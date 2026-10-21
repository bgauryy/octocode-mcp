/** Bound workspace/session operations over the shared coordination protocol. */
import { randomUUID } from 'node:crypto';
import { statSync } from 'node:fs';
import * as activity from './activity.js';
import * as catalog from './catalog.js';
import { completionCheck } from './completion.js';
import { execute, openDatabase, query, rowInteger, rowOptionalText, rowText, transaction, type Database, type Row, type SqlValue } from './database.js';
import type { AttachInput, ClaudeInbound, CommandInputs, CommandResults, HostInboundData, CompleteInput, CompletionCheckInput, HeartbeatInput, JoinInput, RecordUsageInput, ResumeInput, RetryDeliveryInput, SendMessageInput, SetStatusInput, SubscribeInput } from './catalog-types.generated.js';
import * as delivery from './dispatch.js';
import type { DeliveryApi, Dispatched, Staged } from './dispatch.js';
import { ValidationError } from './errors.js';
import { RESERVED_KEY_PREFIXES, notifyExpired } from './expiry.js';
import { health } from './health.js';
import { ownedHere } from './owner-lock.js';
import * as leases from './leases.js';
import { peerContext, peersChanged } from './peers.js';
import { answerSlots, finishRequest, isRequest, messageSlots, wakesByDefault } from './protocols.js';
import { fetch, record } from './records.js';
import { inboxItem, sessionRow, type Session } from './rows.js';
import { Registration, register } from './registry.js';
import { context, readDocument, shareDocument } from './documents.js';
import type { AttachmentHost } from './store-types.js';
import { stripNulls } from './store-types.js';
import { truncateCodePoints } from './text.js';
import { HOUR_MS, LEASE_TTL_MAX_MS, SESSION_TTL_MS, now } from './timing.js';
import { jsonEqual, parseObject, type JsonObject } from './validation.js';
import { compact, dumps } from './wire.js';
import { checkScope, coordinationScope, currentBranch, registerWorkspace, scopeWorkspaces, storedScope } from './workspace.js';
import { realpath } from './paths.js';

const INBOX_COLUMNS = 'm.id,m.sender,s.name AS senderName,m.kind,m.body,m.reasoning,m.topic,m.expiresAt,m.wake,m.conversationId,m.replyTo,m.replyRequired FROM deliveries d JOIN messages m ON m.id=d.message JOIN sessions s ON s.id=m.sender';

/** What `send` stores: a send_message input, or the final reply `complete` builds from its own input. */
type Outgoing = SendMessageInput & { replyTo?: number; slots?: JsonObject; outcome?: CompleteInput['outcome'] };

export class Store implements AttachmentHost, DeliveryApi {
  readonly workspace: string;
  readonly coordinationScope: string;
  readonly database: string;
  readonly db: Database;
  private readonly identity: { dev: bigint; ino: bigint };
  private readonly writer: boolean;
  private readonly registration: Registration | null;
  private idleInbox: string | null = null;

  constructor(database: string, workspace: string, readOnly = false, create = false) {
    this.workspace = realpath(workspace, true);
    this.coordinationScope = coordinationScope(this.workspace);
    this.database = database;
    this.db = openDatabase(this.database, readOnly, create);
    this.identity = statSync(this.database, { bigint: true });
    this.writer = !readOnly;
    // A non-default database is announced where tools that read only the default one can find it.
    this.registration = this.writer ? register(this.database) : null;
  }

  close(): void {
    if (this.writer) {
      try {
        this.db.exec('PRAGMA optimize');
      } catch {
        /* optimizing is best effort */
      }
    }
    this.db.close();
  }

  checkDatabase(): void {
    let current;
    try {
      current = statSync(this.database, { bigint: true });
    } catch {
      throw new ValidationError('Coordination database disappeared; stop this worker');
    }
    if (!current.isFile()) throw new ValidationError('Coordination database is no longer a file; stop this worker');
    if (current.dev !== this.identity.dev || current.ino !== this.identity.ino) throw new ValidationError('Coordination database was replaced; stop this worker');
  }

