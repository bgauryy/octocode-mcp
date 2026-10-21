/** Local native adapters. Transport acceptance never means model acknowledgement. */
import { createHash, randomBytes } from 'node:crypto';
import { lstatSync } from 'node:fs';
import { Agent, request as httpRequest } from 'node:http';
import { connect as connectSocket, isIP, type Socket } from 'node:net';
import { isAbsolute } from 'node:path';
import type { CommandResults, HostInboundData, RecordUsageInput } from './catalog-types.generated.js';
import { ValidationError } from './errors.js';
import { realpath } from './paths.js';
import { codePointLength } from './text.js';
import { monotonic } from './timing.js';
import { isObject, isUuid, type JsonObject } from './validation.js';
import { VERSION } from './version.js';
import { MAX_FRAME, decodeUtf8, dumps, encode, parseJsonBytes, refusal } from './wire.js';

const RECEIPTS: Record<string, string> = { claude: 'socket-write-only', codex: 'jsonrpc', grok: 'acp-turn-completion', opencode: 'http' };

/** The receipt a native offer produced. Acceptance only: the recipient's own `complete` is the acknowledgement. */
export interface Receipt {
  kind: string;
  turnRequested: boolean;
  stopReason?: string;
  usage?: RecordUsageInput;
}

/** The token counters of a `record_usage` input. */
export type UsageCounter = Exclude<keyof RecordUsageInput, 'key' | 'scope' | 'model'>;

const UNIX_PREFIX = 'unix://';
const SOCKET_IO_MS = 5000;
const TCP_CONNECT_MS = 3000;
const HTTP_CONNECT_MS = 2000;
const HTTP_EXCHANGE_MS = 5000;
const GROK_REGISTRATION_MS = 10000;
const GROK_PROMPT_MS = 300000;
const GROK_POLL_MS = 1;
const GROK_REQUEST_POLL_MS = 5;
const HTTP_LIMIT = 1024 * 1024;
const HIGH_WATER = 256 * 1024;

export function requiresAction(mode: string): boolean {
  return mode === 'claude' || mode === 'grok';
}

export function capabilities(mode: string): CommandResults['attach']['capabilities'] {
  if (!(mode in RECEIPTS)) return { nativeInput: false, acceptanceReceipt: 'host-confirmation', readReceipt: false };
  return {
    nativeInput: true, passiveInjection: !requiresAction(mode), actionWake: true, acceptanceReceipt: RECEIPTS[mode]!, readReceipt: false,
    ...(mode === 'codex' || mode === 'opencode' ? { wakePrerequisite: mode === 'codex' ? 'loaded-thread' : 'existing-idle-session-in-workspace' } : {}),
    ...(mode === 'codex' ? { activeInjection: true } : {}),
  };
}

function loopbackAddress(host: string): string | null {
  if (isIP(host) === 4) return host.startsWith('127.') ? host : null;
  if (isIP(host) !== 6) return null;
  const address = new URL(`http://[${host}]`).hostname.slice(1, -1);
  const mapped = /^::ffff:7f[0-9a-f]{2}:[0-9a-f]{1,4}$/.exec(address);
  return address === '::1' || mapped ? address : null;
}

