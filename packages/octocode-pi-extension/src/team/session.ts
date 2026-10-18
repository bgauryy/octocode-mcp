import fs from 'node:fs';
import type { ExtensionAPI, ExtensionContext } from '@earendil-works/pi-coding-agent';
import { USER_SENDER, type MessageEnvelope } from '../shared/messages.js';
import { addReply, cutText, errorMessage } from '../shared/util.js';
import { fenceUntrusted, headerText } from '../shared/fence.js';
import { storedText, visibleControls } from '../shared/sanitize.js';
import { dbFailure, interruptRefusal, leaseAge, MESSAGE_MAX_CHARS, outside, resolveLockPath, resolveTarget } from './routing.js';
import { AGENT_ID_ENV, PARENT_ID_ENV, PARENT_PID_ENV, pathKey, TeamStore } from './store.js';
import { envFlag, ownNonce, SUBAGENT_ENV } from '../shared/env.js';
import { interactive } from '../shared/interactive.js';
import { parentGone, sameProcess, terminateSelf } from '../shared/process.js';
import type { Lease, LeaseRequest, Member, SendOptions } from './model.js';
import { Mail } from './mail.js';
import { userProof } from './proof.js';
import { HeldLeases, LEASE_IDLE_MS } from './held.js';
import { Delivery } from './delivery.js';
import { PeerLeases, type PeerLease } from './peer-leases.js';
import type { EditLog } from './edits.js';
import { AgentDbError } from '../agentdb/db.js';
import { agentDbPath, peerDbPath, peerRegistryDir } from '../shared/home.js';
import { saveMessageFile } from './spill.js';
import { agentName, LINE_MAX, newMember } from './identity.js';
import { TeamTicker, type TeamView } from './ticker.js';
import type { Ask } from './asks.js';

export type { TeamView } from './ticker.js';
/** Refresh the agent's row at least this often so peers can tell it is alive (and its leases stay valid). */
const HEARTBEAT_MS = 5_000;
/** How often a subagent checks that the Pi process that started it still runs. */
const PARENT_CHECK_MS = 1_000;
/** Every this many parent checks the start time is compared too: a reused pid is noticed within that many seconds, and the event loop is not stalled by a `ps` every second. */
const PARENT_START_EVERY = 15;
/** Names drawn in turn when other processes keep taking them. */
const JOIN_ATTEMPTS = 8;

/**
 * Whether the process named by `OCTOCODE_PARENT_PID` (`<pid> <start time>`, the start time when known) is gone. A
 * direct parent is judged by the pid and reparenting; through a launcher, a recorded start time tells a later process
 * that reused the pid from the parent.
 */
export function parentProcessGone(value: string, compareStart = true): boolean {
  const [pid = '', ...started] = value.trim().split(' ');
  const parentPid = Number(pid);
  if (!Number.isInteger(parentPid) || parentPid <= 0) return false;
  if (parentGone(parentPid)) return true;
  // The start time costs a synchronous `ps`, so a caller that polls compares it only now and then (`compareStart`).
  return compareStart && process.ppid !== parentPid && started.length > 0 && !sameProcess(parentPid, started.join(' '));
}

