import path from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { dbStamp, openAgentDb, sharedAgentDb, type AgentDb } from '../agentdb/db.js';
import { agentDbPath, canonicalPath, repoKey } from '../shared/home.js';
import { sameProcess } from '../shared/process.js';
import { HOUR_MS, optionalString } from '../shared/util.js';
import { EditLog } from './edits.js';
import { num, type Row } from '../agentdb/rows.js';
import { ancestorKeys, leaseKey, overlappingRequests } from './lease-key.js';
import type { Ask } from './asks.js';
import { toAsk, toLease, toMember, toMessage, toTraffic, type DeadLetter, type Lease, type LeaseRequest, type Member, type Message, type SendOptions, type Traffic, WAKE } from './model.js';

/** Makes the `proof` of message `id` for `recipient` (see `userProof`); undefined for a recipient the caller cannot sign for. */
type SignProof = (id: number, recipient: string) => string | undefined;

/**
 * The team tables of the agent database: who works in this repository, what they say to each other, and which files
 * they have reserved. One SQLite file shared by every Pi process on the machine (WAL, so readers never block),
 * rows scoped by workspace = git root. Entities, after the octocode-agents-communication skill:
 *   agents      one live agent; its owner rewrites the row as it works (status, tool, tokens, heartbeat)
 *   messages    immutable; may require a reply and may answer another message (replyTo)
 *   deliveries  one row per recipient: delivered when the model saw it, completed when answered, dead when the recipient left unread
 *               (the sender is told once: notified_at); `wake` says whether it may start a turn of an idle recipient
 *               (1), or also stop a busy one's current step (2, an interrupt)
 *   leases      cooperative file/tree reservations that expire unless the owner keeps renewing them
 */

export const AGENT_ID_ENV = 'OCTOCODE_AGENT_ID';
export const PARENT_ID_ENV = 'OCTOCODE_PARENT_ID';
/** Set in a subagent: its parent Pi's pid. The child leaves and shuts down when that process is gone (a crashed parent). */
export const PARENT_PID_ENV = 'OCTOCODE_PARENT_PID';
/** Set in a subagent: the role it was started with (its profile), shown next to its name. */
export const AGENT_ROLE_ENV = 'OCTOCODE_AGENT_ROLE';
/** Set in a subagent: its goal, at most five words (`identity.ts`). Stored in the `task` column. */
export const AGENT_GOAL_ENV = 'OCTOCODE_AGENT_GOAL';
/** Set in a subagent started with `collaborate`: it works with its sibling subagents, not only for its parent. */
export const AGENT_COLLABORATE_ENV = 'OCTOCODE_AGENT_COLLABORATE';
/** A subagent's own handoff folder (`<workspace>/.octocode/tmp/agents/<id>`): long results go there as files, not into its report. */
export const AGENT_SCRATCH_ENV = 'OCTOCODE_AGENT_SCRATCH';
/** Absolute path used as-is as the team workspace (e.g. a subagent in a git worktree joins its parent's team). */
export const TEAM_WORKSPACE_ENV = 'OCTOCODE_TEAM_WORKSPACE';

/** An agent that has not refreshed its row for this long is hidden from `list` (a stalled process: suspended, or on a machine that slept). Only its process ending, or it leaving, drops the row and its mail. */
const STALE_MS = 60_000;
/** Leases live this long past the owner's last heartbeat, so a crashed owner frees its files quickly. */
export const LEASE_MS = 90_000;
const MESSAGE_RETENTION_MS = 24 * HOUR_MS;
export const INBOX_BATCH_SIZE = 32;
const PRUNE_INTERVAL_MS = 60_000;

/** A member has not heartbeat for `STALE_MS`: its process may only be stalled, so it is hidden but keeps its mail and row. */
const stale = (seenAt: number, now: number): boolean => now - seenAt > STALE_MS;

/** The process a member row names: the pid and, where known, its start time, so a reused pid is not taken for it. */
interface ProcessIdentity {
  pid: number;
  started?: string | undefined;
}

const sameIdentity = (a: ProcessIdentity, b: ProcessIdentity): boolean => a.pid === b.pid && (a.started ?? null) === (b.started ?? null);

/**
 * The team workspace for `cwd`: one team per repository (`repoKey(cwd).root`, symlinks resolved), unless
 * `TEAM_WORKSPACE_ENV` names it (a subagent in an isolated worktree joins its parent's team).
 */
