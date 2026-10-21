/** Explicitly launched, isolated vendor workers using the bound communication tools. */
import { spawn, type ChildProcess } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { Socket } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as catalog from './catalog.js';
import { databasePath } from './config.js';
import type { HeartbeatInput, RecordUsageInput } from './catalog-types.generated.js';
import type { Offered } from './rows.js';
import type { JsonObject } from './validation.js';
import { Presence, SESSION_EXPIRED, stopEvent, withPeers, type DeliveryRuntime, type DeliveryStore } from './dispatch.js';
import { ValidationError } from './errors.js';
import { claimDeliveryOwner } from './owner-lock.js';
import { realpath } from './paths.js';
import { truncateCodePoints } from './text.js';
import { deadlineAfter, monotonic, now, running, type Stop } from './timing.js';
import * as transport from './transport.js';
import { isObject } from './validation.js';
import { VERSION } from './version.js';
import { TERMINATE_GRACE_MS, Wire, dumps, encode, refusal } from './wire.js';

const PROXY_INSTRUCTIONS = 'The host manages your identity, presence, live lease renewal and delivery. Use bound tools for the user task. Initiate messages, broadcasts or subscriptions only when the task authorizes them. Follow the supplied skill for leases, replies and completion; unfinished work stays pending. Call inbox only for requested recovery. When no actionable work remains, end the turn. The host waits for mail and starts the next turn; do not sleep or poll to remain active.';
const USAGE_FIELDS: readonly (readonly [transport.UsageCounter, readonly string[]])[] = [
  ['inputTokens', ['inputTokens', 'input_tokens', 'input']],
  ['outputTokens', ['outputTokens', 'output_tokens', 'output']],
  ['cachedInputTokens', ['cachedInputTokens', 'cache_read_input_tokens', 'cacheRead']],
  ['cacheWriteTokens', ['cacheWriteTokens', 'cache_creation_input_tokens', 'cacheWrite']],
];
const PI_CONTEXT_FIELDS = ['input', 'cacheRead', 'cacheWrite'];
const POLL_MS = 100;

interface ProxyArgs {
  vendor?: string;
  model?: string;
  prompt?: string;
  durationMs?: number;
  name?: string;
  session?: string;
  database?: string;
  workspace: string;
  tools?: string;
  trace?: boolean;
}

/** How a worker reaches the communication runtime from inside a vendor process; the interface layer owns the entry script. */
interface WorkerLauncher {
  /** The command and arguments that start the bound MCP server (`mcp ...` flags are appended to `args`). */
  mcp(args: readonly string[]): { command: string; args: string[] };
  /** The CLI binary the Pi extension runs for each tool call (its `binding.binary`). */
  binary: string;
  /** The bundled Pi extension (`dist/hosts/pi-extension.js`) the worker loads. */
  piExtension: string;
}

interface ProxyRuntime extends Pick<DeliveryRuntime, 'output' | 'open'> {
  launcher: WorkerLauncher;
  /** Starts the parent-death guard for the vendor process group; the module `watchdog` when omitted. A seam for ordering tests. */
  watchdog?: (group: number | undefined) => ChildProcess | null;
}

/** Text for the values the vendor error texts embed. */
function show(value: unknown): string {
  return typeof value === 'string' ? value : dumps(value ?? null);
}

const object = (value: unknown): JsonObject => (isObject(value) ? value : {});

/** A vendor reply field that must be text; anything else counts as missing. */
const textOf = (value: unknown): string => (typeof value === 'string' ? value : '');

/** The first line, or '' for no lines. */
function firstLine(text: string): string {
  return text.split(/\r\n|[\n\r\v\f\x1c-\x1e\x85\u2028\u2029]/)[0] ?? '';
}