  known(session: string, active = true): Session {
    this.checkDatabase();
    checkScope(this.db, this.workspace, this.coordinationScope);
    const rows = query(this.db, 'SELECT * FROM sessions WHERE id=? AND workspace=? AND (?=0 OR expiresAt>?)', [session, this.workspace, active, now()]);
    if (!rows.length) throw new ValidationError('Unknown or expired session in this workspace. Refresh peers and copy the exact current ID; never reconstruct it. If your bound identity expired, its lifecycle owner resumes it (a raw CLI agent runs resume {"vendor":...} itself), then acquire fresh leases before writing.');
    return sessionRow(rows[0]!);
  }

  peer(id: string): Session {
    const rows = query(this.db, 'SELECT * FROM sessions WHERE id=?', [id]);
    if (!rows.length || storedScope(this.db, rowText(rows[0]!, 'workspace')) !== this.coordinationScope) throw new ValidationError('Unknown session in this repository. Refresh peers and use its exact ID.');
    return sessionRow(rows[0]!);
  }

  sharedWorkspaces(): string[] {
    return scopeWorkspaces(this.db, this.coordinationScope, this.workspace);
  }

  private liveNames(exclude = ''): Set<string> {
    return new Set(query(this.db, 'SELECT name FROM sessions WHERE workspace IN (SELECT value FROM json_each(?)) AND expiresAt>? AND id<>?', [dumps(this.sharedWorkspaces()), now(), exclude]).map(row => rowText(row, 'name')));
  }

  /**
   * Live peers in one repository scope have distinct names, so a name can address a peer.
   * A taken name gets the first free -2, -3 … suffix, as Claude Code does for sessions.
   */
  uniqueName(name: string, exclude = ''): string {
    const taken = this.liveNames(exclude);
    let candidate = name;
    for (let number = 2; taken.has(candidate); number += 1) {
      const suffix = '-' + number;
      candidate = truncateCodePoints(name, 256 - suffix.length) + suffix;
    }
    return candidate;
  }

  /** Maps a `to` value to a session ID: an exact ID, else a unique live peer name, else the only session ever named so in this repository. */
  resolvePeer(value: string): string {
    if (query(this.db, 'SELECT 1 FROM sessions WHERE id=?', [value]).length) return value;
    const scope = dumps(this.sharedWorkspaces());
    for (const live of [true, false]) {
      const rows = query(this.db, 'SELECT id FROM sessions WHERE name=? AND workspace IN (SELECT value FROM json_each(?)) AND (?=0 OR expiresAt>?) ORDER BY id LIMIT 2', [value, scope, live, now()]);
      if (rows.length === 1) return rowText(rows[0]!, 'id');
      if (rows.length) throw new ValidationError(`Name ${value} matches several ${live ? 'live ' : ''}peers; use the exact ID from peers`);
    }
    throw new ValidationError(`Unknown peer ${value}. Use a peer name or exact ID from peers.`);
  }

  hostIdentities(vendor: string, host: string): { id: string }[] {
    return query(this.db, 'SELECT s.id FROM sessions s LEFT JOIN attachments a ON a.session=s.id WHERE s.workspace=? AND s.vendorSession=? AND (s.vendor=? OR a.transport=?) ORDER BY s.id LIMIT 2', [this.workspace, host, vendor, vendor]).map(row => ({ id: rowText(row, 'id') }));
  }