export function teamWorkspace(cwd: string, env: NodeJS.ProcessEnv = process.env): string {
  const override = env[TEAM_WORKSPACE_ENV];
  if (override && path.isAbsolute(override)) return canonicalPath(override);
  return repoKey(cwd).root;
}

/**
 * Canonical comparison key of `file` below `workspace`: its components folded as `lease-key.ts` says (the rules the
 * agents-communication package shares), so `Src/A.ts` and `src/a.ts` collide on every platform.
 */
export function pathKey(workspace: string, file: string): string {
  const relative = path.relative(workspace, canonicalPath(path.resolve(workspace, file)));
  return leaseKey(relative.split(path.sep));
}

/** SQLite's "database is locked" (`SQLITE_BUSY`, extended codes included). */
const isBusy = (error: unknown): boolean => (Number((error as { errcode?: unknown }).errcode) & 0xff) === 5;

/** Busy wait for a background write (heartbeat, delivery): a locked database is retried on the next tick instead. */
const QUICK_BUSY_MS = 100;
/** Busy wait for a write an agent asked for (a lock, a message). */
const BUSY_MS = 5_000;

export class TeamStore {
  private readonly db: DatabaseSync;
  /** Who changed which file recently, in the same database. */
  readonly edits: EditLog;
  private prunedAt = -Infinity;
  /** Nested `quick` calls: only the outermost restores the long busy wait. */
  private quickDepth = 0;

  private constructor(
    private readonly agent: AgentDb,
    readonly workspace: string,
    /** Whether `close` closes the connection: true for `open`, false for the process connection `shared` borrows. */
    private readonly ownsConnection: boolean,
  ) {
    this.db = agent.db;
    this.edits = new EditLog(agent.db, workspace);
  }

  /** Opens its own connection to the agent database (`agentDbPath`), which checks the file is ours and adds any missing schema first. */
  static open(cwd: string, file = agentDbPath(), env: NodeJS.ProcessEnv = process.env): TeamStore {
    const agent = openAgentDb(file, env);
    try {
      const store = new TeamStore(agent, teamWorkspace(cwd, env), true);
      store.housekeep();
      return store;
    } catch (error) {
      agent.close();
      throw error;
    }
  }

  /** The team over the process's one agent database connection (`sharedAgentDb`), which sessions, memory and backlog use too. */
  static shared(cwd: string, env: NodeJS.ProcessEnv = process.env): TeamStore {
    const store = new TeamStore(sharedAgentDb(env), teamWorkspace(cwd, env), false);
    store.housekeep();
    return store;
  }

  /** Closes a connection `open` made; a `shared` store leaves the process connection open. */
  close(): void {
    if (this.ownsConnection) this.agent.close();
  }

  private transaction<T>(work: () => T): T {
    return this.agent.transaction(work);
  }

  /** Moves whenever any process writes the database file (`dbStamp`): equal stamps mean a read would answer as it did. */
  stamp(): string {
    return dbStamp(this.agent.file);
  }

  /** Runs background work with a short busy wait, so a database held by another process never freezes this one. */
  quick<T>(work: () => T): T {
    if (this.quickDepth++ === 0) this.db.exec(`PRAGMA busy_timeout=${QUICK_BUSY_MS}`);
    try {
      return work();
    } finally {
      if (--this.quickDepth === 0) this.db.exec(`PRAGMA busy_timeout=${BUSY_MS}`);
    }
  }

  /**
   * The prune when a store opens: housekeeping, so it never makes the open fail or wait. While another process holds
   * the write lock (many Pi processes starting at once) it is skipped, and the next heartbeat's prune does it.
   */
  private housekeep(): void {
    try {
      this.quick(() => this.prune());
    } catch (error) {
      if (!isBusy(error)) throw error;
    }
  }

  private prune(now = Date.now()): void {
    if (now - this.prunedAt < PRUNE_INTERVAL_MS) return;
    this.db.prepare(`DELETE FROM messages WHERE created_at < ? AND NOT EXISTS (
      SELECT 1 FROM deliveries d WHERE d.message = messages.id AND d.completed_at IS NULL
        AND (d.dead_at IS NULL OR d.notified_at IS NULL)
    )`).run(now - MESSAGE_RETENTION_MS);
    this.db.prepare('DELETE FROM leases WHERE expires_at < ?').run(now);
    this.edits.prune(now);
    this.sweep(now);
    this.prunedAt = now;
  }

