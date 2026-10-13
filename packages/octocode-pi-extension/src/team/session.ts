import fs from 'node:fs';
import type { ExtensionAPI, ExtensionContext } from '@earendil-works/pi-coding-agent';
import { addReply, errorMessage } from '../shared/util.js';
import { sanitizeTerminalText, storedText } from '../shared/sanitize.js';
import { dbFailure, interruptRefusal, leaseAge, MESSAGE_MAX_CHARS, outside, resolveLockPath, resolveTarget, USER_SENDER } from './routing.js';
import { AGENT_ID_ENV, PARENT_ID_ENV, PARENT_PID_ENV, pathKey, TeamStore } from './store.js';
import { parentGone, terminateSelf } from '../shared/process.js';
import type { Lease, LeaseRequest, Member, SendOptions } from './model.js';
import { Mail, mailIds } from './mail.js';
import { HeldLeases, leaseIdleMs } from './held.js';
import { Inbox } from './inbox.js';
import type { EditLog } from './edits.js';
import { AgentDbError } from '../agentdb/db.js';
import { agentDbPath } from '../shared/home.js';
import { agentName, LINE_MAX, newMember } from './identity.js';
import { TeamTicker, type TeamView } from './ticker.js';

export type { TeamView } from './ticker.js';
export { MESSAGE_TYPE } from './mail.js';
export { EXTERNAL_SENDER, MESSAGE_MAX_CHARS, USER_SENDER } from './routing.js';
/** Refresh the agent's row at least this often so peers can tell it is alive (and its leases stay valid). */
const HEARTBEAT_MS = 5_000;
/** Consecutive failed ticks (about 30s) before the agent hears that the team database is unavailable. */
const FAILED_TICKS_NOTICE = 30;

/** This process's place in the team: joins, reports what it is doing, holds reservations and delivers messages sent to it. */
export class Team {
  private me: Member | undefined;
  private db: TeamStore | undefined;
  private ctx: ExtensionContext | undefined;
  /** The one ticker: delivery and heartbeats while joined, a cached view for watchers (the panel). */
  private readonly ticker = new TeamTicker({
    joined: () => this.me !== undefined,
    beat: () => this.deliverPending(),
    dbFile: () => {
      const file = agentDbPath(this.env);
      return this.ctx && (this.db || fs.existsSync(file)) ? file : undefined;
    },
    // Background reads may prune departed agents (a write): never wait long for another process's lock.
    read: () => (this.db ? this.db.quick(() => this.snapshot()) : this.snapshot()),
    resumed: (since, now) => {
      try {
        this.existing()?.resume(since, now);
      } catch {
        // Unusable database: the snapshot says why; nothing to repair.
      }
    },
    maxAgeMs: HEARTBEAT_MS,
  });
  /** A status or goal change waits for the next tick; activity, tool counts and usage ride the heartbeat. */
  private statusChanged = false;
  private savedAt = 0;
  /** Why the database cannot be used at all (a foreign file); shown in /agents and the footer. */
  private schemaProblem: string | undefined;
  private failedTicks = 0;
  /** When this agent last worked (or joined): an idle owner's reservations lapse `leaseIdleMs` after it. */
  private activeAt = 0;
  private readonly held = new HeldLeases();
  private readonly inbox = new Inbox();
  private readonly mail: Mail;
  /** Subagents this session started that have finished: id → where their report went, for a later message to them. */
  private readonly finished = new Map<string, string>();
  /** Resumes a finished subagent that still lingers (set by the subagents domain); its receipt, else undefined. */
  setResumer(resume: (to: string, text: string, from: string, signal?: AbortSignal) => Promise<string | undefined>): void { this.resumer = resume; }
  private resumer: ((to: string, text: string, from: string, signal?: AbortSignal) => Promise<string | undefined>) | undefined;

  /** Recent completion receipts; active-agent limits cannot bound a long session's history. */
  rememberFinished(id: string, receipt: string): void {
    this.finished.delete(id);
    this.finished.set(id, receipt);
    if (this.finished.size > 128) this.finished.delete(this.finished.keys().next().value!);
  }
  constructor(pi: ExtensionAPI, private readonly env: NodeJS.ProcessEnv = process.env) { this.mail = new Mail(pi); }