export async function run(args: ProxyArgs, runtime: ProxyRuntime): Promise<void> {
  if (!args.vendor) throw new ValidationError('--vendor required');
  const input = { vendor: args.vendor, model: args.model, prompt: args.prompt, ...(args.durationMs === undefined ? {} : { durationMs: args.durationMs }), ...(args.name ? { name: args.name } : {}) };
  catalog.command('run', input);
  const model = catalog.text(input, 'model');
  const prompt = catalog.text(input, 'prompt');
  const store = runtime.open(databasePath(args.database), args.workspace, { create: true });
  try {
    const session = args.session ? await store.call(args.session, 'resume', { vendor: args.vendor }) : await store.call('', 'join', { vendor: args.vendor, name: args.name || args.vendor });
    const identity: string = session.id;
    await store.call(identity, 'heartbeat', { renewLeases: true, task: truncateCodePoints(firstLine(prompt), 256), status: 'busy' });
    try {
      await worker(args, store, identity, args.vendor, model, prompt, runtime);
    } finally {
      await store.call(identity, 'leave', {});
    }
  } finally {
    store.db.close();
  }
}

async function worker(args: ProxyArgs, store: DeliveryStore, identity: string, vendor: string, model: string, prompt: string, runtime: ProxyRuntime): Promise<void> {
  const Handler = WORKERS[vendor];
  if (!Handler) throw new ValidationError('Unknown worker vendor: ' + vendor);
  const lock = await claimDeliveryOwner(store.database, identity);
  const directory = mkdtempSync(join(tmpdir(), 'octocode-worker-'));
  const stop = stopEvent();
  try {
    store.attach(identity, { transport: 'raw' });
    const deadline = deadlineAfter(args.durationMs);
    const parent = process.ppid;
    const handler = new Handler(args, store, identity, model, prompt, directory, runtime);
    const loop = new Loop(handler, stop.signal, deadline, parent);
    let guard: ChildProcess | null = null;
    const host = new Wire(vendor, handler.argv(), handler.cwd, Object.entries(handler.environment), deadline, stop.signal);
    try {
      handler.host = host;
      guard = (runtime.watchdog ?? watchdog)(host.pid);
      await loop.launch();
      await loop.run();
    } finally {
      await host.close();
      guard?.kill();
    }
  } finally {
    stop.dispose();
    try {
      rmSync(directory, { recursive: true, force: true });
    } finally {
      await lock.release();
    }
  }
}

/**
 * Whether the process this worker must outlive is gone. POSIX re-parents an orphan, so `ppid` changes; Windows does not,
 * so the original parent's liveness is probed instead (signal 0 only tests existence; EPERM still means it exists).
 */
export function parentGone(parent: number): boolean {
  if (process.platform !== 'win32') return process.ppid !== parent;
  try {
    process.kill(parent, 0);
    return false;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code !== 'EPERM';
  }
}

/**
 * Runs in a detached `node -e` process. Its stdin is a pipe whose only write end is the worker, so EOF means the worker died
 * (SIGKILL included, and immune to pid reuse or an unreaped zombie). Then the vendor group gets SIGTERM, SIGKILL after the
 * grace. It also exits as soon as the group is gone, so a clean worker shutdown leaves nothing behind.
 */
const WATCHDOG = `const [group, grace] = process.argv.slice(1).map(Number);
const alive = () => { try { process.kill(-group, 0); return true; } catch (error) { return error.code === 'EPERM'; } };
const signal = name => { try { process.kill(-group, name); } catch {} };
setInterval(() => { if (!alive()) process.exit(0); }, 100);
process.stdin.resume();
process.stdin.on('close', () => {
  if (!alive()) process.exit(0);
  signal('SIGTERM');
  const end = Date.now() + grace;
  setInterval(() => { if (!alive()) process.exit(0); if (Date.now() >= end) { signal('SIGKILL'); process.exit(0); } }, 25);
});`;

/**
 * Replaces Linux `prctl(PR_SET_PDEATHSIG)`, which Node cannot set: a worker killed without cleanup (SIGKILL) cannot run
 * `Wire.close`, so this detached process kills the vendor's process group for it. POSIX only: on Windows the vendor is
 * not a process group and `Wire.close` ends its tree with `taskkill /T /F`.
 * Null when there is nothing to guard or the watchdog could not start (the `parentGone` poll still ends a live worker).
 */
export function watchdog(group: number | undefined): ChildProcess | null {
  if (group === undefined || process.platform === 'win32') return null;
  const child = spawn(process.execPath, ['-e', WATCHDOG, String(group), String(TERMINATE_GRACE_MS)], { detached: true, stdio: ['pipe', 'ignore', 'ignore'], env: { ...process.env, NODE_OPTIONS: '' } });
  child.on('error', () => undefined);
  child.stdin.on('error', () => undefined);
  child.unref();
  if (child.stdin instanceof Socket) child.stdin.unref();
  return child;
}