/** The IP and port of a loopback endpoint `<scheme>://<loopback-IP>:<port>/`; credentials, path, query and fragment are refused. */
function loopback(endpoint: string, scheme: string, allowLocalhost: boolean): { host: string; port: number } {
  const parts = /^([A-Za-z][A-Za-z0-9+.-]*):\/\/([^/?#]*)(\/?)$/.exec(endpoint);
  let result: { host: string; port: number } | null = null;
  if (parts && parts[1]!.toLowerCase() === scheme) {
    const netloc = parts[2]!;
    const found = /^\[([^\]]*)\]:([0-9]+)$/.exec(netloc) ?? /^([^:@[\]]*):([0-9]+)$/.exec(netloc);
    const port = found ? Number(found[2]) : 0;
    if (found && port > 0 && port <= 65535) {
      const host = found[1]!.toLowerCase();
      const address = loopbackAddress(allowLocalhost && host === 'localhost' ? '127.0.0.1' : host);
      if (address) result = { host: address, port };
    }
  }
  if (!result) throw new ValidationError(`endpoint must be ${scheme}://<loopback-IP${allowLocalhost ? '|localhost' : ''}>:<port>/; no credentials, path, query or fragment`);
  return result;
}

function ownedSocket(path: string): void {
  if (typeof process.geteuid !== 'function') throw new ValidationError('Native Unix socket delivery is unavailable on this platform; use host hooks');
  const info = lstatSync(path);
  if (!info.isSocket() || info.uid !== process.geteuid()) throw new ValidationError('Endpoint must be a socket owned by this OS user, not a symlink');
}

function socketPath(endpoint: string): string {
  return endpoint.startsWith(UNIX_PREFIX) ? endpoint.slice(UNIX_PREFIX.length) : endpoint;
}

export function validate(mode: string, endpoint?: string | null): void {
  if (mode === 'raw') {
    if (endpoint !== undefined && endpoint !== null) throw new ValidationError('Raw hooks do not have an endpoint');
    return;
  }
  if (!endpoint) throw new ValidationError('Native attachment requires endpoint');
  if (mode === 'opencode') loopback(endpoint, 'http', false);
  else if (mode === 'claude' || mode === 'grok' || (mode === 'codex' && endpoint.startsWith(UNIX_PREFIX))) {
    const path = socketPath(endpoint);
    if (!isAbsolute(path) || Buffer.byteLength(path) > 103) throw new ValidationError('Unix socket endpoint must be an absolute path of at most 103 bytes');
    if (mode === 'grok') ownedSocket(path);
  } else if (mode === 'codex') loopback(endpoint, 'ws', true);
  else throw new ValidationError('Unknown native transport');
}

export function validateSession(session: string): void {
  if (!/^ses_[A-Za-z0-9_]{1,252}$/.test(session)) throw new ValidationError('OpenCode vendorSession must be its existing ses_ identifier');
}

class EndOfStream extends Error {
  override name = 'EndOfStream';
}

/**
 * A socket read through a bounded buffer with absolute monotonic deadlines (a per-call timeout). Reading is
 * demand-driven: the socket pauses once the buffer passes HIGH_WATER and resumes only when a consumer waits for
 * more bytes, so a peer cannot grow the buffer unasked while a frame the consumer is still assembling always completes.
 * Callers bound what they assemble (frame limits), which bounds the buffer.
 */
class Channel {
  private buffer: Buffer = Buffer.alloc(0);
  private failure: Error | null = null;
  private waiter: (() => void) | null = null;

  constructor(readonly socket: Socket, closedMessage: string) {
    socket.on('data', chunk => {
      this.buffer = Buffer.concat([this.buffer, chunk]);
      if (this.buffer.length > HIGH_WATER) socket.pause();
      this.wake();
    });
    const closed = (): void => this.fail(new EndOfStream(closedMessage));
    socket.on('end', closed);
    socket.on('close', closed);
    socket.on('error', error => this.fail(error));
  }

  get length(): number {
    return this.buffer.length;
  }

  peek(count: number): Buffer {
    return this.buffer.subarray(0, count);
  }

  take(count: number): Buffer {
    const value = Buffer.from(this.buffer.subarray(0, count));
    this.buffer = this.buffer.subarray(count);
    return value;
  }

  private fail(error: Error): void {
    this.failure ??= error;
    this.wake();
  }

  private wake(): void {
    const waiter = this.waiter;
    this.waiter = null;
    waiter?.();
  }

  /** Waits for more bytes: true on progress, false at the deadline; throws once the peer closed with nothing more to read. */
  async fill(deadline: number): Promise<boolean> {
    if (this.failure) throw this.failure;
    const remaining = deadline - monotonic();
    if (remaining <= 0) return false;
    const before = this.buffer.length;
    this.socket.resume();
    await new Promise<void>(resolve => {
      const timer = setTimeout(done, remaining);
      this.waiter = done;
      function done(): void {
        clearTimeout(timer);
        resolve();
      }
    });
    this.waiter = null;
    if (this.buffer.length > before) return true;
    if (this.failure) throw this.failure;
    return false;
  }

  write(data: Uint8Array, deadline: number, timeoutMessage: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const remaining = deadline - monotonic();
      if (remaining <= 0) return reject(new Error(timeoutMessage));
      const timer = setTimeout(() => reject(new Error(timeoutMessage)), remaining);
      this.socket.write(data, error => {
        clearTimeout(timer);
        if (error) reject(error);
        else resolve();
      });
    });
  }

  close(): void {
    this.socket.destroy();
  }
}

function connect(options: { path: string } | { host: string; port: number }, timeoutMs: number, closedMessage: string): Promise<Channel> {
  return new Promise((resolve, reject) => {
    const socket = connectSocket(options);
    const channel = new Channel(socket, closedMessage);
    const timer = setTimeout(() => {
      socket.destroy();
      reject(new Error('Native I/O timed out'));
    }, timeoutMs);
    socket.once('connect', () => {
      clearTimeout(timer);
      resolve(channel);
    });
    socket.once('error', error => {
      clearTimeout(timer);
      reject(error);
    });
  });
}