  /** Aborted while an interrupt waits for this agent's run to stop (`agent_before_settle` waits end early on it). */
  get interrupted(): AbortSignal { return this.mail.interrupted; }

  get id(): string | undefined {
    return this.me?.id;
  }

  get parentId(): string | undefined {
    return this.env[PARENT_ID_ENV];
  }

  /** Bind to the session and, in a subagent, join straight away (the parent chose the id). */
  start(ctx: ExtensionContext): void {
    try { this.stop(); } catch { /* the old row stays (locked or closed database) and ages out; stop() cleared the state */ }
    this.ctx = ctx;
    this.schemaProblem = undefined;
    if (this.env[AGENT_ID_ENV]) this.join();
  }

  /** The database opens on first use, so a session that never collaborates never creates it. */
  private store(): TeamStore {
    if (!this.ctx) throw new Error('The team is not available before the session starts.');
    if (this.schemaProblem) throw new Error(this.schemaProblem);
    try {
      return (this.db ??= TeamStore.shared(this.ctx.cwd, this.env));
    } catch (error) {
      const problem = `Team database unavailable: ${errorMessage(error)}`;
      if (error instanceof AgentDbError) this.schemaProblem = problem;
      throw new Error(problem);
    }
  }

  /** Set when the team database is foreign or too new; nothing team-related works until it is fixed. */
  get problem(): string | undefined {
    return this.schemaProblem;
  }

  /** A name held by no member of the shared database, finished subagent of this session or caller in `inUse` (a subagent not yet in it). */
  newName(inUse: Iterable<string> = []): string {
    let live: string[] = [];
    try {
      live = this.existing()?.names() ?? [];
    } catch {
      // An unusable database holds no names this process can read; avoid the rest.
    }
    return agentName([...live, ...this.finished.keys(), ...inUse, ...(this.me ? [this.me.id] : [])]);
  }

  /** Join (or refresh) as this process. Idempotent; `goal` replaces the one-line goal (validated by the caller, see `goal.ts`). */
  join(goal?: string): Member {
    const db = this.store(); // throws before the session starts
    const ctx = this.ctx!;
    if (!this.me) {
      const now = Date.now();
      this.activeAt = now;
      this.me = newMember(this.env, ctx, this.env[AGENT_ID_ENV] ?? this.newName(), goal, now);
      this.ticker.sync();
    } else if (goal !== undefined) {
      this.me.goal = storedText(goal, LINE_MAX);
    }
    this.flush(db);
    return this.me;
  }

  /** Leave the team and release everything held; the database stays open for the next join. State clears first: a refused removal still throws, but leaves nothing stale (the row ages out). */
  leave(): void {
    const me = this.me;
    this.me = undefined;
    this.ticker.sync();
    this.held.clear();
    this.inbox.reset(this.db, me?.id);
    this.mail.reset();
    if (me && this.db) this.db.remove(me.id);
  }

  /** Leave and let go of the database (session end; the process connection stays open for the next session). */
  stop(): void {
    try { this.leave(); } finally {
      this.db = undefined;
      this.ticker.reset();
      this.finished.clear();
      this.ctx = undefined;
    }
  }

  /** Call `listener` on every tick with a fresh `view` (shared ticker and cache; watchers never read the database). */
  watch(listener: () => void): () => void {
    return this.ticker.watch(listener);
  }

  /** The latest snapshot the ticker read (for watchers). */
  get view(): TeamView {
    return this.ticker.view;
  }

  /**
   * The database only if someone already created it: reads never create it, since before anyone has collaborated
   * there is nothing to read. Throws when it exists but is unusable.
   */
  private existing(): TeamStore | undefined {
    return this.db || fs.existsSync(agentDbPath(this.env)) ? this.store() : undefined;
  }

  /** Live agents (none when the database cannot be read; `snapshot` says why). */
  members(): Member[] {
    return this.snapshot().members;
  }

