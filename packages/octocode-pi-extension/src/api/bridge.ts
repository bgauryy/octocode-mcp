import type { ExtensionAPI, ExtensionContext } from '@earendil-works/pi-coding-agent';
import { Box, Text } from '@earendil-works/pi-tui';
import { EventLog } from './events.js';
import { apiDir, ensurePrivateDir, newInstanceId, newToken, removeRecord, socketPath, writeRecord, type InstanceRecord } from './registry.js';
import { ApiServer, type Connection } from './server.js';
import { clampedParam, DEFAULT_EVENT_TYPES, ERR, MAX_FRAME_BYTES, numberParam, PROTOCOL_VERSION, RpcError, stringParam } from './protocol.js';
import { apiClientLabel, fencedBody, fenceUntrusted, headerText, messageHeader } from '../shared/fence.js';
import { redactData, redactSecrets, visibleControls } from '../shared/sanitize.js';
import { saveFullOutput } from '../shared/spill.js';
import { envFlag } from '../shared/env.js';
import { formatClock } from '../shared/format.js';
import { clip, resultBlock } from '../shared/render.js';
import { EXTERNAL_MESSAGE_TYPE, type MessageEnvelope } from '../shared/messages.js';
import { sha256 } from '../shared/atomic.js';
import { capChars, contentText, errorMessage, isRecord, toolHint } from '../shared/util.js';

const API_ENV = 'OCTOCODE_API';
const API_HTTP_ENV = 'OCTOCODE_API_HTTP';
/** Session entry (`pi.appendEntry`, never sent to the model) written for every turn an API client starts. */
const EXTERNAL_AUDIT_TYPE = 'octocode-external';
/** Senders a client may not claim: the user, the team's own API sender, and (checked per call) any live agent. */
const RESERVED_SENDERS = new Set(['user', 'external']);

const WAIT_DEFAULT_MS = 600_000;
const RESULT_MAX_CHARS = 64_000;
/** `messages.list` page size: the default, and the most one page holds (a larger `limit` gets this many; `earlier` reaches the rest). */
const HISTORY_PAGE = 20;
const HISTORY_MAX_PAGE = 100;

/**
 * Model text for an event or a history entry: credential-looking spans redacted first (so a secret that straddles the
 * limit is never left half-visible), then, over `RESULT_MAX_CHARS`, cut with the whole redacted text saved to a file
 * the note names (or the note says it could not be saved).
 */
function boundedText(text: string): string {
  const safe = redactSecrets(text);
  if (safe.length <= RESULT_MAX_CHARS) return safe;
  // The same answer reaches `message`, `agent.end` and the history: one file for it, not one per channel.
  if (lastSpilled?.text === safe) return lastSpilled.shown;
  const file = saveFullOutput(safe, 'api message');
  const shown = capChars(safe, RESULT_MAX_CHARS, file ? `the whole text is in ${file}` : 'the whole text could not be saved');
  lastSpilled = { text: safe, shown };
  return shown;
}
function boundedExternal(value: unknown): unknown {
  const safe = redactData(value);
  const text = JSON.stringify(safe);
  const bytes = Buffer.byteLength(text);
  if (bytes <= MAX_FRAME_BYTES / 2) return safe;
  const file = saveFullOutput(text, 'external-api-result');
  if (!file) throw new RpcError(ERR.unavailable, 'Complete external evidence could not be saved; execution may already have completed', { execution: 'uncertain', bytes });
  return { fullOutput: { path: file, bytes, format: 'json' }, notice: 'Complete redacted result saved on the Pi host; read this file before acting on the result.' };
}
let lastSpilled: { text: string; shown: string } | undefined;

/** What the API needs from the team (kept as an interface so the API domain stays independent of it). */
export interface AgentDirectory {
  list(): unknown[];
  /** Sends a team message (the team saves a long body to a file and delivers a pointer); a result with `error` (unknown recipient, nobody to reach) is a refusal. */
  tell(to: string, text: string): unknown;
  /** What a reader of a message from `from` gets for `text`: the text, or (when it is long) its head and the path of a file with all of it; an `error` when it cannot be saved. */
  deliverable(text: string, from: string): string | { error: string };
}

interface ApiOptions {
  /** Serve on a Unix socket (default when enabled; not available on Windows). */
  socket: boolean;
  /** Serve on loopback HTTP: a port, 0 for any free port, or undefined for no HTTP. */
  http?: number | undefined;
}