/** This process's place in the team: joins, reports what it is doing, holds reservations and delivers messages sent to it. */
export class Team {
  private me: Member | undefined;
  private db: TeamStore | undefined;
  private ctx: ExtensionContext | undefined;
  /** The one ticker: delivery and heartbeats while joined, a cached view for watchers (the panel). */
  private readonly ticker = new TeamTicker({
    joined: () => this.me !== undefined,
    beat: () => this.delivery.deliver(this.db),
    dbFile: () => {
      const file = agentDbPath(this.env);
      return this.ctx && (this.db || fs.existsSync(file)) ? file : undefined;
    },
    // Reads never write, but share the connection's busy wait: never wait long for another process's lock.
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
  /** When this agent last worked (or joined): an idle owner's reservations lapse `LEASE_IDLE_MS` (`held.ts`) after it. */
  private activeAt = 0;
  private readonly held = new HeldLeases();
  /** The agents-communication package's path leases (read-only), opened on the first guarded write. */
  private peers: PeerLeases | undefined;
  private readonly mail: Mail;
  private readonly delivery: Delivery;
  /** A subagent's check that its parent still runs: on from the session start, whether or not it joins the team. */
  private parentWatch: NodeJS.Timeout | undefined;
  /** Subagents this session started that have finished: id → where their report went, for a later message to them. */
  private readonly finished = new Map<string, string>();
  /** Resumes a finished subagent that still lingers (set by the subagents domain); its receipt, else undefined. */
  setResumer(resume: (to: string, text: string, from: string, signal?: AbortSignal) => Promise<string | undefined>): void { this.resumer = resume; }
  private resumer: ((to: string, text: string, from: string, signal?: AbortSignal) => Promise<string | undefined>) | undefined;
  private messageHook: ((message: MessageEnvelope, ctx: ExtensionContext, signal?: AbortSignal) => Promise<void>) | undefined;
  setMessageHook(hook: (message: MessageEnvelope, ctx: ExtensionContext, signal?: AbortSignal) => Promise<void>): void { this.messageHook = hook; }

  /** Recent completion receipts; active-agent limits cannot bound a long session's history. */
  rememberFinished(id: string, receipt: string): void {
    this.finished.delete(id);
    this.finished.set(id, receipt);
    if (this.finished.size > 128) this.finished.delete(this.finished.keys().next().value!);
  }
  constructor(pi: ExtensionAPI, private readonly env: NodeJS.ProcessEnv = process.env) {
    this.mail = new Mail(pi, () => ownNonce(this.env));
    this.delivery = new Delivery({
      id: () => this.me?.id,
      parentId: () => this.parentId,
      ctx: () => this.ctx,
      headless: () => this.headless(),
      heartbeat: (db) => this.heartbeat(db),
    }, this.mail);
  }

  /** Secrets of the subagents this session started, by agent id (`vouch`): what signs a message the user types for one. */
  private readonly secrets = new Map<string, string>();

  /**
   * Registers the secret this session gave subagent `id` (the secret in its `PERMISSION_NONCE_FILE_ENV` file), so `/agents tell` can sign for it and
   * the child can tell the user's message from a forged one. Returns what ends it, when the child is gone.
   */
  vouch(id: string, secret: string): () => void {
    this.secrets.set(id, secret);
    return () => {
      if (this.secrets.get(id) === secret) this.secrets.delete(id);
    };
  }

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
    this.watchParent();
    if (this.env[AGENT_ID_ENV]) this.join();
  }

  /**
   * A crashed parent's child spends tokens for nobody: once the parent is gone, Pi's SIGTERM path disposes the session
   * and exits (ARCHITECTURE: Liveness). Its own unref'd timer, so a child that could not join the team stops too.
   */
  private watchParent(): void {
    const parent = this.env[PARENT_PID_ENV];
    if (!parent || this.parentWatch) return;
    let checks = 0;
    this.parentWatch = setInterval(() => {
      if (!parentProcessGone(parent, checks++ % PARENT_START_EVERY === 0)) return;
      clearInterval(this.parentWatch);
      this.parentWatch = undefined;
      // Where a signal ends the process outright (Windows) nothing runs after it: the row and reservations go now, not when a peer's sweep finds the pid dead.
      try { this.leave(); } catch { /* locked database: the sweep reaps the row */ }
      terminateSelf();
    }, PARENT_CHECK_MS);
    this.parentWatch.unref();
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

  /** A name held by no member of the shared database, finished subagent of this session or caller in `inUse` (a subagent not yet in it, or a name another process took first). */
  newName(inUse: Iterable<string> = []): string {
    let live: string[] = [];
    try {
      live = this.existing()?.names() ?? [];
    } catch {
      // An unusable database holds no names this process can read; avoid the rest.
    }
    return agentName([...live, ...this.finished.keys(), ...inUse, ...(this.me ? [this.me.id] : [])]);
  }

  /** Join (or refresh) as this process. Idempotent; `goal` replaces the one-line goal (validated by the caller with `checkGoal`, `identity.ts`). */
  join(goal?: string): Member {
    const db = this.store(); // throws before the session starts
    const ctx = this.ctx!;
    if (!this.me) {
      this.me = this.claimName(db, ctx, goal);
      this.activeAt = this.me.joinedAt;
      this.ticker.sync();
    } else if (goal !== undefined) {
      this.me.goal = storedText(goal, LINE_MAX);
    }
    this.flush(db);
    return this.me;
  }

  /**
   * Takes a name in the shared database: the one the parent chose for a subagent, else a free one. Two processes can
   * draw the same free name; the database gives it to the first, and the other draws again (never overwrites the row).
   */
  private claimName(db: TeamStore, ctx: ExtensionContext, goal: string | undefined): Member {
    const chosen = this.env[AGENT_ID_ENV];
    const lost: string[] = [];
    for (let attempt = 0; attempt < JOIN_ATTEMPTS; attempt += 1) {
      const member = newMember(this.env, ctx, chosen ?? this.newName(lost), goal, Date.now());
      if (db.join(member)) return member;
      if (chosen) throw new Error(`The team name ${chosen} is held by another running agent.`);
      lost.push(member.id);
    }
    throw new Error('No free team name: the names kept being taken by other agents joining at the same time. Try again.');
  }

  /** Leave the team and release everything held; the database stays open for the next join. State clears first: a refused removal still throws, but leaves nothing stale (the row ages out). */
  leave(): void {
    const me = this.me;
    this.me = undefined;
    this.ticker.sync();
    this.held.clear();
    this.delivery.reset(this.db, me?.id);
    this.mail.reset();
    // Only a row that still names this process: a name another process holds now is not ours to remove.
    if (me && this.db) this.db.remove(me.id, Date.now(), me);
  }

  /** Leave and let go of the database (session end; the process connection stays open for the next session). */
  stop(): void {
    try { this.leave(); } finally {
      clearInterval(this.parentWatch);
      this.parentWatch = undefined;
      this.db = undefined;
      this.peers?.close();
      this.peers = undefined;
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

  /**
   * The questions `child` sent its `parent` since `since`, with their answers. None when the database cannot be read:
   * this is a measurement, so it never fails the run it describes.
   */
  asks(child: string, parent: string, since: number): Ask[] {
    try {
      return this.existing()?.asks(child, parent, since) ?? [];
    } catch {
      return [];
    }
  }

  /** Queue a message for the agents `to` resolves to; returns who got it and the message id, or an error text. */
  async send(
    recipient: string | undefined, text: string, options: SendOptions & { from?: string | undefined; signal?: AbortSignal } = {},
  ): Promise<{ sent: string[]; id: number; departed?: string[]; resumed?: string } | { error: string }> {
    options.signal?.throwIfAborted();
    const from = options.from ?? this.me?.id;
    if (!from) return { error: 'Join first: call coordinate with action "join".' };
    const db = this.store();
    const answered = options.replyTo === undefined ? undefined : db.replyTarget(options.replyTo);
    if (options.replyTo !== undefined && !answered) return { error: `No message #${options.replyTo} in this repository to reply to; omit replyTo or use the number from the message you answer. Nothing was sent.` };
    // A reply goes to the sender of the message it answers unless the caller says otherwise.
    const to = recipient ?? answered?.from;
    if (to === undefined) return { error: 'Say who to send to: `to` (an agent id, role, "parent" or "all"), or `replyTo` (the message you answer). Nothing was sent.' };
    // A broadcast stays in the sender's session tree; the user's and an API client's in this session's tree.
    const scope = outside(from) ? this.me?.id : from;
    if (to === 'all' && !scope) return { error: 'No agents in this session yet: nothing to broadcast to.' };
    const members = db.list();
    const targets = resolveTarget(members, from, to, this.parentId, scope);
    const beforeSend = async (recipient: string): Promise<string | undefined> => {
      const ctx = this.ctx;
      if (!this.messageHook || !ctx) return undefined;
      const signal = options.signal ? AbortSignal.any([options.signal, ...(ctx.signal ? [ctx.signal] : [])]) : ctx.signal;
      try {
        await this.messageHook({ channel: 'internal', direction: 'outbound', from, to: recipient, text, ...(options.replyTo !== undefined ? { replyTo: String(options.replyTo) } : {}) }, ctx, signal);
        options.signal?.throwIfAborted();
        if (this.ctx !== ctx) throw new Error('The session changed before the message could be sent.');
      } catch (error) { return errorMessage(error); }
      return undefined;
    };
    if (typeof targets === 'string' && this.finished.has(to) && this.resumer) {
      const denied = await beforeSend(to);
      if (denied) return { error: denied };
    }
    const resumed = typeof targets === 'string' && this.finished.has(to) ? await this.resumer?.(to, text, from, options.signal) : undefined;
    if (resumed) return { sent: [to], id: 0, resumed };
    if (typeof targets === 'string') return { error: this.finished.has(to) ? `${to} has finished and takes no more messages; ${this.finished.get(to)} To continue its work, start a new agent and give it the context it needs.` : targets };
    const refused = options.interrupt ? interruptRefusal(members, targets, from, to, scope) : undefined;
    if (refused) return { error: refused };
    for (const target of targets) {
      const denied = await beforeSend(target.id);
      if (denied) return { error: denied };
    }
    options.signal?.throwIfAborted();
    // A message is FYI unless the sender says it needs an answer: a default that asked for answers made two agents wake each other forever.
    const replyRequired = options.replyRequired ?? false;
    // Stored with controls shown as escapes: every reader (the model, the panel, other processes) gets text that cannot steer a terminal, and the evidence stays.
    const delivered = spilledMessage(visibleControls(text), from);
    if (typeof delivered !== 'string') return delivered;
    const reply = options.replyTo !== undefined ? { replyTo: options.replyTo } : {};
    // Only the user's messages are signed, and only for a child this session started: any other recipient reads them as unverified.
    const sign = from === USER_SENDER ? (id: number, recipient: string) => this.signed(id, recipient, delivered) : undefined;
    const flags = { replyRequired, wake: outside(from), interrupt: options.interrupt === true, ...reply, ...(sign ? { sign } : {}) };
    const { id, departed } = db.send(from, targets.map((target) => target.id), delivered, flags);
    if (id === undefined) return { error: `${departed.join(', ')} left the team; the message was not sent.` };
    if (from === USER_SENDER) this.mail.createdForUser(id);
    const sent = targets.map((target) => target.id).filter((target) => !departed.includes(target));
    return { sent, id, ...(departed.length > 0 ? { departed } : {}) };
  }

  /** The signature of the user's message `text` (stored as message `id`) for child `recipient`; undefined when this session did not start it. */
  private signed(id: number, recipient: string, text: string): string | undefined {
    const secret = this.secrets.get(recipient);
    return secret ? userProof(secret, { id, to: recipient, text }) : undefined;
  }

  /** Reserve paths (a trailing `/` marks a whole directory tree) for this agent. */
  lock(paths: string[], reason: string): { ok: true; leases: Lease[]; held: number } | { ok: false; conflicts: Array<{ path: string; heldBy: Lease }> } {
    const me = this.join();
    // Stored resolved from this session's cwd, the way edits resolve; conflicts still show the paths as given.
    const shown = new Map(paths.map((entry) => [resolveLockPath(this.ctx?.cwd, entry), entry]));
    const requests: LeaseRequest[] = paths.map((entry) => ({ path: resolveLockPath(this.ctx?.cwd, entry), kind: /[\\/]$/.test(entry) ? 'tree' : 'file', reason }));
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
  private check(file: string): { lease?: Lease; peer?: PeerLease; lapsed?: string; error?: string } {
    try {
      const db = this.existing();
      if (db) {
        const lease = db.conflict(file, this.me?.id ?? USER_SENDER);
        if (lease) return { lease };
        const lapsed = this.lapsedCover(db, file);
        if (lapsed) return { lapsed };
      }
    } catch (error) {
      if (this.collaborating()) return { error: dbFailure(error) };
    }
    // Agents outside this team (Claude, Codex, Pi sessions that use agents-communication) reserve paths in their own database.
    const peer = this.peerLeases().conflict(file);
    return peer ? { peer } : {};
  }

  /** The package reads its home from the process environment, so this does too (not the team's injected `env`, which only carries a subagent's identity). */
  private peerLeases(): PeerLeases {
    return (this.peers ??= new PeerLeases(peerDbPath(), { registry: peerRegistryDir(), self: () => this.ctx?.sessionManager.getSessionId(), warn: (text) => this.mail.notice(text) }));
  }

  /** A reservation of ours covering `file` that is no longer live in the database (now tracked as lapsed), if any. */
  private lapsedCover(db: TeamStore, file: string): string | undefined {
    const me = this.me;
    if (!me || !this.held.any) return undefined;
    return this.held.lapsedCover(pathKey(db.workspace, file), () => db.owned(me.id));
  }

  /** Why the file may not be changed (another agent's reservation, in this team or in agents-communication; our lapsed one; or an unreadable team database), or undefined. */
  reservation(absolute: string, display: string): string | undefined {
    const { lease, peer, lapsed, error } = this.check(absolute);
    if (error) return `Team database unavailable (${error}); retry the change.`;
    if (lapsed) return `Your reservation on ${lapsed} lapsed; lock it again before editing ${display}.`;
    if (peer) return visibleControls(`${display} is reserved by ${peer.name} (${peer.vendor} agent in agents-communication; ${peer.reason}; ${leaseAge(peer)}). Do other work, or message ${peer.name} through agents-communication and retry after they unlock.`);
    return lease ? visibleControls(`${display} is reserved by ${lease.owner} (${lease.reason}; ${leaseAge(lease)}). Do other work, or sendMessage ${lease.owner} and retry after they unlock.`) : undefined;
  }

  /** Who changed which file recently, once the database exists; throws when it is unusable. */
  editLog(): EditLog | undefined {
    return this.existing()?.edits;
  }

  // Activity the parent and the user see: state, current tool, tokens.
  onAgentStart(): void {
    this.update((me) => void (me.status = 'working'), true);
  }

  /** Delivers held interrupts first; a headless child then leaves because its parent closes its input. */
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

  /** A subagent (no person to talk to, whatever its mode): once its run is over it gets no further turn. */
  private headless(): boolean {
    return Boolean(this.env[AGENT_ID_ENV] && this.ctx && !interactive(this.ctx, envFlag(this.env, SUBAGENT_ENV)));
  }

  /** Pi is about to call the model with `messages`: team mail among them is now delivered. */
  onContext(messages: ReadonlyArray<{ role?: string; customType?: string; details?: unknown }>): void {
    this.delivery.seen(this.db, messages);
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
    if (!db.save(this.me)) throw new Error(`The team name ${this.me.id} is held by another running agent; this agent's row cannot be refreshed.`);
    // Reservations live while their owner works; an idle owner's lapse once it has been idle too long.
    const idle = now - this.activeAt >= LEASE_IDLE_MS;
    if (!idle) db.renew(this.me.id, now);
    this.savedAt = now;
    this.statusChanged = false;
    if (!this.held.holding) return;
    // A heartbeat stall can let a lease lapse (and a peer take the path): say so once, and refuse edits until re-locked.
    const lost = this.held.lost(db.owned(this.me.id, now));
    const why = idle ? ` after ${Math.round((now - this.activeAt) / 60_000)}m idle` : '';
    if (lost.length > 0) this.mail.notice(`Your reservation on ${lost.join(', ')} lapsed${why}; lock it again before editing.`);
  }

  /** Writes the heartbeat when a status changed or `HEARTBEAT_MS` passed since the last; whether it did. */
  private heartbeat(db: TeamStore): boolean {
    if (!this.statusChanged && Date.now() - this.savedAt < HEARTBEAT_MS) return false;
    this.flush(db);
    return true;
  }
}

/**
 * What goes to the readers of a message: `text` when it fits `MESSAGE_MAX_CHARS`; a longer one is saved whole to a
 * private file and delivered as its head plus the file's path, still within the limit so no reader cuts the pointer off.
 * `text` is already sanitized, and the file holds it the way the recipient's message would carry it: fenced as data from
 * `from` (the user's own words excepted), because the recipient reads the file with `read`, outside the message's fence.
 * The file is named by the hash of its content (`team/spill.ts`), so the signature of a user's message covers it. An error when the file cannot be written (nothing is sent rather than a message with a silent gap).
 */
export function spilledMessage(text: string, from: string): string | { error: string } {
  if (text.length <= MESSAGE_MAX_CHARS) return text;
  const file = saveMessageFile(from === USER_SENDER ? text : fenceUntrusted(`Full message (${text.length} characters) from ${headerText(from, 64)}`, text));
  if (!file) return { error: `Message is ${text.length} characters (the limit is ${MESSAGE_MAX_CHARS}) and could not be saved to a file. Send a summary. Nothing was sent.` };
  const note = `\n[Full message (${text.length} characters): ${file}]`;
  return `${cutText(text, Math.max(0, MESSAGE_MAX_CHARS - note.length), { chars: true })}${note}`;
}