  /** The commands the store runs; the others (delivery loops, hooks, database tools) are run by their own modules. */
  private readonly handlers: { [N in catalog.CommandName]?: (session: string, input: CommandInputs[N]) => CommandResults[N] | Promise<CommandResults[N]> } = {
    fetch: (session, input) => fetch(this, session, input),
    record: (session, input) => record(this, session, input),
    activity: async (session, input) => {
      this.known(session, false);
      return activity.read(this.workspace, input);
    },
    binding: session => {
      const identity = this.known(session, false);
      return this.withCheckpoint(session, { ...identity, coordinationScope: this.coordinationScope, active: identity.expiresAt > now() });
    },
    health: (_session, input) => health(this, input),
    peers: (_session, input) => catalog.page(query(this.db, 'SELECT id,workspace,(SELECT coordinationScope FROM workspaces w WHERE w.workspace=sessions.workspace) AS coordinationScope,name,vendor,vendorSession,branch,task,status,expiresAt FROM sessions WHERE workspace IN (SELECT value FROM json_each(?)) AND expiresAt>? AND id>? ORDER BY id LIMIT 101', [dumps(this.sharedWorkspaces()), now(), input.after ?? '']).map(row => ({ ...sessionRow(row), coordinationScope: rowOptionalText(row, 'coordinationScope') })), true, 'peers', input),
    inbox: (session, input) => {
      if (input.message === undefined) return this.inbox(session, input.after ?? 0);
      this.known(session);
      return catalog.page(query(this.db, 'SELECT ' + INBOX_COLUMNS + ' WHERE d.recipient=? AND d.acknowledgedAt IS NULL AND m.expiresAt>? AND m.id=?', [session, now(), input.message]).map(inboxItem), false, 'inbox', input);
    },
    join: (_session, input) => this.join(input),
    resume: (session, input) => this.resume(session, input),
    heartbeat: (session, input) => this.heartbeat(session, input),
    set_status: (session, input) => this.setStatus(session, input),
    leave: session => this.leave(session),
    subscribe: (session, input) => this.subscribe(session, input),
    prune: () => this.prune(),
    check_write: (session, input) => leases.checkWrite(this, session, input),
    check_paths: (session, input) => leases.checkPaths(this, session, input),
    share_document: (session, input) => shareDocument(this, session, input),
    read_document: (session, input) => readDocument(this, session, input),
    context: (session, input) => context(this, session, input),
    locks: (session, input) => leases.locks(this, session, input),
    lock: (session, input) => leases.lock(this, session, input),
    lock_many: (session, input) => leases.lockMany(this, session, input),
    renew: (session, input) => leases.renew(this, session, input),
    unlock: (session, input) => leases.unlock(this, session, input),
    send_message: (session, input) => this.send(session, input, false, false),
    // notify_all's input is a subset of send_message's.
    notify_all: (session, input) => this.send(session, { ...input }, true, false),
    complete: (session, input) => this.complete(session, input),
  };

  /** Runs one catalog command; only `activity` waits on anything (Git), every database step is synchronous. */
  async call<N extends catalog.CommandName>(session: string, name: N, input: CommandInputs[N]): Promise<CommandResults[N]> {
    this.checkDatabase();
    this.registration?.touch();
    catalog.command(name, input);
    const handler = this.handlers[name];
    if (!handler) throw new ValidationError('Unknown operation: ' + name);
    return stripNulls(await handler(session, input));
  }

  private join(input: JoinInput): CommandResults['join'] {
    const branch: string | null = input.branch !== undefined ? input.branch : currentBranch(this.workspace);
    return transaction(this.db, () => {
      registerWorkspace(this.db, this.workspace, this.coordinationScope);
      const id = randomUUID();
      const name = this.uniqueName(catalog.text(input, 'name'));
      const vendor = catalog.text(input, 'vendor');
      if ('vendorSession' in input) catalog.text(input, 'vendorSession');
      const expires = now() + SESSION_TTL_MS;
      execute(this.db, 'INSERT INTO sessions(id,workspace,name,vendor,vendorSession,branch,expiresAt,task,status) VALUES(?,?,?,?,?,?,?,?,?)', [id, this.workspace, name, vendor, input.vendorSession ?? null, branch, expires, input.task ?? '', input.status ?? 'unknown']);
      return { id, name, vendor, vendorSession: input.vendorSession, expiresAt: expires };
    });
  }