/** The transports the environment asks for, or undefined when the API is off. A bad port throws its reason instead of silently serving nothing. */
export function optionsFromEnv(env: NodeJS.ProcessEnv = process.env, platform = process.platform): ApiOptions | undefined {
  const httpText = env[API_HTTP_ENV]?.trim();
  const port = httpText === undefined || httpText === '' ? undefined : /^\d+$/.test(httpText) ? Number(httpText) : Number.NaN;
  if (port !== undefined && !(port >= 0 && port <= 65_535)) throw new Error(`Octocode API is off: ${API_HTTP_ENV}=${httpText} is not a port (0-65535; 0 picks a free one).`);
  const on = envFlag(env, API_ENV);
  if (!on && port === undefined) return undefined;
  const socket = on && platform !== 'win32';
  // Windows has no Unix sockets here: HTTP on a free port is the only transport.
  return { socket, http: port ?? (socket ? undefined : 0) };
}

/**
 * Where a tool call sits in the call tree. Calls a tool makes itself (`ctx.executeTool`, e.g. codemode scripts) carry
 * `parentToolCallId`, and Pi names them `<parent>/<n>`; provider ids contain no `/`, so the parent's segment count is
 * the depth: `toolu_1` → 0, `toolu_1/1` (parent `toolu_1`) → 1, `toolu_1/1/2` (parent `toolu_1/1`) → 2.
 */
export function nesting(parentId: string | undefined): { depth: number; parentId?: string } {
  return parentId ? { parentId, depth: parentId.split('/').length } : { depth: 0 };
}

export interface ApiOperations {
  messageSend?(message: MessageEnvelope, ctx: ExtensionContext, signal?: AbortSignal): Promise<void>;
  externalCall?(params: unknown, ctx: ExtensionContext): Promise<unknown>;
}

interface SendReceipt {
  phase: 'preparing' | 'accepted' | 'uncertain' | 'cancelled' | 'settled';
  reject(error: Error): void;
  controller: AbortController;
  ready: Promise<void>;
  fingerprint: string;
  accepted: { id: string; queued: string };
  settlement: Promise<{ text: string; stopReason?: string }>;
}

const SEND_RECEIPT_LIMIT = 128;

interface Waiter {
  resolve(result: { text: string; stopReason?: string }): void;
  reject(error: Error): void;
}

/**
 * An external API for one running Pi session: other programs discover it, send it messages, follow what it does and
 * ask it to stop. JSON-RPC 2.0 over a private Unix socket (and optionally authenticated loopback HTTP + SSE), the
 * shape Codex's app-server and ACP use, scoped to this extension's needs.
 */
export class OctocodeApi {
  readonly log = new EventLog();
  private ctx: ExtensionContext | undefined;
  private server: ApiServer | undefined;
  private record: InstanceRecord | undefined;
  private dir = apiDir();
  private readonly waiters = new Set<Waiter>();
  /** The last run's final assistant text, handed to `wait` callers when Pi settles. */
  private lastResult: { text: string; stopReason?: string } | undefined;
  private counter = 0;
  private receiptSession: string | undefined;
  private readonly receipts = new Map<string, SendReceipt>();
  private readonly preparing = new Set<SendReceipt>();
  private activeKey: string | undefined;
  private lastAssistantText = '';
  private pendingDelta = '';

  constructor(
    private readonly pi: ExtensionAPI,
    private readonly agents: AgentDirectory,
    private readonly version: () => string | undefined,
    private readonly env: NodeJS.ProcessEnv = process.env,
    private readonly operations: ApiOperations = {},
  ) {}

  get running(): boolean {
    return this.server !== undefined;
  }

  get directory(): string {
    return this.dir;
  }

  get instance(): InstanceRecord | undefined {
    return this.record;
  }