function unix(path: string, closedMessage: string): Promise<Channel> {
  ownedSocket(path);
  return connect({ path }, SOCKET_IO_MS, closedMessage);
}

export function codexPeerTurn(session: string, content: string): JsonObject {
  return { threadId: session, input: [], toolOutput: { name: 'octocode_peer_messages', output: content } };
}

export function codexPeerItems(session: string, content: string): JsonObject {
  return { threadId: session, items: [{ type: 'function_call_output', name: 'octocode_peer_messages', output: content }] };
}

function object(value: unknown, what: string): JsonObject {
  if (!isObject(value)) throw new TypeError(what + ' is not a JSON object');
  return value;
}

/** `value` when it is a JSON object, else an empty one: a vendor reply field that may be absent. */
const objectOrEmpty = (value: unknown): JsonObject => (isObject(value) ? value : {});

const isOneOf = (value: unknown, allowed: readonly string[]): boolean => typeof value === 'string' && allowed.includes(value);

const WEBSOCKET_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
const WEBSOCKET_LIMIT = 1024 * 1024;

/** RFC 6455 client for local plaintext sockets, with strict bounded framing. */
class WebSocket {
  deadline: number;

  private constructor(private readonly channel: Channel) {
    this.deadline = monotonic() + SOCKET_IO_MS;
  }