/** What `Loop` reads and drives of a vendor worker: identity, store, wire, and the vendor's handshake, event and delivery steps. */
export interface LoopWorker {
  readonly name: string;
  readonly identity: string;
  readonly prompt: string;
  readonly toolNames: readonly string[];
  readonly deliverWhileBusy: boolean;
  readonly args: Pick<ProxyArgs, 'tools' | 'trace'>;
  readonly store: Pick<DeliveryStore, 'workspace' | 'coordinationScope' | 'known' | 'peerContext' | 'stage' | 'finishDispatch' | 'recordUsage'>;
  readonly host: Pick<Wire, 'pid' | 'event' | 'send'>;
  session: string;
  busy: boolean;
  emit(record: object): void;
  heartbeat(fields?: HeartbeatInput): Promise<void>;
  start(): Promise<void>;
  prime(peers: string): Promise<string>;
  begin(guidance: string): Promise<void>;
  onEvent(event: JsonObject, params: JsonObject, message: JsonObject, item: JsonObject, turn: JsonObject): Promise<void>;
  offer(items: readonly Offered[], content: string): Promise<void>;
  stageActionOnly(): boolean | null;
}

/** One vendor's launch arguments, handshake, event protocol and delivery. */
abstract class VendorWorker implements LoopWorker {
  abstract readonly name: string;
  readonly deliverWhileBusy: boolean = true;
  readonly tools: ReturnType<typeof catalog.selectedTools>;
  readonly toolNames: string[];
  readonly mcp: { command: string; args: string[] };
  readonly cwd: string;
  readonly environment: Record<string, string> = {};
  host!: Wire;
  session = '';
  busy = true;

  constructor(readonly args: ProxyArgs, readonly store: DeliveryStore, readonly identity: string, readonly model: string, readonly prompt: string, readonly directory: string, readonly runtime: ProxyRuntime) {
    this.tools = catalog.selectedTools(args.tools);
    const flags = ['mcp', '--workspace', store.workspace, '--database', String(store.database), '--session', identity];
    if (args.tools) flags.push('--tools', args.tools);
    this.mcp = runtime.launcher.mcp(flags);
    this.toolNames = this.tools.map(tool => tool.name);
    this.cwd = realpath(directory, true);
  }

  emit(record: object): void {
    this.runtime.output(record);
  }

  emitTexts(message: JsonObject): void {
    for (const piece of Array.isArray(message.content) ? message.content : []) if (isObject(piece) && piece.type === 'text') this.emit({ type: 'text', text: piece.text });
  }

  async heartbeat(fields: HeartbeatInput = {}): Promise<void> {
    await this.store.call(this.identity, 'heartbeat', { renewLeases: true, ...fields });
  }

  abstract argv(): string[];

  /** Vendor handshake before the first turn; may bind the vendor session. */
  async start(): Promise<void> {}

  /** Returns the peer context still owed to the first turn. */
  async prime(peers: string): Promise<string> {
    return peers;
  }

  async begin(guidance: string): Promise<void> {
    await this.deliver(guidance);
  }

  abstract deliver(content: string, action?: boolean): Promise<void>;

  async offer(items: readonly Offered[], content: string): Promise<void> {
    await this.deliver(content, items.some(item => item.wake === 'action'));
  }

  stageActionOnly(): boolean | null {
    return null;
  }

  abstract onEvent(event: JsonObject, params: JsonObject, message: JsonObject, item: JsonObject, turn: JsonObject): Promise<void>;

  completed(): void {
    this.busy = false;
    this.emit({ type: 'turn-completed', vendor: this.name });
  }
}

class CodexWorker extends VendorWorker {
  readonly name = 'codex';

  argv(): string[] {
    return ['app-server'];
  }