  /** Publish Pi's events to subscribers. Cheap when nobody listens: the log only keeps a short ring buffer. */
  observe(): void {
    const { pi, log } = this;
    const flushDelta = (): void => {
      if (!this.pendingDelta) return;
      const delta = boundedText(this.pendingDelta);
      this.pendingDelta = '';
      log.publish('message.delta', { delta });
    };
    registerExternalMessageRenderer(pi);
    pi.on('agent_start', () => {
      // A new run: `wait` must never answer with the previous run's text.
      this.lastResult = undefined;
      this.pendingDelta = '';
      if (this.server) log.publish('agent.start', {});
    });
    pi.on('agent_end', (event) => {
      if (!this.server) return;
      flushDelta();
      const last = [...event.messages].reverse().find((message) => message.role === 'assistant');
      const text = last ? contentText(last.content, { separator: '' }) : '';
      const stopReason = last && 'stopReason' in last ? String(last.stopReason) : undefined;
      this.lastAssistantText = text;
      this.lastResult = { text: boundedText(text), ...(stopReason ? { stopReason } : {}) };
      log.publish('agent.end', this.lastResult);
    });
    // `wait` answers once Pi has settled: after agent_end it may still continue (a queued follow-up, a compaction
    // retry), and the caller wants the final answer, not an intermediate one.
    pi.on('agent_settled', (event) => {
      if (!this.server) return;
      const result = { ...(this.lastResult ?? { text: '' }), ...(event.aborted ? { stopReason: 'aborted' } : {}) };
      for (const receipt of this.preparing) this.cancelPreparation(receipt, 'The session ran while the message was being prepared');
      for (const receipt of this.receipts.values()) if (receipt.phase === 'accepted') receipt.phase = 'settled';
      this.activeKey = undefined;
      log.publish('agent.settled', result);
      for (const waiter of [...this.waiters]) {
        this.waiters.delete(waiter);
        waiter.resolve(result);
      }
    });
    pi.on('message_end', (event) => {
      if (!this.server) return;
      const { role } = event.message;
      if (role === 'assistant') flushDelta();
      if (role === 'assistant' || role === 'user') log.publish('message', { role, text: boundedText(contentText(event.message.content, { separator: '' })) });
    });
    pi.on('message_update', (event) => {
      if (!this.server) return;
      const inner = event.assistantMessageEvent as { type?: string; delta?: unknown };
      if (inner.type === 'text_delta' && typeof inner.delta === 'string') this.pendingDelta += inner.delta;
    });
    pi.on('tool_execution_start', (event) => {
      if (!this.server) return;
      log.publish('tool.start', { id: event.toolCallId, name: event.toolName, hint: toolHint(event.args), ...nesting(event.parentToolCallId) });
    });
    pi.on('tool_execution_end', (event) => {
      if (!this.server) return;
      log.publish('tool.end', {
        id: event.toolCallId,
        name: event.toolName,
        isError: event.isError,
        ...nesting(event.parentToolCallId),
        ...(event.durationMs !== undefined ? { durationMs: event.durationMs } : {}),
      });
    });
    pi.on('session_compact', () => void (this.server && log.publish('compaction', {})));
  }

  /** Bind to the session, and serve on `options` (undefined: bound, not serving). */
  async start(ctx: ExtensionContext, options: ApiOptions | undefined): Promise<void> {
    await this.stop();
    this.ctx = ctx;
    if (!options) return;
    this.dir = apiDir(this.env);
    ensurePrivateDir(this.dir);
    const id = newInstanceId();
    const token = newToken();
    const server = new ApiServer((method, params, connection) => this.dispatch(method, params, connection), this.log, token);
    try {
      const record: InstanceRecord = { id, pid: process.pid, cwd: ctx.cwd, startedAt: Date.now(), protocol: PROTOCOL_VERSION };
      if (options.socket) {
        record.socket = socketPath(this.dir, id);
        await server.listenUnix(record.socket);
      }
      if (options.http !== undefined) {
        await server.listenHttp(options.http);
        record.http = { url: server.httpUrl!, token };
      }
      this.server = server;
      this.record = record;
      writeRecord(this.dir, record);
    } catch (error) {
      await server.close();
      throw new Error(`Octocode API could not start: ${errorMessage(error)}`);
    }
  }

  async stop(): Promise<void> {
    const { server, record } = this;
    this.server = undefined;
    this.record = undefined;
    this.ctx = undefined;
    this.lastResult = undefined;
    this.lastAssistantText = '';
    this.pendingDelta = '';
    for (const waiter of this.waiters) waiter.reject(new RpcError(ERR.unavailable, 'The session ended', { execution: 'accepted' }));
    this.waiters.clear();
    for (const receipt of this.preparing) this.cancelPreparation(receipt, 'The session ended');
    this.preparing.clear();
    this.receipts.clear();
    this.receiptSession = undefined;
    this.activeKey = undefined;
    if (record) removeRecord(this.dir, record.id);
    await server?.close();
    this.log.close();
  }