  static async open(endpoint: string): Promise<WebSocket> {
    validate('codex', endpoint);
    const local = endpoint.startsWith(UNIX_PREFIX);
    const channel = local ? await unix(endpoint.slice(UNIX_PREFIX.length), 'Codex endpoint closed') : await connect(loopback(endpoint, 'ws', true), TCP_CONNECT_MS, 'Codex endpoint closed');
    const socket = new WebSocket(channel);
    try {
      await socket.upgrade(local ? 'localhost' : endpoint.replace(/^[^:]*:\/\//, '').replace(/\/$/, ''));
    } catch (error) {
      channel.close();
      throw error;
    }
    return socket;
  }

  private async upgrade(host: string): Promise<void> {
    const key = randomBytes(16).toString('base64');
    await this.write(Buffer.from(`GET / HTTP/1.1\r\nHost: ${host}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: ${key}\r\nSec-WebSocket-Version: 13\r\n\r\n`));
    let end = -1;
    while ((end = this.channel.peek(this.channel.length).indexOf('\r\n\r\n')) < 0) {
      if (this.channel.length > 16384) throw new ValidationError('WebSocket response headers too large');
      await this.more();
    }
    const headers = this.channel.take(end + 4).subarray(0, end).toString('latin1');
    const lines = headers.split('\r\n');
    const fields: Record<string, string> = {};
    for (const line of lines.slice(1)) {
      const colon = line.indexOf(':');
      if (colon < 0) throw new ValidationError('Invalid WebSocket upgrade response');
      fields[line.slice(0, colon).toLowerCase()] = line.slice(colon + 1).trim();
    }
    const status = lines[0]!.split(/\s+/).filter(Boolean);
    const expected = createHash('sha1').update(key + WEBSOCKET_GUID).digest('base64');
    if (status.length < 2 || status[1] !== '101' || fields['sec-websocket-accept'] !== expected || (fields.upgrade ?? '').toLowerCase() !== 'websocket' || !(fields.connection ?? '').toLowerCase().includes('upgrade')) throw new ValidationError('Invalid WebSocket upgrade response');
  }

  private async more(): Promise<void> {
    if (!(await this.channel.fill(this.deadline))) throw new Error('Codex I/O timed out');
  }

  private async exact(size: number): Promise<Buffer> {
    while (this.channel.length < size) await this.more();
    return this.channel.take(size);
  }

  private write(data: Uint8Array): Promise<void> {
    return this.channel.write(data, this.deadline, 'Codex I/O timed out');
  }

  private async sendFrame(opcode: number, payload: Buffer): Promise<void> {
    if (payload.length > WEBSOCKET_LIMIT) throw new ValidationError('Codex frame exceeds 1 MiB');
    const mask = randomBytes(4);
    const size = payload.length;
    const header = size < 126 ? Buffer.from([0x80 | opcode, 0x80 | size]) : size <= 65535 ? Buffer.from([0x80 | opcode, 0xfe, size >> 8, size & 255]) : Buffer.concat([Buffer.from([0x80 | opcode, 0xff]), Buffer.alloc(8)]);
    if (size > 65535) header.writeBigUInt64BE(BigInt(size), 2);
    const masked = Buffer.alloc(size);
    for (let index = 0; index < size; index += 1) masked[index] = payload[index]! ^ mask[index % 4]!;
    await this.write(Buffer.concat([header, mask, masked]));
  }

  send(value: unknown): Promise<void> {
    return this.sendFrame(1, encode(value));
  }

  async read(): Promise<unknown> {
    const chunks: Buffer[] = [];
    let total = 0;
    let active: number | null = null;
    for (;;) {
      const [first, second] = [...(await this.exact(2))] as [number, number];
      const opcode = first & 15;
      const final = Boolean(first & 128);
      if (first & 112 || second & 128) throw new ValidationError('Invalid WebSocket server frame');
      let size = second & 127;
      if (size === 126) size = (await this.exact(2)).readUInt16BE();
      else if (size === 127) {
        const wide = (await this.exact(8)).readBigUInt64BE();
        if (wide > BigInt(WEBSOCKET_LIMIT)) throw new ValidationError('Codex frame exceeds 1 MiB');
        size = Number(wide);
      }
      if (size > WEBSOCKET_LIMIT || total + size > WEBSOCKET_LIMIT) throw new ValidationError('Codex frame exceeds 1 MiB');
      if (opcode >= 8 && (!final || size > 125)) throw new ValidationError('Invalid WebSocket control frame');
      const payload = await this.exact(size);
      if (opcode === 8) throw new EndOfStream('Codex endpoint closed');
      if (opcode === 9) {
        await this.sendFrame(10, payload);
        continue;
      }
      if (opcode === 10) continue;
      if (opcode === 1 || opcode === 2) {
        if (active !== null) throw new ValidationError('Unexpected WebSocket message start');
        active = opcode;
      } else if (opcode !== 0 || active === null) throw new ValidationError('Unexpected WebSocket continuation');
      chunks.push(payload);
      total += size;
      if (final) {
        if (active === 1) return JSON.parse(decodeUtf8(Buffer.concat(chunks)));
        chunks.length = 0;
        total = 0;
        active = null;
      }
    }
  }

  close(): void {
    this.channel.close();
  }
}

class Codex {
  private sequence = 0;

  private constructor(private readonly socket: WebSocket) {}

  static async open(endpoint: string): Promise<Codex> {
    const codex = new Codex(await WebSocket.open(endpoint));
    try {
      await codex.request('initialize', { clientInfo: { name: 'octocode-communication-dispatch', version: VERSION }, capabilities: { experimentalApi: true } });
      await codex.socket.send({ method: 'initialized', params: {} });
    } catch (error) {
      codex.close();
      throw error;
    }
    return codex;
  }

  async request(method: string, params: JsonObject): Promise<JsonObject | null> {
    this.sequence += 1;
    const identity = this.sequence;
    this.socket.deadline = monotonic() + SOCKET_IO_MS;
    await this.socket.send({ id: identity, method, params });
    for (;;) {
      const value = object(await this.socket.read(), 'Codex frame');
      if (value.id === identity && !('method' in value)) {
        if (value.error !== undefined && value.error !== null) throw new Error(`Codex ${method}: ${dumps(value.error)}`);
        return isObject(value.result) ? value.result : null;
      }
      if ('id' in value && 'method' in value) await this.socket.send(refusal(value.id));
    }
  }

  async ready(session: string, workspace: string): Promise<boolean> {
    const thread = objectOrEmpty((await this.request('thread/read', { threadId: session, includeTurns: false }))?.thread);
    if (thread.id !== session) throw new ValidationError('Codex thread/read returned a different or missing thread identity');
    if (typeof thread.cwd !== 'string' || !thread.cwd || realpath(thread.cwd, true) !== workspace) throw new ValidationError('Codex thread/read returned a different workspace');
    const status = objectOrEmpty(thread.status).type;
    if (!isOneOf(status, ['idle', 'active', 'notLoaded', 'systemError'])) throw new ValidationError('Codex thread/read returned an unknown runtime status');
    return status === 'idle' || status === 'active';
  }

  async startTurn(session: string, content: string): Promise<void> {
    const turn = objectOrEmpty((await this.request('turn/start', codexPeerTurn(session, content)))?.turn);
    if (!turn.id || !isOneOf(turn.status, ['inProgress', 'completed', 'failed', 'interrupted'])) throw new ValidationError('Codex turn/start returned no valid acceptance receipt; inspect before retrying');
  }

  async inject(session: string, content: string): Promise<void> {
    await this.request('thread/inject_items', codexPeerItems(session, content));
  }

  close(): void {
    this.socket.close();
  }
}

const CLAUDE_PROMPTING_MODES = ['default', 'acceptEdits', 'auto', 'dontAsk'];

/** Claude Code verifies a sender that presents the receiver's exported session token. */
export function claudeOwnChild(endpoint: string): boolean {
  return process.env.CLAUDE_CODE_MESSAGING_SOCKET === socketPath(endpoint) && 'CLAUDE_CODE_MESSAGING_TOKEN' in process.env;
}

/**
 * Predict Claude Code's documented inbound decision (delivered, held, refused, unknown) from the receiver's
 * hook-reported permission mode and crossSessionInbound setting. A --settings flag on the receiver is invisible to
 * hooks, so 'accept' is never certain.
 */
export function claudeInbound(state: Pick<HostInboundData, 'permissionMode' | 'crossSessionInbound'> | null | undefined, ownChild: boolean): [string, string] {
  if (!state) return ['unknown', 'Receiver has not reported its permission mode through hooks'];
  const setting = state.crossSessionInbound;
  if (setting === 'refuse') return ['refused', 'Receiver crossSessionInbound is refuse; Claude Code drops peer messages'];
  if (setting === 'hold') return ['held', 'Receiver crossSessionInbound is hold; Claude Code shows a notice and does not deliver'];
  if (setting === 'accept') return ['delivered', 'Receiver crossSessionInbound is accept'];
  if (setting !== undefined && setting !== null) return ['unknown', 'Receiver crossSessionInbound value is not recognized'];
  if (ownChild) return ['delivered', "Sender presents the receiver's session token (verified own child)"];
  const mode = state.permissionMode;
  if (mode === 'bypassPermissions') return ['held', 'Receiver bypasses permission prompts; Claude Code holds peer messages for approval and drops them after dialogExpiry'];
  if (CLAUDE_PROMPTING_MODES.includes(mode)) return ['delivered', 'Receiver prompts for permissions; Claude Code delivers peer messages'];
  return ['unknown', 'Receiver permission mode does not determine the inbound decision'];
}

/** Writes one peer message to Claude Code's messaging socket and closes it; the receipt is the completed write only. */
export async function claude(endpoint: string, session: string, token: string, content: string): Promise<void> {
  const channel = await unix(socketPath(endpoint), 'Claude socket closed');
  try {
    const deadline = monotonic() + SOCKET_IO_MS;
    const frames: Buffer[] = [];
    const line = (value: unknown): Buffer => Buffer.concat([encode(value), Buffer.from('\n')]);
    if (claudeOwnChild(endpoint)) frames.push(line({ type: 'auth', token: process.env.CLAUDE_CODE_MESSAGING_TOKEN }));
    frames.push(line({ type: 'user', session_id: session, from: 'octocode-communication', priority: 'next', uuid: token, msg_id: token, message: { role: 'user', content } }));
    await channel.write(Buffer.concat(frames), deadline, 'Native I/O timed out');
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Native I/O timed out')), Math.max(0, deadline - monotonic()));
      channel.socket.end(() => {
        clearTimeout(timer);
        resolve();
      });
    });
  } finally {
    channel.close();
  }
}