  // ── agents ────────────────────────────────────────────────────────────────

  /**
   * Heartbeat: refreshes the member row and runs the periodic prune (at most once a minute). The row is matched by id,
   * pid and start time, so a process never writes over a row another process holds; a row that is gone (swept while
   * this process was stalled) is inserted again. False when another process holds the id.
   */
  save(member: Member): boolean {
    this.prune(member.updatedAt);
    return this.refresh(member) || this.insert(member);
  }

  /** The heartbeat's `UPDATE`: matches the row only while it still names this process. */
  private refresh(member: Member): boolean {
    const { changes } = this.db
      .prepare(
        `UPDATE agents SET status = ?, task = ?, activity = ?, model = ?, seen_at = ?, tool_calls = ?, input = ?, cache_read = ?, output = ?, cost = ?, unpriced = ?
         WHERE id = ? AND pid = ? AND started IS ?`,
      )
      .run(
        member.status, member.goal ?? null, member.activity ?? null, member.model ?? null, member.updatedAt, member.toolCalls, member.input, member.cacheRead, member.output, member.cost,
        member.unpriced ? 1 : 0, member.id, member.pid, member.started ?? null,
      );
    return changes > 0;
  }

  /** Adds the row unless the id is taken (`ON CONFLICT DO NOTHING`, so a name held by another process is never overwritten); whether it was added. */
  private insert(member: Member): boolean {
    const row = this.db
      .prepare(
        `INSERT INTO agents (id, workspace, role, parent_id, pid, started, status, task, activity, model, joined_at, seen_at, tool_calls, input, cache_read, output, cost, unpriced)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO NOTHING RETURNING id`,
      )
      .get(member.id, this.workspace, member.role, member.parentId ?? null, member.pid, member.started ?? null, member.status, member.goal ?? null, member.activity ?? null, member.model ?? null,
        member.joinedAt, member.updatedAt, member.toolCalls, member.input, member.cacheRead, member.output, member.cost, member.unpriced ? 1 : 0);
    return row !== undefined;
  }

  /**
   * Takes the name `member.id` in one write transaction. False when another running process holds it: the caller
   * draws another name. A row of this same process (a second join) is refreshed; one whose process is gone is
   * retired first (its unread mail becomes dead letters) and the name is taken over.
   */
  join(member: Member): boolean {
    return this.transaction(() => {
      if (this.insert(member) || this.refresh(member)) return true;
      const holder = this.processOf(member.id);
      if (holder && sameProcess(holder.pid, holder.started)) return false;
      this.retire(member.id, Date.now());
      return this.insert(member);
    });
  }

  /**
   * Leave: the agent and its reservations go; the messages it never read become dead letters the sender can see. With
   * `owner` (a process leaving its own row) nothing is removed when the row now names another process.
   */
  remove(id: string, now = Date.now(), owner?: ProcessIdentity): boolean {
    return this.transaction(() => {
      if (owner) {
        const row = this.processOf(id);
        if (row && !sameIdentity(row, owner)) return false;
      }
      this.retire(id, now);
      return true;
    });
  }

  /** The process the row of `id` names; undefined when it has no row. */
  private processOf(id: string): ProcessIdentity | undefined {
    const row = this.db.prepare('SELECT pid, started FROM agents WHERE id = ?').get(id) as Row | undefined;
    return row ? { pid: num(row['pid']), started: optionalString(row['started']) } : undefined;
  }

  /** Deletes the row, releases the leases and dead-letters the unread mail of `id`; the one place a member is dropped. */
  private retire(id: string, now: number): void {
    this.db.prepare('DELETE FROM agents WHERE id = ?').run(id);
    this.db.prepare('DELETE FROM leases WHERE owner = ?').run(id);
    this.db.prepare('UPDATE deliveries SET dead_at = ? WHERE recipient = ? AND delivered_at IS NULL AND dead_at IS NULL').run(now, id);
  }

  /**
   * Retires every member whose process is gone (`sameProcess`: dead, or a later process that got its pid): the one place
   * a member that did not leave is dropped and its unread mail dead-lettered. A stale member (alive, silent) is kept.
   * Each is judged outside the write lock and retired only if its row still names the process judged, so a member that
   * joined again under the same name meanwhile is left alone. What was retired is read back with `names`.
   */
  sweep(now = Date.now()): void {
    const rows = this.db.prepare('SELECT id, pid, started FROM agents').all() as Row[];
    for (const row of rows) {
      if (!sameProcess(num(row['pid']), optionalString(row['started']), now)) this.reap(String(row['id']), { pid: num(row['pid']), started: optionalString(row['started']) }, now);
    }
  }