  private session(): ExtensionContext {
    if (!this.ctx) throw new RpcError(ERR.unavailable, 'No active session');
    const current = this.ctx.sessionManager.getSessionId();
    if (this.receiptSession !== current) {
      for (const waiter of this.waiters) waiter.reject(new RpcError(ERR.unavailable, 'The session was replaced', { execution: 'accepted' }));
      this.waiters.clear();
      for (const receipt of this.preparing) this.cancelPreparation(receipt, 'The session was replaced');
      this.preparing.clear();
      this.receipts.clear();
      this.activeKey = undefined;
      this.receiptSession = current;
    }
    return this.ctx;
  }

  private guardSession(params: Record<string, unknown>, ctx: ExtensionContext): void {
    const expected = stringParam(params, 'expectedSessionId', { optional: true });
    if (expected !== undefined && expected !== ctx.sessionManager.getSessionId()) throw new RpcError(ERR.unavailable, 'The expected session was replaced; nothing was sent', { execution: 'not-sent' });
  }

  private status(): Record<string, unknown> {
    const ctx = this.session();
    try {
      const usage = ctx.getContextUsage();
      return {
        state: ctx.isIdle() ? 'idle' : 'working',
        pending: ctx.hasPendingMessages(),
        cwd: ctx.cwd,
        sessionId: ctx.sessionManager.getSessionId(),
        sessionName: ctx.sessionManager.getSessionName() ?? null,
        model: ctx.model ? `${ctx.model.provider}/${ctx.model.id}` : null,
        context: usage ?? null,
        seq: this.log.seq,
        ...(this.activeKey ? { activeMessageId: this.receipts.get(this.activeKey)?.accepted.id } : {}),
      };
    } catch {
      throw new RpcError(ERR.unavailable, 'The session was replaced', { execution: 'accepted' });
    }
  }

  private async dispatch(method: string, params: Record<string, unknown>, connection: Connection): Promise<unknown> {
    switch (method) {
      case 'ping':
        return {};
      case 'initialize':
        return {
          protocolVersion: PROTOCOL_VERSION,
          instance: { id: this.record?.id, pid: process.pid, cwd: this.ctx?.cwd, version: this.version() },
          capabilities: { events: DEFAULT_EVENT_TYPES, optionalEvents: ['message.delta'], wait: true, agents: true, streaming: connection.subscribe !== undefined },
        };
      case 'status':
        return this.status();
      case 'message.send':
        return this.send(params);
      case 'turn.abort': {
        const ctx = this.session();
        this.guardSession(params, ctx);
        const key = stringParam(params, 'key', { optional: true, max: 128 });
        if (key !== undefined && (this.activeKey !== key || !this.receipts.has(key))) {
          throw new RpcError(ERR.unavailable, 'This request does not own the active run');
        }
        if (key !== undefined) {
          const receipt = this.receipts.get(key)!;
          if (receipt.phase === 'preparing') {
            this.cancelPreparation(receipt, 'Message preparation was cancelled; nothing was sent');
            return { aborted: false, cancelledPreparation: true };
          }
          if (receipt.phase !== 'accepted') throw new RpcError(ERR.unavailable, 'This request no longer owns the active run');
        }
        const wasBusy = !ctx.isIdle();
        ctx.abort();
        return { aborted: wasBusy };
      }
      case 'external.call': {
        if (!this.operations.externalCall) throw new RpcError(ERR.unavailable, 'External agents are not registered');
        try { return boundedExternal(await this.operations.externalCall(params, this.session())); }
        catch (error) {
          const details = isRecord(error) ? error : {};
          const data = Object.fromEntries(['partial', 'execution', 'stderr'].filter((key) => details[key] !== undefined).map((key) => [key, details[key]]));
          const evidence = boundedExternal(data);
          const visible = isRecord(evidence) && evidence['fullOutput'] ? { ...redactData({ execution: data['execution'] }), ...evidence } : evidence;
          throw new RpcError(ERR.unavailable, redactSecrets(errorMessage(error)), visible);
        }
      }
      case 'messages.list':
        return this.history(clampedParam(params, 'limit', { min: 1, max: HISTORY_MAX_PAGE }) ?? HISTORY_PAGE, clampedParam(params, 'before', { min: 0, max: Number.MAX_SAFE_INTEGER }));
      case 'events.subscribe': {
        if (!connection.subscribe) throw new RpcError(ERR.invalidRequest, 'Streaming needs the socket transport or GET /events');
        const since = numberParam(params, 'since', { min: 0, max: Number.MAX_SAFE_INTEGER });
        const types = params['types'];
        if (types !== undefined && (!Array.isArray(types) || types.some((type) => typeof type !== 'string'))) throw new RpcError(ERR.invalidParams, 'types must be an array of strings');
        return connection.subscribe({ ...(since !== undefined ? { since } : {}), ...(types ? { types: types as string[] } : {}) });
      }
      case 'events.unsubscribe':
        connection.unsubscribe?.();
        return {};
      case 'agents.list':
        return { agents: this.agents.list() };
      case 'agents.tell':
        return this.tell(params);
      default:
        throw new RpcError(ERR.methodNotFound, `Unknown method ${method}`);
    }
  }