  private resume(session: string, input: ResumeInput): CommandResults['resume'] {
    return transaction(this.db, () => {
      const row = this.known(session, false);
      if (row.vendor !== catalog.text(input, 'vendor') || row.expiresAt > now()) throw new ValidationError('Vendor mismatch or session still active');
      this.revive(session, row);
      return this.withCheckpoint(session, this.known(session));
    });
  }

  /** Recovers an expired identity as a new presence: no leases, no claims, a free name. */
  private revive(session: string, row: Session): void {
    execute(this.db, 'DELETE FROM leases WHERE owner=?', [session]);
    execute(this.db, 'DELETE FROM lease_waits WHERE owner=?', [session]);
    execute(this.db, 'UPDATE deliveries SET claimUntil=0,claimedBy=NULL WHERE recipient=? AND acknowledgedAt IS NULL', [session]);
    execute(this.db, 'UPDATE sessions SET expiresAt=?,name=? WHERE id=?', [now() + SESSION_TTL_MS, this.uniqueName(row.name, session), session]);
    leases.grantWaits(this, now());
  }

  /**
   * An expired row whose owner process holds the live delivery-owner lock was not crashed: the process slept or stalled past
   * the presence TTL. Such a session renews itself and keeps its leases, except those another owner took meanwhile. If its
   * name was taken by a newer join the identity is revived as `resume` would (no leases, a free name). Without the lock
   * nothing changes: expiry still means the owner died. An explicit `leave` (the row's latest coordination event is
   * `coordinate.out`) is an end the owner chose, not a stall: it is never undone.
   */
  private reclaim(session: string): void {
    const rows = query(this.db, 'SELECT * FROM sessions WHERE id=? AND workspace=?', [session, this.workspace]);
    const at = now();
    if (!rows.length || rowInteger(rows[0]!, 'expiresAt') > at || !ownedHere(this.database, session)) return;
    const last = query(this.db, "SELECT type FROM records WHERE \"from\"=? AND type IN ('coordinate.in','coordinate.update','coordinate.out') ORDER BY id DESC LIMIT 1", [session])[0];
    if (last !== undefined && rowText(last, 'type') === 'coordinate.out') return;
    const row = sessionRow(rows[0]!);
    if (this.liveNames(session).has(row.name)) return this.revive(session, row);
    leases.forgoTakenLeases(this, session, at);
    execute(this.db, 'UPDATE sessions SET expiresAt=? WHERE id=?', [at + SESSION_TTL_MS, session]);
  }

  private heartbeat(session: string, input: HeartbeatInput): CommandResults['heartbeat'] {
    return transaction(this.db, () => {
      this.reclaim(session);
      const identity = this.known(session);
      if (input.vendorSession !== undefined) {
        catalog.text(input, 'vendorSession');
        this.validateVendorSessionUpdate(session, identity, input.vendorSession);
      }
      const at = now();
      if (identity.expiresAt <= at) throw new ValidationError('Session expired before heartbeat; stop this worker');
      const expires = at + catalog.ttl(input, SESSION_TTL_MS, LEASE_TTL_MAX_MS);
      execute(this.db, 'UPDATE sessions SET expiresAt=?,vendorSession=coalesce(?,vendorSession),task=coalesce(?,task),status=coalesce(?,status) WHERE id=?', [expires, input.vendorSession ?? null, input.task ?? null, input.status ?? null, session]);
      if (input.name !== undefined) {
        if (this.liveNames(session).has(catalog.text(input, 'name'))) throw new ValidationError(`Name ${input.name} belongs to a live peer; choose another name`);
        execute(this.db, 'UPDATE sessions SET name=? WHERE id=?', [input.name, session]);
      }
      if (input.branch !== undefined) execute(this.db, 'UPDATE sessions SET branch=? WHERE id=?', [input.branch, session]);
      const renewedLeases = input.renewLeases ? execute(this.db, 'UPDATE leases SET expiresAt=?,refreshedAt=? WHERE owner=? AND workspace=? AND expiresAt>? AND expiresAt<?', [expires, at, session, this.workspace, at, expires]) : undefined;
      // Periodic heartbeats hand silently expired leases to waiters and tell the sender of any request that expired unacknowledged.
      leases.grantWaits(this, at);
      notifyExpired(this, session, at);
      return { alive: true, expiresAt: expires, renewedLeases };
    });
  }