/** Percent-encoding with `+` for spaces (form encoding). */
function quotePlus(value: string): string {
  return encodeURIComponent(value).replace(/[!'()*]/g, character => '%' + character.charCodeAt(0).toString(16).toUpperCase()).replaceAll('%20', '+');
}

class OpenCode {
  private readonly host: string;
  private readonly port: number;
  private readonly headers: Record<string, string> = {};
  private readonly agent = new Agent({ keepAlive: true, maxSockets: 1 });

  constructor(endpoint: string, private readonly session: string, private readonly workspace: string) {
    validate('opencode', endpoint);
    validateSession(session);
    ({ host: this.host, port: this.port } = loopback(endpoint, 'http', false));
    const password = process.env.OPENCODE_SERVER_PASSWORD ?? '';
    if (password) {
      if (process.env.OCTOCODE_OPENCODE_AUTH_ENDPOINT !== endpoint) throw new ValidationError('Set OCTOCODE_OPENCODE_AUTH_ENDPOINT to the exact attached endpoint before using OPENCODE_SERVER_PASSWORD');
      const username = process.env.OPENCODE_SERVER_USERNAME ?? 'opencode';
      const credentials = username + password;
      const control = [...credentials].some(character => {
        const code = character.codePointAt(0)!;
        return code < 32 || (code >= 127 && code <= 159);
      });
      if (!username || username.includes(':') || control || Buffer.byteLength(credentials) > 8192) throw new ValidationError('Invalid OpenCode authentication configuration');
      this.headers.Authorization = 'Basic ' + Buffer.from(`${username}:${password}`).toString('base64');
    }
  }

  request(method: string, path: string, body?: unknown): Promise<{ status: number; content: Buffer }> {
    const data = body === undefined ? undefined : encode(body);
    const headers: Record<string, string | number> = { ...this.headers };
    if (data) {
      headers['Content-Type'] = 'application/json';
      headers['Content-Length'] = data.length;
    }
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      let size = 0;
      let finished = false;
      const finish = (error: Error | null, value?: { status: number; content: Buffer }): void => {
        if (finished) return;
        finished = true;
        clearTimeout(timer);
        if (error) {
          request.destroy();
          reject(error);
        } else resolve(value!);
      };
      // One deadline bounds the whole exchange, including a peer that trickles headers or body.
      const timer = setTimeout(() => finish(new Error('Native I/O timed out')), HTTP_EXCHANGE_MS);
      const request = httpRequest({ agent: this.agent, host: this.host, port: this.port, method, path: `${path}?directory=${quotePlus(this.workspace)}`, headers }, response => {
        let headerBytes = 0;
        for (let index = 0; index + 1 < response.rawHeaders.length; index += 2) headerBytes += response.rawHeaders[index]!.length + response.rawHeaders[index + 1]!.length + 4;
        if (headerBytes > 16384) return finish(new ValidationError('OpenCode response headers too large'));
        response.on('data', (chunk: Buffer) => {
          size += chunk.length;
          if (size > HTTP_LIMIT) return finish(new ValidationError('OpenCode response exceeds 1 MiB'));
          chunks.push(chunk);
        });
        response.on('end', () => finish(null, { status: response.statusCode ?? 0, content: Buffer.concat(chunks) }));
        response.on('error', error => finish(error));
        response.on('close', () => finish(new Error('OpenCode connection closed before the response completed')));
      });
      request.on('socket', socket => {
        if (!socket.connecting) return;
        const connectTimer = setTimeout(() => finish(new Error('Native I/O timed out')), HTTP_CONNECT_MS);
        socket.once('connect', () => clearTimeout(connectTimer));
        socket.once('close', () => clearTimeout(connectTimer));
      });
      request.on('error', error => finish(error));
      request.end(data);
    });
  }

  async get(path: string): Promise<unknown> {
    const { status, content } = await this.request('GET', path);
    if (status !== 200) throw new Error(`OpenCode preflight returned HTTP ${status}; no message submitted`);
    return parseJsonBytes(content);
  }

  async idle(): Promise<boolean> {
    const session = object(await this.get('/session/' + this.session), 'OpenCode session');
    if (session.id !== this.session || typeof session.directory !== 'string' || !session.directory || realpath(session.directory, true) !== this.workspace) throw new ValidationError('OpenCode session/workspace mismatch; no message submitted');
    const statuses = await this.get('/session/status');
    if (!isObject(statuses)) throw new ValidationError('Invalid OpenCode status map; no message submitted');
    // An absent entry means idle; a present entry that is not an object is a malformed map, not idle.
    const entry = Object.hasOwn(statuses, this.session) ? statuses[this.session] : { type: 'idle' };
    if (!isObject(entry)) throw new ValidationError('Invalid OpenCode status entry; no message submitted');
    const status = entry.type;
    if (!isOneOf(status, ['idle', 'busy', 'retry'])) throw new ValidationError('Unknown OpenCode runtime status; no message submitted');
    return status === 'idle';
  }

  async submit(content: string, action: boolean): Promise<void> {
    const { status, content: body } = await this.request('POST', `/session/${this.session}/${action ? 'prompt_async' : 'message'}`, { noReply: !action, parts: [{ type: 'text', text: content }] });
    if (status !== (action ? 204 : 200)) throw new Error(`OpenCode submission returned HTTP ${status}; inspect before retrying`);
    if (!action) {
      const receipt = object(parseJsonBytes(body), 'OpenCode receipt');
      const info = objectOrEmpty(receipt.info);
      const parts: unknown[] = Array.isArray(receipt.parts) ? receipt.parts : [];
      if (info.sessionID !== this.session || info.role !== 'user' || !String(info.id ?? '').startsWith('msg_') || !parts.some(part => isObject(part) && part.type === 'text' && part.text === content)) throw new ValidationError('OpenCode receipt did not match submitted message/session; inspect before retrying');
    }
  }

  close(): void {
    this.agent.destroy();
  }
}