  /** `agents.tell`: a long text is the team's to save and point to; a refusal (unknown agent, nobody reachable) is an RPC error. */
  private async tell(params: Record<string, unknown>): Promise<unknown> {
    const to = stringParam(params, 'to')!;
    const text = this.label(stringParam(params, 'text')!);
    const result = await this.agents.tell(to, text);
    this.audit({ method: 'agents.tell', to, chars: text.length, accepted: !(result && typeof result === 'object' && 'error' in result) });
    if (result && typeof result === 'object' && typeof (result as { error?: unknown }).error === 'string') throw new RpcError(ERR.invalidParams, (result as { error: string }).error);
    return result;
  }

  private label(text: string): string {
    return visibleControls(text);
  }

  /** Records an API-started turn in the session (a `octocode-external` entry), so what an outside program caused can be reviewed. */
  private audit(data: Record<string, unknown>): void {
    try {
      this.pi.appendEntry(EXTERNAL_AUDIT_TYPE, { at: Date.now(), ...data });
    } catch {
      // The session ended: nothing to record in.
    }
  }

  /** The sender name a client gave, on one line; a name that would pass for the user, the team or a live agent is refused. */
  private sender(params: Record<string, unknown>): string {
    const given = stringParam(params, 'from', { max: 64, optional: true });
    const from = headerText((given ?? 'external client').replaceAll('"', ' '), 64) || 'external client';
    const taken = this.agents.list().some((agent) => typeof agent === 'object' && agent !== null && (agent as { id?: unknown }).id === from);
    if (RESERVED_SENDERS.has(from.toLowerCase()) || taken) throw new RpcError(ERR.invalidParams, `The sender name ${JSON.stringify(from)} is reserved for the user or a team agent; name your client instead (for example "ci bot"). Nothing was sent.`);
    return from;
  }