  /** Retires `id` if its row still names `judged` (or is already gone, leaving leases of a member with no row to clean). */
  private reap(id: string, judged: ProcessIdentity | undefined, now: number): boolean {
    return this.transaction(() => {
      const row = this.processOf(id);
      if (row && (judged === undefined || !sameIdentity(row, judged))) return false;
      this.retire(id, now);
      return true;
    });
  }

  /**
   * The machine slept from `since` to `now`: no agent could heartbeat or renew. Members still live at `since` (by
   * heartbeat) and leases not yet expired then get a fresh start from `now`, so the first process awake does not prune
   * its sleeping peers, drop their reservations or dead-letter their messages. Idempotent: every process that wakes
   * calls it. A member that stays silent after the wake goes `STALE_MS` later, its leases `LEASE_MS` later.
   */
  resume(since: number, now = Date.now()): void {
    this.transaction(() => {
      this.db.prepare('UPDATE agents SET seen_at = MAX(seen_at, ?) WHERE workspace = ? AND seen_at >= ?').run(now, this.workspace, since - STALE_MS);
      this.db.prepare('UPDATE leases SET expires_at = MAX(expires_at, ?) WHERE workspace = ? AND expires_at > ?').run(now + LEASE_MS, this.workspace, since);
    });
  }

  /** Every agent name in the shared database, whatever its workspace (ids are unique across all of them), live or not yet dropped. */
  names(): string[] {
    return (this.db.prepare('SELECT id FROM agents').all() as Row[]).map((row) => String(row['id']));
  }

  /**
   * Visible agents of this workspace, oldest first, with unanswered-message counts and held paths. A stale one (silent
   * for `STALE_MS`) or one whose process is gone is left out; nothing is removed here, `sweep` and `remove` do that.
   */
  list(now = Date.now()): Member[] {
    const rows = this.db
      .prepare(
        `SELECT a.*, (SELECT count(*) FROM deliveries d JOIN messages m ON m.id = d.message
                      WHERE d.recipient = a.id AND d.delivered_at IS NOT NULL AND d.completed_at IS NULL AND m.reply_required = 1) AS pending
         FROM agents a WHERE a.workspace = ? ORDER BY a.joined_at, a.id`,
      )
      .all(this.workspace) as Row[];
    const live = rows.map(toMember).filter((member) => !stale(member.updatedAt, now) && sameProcess(member.pid, member.started, now));
    const held = this.leases(now);
    return live.map((member) => {
      const locks = held.filter((lease) => lease.owner === member.id).map((lease) => (lease.kind === 'tree' ? `${lease.path}/` : lease.path));
      return locks.length > 0 ? { ...member, locks } : member;
    });
  }

  /** Ids of this workspace's agents that can still read mail: every one whose process runs, stale (stalled) ones included. */
  private reachable(): Set<string> {
    const rows = this.db.prepare('SELECT id, pid, started FROM agents WHERE workspace = ?').all(this.workspace) as Row[];
    const now = Date.now();
    return new Set(rows.filter((row) => sameProcess(num(row['pid']), optionalString(row['started']), now)).map((row) => String(row['id'])));
  }

  // ── messages ──────────────────────────────────────────────────────────────