class Grok {
  private sequence = 0;
  private pending: { identity: number; deadline: number } | null = null;

  private constructor(private readonly channel: Channel, private readonly session: string) {}

  static async open(endpoint: string, session: string, workspace: string): Promise<Grok> {
    validate('grok', endpoint);
    if (!isUuid(session)) throw new ValidationError('badly formed hexadecimal UUID string');
    const grok = new Grok(await unix(socketPath(endpoint), 'Grok leader closed; delivery may have succeeded; inspect before retrying'), session);
    try {
      await grok.register(workspace);
    } catch (error) {
      grok.close();
      throw error;
    }
    return grok;
  }

  private async register(workspace: string): Promise<void> {
    const deadline = monotonic() + GROK_REGISTRATION_MS;
    await this.sendFrame({ type: 'register', client_type: 'octocode-communication', mode: 'stdio', capabilities: {} });
    let registered = false;
    for (;;) {
      if (monotonic() >= deadline) throw new Error('Grok leader registration timed out');
      const frame = await this.frame(GROK_REQUEST_POLL_MS);
      if (frame === null) continue;
      if (frame.type === 'registered') {
        if (frame.leader_protocol_version !== 1) throw new ValidationError('Unsupported Grok leader protocol; version 1 is required');
        registered = true;
        if (frame.ready !== false) break;
      } else if (frame.type === 'leader_ready' && registered) break;
      else throw new ValidationError('Unexpected Grok leader registration response');
    }
    const result = object(await this.request('initialize', { protocolVersion: 1, clientInfo: { name: 'octocode-communication', version: VERSION }, clientCapabilities: {} }, deadline), 'Grok initialize result');
    if (result.protocolVersion !== 1) throw new ValidationError('Unsupported Grok ACP protocol; version 1 is required');
    const info = objectOrEmpty(object(await this.request('_x.ai/session/info', { sessionId: this.session }, deadline), 'Grok session info').result);
    if (info.sessionId !== this.session || typeof info.cwd !== 'string' || !info.cwd || realpath(info.cwd, true) !== workspace) throw new ValidationError('Grok session metadata does not match identity/workspace; no message staged');
  }