  override async start(): Promise<void> {
    const host = this.host;
    await host.request('initialize', { clientInfo: { name: 'octocode-agents-communication', version: VERSION } });
    await host.send({ method: 'initialized', params: {} });
    await this.heartbeat();
    const config = object(object(await host.request('config/read', { includeLayers: false })).config);
    const plugins = Object.fromEntries(Object.keys(object(config.plugins)).map(key => [key, { enabled: false }]));
    const servers: JsonObject = Object.fromEntries(Object.keys(object(config.mcp_servers)).map(key => [key, { enabled: false }]));
    servers.agents_communication = { ...this.mcp, enabled: true, enabled_tools: this.toolNames, default_tools_approval_mode: 'approve' };
    const skills = await this.disabledSkills();
    await this.heartbeat();
    const started = object(await host.request('thread/start', this.thread(servers, plugins, skills)));
    this.session = textOf(object(started.thread).id);
    if (!this.session) throw new ValidationError('No vendor session ID');
    await this.heartbeat({ vendorSession: this.session });
  }

  private async disabledSkills(): Promise<JsonObject[]> {
    const discovered = object(await this.host.request('skills/list', { cwds: [this.cwd], forceReload: true }));
    if (!Array.isArray(discovered.data)) throw new ValidationError('Invalid Codex skills list');
    const skills: JsonObject[] = [];
    for (const entry of discovered.data) {
      const listed = object(entry).skills;
      if (!Array.isArray(listed)) throw new ValidationError('Invalid Codex skills entry');
      for (const skill of listed) {
        const path = object(skill).path;
        if (typeof path !== 'string') throw new ValidationError('Missing Codex skill path');
        skills.push({ path, enabled: false });
      }
    }
    return skills;
  }

  private thread(servers: JsonObject, plugins: JsonObject, skills: JsonObject[]): JsonObject {
    const features = { code_mode: { enabled: false }, shell_tool: false, apply_patch_freeform: false, multi_agent: false, memories: false, hooks: false, apps: false, skill_search: false };
    const config = { mcp_servers: servers, plugins, project_doc_max_bytes: 0, skills: { config: skills }, web_search: 'disabled', features };
    return { model: this.model, cwd: this.cwd, approvalPolicy: 'never', sandbox: 'read-only', ephemeral: true, baseInstructions: PROXY_INSTRUCTIONS, developerInstructions: '', config };
  }

  override async prime(peers: string): Promise<string> {
    if (peers) await this.host.request('thread/inject_items', transport.codexPeerItems(this.session, peers));
    return '';
  }

  override async begin(guidance: string): Promise<void> {
    await this.host.request('turn/start', { threadId: this.session, input: [{ type: 'text', text: guidance }], effort: 'low' });
  }

  async deliver(content: string, action = true): Promise<void> {
    if (action) await this.host.request('turn/start', transport.codexPeerTurn(this.session, content));
    else await this.host.request('thread/inject_items', transport.codexPeerItems(this.session, content));
  }

  override stageActionOnly(): boolean | null {
    return this.busy ? false : null;
  }

  async onEvent(event: JsonObject, params: JsonObject, _message: JsonObject, item: JsonObject, turn: JsonObject): Promise<void> {
    const method = event.method;
    if (method === 'item/completed' && item.type === 'agentMessage') this.emit({ type: 'text', text: item.text });
    if (method === 'turn/completed') {
      if (turn.status === 'failed') throw new Error('Vendor turn failed: ' + show(turn.error));
      this.completed();
    }
    if (method === 'error' && params.willRetry !== true) throw new Error('Vendor error: ' + show(params));
  }
}

class PiWorker extends VendorWorker {
  readonly name = 'pi';
  override readonly deliverWhileBusy = false;
  private readonly extension: string;
  private error: unknown = null;

  constructor(args: ProxyArgs, store: DeliveryStore, identity: string, model: string, prompt: string, directory: string, runtime: ProxyRuntime) {
    super(args, store, identity, model, prompt, directory, runtime);
    this.extension = runtime.launcher.piExtension;
    const binding = { binary: runtime.launcher.binary, workspace: store.workspace, database: String(store.database), session: identity, tools: this.tools };
    this.environment.OCTOCODE_COMMUNICATION_BINDING = encode(binding).toString('utf8');
  }

  argv(): string[] {
    return ['--mode', 'rpc', '--model', this.model, '--thinking', 'off', '--system-prompt', PROXY_INSTRUCTIONS, '--no-session', '--no-extensions', '--no-skills', '--no-prompt-templates', '--no-context-files', '--no-builtin-tools', '--extension', this.extension];
  }