  private setStatus(session: string, input: SetStatusInput): CommandResults['set_status'] {
    return transaction(this.db, () => {
      this.known(session);
      execute(this.db, 'UPDATE sessions SET task=coalesce(?,task),status=coalesce(?,status) WHERE id=?', [input.task ?? null, input.status ?? null, session]);
      const row = this.known(session);
      return { id: row.id, task: row.task, status: row.status };
    });
  }

  private leave(session: string): CommandResults['leave'] {
    return transaction(this.db, () => {
      this.known(session, false);
      execute(this.db, 'DELETE FROM leases WHERE owner=?', [session]);
      execute(this.db, 'DELETE FROM lease_waits WHERE owner=?', [session]);
      execute(this.db, 'DELETE FROM subscriptions WHERE session=?', [session]);
      execute(this.db, 'UPDATE deliveries SET claimUntil=0,claimedBy=NULL WHERE recipient=? AND acknowledgedAt IS NULL', [session]);
      // Never raises expiresAt, so the trigger's `NEW<OLD AND NEW<=now` arm always appends coordinate.out, which `reclaim` reads as the end.
      execute(this.db, 'UPDATE sessions SET expiresAt=min(?,expiresAt-1) WHERE id=?', [now(), session]);
      leases.grantWaits(this, now());
      return { left: true };
    });
  }

  private subscribe(session: string, input: SubscribeInput): CommandResults['subscribe'] {
    return transaction(this.db, () => {
      this.known(session);
      const topics = input.topics;
      for (const topic of topics) catalog.text({ topic }, 'topic');
      execute(this.db, 'DELETE FROM subscriptions WHERE session=? AND topic NOT IN (SELECT value FROM json_each(?))', [session, dumps(topics)]);
      for (const topic of topics) execute(this.db, 'INSERT OR IGNORE INTO subscriptions VALUES(?,?)', [session, topic]);
      return { subscribed: true };
    });
  }

  private prune(): CommandResults['prune'] {
    return transaction(this.db, () => {
      const at = now();
      const removed = execute(this.db, 'DELETE FROM leases WHERE id IN (SELECT l.id FROM leases l JOIN sessions s ON s.id=l.owner WHERE l.workspace=? AND (l.expiresAt<=? OR s.expiresAt<=?) ORDER BY l.id LIMIT 100)', [this.workspace, at, at]);
      leases.grantWaits(this, at);
      return removed === 100 ? { removed, next: { command: 'prune', input: {} } } : { removed };
    });
  }

  /** Checkpoint-resume: an identity read returns the agent's latest checkpoint record. */
  private withCheckpoint(session: string, identity: Session & { coordinationScope?: string; active?: boolean }): CommandResults['binding'] {
    const rows = query(this.db, "SELECT id,timestamp,data FROM records WHERE \"from\"=? AND type='checkpoint' ORDER BY id DESC LIMIT 1", [session]);
    if (!rows.length) return identity;
    return { ...identity, checkpoint: { recordId: rowInteger(rows[0]!, 'id'), timestamp: rowInteger(rows[0]!, 'timestamp'), data: parseObject(rowText(rows[0]!, 'data'), 'checkpoint data') } };
  }