  private async sendFrame(value: unknown): Promise<void> {
    const data = encode(value);
    if (data.length > MAX_FRAME) throw new ValidationError('Grok frame exceeds 8 MiB');
    const header = Buffer.alloc(4);
    header.writeUInt32BE(data.length);
    await this.channel.write(Buffer.concat([header, data]), monotonic() + SOCKET_IO_MS, 'Native I/O timed out');
  }

  private sendRpc(value: unknown): Promise<void> {
    return this.sendFrame({ type: 'acp', payload: encode(value).toString('utf8') });
  }

  /** The next complete length-prefixed frame, or null when none arrives within `waitMs`. */
  private async frame(waitMs: number): Promise<JsonObject | null> {
    for (;;) {
      if (this.channel.length >= 4) {
        const size = this.channel.peek(4).readUInt32BE();
        if (size > MAX_FRAME) throw new ValidationError('Grok frame exceeds 8 MiB');
        if (this.channel.length >= size + 4) return object(parseJsonBytes(this.channel.take(size + 4).subarray(4)), 'Grok frame');
      }
      if (!(await this.channel.fill(monotonic() + waitMs))) return null;
    }
  }

  private async response(identity: number, waitMs: number): Promise<unknown> {
    for (let count = 0; count < 64; count += 1) {
      const frame = await this.frame(waitMs);
      if (frame === null) return null;
      if (frame.type === 'acp') {
        const rpc = object(JSON.parse(String(frame.payload)), 'Grok ACP payload');
        if ('method' in rpc && 'id' in rpc) await this.sendRpc({ ...refusal(rpc.id), jsonrpc: '2.0' });
        else if (rpc.id === identity) {
          if ('error' in rpc) throw new Error('Grok ACP request failed: ' + dumps(rpc.error));
          if (!('result' in rpc)) throw new ValidationError('Grok ACP response lacks result');
          return rpc.result;
        }
      } else if (frame.type !== 'pong') throw new ValidationError('Unsupported Grok leader frame');
    }
    return null;
  }

  private async request(method: string, params: JsonObject, deadline: number): Promise<unknown> {
    this.sequence += 1;
    const identity = this.sequence;
    await this.sendRpc({ jsonrpc: '2.0', id: identity, method, params });
    while (monotonic() < deadline) {
      const result = await this.response(identity, GROK_REQUEST_POLL_MS);
      if (result !== null && result !== undefined) return result;
    }
    throw new Error(`Grok ${method} timed out`);
  }