  /** Live agents and the latest messages between them, from one read. */
  snapshot(): TeamView {
    try {
      const db = this.existing();
      return db ? { members: db.list(), traffic: db.recent() } : { members: [], traffic: [] };
    } catch (error) {
      if (this.schemaProblem) return { members: [], traffic: [], error: this.schemaProblem };
      return { members: [], traffic: [], error: `Team database unavailable: ${errorMessage(error)}`, retrying: true };
    }
  }

  /** Queue a message for the agents `to` resolves to; returns who got it and the message id, or an error text. */
  async send(
    to: string, text: string, options: SendOptions & { from?: string | undefined; signal?: AbortSignal } = {},
  ): Promise<{ sent: string[]; id: number; departed?: string[]; resumed?: string } | { error: string }> {
    options.signal?.throwIfAborted();
    const from = options.from ?? this.me?.id;
    if (!from) return { error: 'Join first: call coordinate with action "join".' };
    if (text.length > MESSAGE_MAX_CHARS) return { error: `Message exceeds ${MESSAGE_MAX_CHARS} characters; send a summary and a file path to the full content. Nothing was sent.` };
    const db = this.store();
    if (options.replyTo !== undefined && !db.replyTarget(options.replyTo)) return { error: `No message #${options.replyTo} in this repository to reply to; omit replyTo or use the number from the message you answer. Nothing was sent.` };
    // A broadcast stays in the sender's session tree; the user's and an API client's in this session's tree.
    const scope = outside(from) ? this.me?.id : from;
    if (to === 'all' && !scope) return { error: 'No agents in this session yet: nothing to broadcast to.' };
    const members = db.list();
    const targets = resolveTarget(members, from, to, this.parentId, scope);
    const resumed = typeof targets === 'string' && this.finished.has(to) ? await this.resumer?.(to, text, from, options.signal) : undefined;
    if (resumed) return { sent: [to], id: 0, resumed };
    if (typeof targets === 'string') return { error: this.finished.has(to) ? `${to} has finished and takes no more messages; ${this.finished.get(to)} To continue its work, start a new agent and give it the context it needs.` : targets };
    const refused = options.interrupt ? interruptRefusal(members, targets, from, to, scope) : undefined;
    if (refused) return { error: refused };
    // Replies default to FYI: an answer that asks for an answer makes two agents wake each other forever.
    const replyRequired = options.replyRequired ?? (to !== 'all' && !outside(from) && options.replyTo === undefined);
    // Stored sanitized: every reader (the model, the panel, other processes) gets plain text.
    const reply = options.replyTo !== undefined ? { replyTo: options.replyTo } : {};
    const { id, departed } = db.send(from, targets.map((target) => target.id), sanitizeTerminalText(text), { replyRequired, wake: outside(from), interrupt: options.interrupt === true, ...reply });
    if (id === undefined) return { error: `${departed.join(', ')} left the team; the message was not sent.` };
    const sent = targets.map((target) => target.id).filter((target) => !departed.includes(target));
    return { sent, id, ...(departed.length > 0 ? { departed } : {}) };
  }

  /** Reserve paths (a trailing `/` marks a whole directory tree) for this agent. */
  lock(paths: string[], reason: string): { ok: true; leases: Lease[]; held: number } | { ok: false; conflicts: Array<{ path: string; heldBy: Lease }> } {
    const me = this.join();
    // Stored resolved from this session's cwd, the way edits resolve; conflicts still show the paths as given.
    const shown = new Map(paths.map((entry) => [resolveLockPath(this.ctx?.cwd, entry), entry]));
    const requests: LeaseRequest[] = [...shown].map(([resolved, entry]) => ({ path: resolved, kind: /[\\/]$/.test(entry) ? 'tree' : 'file', reason }));
    const db = this.store();
    const result = db.lock(me.id, requests);
    if (!result.ok) return { ok: false, conflicts: result.conflicts.map((conflict) => ({ ...conflict, path: shown.get(conflict.path) ?? conflict.path })) };
    this.held.granted(result.leases.map((lease) => ({ key: `${lease.kind}:${pathKey(db.workspace, lease.path)}`, lease })));
    // The store returns every lease this agent holds: keep the requested ones, and count the rest apart.
    const asked = new Set(requests.map((request) => `${request.kind}:${pathKey(db.workspace, request.path)}`));
    return { ok: true, leases: result.leases.filter((lease) => asked.has(`${lease.kind}:${pathKey(db.workspace, lease.path)}`)), held: result.leases.length };
  }