  /**
   * Store one message for every recipient that can still read it (a stalled, stale one keeps its mail). A reply
   * completes the delivery it answers. Recipients that left or whose process ended are refused and returned in
   * `departed`; with none left, nothing is stored and `id` is undefined.
   * `wake` (a question, or a sender outside the team) lets it start an idle recipient's turn; otherwise only the
   * answer to a question that recipient asked, and still awaited, wakes it. `sign` makes the recipient's `proof` once the
   * message has its id (see `userProof`); it returns undefined for a recipient the caller cannot sign for.
   */
  send(
    from: string, to: string[], body: string, options: SendOptions & { replyRequired: boolean; wake?: boolean; sign?: SignProof },
    now = Date.now(),
  ): { id: number | undefined; departed: string[] } {
    return this.transaction(() => {
      // Read in the same IMMEDIATE transaction as the insert: no recipient can leave in between.
      const live = this.reachable();
      const departed = to.filter((recipient) => !live.has(recipient));
      const recipients = to.filter((recipient) => live.has(recipient));
      if (recipients.length === 0) return { id: undefined, departed };
      // The asker is woken by the answer to its own open question, never by a reply to an FYI or a thank-you.
      let asker: string | undefined;
      if (options.replyTo !== undefined) {
        const question = this.replyTarget(options.replyTo);
        const open = this.db.prepare('SELECT 1 FROM deliveries WHERE message = ? AND recipient = ? AND completed_at IS NULL').get(options.replyTo, from);
        if (question?.replyRequired && open !== undefined) asker = question.from;
      }
      const { lastInsertRowid } = this.db
        .prepare('INSERT INTO messages (workspace, sender, body, reply_required, reply_to, created_at) VALUES (?, ?, ?, ?, ?, ?)')
        .run(this.workspace, from, body, options.replyRequired ? 1 : 0, options.replyTo ?? null, now);
      const id = Number(lastInsertRowid);
      const insert = this.db.prepare('INSERT INTO deliveries (message, recipient, wake, proof) VALUES (?, ?, ?, ?)');
      for (const recipient of recipients) {
        const wake = options.interrupt ? WAKE.interrupt : options.wake || options.replyRequired || recipient === asker ? WAKE.wake : WAKE.none;
        insert.run(id, recipient, wake, options.sign?.(id, recipient) ?? null);
      }
      if (options.replyTo !== undefined) this.db.prepare('UPDATE deliveries SET completed_at = ? WHERE message = ? AND recipient = ? AND completed_at IS NULL').run(now, options.replyTo, from);
      return { id, departed };
    });
  }

  /** The sender of message `id` in this workspace and whether it asked for a reply; undefined when there is no such message. */
  replyTarget(id: number): { from: string; replyRequired: boolean } | undefined {
    const row = this.db.prepare('SELECT sender, reply_required FROM messages WHERE id = ? AND workspace = ?').get(id, this.workspace) as Row | undefined;
    return row ? { from: String(row['sender']), replyRequired: row['reply_required'] === 1 } : undefined;
  }

  /**
   * The questions `child` sent `parent` (messages with `replyRequired`) since `since`, oldest first, each with the
   * parent's first reply to it (a message with `replyTo` that id). Read from the existing tables: nothing is stored for it.
   */
  asks(child: string, parent: string, since: number): Ask[] {
    const rows = this.db
      .prepare(
        `SELECT m.id, m.body, m.created_at, r.id AS reply_id, r.created_at AS reply_at, r.sender AS reply_by
         FROM messages m JOIN deliveries d ON d.message = m.id AND d.recipient = ?
         LEFT JOIN messages r ON r.id = (SELECT min(id) FROM messages WHERE reply_to = m.id AND sender = d.recipient)
         WHERE m.workspace = ? AND m.sender = ? AND m.reply_required = 1 AND m.created_at >= ? ORDER BY m.id`,
      )
      .all(parent, this.workspace, child, since) as Row[];
    return rows.map(toAsk);
  }

  /** Messages `sender` sent whose recipients left before reading them, not yet reported to it (oldest first). */
  deadLetters(sender: string, limit = INBOX_BATCH_SIZE): DeadLetter[] {
    const rows = this.db
      .prepare(
        `SELECT m.id, m.body, d.recipient FROM deliveries d JOIN messages m ON m.id = d.message
         WHERE m.workspace = ? AND m.sender = ? AND d.dead_at IS NOT NULL AND d.notified_at IS NULL ORDER BY m.id, d.recipient LIMIT ?`,
      )
      .all(this.workspace, sender, limit) as Row[];
    const letters = new Map<number, DeadLetter>();
    for (const row of rows) {
      const id = num(row['id']);
      const letter = letters.get(id) ?? { id, recipients: [], text: String(row['body']) };
      letter.recipients.push(String(row['recipient']));
      letters.set(id, letter);
    }
    return [...letters.values()];
  }

  /** Records that the sender was told these dead letters went unread. */
  markNotified(letters: DeadLetter[], now = Date.now()): void {
    if (letters.length === 0) return;
    this.transaction(() => {
      const mark = this.db.prepare('UPDATE deliveries SET notified_at = ? WHERE message = ? AND recipient = ? AND dead_at IS NOT NULL');
      for (const letter of letters) for (const recipient of letter.recipients) mark.run(now, letter.id, recipient);
    });
  }