  private validateVendorSessionUpdate(session: string, identity: Session, value: string): void {
    if (identity.vendorSession !== value) {
      this.ensureBindingChangeAllowed(session);
      if (query(this.db, "SELECT 1 FROM attachments WHERE session=? AND transport<>'raw'", [session]).length) throw new ValidationError("Use attach to change a native receiver's vendorSession");
    }
  }

  private complete(session: string, input: CompleteInput): CommandResults['complete'] {
    if ('reply' in input) {
      const [slots, body] = answerSlots(this, session, input);
      // The outcome also travels in reasoning, which inbox returns beside the BLUF body.
      const reasoning = `Outcome: ${input.outcome}` + ('reasoning' in input ? '; ' + input.reasoning : '');
      catalog.text({ reasoning }, 'reasoning');
      return this.send(session, { replyTo: input.message, body, slots, outcome: input.outcome, reasoning, key: `complete:${input.message}`, wake: 'action' }, false, true);
    }
    return transaction(this.db, () => {
      this.known(session);
      const messages: number[] = input.messages ?? [input.message!];
      const required = query(this.db, 'SELECT m.id FROM deliveries d JOIN messages m ON m.id=d.message WHERE d.recipient=? AND d.acknowledgedAt IS NULL AND m.replyRequired=1 AND m.id IN (SELECT value FROM json_each(?)) LIMIT 1', [session, dumps(messages)]);
      if (required.length) throw new ValidationError(`Message ${rowInteger(required[0]!, 'id')} requires a final answer: use complete with message and reply, or leave unfinished work pending`);
      const at = now();
      for (const message of messages) {
        if (execute(this.db, 'UPDATE deliveries SET acknowledgedAt=coalesce(acknowledgedAt,?) WHERE message=? AND recipient=?', [at, message, session]) !== 1) throw new ValidationError('Completion requires every ID to be received by this session');
      }
      return { completed: true, count: messages.length };
    });
  }