  unlock(paths?: string[]): number {
    if (!this.me) return 0;
    const db = this.store();
    const resolved = paths?.map((entry) => resolveLockPath(this.ctx?.cwd, entry));
    const keys = resolved?.length ? resolved.flatMap((entry) => [`file:${pathKey(db.workspace, entry)}`, `tree:${pathKey(db.workspace, entry)}`]) : this.held.keys();
    this.held.release(keys);
    return db.unlock(this.me.id, resolved);
  }

  /** Whether this agent takes part in the team: it joined, or still tracks reservations. */
  private collaborating(): boolean {
    return this.me !== undefined || this.held.any;
  }

  /**
   * Whether this agent may change `file`: another agent's live lease, a reservation of ours that lapsed, or a
   * database error all forbid it. A database error fails closed only for an agent that collaborates; a solo session
   * (never joined, nothing held) keeps editing when the database is missing, foreign, too new or unusable.
   */
  private check(file: string): { lease?: Lease; lapsed?: string; error?: string } {
    try {
      const db = this.existing();
      if (!db) return {};
      const lease = db.conflict(file, this.me?.id ?? USER_SENDER);
      if (lease) return { lease };
      const lapsed = this.lapsedCover(db, file);
      return lapsed ? { lapsed } : {};
    } catch (error) {
      return this.collaborating() ? { error: dbFailure(error) } : {};
    }
  }

  /** A reservation of ours covering `file` that is no longer live in the database (now tracked as lapsed), if any. */
  private lapsedCover(db: TeamStore, file: string): string | undefined {
    const me = this.me;
    if (!me || !this.held.any) return undefined;
    return this.held.lapsedCover(pathKey(db.workspace, file), () => db.owned(me.id));
  }

  /** The live lease of another agent that covers this file, if any. */
  blockedBy(file: string): Lease | undefined {
    return this.check(file).lease;
  }

  /** Why the file may not be changed (another agent's reservation, our lapsed one, or an unreadable team database), or undefined. */
  reservation(absolute: string, display: string): string | undefined {
    const { lease, lapsed, error } = this.check(absolute);
    if (error) return `Team database unavailable (${error}); retry the change.`;
    if (lapsed) return `Your reservation on ${lapsed} lapsed; lock it again before editing ${display}.`;
    return lease ? sanitizeTerminalText(`${display} is reserved by ${lease.owner} (${lease.reason}; ${leaseAge(lease)}). Do other work, or sendMessage ${lease.owner} and retry after they unlock.`) : undefined;
  }

  /** Who changed which file recently, once the database exists; throws when it is unusable. */
  editLog(): EditLog | undefined {
    return this.existing()?.edits;
  }

  // Activity the parent and the user see: state, current tool, tokens.
  onAgentStart(): void {
    this.update((me) => void (me.status = 'working'), true);
  }

  /** Delivers held interrupts first; a headless child then leaves because its print/JSON process exits. */
  onAgentSettled(): void {
    if (this.mail.settled()) return; // An interrupt stopped the run: its message starts the next turn.
    if (this.me && this.headless()) {
      this.flush();
      this.leave();
      return;
    }
    // The activity line was cleared by src/ui/activity.ts, which owns it.
    this.update((me) => void (me.status = 'idle'), true);
  }

  /** A subagent without a UI (print/JSON mode): once its run is over it gets no further turn. */
  private headless(): boolean {
    return Boolean(this.env[AGENT_ID_ENV] && this.ctx && !this.ctx.hasUI);
  }