  /** How many messages newer than `after` wait undelivered for `id` (the inbox index alone): the inbox reads them only when this is non-zero. */
  waiting(id: string, after = 0): number {
    return num((this.db.prepare('SELECT COUNT(*) AS n FROM deliveries WHERE recipient = ? AND message > ? AND delivered_at IS NULL AND dead_at IS NULL').get(id, after) as Row)['n']);
  }

  /** The ids of the messages up to `through` that still wait undelivered for `id`: the inbox handed those over, or its mark ran ahead of this database. */
  waitingThrough(id: string, through: number): number[] {
    const rows = this.db.prepare('SELECT message FROM deliveries WHERE recipient = ? AND message <= ? AND delivered_at IS NULL AND dead_at IS NULL').all(id, through) as Row[];
    return rows.map((row) => num(row['message']));
  }

  /** One bounded batch of messages newer than `after` waiting for `id`, oldest first. `ack` marks the ones the model saw. */
  pending(id: string, after = 0): Message[] {
    const rows = this.db
      .prepare(
        `SELECT m.id, m.sender, m.body, m.created_at, m.reply_required, m.reply_to, d.wake, d.proof, s.role AS sender_role, s.task AS sender_goal
         FROM deliveries d JOIN messages m ON m.id = d.message LEFT JOIN agents s ON s.id = m.sender
         WHERE d.recipient = ? AND d.message > ? AND d.delivered_at IS NULL AND d.dead_at IS NULL ORDER BY m.id LIMIT ?`,
      )
      .all(id, after, INBOX_BATCH_SIZE) as Row[];
    return rows.map((row) => toMessage(row, id));
  }

  /** Mark messages delivered to `id` (FYI messages are complete on delivery). One reader per recipient, so no lease. */
  ack(id: string, messageIds: number[], now = Date.now()): void {
    if (messageIds.length === 0) return;
    this.transaction(() => {
      const mark = this.db.prepare(
        'UPDATE deliveries SET delivered_at = ?, completed_at = CASE WHEN (SELECT reply_required FROM messages WHERE id = ?) = 1 THEN completed_at ELSE COALESCE(completed_at, ?) END WHERE message = ? AND recipient = ? AND delivered_at IS NULL',
      );
      for (const message of messageIds) mark.run(now, message, now, message, id);
    });
  }

  /**
   * The latest messages in this workspace, newest first, with their delivery state. The workspace is shared by every
   * session in the repository, so the default fetches enough rows for a panel to filter its own and still show a few.
   */
  recent(limit = 30, now = Date.now(), windowMs = 10 * 60_000): Traffic[] {
    const rows = this.db.prepare('SELECT * FROM messages WHERE workspace = ? AND created_at > ? ORDER BY id DESC LIMIT ?').all(this.workspace, now - windowMs, limit) as Row[];
    const deliveries = this.db.prepare('SELECT recipient, delivered_at, completed_at, dead_at FROM deliveries WHERE message = ? ORDER BY recipient');
    return rows.map((row) => toTraffic(row, deliveries.all(num(row['id'])) as Row[]));
  }

  // ── leases ────────────────────────────────────────────────────────────────

  leases(now = Date.now()): Lease[] {
    return (this.db.prepare('SELECT * FROM leases WHERE workspace = ? AND expires_at > ? ORDER BY id').all(this.workspace, now) as Row[]).map(toLease);
  }

  /** A live lease held by someone other than `self` that covers `file` (or, for a tree request, lies under it). */
  conflict(file: string, self: string, kind: 'file' | 'tree' = 'file', now = Date.now()): Lease | undefined {
    const key = pathKey(this.workspace, file);
    const ancestors = ancestorKeys(key);
    const marks = ancestors.map(() => '?').join(',');
    // Same key, a tree above it, or (for a tree request) anything below it. Component boundaries, not string prefixes.
    const query = this.db.prepare(
      `SELECT * FROM leases WHERE workspace = ? AND owner <> ? AND expires_at > ? AND
         (path_key = ? OR (kind = 'tree' AND path_key IN (${marks})) OR (? = 'tree' AND path_key > ? AND path_key < ?)) ORDER BY id LIMIT 1`,
    );
    for (;;) {
      const row = query.get(this.workspace, self, now, key, ...ancestors, kind, `${key}/`, `${key}0`) as Row | undefined;
      if (!row) return undefined;
      const lease = toLease(row);
      // A crashed owner (killed, never left) frees its files now rather than when the lease runs out; a stalled one
      // (alive, silent) keeps them until they lapse, since its process may resume.
      if (!this.retireOwner(lease.owner, now)) return lease;
    }
  }