  private async send(params: Record<string, unknown>): Promise<unknown> {
    const ctx = this.session();
    const originalSessionId = ctx.sessionManager.getSessionId();
    this.guardSession(params, ctx);
    const from = this.sender(params);
    const raw = stringParam(params, 'text')!;
    const whole = this.label(raw);
    const mode = params['mode'] ?? 'auto';
    if (mode !== 'auto' && mode !== 'steer' && mode !== 'followUp') throw new RpcError(ERR.invalidParams, 'mode must be auto, steer or followUp');
    if (params['requireIdle'] !== undefined && typeof params['requireIdle'] !== 'boolean') throw new RpcError(ERR.invalidParams, 'requireIdle must be a boolean');
    const requireIdle = params['requireIdle'] === true;
    const wait = params['wait'] === true;
    const timeout = numberParam(params, 'timeoutMs', { min: 1_000, max: 3_600_000 }) ?? WAIT_DEFAULT_MS;
    const key = stringParam(params, 'key', { optional: true, max: 128 });
    const fingerprint = sha256(JSON.stringify({ raw, from, mode, requireIdle }));
    const prior = key ? this.receipts.get(key) : undefined;
    if (prior) {
      if (prior.fingerprint !== fingerprint) throw new RpcError(ERR.invalidParams, 'The message key was already used for different input; nothing was sent', { execution: 'not-sent' });
      if (wait) return { ...prior.accepted, ...(await this.waitReceipt(prior, timeout)) };
      await prior.ready;
      return prior.accepted;
    }
    const busy = !ctx.isIdle() || ctx.hasPendingMessages() || this.activeKey !== undefined || this.preparing.size > 0;
    if (requireIdle && busy) throw new RpcError(ERR.unavailable, 'The session is busy; nothing was sent', { execution: 'not-sent' });
    if (key && this.receipts.size >= SEND_RECEIPT_LIMIT) throw new RpcError(ERR.unavailable, 'This session has reached its message key capacity; existing receipts are retained', { execution: 'not-sent' });
    let text: string;
    const id = `x${++this.counter}`;
    const deliverAs = mode === 'followUp' ? 'followUp' : 'steer';
    const at = Date.now();
    const accepted = { id, queued: busy ? deliverAs : 'turn' };
    let waiter: Waiter | undefined;
    const settlement = new Promise<{ text: string; stopReason?: string }>((resolve, reject) => {
      waiter = { resolve, reject };
    });
    settlement.catch(() => undefined);
    let resolveReady!: () => void;
    let rejectReady!: (error: Error) => void;
    const ready = new Promise<void>((resolve, reject) => { resolveReady = resolve; rejectReady = reject; });
    ready.catch(() => undefined);
    const reject = (error: Error): void => { waiter!.reject(error); rejectReady(error); };
    const receipt: SendReceipt = { phase: 'preparing', controller: new AbortController(), ready, reject, fingerprint, accepted, settlement };
    this.preparing.add(receipt);
    if (key) {
      this.receipts.set(key, receipt);
      if (!busy) this.activeKey = key;
    }
    const message: MessageEnvelope = { channel: 'external', direction: 'inbound', from, to: originalSessionId, text: raw, id };
    const deadline = Date.now() + timeout;
    const preparingTimer = setTimeout(() => this.cancelPreparation(receipt, 'Message preparation timed out; nothing was sent'), timeout);
    preparingTimer.unref();
    let dispatched = false;
    try {
      if (this.operations.messageSend) await Promise.race([this.operations.messageSend(message, ctx, receipt.controller.signal), settlement]);
      this.guardPreparedSend(params, ctx, originalSessionId, key, receipt);
      const given = this.agents.deliverable(whole, from);
      if (typeof given !== 'string') throw new RpcError(ERR.unavailable, given.error);
      text = given;
      this.preparing.delete(receipt);
      clearTimeout(preparingTimer);
      receipt.phase = 'accepted';
      if (key || wait) this.waiters.add(waiter!);
      else waiter!.resolve({ text: '' });
      dispatched = true;
      this.pi.sendMessage(
        { customType: EXTERNAL_MESSAGE_TYPE, content: fenceUntrusted(messageHeader(apiClientLabel(from), at), text), display: true, details: { id, from, at, message } },
        { triggerTurn: true, deliverAs },
      );
      resolveReady();
    } catch (error) {
      clearTimeout(preparingTimer);
      this.preparing.delete(receipt);
      if (waiter) this.waiters.delete(waiter);
      const execution = dispatched ? 'uncertain' : 'not-sent';
      const failure = new RpcError(ERR.unavailable, `The session could not take the message: ${errorMessage(error)}`, { execution, ...(dispatched ? accepted : {}) });
      receipt.reject(failure);
      if (dispatched) receipt.phase = 'uncertain';
      else {
        if (key) this.receipts.delete(key);
        if (this.activeKey === key) this.activeKey = undefined;
      }
      throw failure;
    }
    this.audit({ method: 'message.send', id, from, mode: deliverAs, queued: accepted.queued, chars: whole.length });
    this.log.publish('external.message', { id, from, text: redactSecrets(capChars(text, 2_000)), queued: accepted.queued });
    if (!wait) return accepted;
    try { return { ...accepted, ...(await this.waitReceipt(receipt, Math.max(1, deadline - Date.now()))) }; }
    finally { if (!key && waiter) this.waiters.delete(waiter); }
  }

  private cancelPreparation(receipt: SendReceipt, message: string): void {
    if (receipt.phase !== 'preparing') return;
    receipt.phase = 'cancelled';
    receipt.controller.abort();
    receipt.reject(new RpcError(ERR.unavailable, message, { execution: 'not-sent' }));
    if (this.activeKey && this.receipts.get(this.activeKey) === receipt) this.activeKey = undefined;
    this.preparing.delete(receipt);
  }