  override async start(): Promise<void> {
    this.session = textOf(object(await this.host.piRequest('get_state', {})).sessionId);
    if (!this.session) throw new ValidationError('No Pi session ID');
    await this.heartbeat({ vendorSession: this.session });
  }

  async deliver(content: string): Promise<void> {
    await this.host.piRequest('prompt', { message: content });
  }

  async onEvent(event: JsonObject, _params: JsonObject, message: JsonObject, _item: JsonObject, _turn: JsonObject): Promise<void> {
    const kind = event.type;
    if (kind === 'response' && event.success === false) throw new Error('Pi command failed: ' + show(event.error));
    if (kind === 'message_end' && message.role === 'assistant') {
      const reason = message.stopReason;
      const failed = reason === 'error' || reason === 'aborted';
      this.error = failed ? (message.errorMessage ?? null) : null;
      if (failed && this.error === null) this.error = reason;
      this.emitTexts(message);
    }
    if (kind === 'agent_settled') {
      if (this.error !== null) throw new Error('Pi turn failed: ' + show(this.error));
      this.completed();
    }
  }
}

class ClaudeWorker extends VendorWorker {
  readonly name = 'claude';
  private readonly socket: string;

  constructor(args: ProxyArgs, store: DeliveryStore, identity: string, model: string, prompt: string, directory: string, runtime: ProxyRuntime) {
    super(args, store, identity, model, prompt, directory, runtime);
    this.socket = join(this.cwd, 'inbox.sock');
    if (typeof process.geteuid !== 'function') throw new ValidationError('Managed Claude peer delivery requires local Unix sockets; use a host-wired communication binding on this platform');
    transport.validate('claude', this.socket);
  }

  argv(): string[] {
    const settings = encode({ disableAllHooks: true, autoMemoryEnabled: false }).toString('utf8');
    const servers = encode({ mcpServers: { agents_communication: this.mcp } }).toString('utf8');
    return ['-p', '--messaging-socket-path', this.socket, '--settings', settings, '--system-prompt', PROXY_INSTRUCTIONS, '--model', this.model, '--input-format', 'stream-json', '--output-format', 'stream-json', '--verbose', '--no-session-persistence', '--setting-sources', '', '--strict-mcp-config', '--mcp-config', servers, '--tools', '', '--allowedTools', 'mcp__agents_communication__*', '--permission-mode', 'dontAsk', '--disable-slash-commands'];
  }

  async deliver(content: string): Promise<void> {
    await this.host.send({ type: 'user', message: { role: 'user', content }, session_id: this.session, parent_tool_use_id: null });
  }

  override async offer(items: readonly Offered[], content: string): Promise<void> {
    await transport.claude(this.socket, this.session, items[0]!.dispatchToken, content);
  }

  async onEvent(event: JsonObject, _params: JsonObject, message: JsonObject, _item: JsonObject, _turn: JsonObject): Promise<void> {
    const kind = event.type;
    if (kind === 'system' && event.subtype === 'init') {
      this.session = textOf(event.session_id);
      if (!this.session) throw new ValidationError('No vendor session ID');
      await this.heartbeat({ vendorSession: this.session });
    }
    if (kind === 'assistant') this.emitTexts(message);
    if (kind === 'result') {
      if (event.is_error === true) throw new Error('Vendor turn failed: ' + show(event));
      this.completed();
    }
  }
}

type WorkerClass = new (args: ProxyArgs, store: DeliveryStore, identity: string, model: string, prompt: string, directory: string, runtime: ProxyRuntime) => VendorWorker;

const WORKERS: Record<string, WorkerClass> = { codex: CodexWorker, pi: PiWorker, claude: ClaudeWorker };

/** Shared worker lifecycle: first turn, heartbeats, vendor events and staged delivery. */
export class Loop {
  private readonly presence: Presence;
  private readonly calls = new Map<string, string>();
  private poll = 0;

  /** `parent` is the process ID the worker must outlive; it is `process.ppid` at launch. */
  constructor(private readonly worker: LoopWorker, private readonly stop: Stop, private readonly deadline: number | null, private readonly parent: number) {
    this.presence = new Presence(() => worker.heartbeat());
  }