  /** Pi is about to call the model with `messages`: team mail among them is now delivered. */
  onContext(messages: ReadonlyArray<{ role?: string; customType?: string; details?: unknown }>): void {
    const me = this.inbox.awaitingContext ? this.me?.id : undefined;
    const db = this.db;
    const ids = me && db ? messages.flatMap((message) => mailIds(message, me)) : [];
    if (!me || !db || ids.length === 0) return;
    try {
      db.quick(() => this.inbox.seen(db, me, ids));
    } catch {
      // Busy database: the inbox keeps the ids and records them on the next tick.
    }
  }

  /** A top-level tool call started (parallel calls each count; calls a tool makes itself do not). */
  onToolStart(): void {
    this.update((me) => void (me.toolCalls += 1));
  }

  /** What the agent does now (the line src/ui/activity.ts describes), or undefined between steps and when idle. */
  setActivity(line: string | undefined): void {
    this.update((me) => void (line ? (me.activity = storedText(line, LINE_MAX)) : delete me.activity));
  }

  /** One reply's usage; `model` wrote it (it changes when the user switches models); `unpriced`: that model has no pricing. */
  onUsage(usage: unknown, model: string | undefined, unpriced: boolean): void {
    this.update((me) => {
      if (model) me.model = storedText(model, LINE_MAX);
      addReply(me, usage, unpriced);
    });
  }

  /** Changes this agent's row in memory; `status` changes are written on the next tick, the rest with the heartbeat. */
  private update(change: (me: Member) => void, status = false): void {
    if (!this.me) return;
    change(this.me);
    if (status) this.statusChanged = true;
  }

  private flush(db: TeamStore | undefined = this.db): void {
    if (!this.me || !db) return;
    const now = Date.now();
    this.me.updatedAt = now;
    if (this.me.status === 'working') this.activeAt = now;
    db.save(this.me);
    // Reservations live while their owner works; an idle owner's lapse once it has been idle too long.
    const idle = now - this.activeAt >= leaseIdleMs(this.env);
    if (!idle) db.renew(this.me.id, now);
    this.savedAt = now;
    this.statusChanged = false;
    if (!this.held.holding) return;
    // A heartbeat stall can let a lease lapse (and a peer take the path): say so once, and refuse edits until re-locked.
    const lost = this.held.lost(db.owned(this.me.id, now));
    const why = idle ? ` after ${Math.round((now - this.activeAt) / 60_000)}m idle` : '';
    if (lost.length > 0) this.mail.notice(`Your reservation on ${lost.join(', ')} lapsed${why}; lock it again before editing.`);
  }

  /** Two-phase delivery: hand what is waiting to Pi (the inbox records it once the model sees it), then the heartbeat. */
  private deliverPending(): void {
    if (!this.me || !this.db) return;
    // A crashed parent's child spends tokens for nobody: Pi's SIGTERM path disposes the session and exits (ARCHITECTURE: Liveness).
    const parentPid = Number(this.env[PARENT_PID_ENV] ?? 0);
    if (parentPid && parentGone(parentPid)) return terminateSelf();
    const db = this.db;
    try {
      db.quick(() => this.deliverNow(db));
      this.failedTicks = 0;
    } catch (error) {
      // A locked or closed database is retried on the next tick; say so once if it lasts long enough for leases to lapse.
      if (++this.failedTicks === FAILED_TICKS_NOTICE) this.mail.notice(`Team database unavailable (${errorMessage(error)}): your reservations may lapse and messages wait until it recovers.`);
    }
  }

  private deliverNow(db: TeamStore): void {
    if (!this.me) return;
    // A settlement send can fail while Pi changes state. An interactive session stays alive to retry held mail.
    if (!this.headless() && this.ctx?.isIdle()) this.mail.settled();
    // An idle subagent without a UI has had its last turn: mail waits, and becomes a dead letter when it leaves.
    if (!(this.headless() && this.ctx?.isIdle())) this.inbox.deliver(db, this.me.id, (batch) => this.mail.deliver(batch, this.parentId, this.ctx));
    if (!this.statusChanged && Date.now() - this.savedAt < HEARTBEAT_MS) return;
    this.flush(db);
    this.mail.reportDeadLetters(db, this.me.id);
  }
}