  async submit(content: string, token: string): Promise<void> {
    if (this.pending) throw new Error('Grok already has an in-flight delivery');
    this.sequence += 1;
    this.pending = { identity: this.sequence, deadline: monotonic() + GROK_PROMPT_MS };
    await this.sendRpc({ jsonrpc: '2.0', id: this.sequence, method: 'session/prompt', params: { sessionId: this.session, prompt: [{ type: 'text', text: content }], _meta: { verbatim: true, promptId: token } } });
  }

  /** The turn's stop reason and its `_meta`, once the prompt response arrives. */
  async poll(): Promise<{ stopReason: string; meta: JsonObject } | null> {
    if (!this.pending) return null;
    const { identity, deadline } = this.pending;
    const value = await this.response(identity, GROK_POLL_MS);
    if (value !== null && value !== undefined) {
      if (!isObject(value) || typeof value.stopReason !== 'string') throw new ValidationError('Grok prompt response lacks stopReason');
      this.pending = null;
      return { stopReason: value.stopReason, meta: objectOrEmpty(value._meta) };
    }
    if (monotonic() >= deadline) throw new Error('Grok prompt timed out; delivery may have succeeded; inspect before retrying');
    return null;
  }

  close(): void {
    this.channel.close();
  }
}

const USAGE_SOURCES: [UsageCounter, string][] = [['inputTokens', 'inputTokens'], ['outputTokens', 'outputTokens'], ['cachedInputTokens', 'cachedReadTokens'], ['cacheWriteTokens', 'cacheCreationTokens']];

type Backend = Codex | Grok | OpenCode | null;

/** One native receiver: its adapter, binding identity and receipt semantics. */
export class NativeDelivery {
  private constructor(readonly mode: string, readonly endpoint: string | undefined, readonly session: string | undefined, readonly workspace: string, private readonly backend: Backend) {}

  static async open(mode: string, endpoint: string | undefined, session: string | undefined, workspace: string): Promise<NativeDelivery> {
    if (!(mode in RECEIPTS)) throw new ValidationError('Unknown native transport: ' + mode);
    const backend: Backend = mode === 'codex' ? await Codex.open(endpoint!) : mode === 'grok' ? await Grok.open(endpoint!, session!, workspace) : mode === 'opencode' ? new OpenCode(endpoint!, session!, workspace) : null;
    return new NativeDelivery(mode, endpoint, session, workspace, backend);
  }

  matches(mode: string, endpoint: string | undefined, session: string | undefined, workspace: string): boolean {
    return this.mode === mode && this.endpoint === endpoint && this.session === session && this.workspace === workspace;
  }

  async prepare(): Promise<boolean> {
    if (this.backend instanceof Codex) return this.backend.ready(this.session!, this.workspace);
    if (this.backend instanceof OpenCode) return this.backend.idle();
    return true;
  }

  /** Offers one batch; resolves to the acceptance receipt, or null while Grok's turn completion is awaited through `poll`. */
  async offer(content: string, token: string, action: boolean): Promise<Receipt | null> {
    if (requiresAction(this.mode) && !action) throw new ValidationError(this.mode + ' cannot inject passive-only context');
    if (this.mode === 'claude') await claude(this.endpoint!, this.session!, token, content);
    else if (this.backend instanceof Codex) await (action ? this.backend.startTurn(this.session!, content) : this.backend.inject(this.session!, content));
    else if (this.backend instanceof OpenCode) await this.backend.submit(content, action);
    else {
      await (this.backend as Grok).submit(content, token);
      return null;
    }
    return { kind: RECEIPTS[this.mode]!, turnRequested: action };
  }

  async poll(token: string): Promise<Receipt | null> {
    if (!(this.backend instanceof Grok)) return null;
    const receipt = await this.backend.poll();
    if (receipt === null) return null;
    const result: Receipt = { kind: RECEIPTS[this.mode]!, turnRequested: true, stopReason: receipt.stopReason };
    const meta = receipt.meta;
    const record: RecordUsageInput = { key: 'grok-' + token, scope: 'turn' };
    for (const [field, source] of USAGE_SOURCES) {
      const value = objectOrEmpty(meta.usage)[source];
      if (typeof value === 'number' && Number.isInteger(value) && value >= 0) record[field] = value;
    }
    if (Object.keys(record).length > 2) {
      const model = meta.modelId;
      if (typeof model === 'string' && model.length > 0 && codePointLength(model) <= 256) record.model = model;
      result.usage = record;
    }
    return result;
  }

  close(): void {
    this.backend?.close();
  }
}