  private guardPreparedSend(params: Record<string, unknown>, original: ExtensionContext, sessionId: string, key: string | undefined, receipt: SendReceipt): void {
    const ctx = this.session();
    this.guardSession(params, ctx);
    if (ctx !== original || ctx.sessionManager.getSessionId() !== sessionId) throw new RpcError(ERR.unavailable, 'The session was replaced; nothing was sent');
    if (receipt.phase !== 'preparing') throw new RpcError(ERR.unavailable, 'Message preparation was cancelled; nothing was sent');
    if (params['requireIdle'] === true && (!ctx.isIdle() || ctx.hasPendingMessages() || this.activeKey !== key || this.preparing.size > 1)) {
      throw new RpcError(ERR.unavailable, 'The session became busy; nothing was sent');
    }
  }

  private async waitReceipt(receipt: SendReceipt, timeout: number): Promise<{ text: string; stopReason?: string }> {
    let timer: NodeJS.Timeout | undefined;
    const expired = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        if (receipt.phase === 'preparing') {
          this.cancelPreparation(receipt, 'Message preparation timed out; nothing was sent');
          reject(new RpcError(ERR.unavailable, 'Message preparation timed out; nothing was sent'));
        } else reject(new RpcError(ERR.timeout, 'Timed out waiting for the agent to finish; the message was delivered', { ...receipt.accepted, execution: 'accepted' }));
      }, timeout);
      timer.unref();
    });
    try { return await Promise.race([receipt.settlement, expired]); }
    finally { clearTimeout(timer); }
  }

  /**
   * One page of the transcript's user and assistant text, oldest first: the `limit` messages before index `before`
   * (default: the end); a `limit` outside 1..`HISTORY_MAX_PAGE` is clamped to it and a `before` past the end means the end,
   * and the page says the size it used. Every message carries its `index`; `earlier.before` is the next page's `before` and is absent
   * on the first page of the transcript. A text over `RESULT_MAX_CHARS` is cut with its whole text saved to a file.
   */
  private history(limit: number, before?: number): unknown {
    const ctx = this.session();
    const all: Array<{ role: string; text: string }> = [];
    for (const entry of ctx.sessionManager.getBranch()) {
      const message = (entry as { type?: string; message?: { role?: string; content?: unknown } }).message;
      if ((entry as { type?: string }).type !== 'message' || !message?.role) continue;
      if (message.role !== 'user' && message.role !== 'assistant') continue;
      const text = contentText(message.content, { separator: '' });
      if (text) all.push({ role: message.role, text });
    }
    const end = Math.min(before ?? all.length, all.length);
    let start = end;
    let bytes = 0;
    const messages: Array<{ index: number; role: string; text: string }> = [];
    for (let index = end - 1; index >= Math.max(end - limit, 0); index--) {
      const row = { index, role: all[index]!.role, text: boundedText(all[index]!.text) };
      const size = Buffer.byteLength(JSON.stringify(row)) + 1;
      if (messages.length > 0 && bytes + size > MAX_FRAME_BYTES / 2) break;
      messages.unshift(row);
      bytes += size;
      start = index;
    }
    return {
      messages,
      total: all.length,
      limit,
      ...(start > 0 ? { earlier: { before: start } } : {}),
      last: this.lastAssistantText ? boundedText(this.lastAssistantText) : null,
    };
  }
}

/** `✉ from <client>`, then the client's text: untrusted, so resultBlock sanitizes and previews it instead of Markdown. */
function registerExternalMessageRenderer(pi: ExtensionAPI): void {
  pi.registerMessageRenderer(EXTERNAL_MESSAGE_TYPE, (message, { expanded, outputPad }, theme) => {
    const details = message.details as { from?: unknown; at?: unknown } | undefined;
    const from = clip(String(details?.from ?? 'API client'), 60);
    const text = contentText(message.content);
    // The content is the fenced message the model reads; the header above says who sent it, so draw only the body.
    const body = fencedBody(text);
    const box = new Box(outputPad ?? 1, 0);
    box.addChild(new Text(`${theme.fg('accent', '✉')} ${theme.fg('toolTitle', theme.bold(`from ${from}`))} ${theme.fg('dim', `· Octocode API · ${formatClock(typeof details?.at === 'number' ? details.at : Date.now())}`)}`, 0, 0));
    box.addChild(resultBlock(theme, { expanded }, { summary: '', body, error: false }));
    return box;
  });
}