  async launch(): Promise<void> {
    const worker = this.worker;
    await worker.start();
    worker.emit({ type: 'ready', session: worker.identity, vendor: worker.name, pid: worker.host.pid ?? null, leases: 'managed' });
    const peers = await worker.prime(worker.store.peerContext(worker.identity, 'worker', 'session'));
    await worker.begin(this.guidance(peers));
  }

  guidance(peers: string): string {
    const { worker } = this;
    const base = catalog.workerSkill(worker.args.tools);
    const binding = { session: worker.identity, workspace: worker.store.workspace, coordinationScope: worker.store.coordinationScope, branch: worker.store.known(worker.identity, true).branch, tools: worker.toolNames, presence: 'managed', leaseRenewal: 'managed', delivery: 'managed', instructionsVersion: 1, instructionsSha256: createHash('sha256').update(base, 'utf8').digest('hex') };
    return `Available communication tools: ${encode(worker.toolNames).toString('utf8')}\n\n${base}\n\nCommunication binding: ${encode(binding).toString('utf8')}\n${peers}\nUser task:\n${worker.prompt}`;
  }

  async run(): Promise<void> {
    this.presence.reset();
    this.poll = monotonic();
    while (running(this.stop, this.deadline)) {
      // The parent died and this worker was re-parented: stop instead of running unowned.
      if (parentGone(this.parent)) break;
      await this.presence.tick();
      const event = await this.worker.host.event(POLL_MS);
      if (event !== null) await this.handle(event);
      await this.deliver();
    }
  }

  async handle(frame: Record<string, unknown>): Promise<void> {
    const event = object(frame);
    const { worker } = this;
    const wasBusy = worker.busy;
    persistUsage(worker.store, worker.identity, worker.name, worker.session, event);
    const params = object(event.params);
    const message = object(event.message);
    const item = object(params.item);
    const turn = object(params.turn);
    if (worker.args.trace) this.trace(event, item, turn);
    await worker.onEvent(event, params, message, item, turn);
    if ('method' in event && 'id' in event) await worker.host.send(refusal(event.id));
    if (wasBusy && !worker.busy) {
      await worker.heartbeat({ status: 'available' });
      this.presence.reset();
    }
  }

  private trace(event: JsonObject, item: JsonObject, turn: JsonObject): void {
    const { worker } = this;
    traceUsage(worker, event);
    for (const record of traceTools(worker.identity, event, this.calls)) worker.emit(record);
    worker.emit({ type: 'protocol', method: event.method ?? event.type, itemType: item.type, status: turn.status });
  }

  async deliver(): Promise<void> {
    const { worker } = this;
    if (!worker.session || (worker.busy && !worker.deliverWhileBusy) || monotonic() - this.poll < POLL_MS) return;
    this.poll = monotonic();
    const items = worker.store.stage(worker.identity, 'managed:' + worker.name, worker.stageActionOnly());
    if (!items.length) {
      // The row expired while this process slept: renew now instead of waiting out the heartbeat period.
      if (items.reason === SESSION_EXPIRED) await this.presence.tick(true);
      return;
    }
    worker.busy = true;
    await worker.heartbeat({ status: 'busy' });
    this.presence.reset();
    worker.emit({ type: 'delivery', messages: items.map(item => item.id) });
    try {
      await worker.offer(items, withPeers(items, worker.store.peerContext(worker.identity, 'worker', 'session')));
    } catch (error) {
      worker.store.finishDispatch(worker.identity, items, (error as Error).message);
      throw error;
    }
    worker.store.finishDispatch(worker.identity, items);
  }
}

function traceUsage(worker: LoopWorker, event: JsonObject): void {
  const message = object(event.message);
  const params = object(event.params);
  let scope: string;
  let usage: unknown;
  if (event.method === 'thread/tokenUsage/updated') [scope, usage] = ['thread', params.tokenUsage];
  else if (event.type === 'result') [scope, usage] = ['result', event.usage];
  else if (event.type === 'assistant' || (event.type === 'message_end' && message.role === 'assistant')) [scope, usage] = ['message', message.usage];
  else return;
  if (usage !== undefined && usage !== null) worker.emit({ type: 'usage', vendor: worker.name, scope, messageId: message.id, usage });
}