  send(session: string, input: Outgoing, broadcast?: boolean, completing?: false): CommandResults['send_message'];
  send(session: string, input: Outgoing, broadcast: boolean, completing: true): Extract<CommandResults['complete'], { id: number }>;
  send(session: string, input: Outgoing, broadcast = false, completing = false): CommandResults['send_message'] | Extract<CommandResults['complete'], { id: number }> {
    if (!completing && 'replyTo' in input) throw new ValidationError('Final replies require complete with message and reply');
    if (!broadcast && (('to' in input && 'topic' in input) || !['to', 'topic', 'replyTo'].some(key => key in input))) throw new ValidationError('Supply exactly one of to or topic. For replies use complete with message and reply.');
    let target: string | null = broadcast ? '*' : 'to' in input ? catalog.text(input, 'to') : 'topic' in input ? catalog.text(input, 'topic') : null;
    const reasoning = catalog.text(input, 'reasoning');
    // The kind decides the policy: requests owe an answer; requests and blockers wake.
    const kind = completing ? 'answer' : catalog.kindOf(input);
    const replyRequired = isRequest(kind);
    const duration = catalog.ttl(input, HOUR_MS);
    const wake: string = input.wake ?? (wakesByDefault(kind) ? 'action' : 'passive');
    const key = 'key' in input ? catalog.text(input, 'key') : randomUUID();
    if (!completing && RESERVED_KEY_PREFIXES.some(prefix => key.startsWith(prefix))) throw new ValidationError(`Keys beginning ${RESERVED_KEY_PREFIXES.join(', ')} are reserved for final replies and runtime notices`);
    return transaction(this.db, () => {
      this.known(session);
      if ('to' in input && !broadcast) target = this.resolvePeer(target!);
      let slots: JsonObject | null;
      let body: string;
      let conversation: string | undefined;
      if (completing) {
        // `complete` always supplies both.
        slots = input.slots!;
        body = input.body!;
      } else {
        [slots, body, conversation] = messageSlots(this, session, kind, input, target);
      }
      catalog.text({ body }, 'body');
      let replySender: string | null = null;
      if (input.replyTo !== undefined) {
        const parents = query(this.db, 'SELECT m.conversationId,m.sender,m.replyRequired FROM messages m JOIN sessions s ON s.id=m.sender WHERE m.id=? AND s.workspace IN (SELECT value FROM json_each(?)) AND (m.sender=? OR EXISTS(SELECT 1 FROM deliveries d WHERE d.message=m.id AND d.recipient=?))', [input.replyTo, dumps(this.sharedWorkspaces()), session, session]);
        if (!parents.length) throw new ValidationError(`Unknown message ${input.replyTo} for this session. Use data.messageId from fetch or item.id from inbox, never a recordId.`);
        const parent = parents[0]!;
        if (!parent.replyRequired) throw new ValidationError(`Message ${input.replyTo} is informational and accepts no reply. Handle it with complete using message or messages only; start a new direct request for new work`);
        conversation = rowOptionalText(parent, 'conversationId');
        replySender = rowText(parent, 'sender');
      }
      target = target ?? replySender;
      if (target === null) throw new ValidationError('Reply parent has no sender');
      if (completing && (replySender !== target || !query(this.db, 'SELECT 1 FROM deliveries WHERE message=? AND recipient=?', [input.replyTo!, session]).length)) throw new ValidationError('Completion requires replying to a message received by this session');
      const receipt = (id: number, recipients: number, effects: ReturnType<typeof finishRequest> = {}, offline = false): CommandResults['send_message'] | Extract<CommandResults['complete'], { id: number }> => {
        if (!completing) return { id, recipients, ...(offline ? { recipientOffline: true as const } : {}) };
        execute(this.db, 'UPDATE deliveries SET acknowledgedAt=? WHERE message=? AND recipient=? AND acknowledgedAt IS NULL', [now(), input.replyTo!, session]);
        return { id, recipients, ...(offline ? { recipientOffline: true as const } : {}), completed: true, count: 1, ...effects };
      };
      const existing = query(this.db, 'SELECT * FROM messages WHERE sender=? AND key=?', [session, key]);
      if (existing.length) {
        const row = existing[0]!;
        const expected: Row = { target, kind, body, topic: input.topic, reasoning, wake, conversationId: conversation, replyTo: input.replyTo, replyRequired, ttlMs: duration };
        if (Object.entries(expected).some(([field, value]) => (row[field] ?? null) !== (value ?? null)) || !jsonEqual(rowOptionalText(row, 'slots') === undefined ? null : parseObject(rowText(row, 'slots'), 'message slots'), slots ?? null))
          throw new ValidationError(completing ? 'Final reply already stored with different content; use send_message for new work' : 'Message key reused with different content (target, topic, body, reasoning, wake, correlation or ttlMs); use a new key');
        return receipt(rowInteger(row, 'id'), this.deliveryCount(rowInteger(row, 'id')));
      }
      if (completing && query(this.db, 'SELECT 1 FROM deliveries WHERE message=? AND recipient=? AND acknowledgedAt IS NOT NULL', [input.replyTo!, session]).length) throw new ValidationError('Message already completed without this reply; send_message for new work');
      let offline = false;
      let recipients: { id: string }[];
      if (broadcast) recipients = query(this.db, 'SELECT id FROM sessions WHERE workspace IN (SELECT value FROM json_each(?)) AND expiresAt>? AND id<>?', [dumps(this.sharedWorkspaces()), now(), session]).map(row => ({ id: rowText(row, 'id') }));
      else if (!('topic' in input)) {
        offline = this.peer(target).expiresAt <= now();
        recipients = [{ id: target }];
      } else recipients = query(this.db, 'SELECT s.id FROM sessions s JOIN subscriptions t ON s.id=t.session WHERE t.topic=? AND s.workspace IN (SELECT value FROM json_each(?)) AND s.expiresAt>? AND s.id<>?', [target, dumps(this.sharedWorkspaces()), now(), session]).map(row => ({ id: rowText(row, 'id') }));
      const id = this.db.run('INSERT INTO messages(sender,target,topic,body,key,expiresAt,reasoning,wake,conversationId,replyTo,ttlMs,replyRequired,kind,slots) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)', [session, target, input.topic ?? null, body, key, now() + duration, reasoning, wake, conversation ?? null, input.replyTo ?? null, duration, replyRequired, kind, slots === null ? null : compact(slots)] as SqlValue[]).lastInsertRowid;
      for (const recipient of recipients) execute(this.db, 'INSERT INTO deliveries(message,recipient) VALUES(?,?)', [id, recipient.id]);
      const effects = completing ? finishRequest(this, session, input.replyTo!, id, input.outcome!, now()) : {};
      return receipt(id, this.deliveryCount(id), effects, offline);
    });
  }