  /** Retires a lease owner that is gone (it has no row, or its process died or was replaced); whether it was. */
  private retireOwner(owner: string, now: number): boolean {
    const judged = this.processOf(owner);
    if (judged && sameProcess(judged.pid, judged.started, now)) return false;
    return this.reap(owner, judged, now);
  }

  /**
   * Reserve every request or none: a conflict with another live lease rejects the whole set. The requests must not
   * overlap each other (a tree and a path under it, two spellings of one path, a path twice): that is an error, as in
   * the agents-communication package, because the caller's intent is then unclear (ask for the tree alone).
   */
  lock(owner: string, requests: LeaseRequest[], now = Date.now()): { ok: true; leases: Lease[] } | { ok: false; conflicts: Array<{ path: string; heldBy: Lease }> } {
    if (requests.length === 0) throw new Error('Give at least one path.');
    const overlap = overlappingRequests(requests.map((request) => ({ ...request, key: pathKey(this.workspace, request.path) })));
    if (overlap) {
      const shown = (request: LeaseRequest) => path.relative(this.workspace, canonicalPath(path.resolve(this.workspace, request.path))) || '.';
      throw new Error(`Requested paths overlap: ${shown(overlap[0])} and ${shown(overlap[1])}. Nothing was locked; reserve the tree alone, or each path once.`);
    }
    return this.transaction(() => {
      this.prune(now);
      const conflicts = requests.flatMap((request) => {
        const heldBy = this.conflict(request.path, owner, request.kind, now);
        return heldBy ? [{ path: request.path, heldBy }] : [];
      });
      if (conflicts.length > 0) return { ok: false as const, conflicts };
      const find = this.db.prepare('SELECT id FROM leases WHERE workspace = ? AND owner = ? AND path_key = ? AND kind = ? AND expires_at > ?');
      const insert = this.db.prepare('INSERT INTO leases (workspace, path, path_key, kind, owner, reason, acquired_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
      const touch = this.db.prepare('UPDATE leases SET reason = ?, expires_at = ? WHERE id = ?');
      for (const request of requests) {
        const relative = path.relative(this.workspace, canonicalPath(path.resolve(this.workspace, request.path))) || '.';
        const key = pathKey(this.workspace, request.path);
        const existing = find.get(this.workspace, owner, key, request.kind, now) as Row | undefined;
        if (existing) touch.run(request.reason, now + LEASE_MS, num(existing['id']));
        else insert.run(this.workspace, relative, key, request.kind, owner, request.reason, now, now + LEASE_MS);
      }
      return { ok: true as const, leases: this.leases(now).filter((lease) => lease.owner === owner) };
    });
  }

  /**
   * Keep the owner's reservations alive; called with every heartbeat. Leases that had already lapsed (a peer may have
   * taken the path since) are released, not revived: the owner learns of them from `owned`, which no longer lists
   * them, and must lock them again.
   */
  renew(owner: string, now = Date.now()): void {
    this.transaction(() => {
      this.db.prepare('DELETE FROM leases WHERE owner = ? AND expires_at <= ?').run(owner, now);
      this.db.prepare('UPDATE leases SET expires_at = ? WHERE owner = ?').run(now + LEASE_MS, owner);
    });
    this.prune(now);
  }

  /** `kind:key` of every live lease the owner holds in this workspace. */
  owned(owner: string, now = Date.now()): Set<string> {
    return new Set(this.leases(now).filter((lease) => lease.owner === owner).map((lease) => `${lease.kind}:${pathKey(this.workspace, lease.path)}`));
  }

  /** Release the owner's reservations for the given paths, or all of them; returns how many were released. */
  unlock(owner: string, paths?: string[]): number {
    if (!paths || paths.length === 0) return Number(this.db.prepare('DELETE FROM leases WHERE owner = ?').run(owner).changes);
    const remove = this.db.prepare('DELETE FROM leases WHERE workspace = ? AND owner = ? AND path_key = ?');
    return paths.reduce((count, file) => count + Number(remove.run(this.workspace, owner, pathKey(this.workspace, file)).changes), 0);
  }
}