const counted = (value: unknown): value is number => typeof value === 'number' && Number.isInteger(value) && value >= 0;

function usageSource(vendor: string, event: JsonObject, message: JsonObject, params: JsonObject): [unknown, RecordUsageInput['scope'] | null] {
  if (vendor === 'codex' && event.method === 'thread/tokenUsage/updated') return [object(params.tokenUsage).total, 'cumulative'];
  if (vendor === 'claude' && event.type === 'result') return [event.usage, 'turn'];
  if (vendor === 'pi' && event.type === 'message_end' && message.role === 'assistant') return [message.usage, 'request'];
  return [null, null];
}

function usageKey(vendorSession: string, usage: JsonObject, scope: RecordUsageInput['scope'], event: JsonObject, message: JsonObject): string {
  const keydata = scope === 'cumulative' ? [vendorSession, usage] : (event.uuid ?? null) !== null || (message.timestamp ?? null) !== null ? [vendorSession, event.uuid ?? null, message.timestamp ?? null] : [vendorSession, randomUUID()];
  return createHash('sha256').update(encode(keydata)).digest('hex');
}

export function persistUsage(store: Pick<DeliveryStore, 'recordUsage'>, identity: string, vendor: string, vendorSession: string, event: JsonObject): void {
  const message = object(event.message);
  const params = object(event.params);
  const [usage, scope] = usageSource(vendor, event, message, params);
  if (typeof usage !== 'object' || usage === null || Array.isArray(usage) || scope === null) return;
  const source = usage as JsonObject;
  const record: RecordUsageInput = { key: usageKey(vendorSession, source, scope, event, message), scope };
  for (const [field, names] of USAGE_FIELDS) {
    const value = names.map(name => source[name]).find(counted);
    if (value !== undefined) record[field] = value;
  }
  const value = object(object(params.tokenUsage).last).inputTokens;
  if (counted(value)) record.contextTokens = value;
  if (vendor === 'pi' && PI_CONTEXT_FIELDS.every(key => counted(source[key]))) record.contextTokens = PI_CONTEXT_FIELDS.reduce((sum, key) => sum + (source[key] as number), 0);
  store.recordUsage(identity, record);
}

function rpcToolRecords(event: JsonObject): JsonObject[] {
  const item = object(object(event.params).item);
  if (item.type !== 'mcpToolCall') return [];
  if (event.method === 'item/started') return [{ type: 'tool-call', callId: item.id, server: item.server, tool: item.tool, input: item.arguments }];
  if (event.method === 'item/completed') return [{ type: 'tool-result', callId: item.id, server: item.server, tool: item.tool, result: item.result, error: item.error }];
  return [];
}

function executionToolRecords(event: JsonObject): JsonObject[] {
  if (event.type === 'tool_execution_start') return [{ type: 'tool-call', callId: event.toolCallId, tool: event.toolName, input: event.args }];
  if (event.type === 'tool_execution_end') return [{ type: 'tool-result', callId: event.toolCallId, tool: event.toolName, result: event.result, isError: event.isError }];
  return [];
}

function messageToolRecords(event: JsonObject, calls: Map<string, string>): JsonObject[] {
  const records: JsonObject[] = [];
  const content = object(event.message).content;
  for (const item of Array.isArray(content) ? content : []) {
    if (!isObject(item)) continue;
    if (item.type === 'tool_use' && typeof item.id === 'string' && typeof item.name === 'string') {
      calls.set(item.id, item.name);
      records.push({ type: 'tool-call', callId: item.id, tool: item.name, input: item.input });
    } else if (item.type === 'tool_result') {
      const id = item.tool_use_id;
      const tool = typeof id === 'string' ? calls.get(id) ?? null : null;
      if (typeof id === 'string') calls.delete(id);
      records.push({ type: 'tool-result', callId: item.tool_use_id, tool, result: item.content, isError: item.is_error });
    }
  }
  return records;
}

export function traceTools(session: string, event: JsonObject, calls: Map<string, string>): JsonObject[] {
  const records = [...rpcToolRecords(event), ...executionToolRecords(event), ...messageToolRecords(event, calls)];
  for (const record of records) Object.assign(record, { session, at: now() });
  return records;
}