  private deliveryCount(message: number): number {
    return rowInteger(query(this.db, 'SELECT count(*) AS n FROM deliveries WHERE message=?', [message])[0]!, 'n');
  }

  inbox(session: string, after = 0): CommandResults['inbox'] {
    this.known(session);
    const state = `${session}\0${after}\0${this.db.value('PRAGMA data_version')}\0${this.db.value('SELECT total_changes()')}`;
    if (this.idleInbox === state) return { items: [] };
    const rows = query(this.db, 'SELECT ' + INBOX_COLUMNS + ' WHERE d.recipient=? AND d.acknowledgedAt IS NULL AND m.expiresAt>? AND d.message>? ORDER BY d.message LIMIT 101', [session, now(), after]);
    const result = catalog.page(rows.map(inboxItem), false, 'inbox', { after });
    this.idleInbox = rows.length ? null : state;
    return result;
  }

  completionCheck(session: string, input: CompletionCheckInput): CommandResults['completion-check'] {
    return completionCheck(this, session, input);
  }

  peersChanged(session: string, consumer: string, generation: string): boolean {
    return peersChanged(this, session, consumer, generation);
  }

  peerContext(session: string, consumer: string, generation: string): string {
    return peerContext(this, session, consumer, generation);
  }

  attach(session: string, input: AttachInput): CommandResults['attach'] { return delivery.attach(this, session, input); }
  attachment(session: string): CommandResults['attach'] { return delivery.attachment(this, session); }
  present(session: string, managed = false): Promise<void> { return delivery.present(this, session, managed); }
  hostInbound(session: string): HostInboundData | null { return delivery.hostInbound(this, session); }
  claudeInbound(session: string, endpoint: string, ownChild?: boolean): ClaudeInbound { return delivery.claudeInbound(this, session, endpoint, ownChild); }
  stage(session: string, mode: string, actionOnly?: boolean | null): Staged { return delivery.stage(this, session, mode, actionOnly); }
  stageBound(session: string, mode: string, binding: CommandResults['attach'] | null = null, actionOnly: boolean | null = null): Staged { return delivery.stageBound(this, session, mode, binding, actionOnly); }
  hasDispatchable(session: string, actionOnly: boolean): boolean { return delivery.hasDispatchable(this, session, actionOnly); }
  finishDispatch(session: string, items: readonly Dispatched[], error: string | null = null): void { delivery.finishDispatch(this, session, items, error); }
  releaseDispatch(session: string, items: readonly Dispatched[], reason: string): void { delivery.releaseDispatch(this, session, items, reason); }
  retryDelivery(session: string, input: RetryDeliveryInput): CommandResults['retry_delivery'] { return delivery.retryDelivery(this, session, input); }
  recordUsage(session: string, input: RecordUsageInput): CommandResults['record_usage'] { return delivery.recordUsage(this, session, input); }
  ensureBindingChangeAllowed(session: string): void { delivery.ensureBindingChangeAllowed(this, session); }
  reconcileCompletedOrphan(session: string): void { delivery.reconcileCompletedOrphan(this, session); }
}
