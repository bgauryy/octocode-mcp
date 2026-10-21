/**
 * Byte-stable JSON text, bounded line protocol and owned vendor-process lifecycle.
 *
 * `dumps` writes JSON text byte for byte as the persisted format defines it for every option combination in use (ASCII or
 * Unicode escapes, spacing, key order), because some of its output is hashed, compared or stored.
 * Numbers that are whole are printed as integers: JSON cannot tell `5.0` from `5`.
 */
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { accessSync, closeSync, constants, openSync, readSync } from 'node:fs';
import { delimiter, join } from 'node:path';
import { ValidationError } from './errors.js';
import { compareCodePoints } from './text.js';
import { monotonic, type Stop } from './timing.js';

export const MAX_FRAME = 8 * 1024 * 1024;

const STRICT_UTF8 = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });

/** The text of `bytes` as strict UTF-8: invalid UTF-8 throws and a leading U+FEFF is kept (a `TextDecoder` drops it by default). */
export function decodeUtf8(bytes: Uint8Array): string {
  return STRICT_UTF8.decode(bytes);
}

/** Parses JSON from strict UTF-8 bytes; one leading byte order mark is tolerated. */
export function parseJsonBytes(bytes: Uint8Array): unknown {
  const marked = bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf;
  return JSON.parse(decodeUtf8(marked ? bytes.subarray(3) : bytes));
}

interface DumpsOptions {
  /** Escape every character outside printable ASCII as \uXXXX (the default). */
  ensureAscii?: boolean;
  /** Item and key separators; the default is `', '` and `': '`. */
  separators?: readonly [string, string];
  sortKeys?: boolean;
  /** Emit NaN and Infinity (the default) instead of failing. */
  allowNan?: boolean;
}

/** Compact separators, characters kept as written, NaN refused: how stored bodies, hashes and wire frames are written. */
export const COMPACT: DumpsOptions = { ensureAscii: false, separators: [',', ':'], allowNan: false };

/** `dumps` with `COMPACT`. */
export function compact(value: unknown): string {
  return dumps(value, COMPACT);
}

/** Compact separators with every non-ASCII character escaped: MCP binding text and ID lists. */
export function compactAscii(value: unknown): string {
  return dumps(value, { separators: [',', ':'] });
}

/** The shortest round-trip text of a float, with an exponent outside 1e-4..1e16; safe integers are printed as integers instead. */
function formatFloat(value: number): string {
  const [mantissa = '', exponentText = '0'] = value.toExponential().split('e');
  const exponent = Number(exponentText);
  if (exponent >= -4 && exponent < 16) return String(value);
  const digits = Math.abs(exponent);
  return `${mantissa}e${exponent < 0 ? '-' : '+'}${digits < 10 ? '0' : ''}${digits}`;
}

function formatNumber(value: number, allowNan: boolean): string {
  if (!Number.isFinite(value)) {
    if (!allowNan) throw new ValidationError('Out of range float values are not JSON compliant');
    return Number.isNaN(value) ? 'NaN' : value > 0 ? 'Infinity' : '-Infinity';
  }
  if (Number.isSafeInteger(value)) return Object.is(value, -0) ? '0' : String(value);
  return formatFloat(value);
}

/** JSON text of `value` per `options`. Object properties that are `undefined` are omitted, as JSON.stringify does. */
export function dumps(value: unknown, { ensureAscii = true, separators = [', ', ': '], sortKeys = false, allowNan = true }: DumpsOptions = {}): string {
  const [itemSeparator, keySeparator] = separators;
  const text = (string: string): string => {
    const quoted = JSON.stringify(string);
    return ensureAscii ? quoted.replace(/[^\x20-\x7e]/g, character => '\\u' + character.charCodeAt(0).toString(16).padStart(4, '0')) : quoted;
  };
  const write = (item: unknown, inArray: boolean): string => {
    if (item === null || (item === undefined && inArray)) return 'null';
    switch (typeof item) {
      case 'string': return text(item);
      case 'boolean': return item ? 'true' : 'false';
      case 'number': return formatNumber(item, allowNan);
      case 'bigint': return item.toString();
      case 'object': break;
      default: throw new TypeError(`Object of type ${typeof item} is not JSON serializable`);
    }
    if (Array.isArray(item)) return '[' + item.map(element => write(element, true)).join(itemSeparator) + ']';
    if (Object.getPrototypeOf(item) !== Object.prototype && Object.getPrototypeOf(item) !== null) throw new TypeError('Object is not JSON serializable');
    let entries = Object.entries(item as Record<string, unknown>).filter(([, member]) => member !== undefined);
    if (sortKeys) entries = entries.sort(([a], [b]) => compareCodePoints(a, b));
    return '{' + entries.map(([key, member]) => text(key) + keySeparator + write(member, false)).join(itemSeparator) + '}';
  };
  if (value === undefined) throw new TypeError('Object of type undefined is not JSON serializable');
  return write(value, false);
}

/** One wire frame without its newline: compact UTF-8 JSON. */
export function encode(value: unknown): Buffer {
  return Buffer.from(compact(value));
}

function which(command: string): string | null {
  const names = process.platform === 'win32' ? ['', ...(process.env.PATHEXT ?? '.EXE;.CMD;.BAT').split(';')] : [''];
  const directories = command.includes('/') || command.includes('\\') ? [''] : (process.env.PATH ?? '').split(delimiter);
  for (const directory of directories) {
    for (const extension of names) {
      const candidate = directory ? join(directory, command + extension) : command + extension;
      try {
        accessSync(candidate, constants.X_OK);
        return candidate;
      } catch {
        /* next candidate */
      }
    }
  }
  return null;
}

/** Splits a line into words as a POSIX shell does: whitespace separates, quotes and backslashes group and escape. */
export function splitShellWords(line: string): string[] {
  const words: string[] = [];
  let word: string | null = null;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index]!;
    if (' \t\r\n'.includes(character)) {
      if (word !== null) words.push(word);
      word = null;
    } else if (character === "'") {
      const end = line.indexOf("'", index + 1);
      if (end < 0) throw new ValidationError('No closing quotation');
      word = (word ?? '') + line.slice(index + 1, end);
      index = end;
    } else if (character === '"') {
      let quoted = '';
      for (index += 1; ; index += 1) {
        if (index >= line.length) throw new ValidationError('No closing quotation');
        const inner = line[index]!;
        if (inner === '"') break;
        if (inner === '\\') {
          if (index + 1 >= line.length) throw new ValidationError('No closing quotation');
          const escaped = line[index + 1]!;
          if (escaped === '"' || escaped === '\\') {
            quoted += escaped;
            index += 1;
            continue;
          }
        }
        quoted += inner;
      }
      word = (word ?? '') + quoted;
    } else if (character === '\\') {
      if (index + 1 >= line.length) throw new ValidationError('No escaped character');
      word = (word ?? '') + line[(index += 1)];
    } else word = (word ?? '') + character;
  }
  if (word !== null) words.push(word);
  return words;
}

/** Invoke script interpreters explicitly, preserving their declared arguments. */
export function executableArgv(command: string, args: readonly string[]): string[] {
  const path = which(command);
  if (path) {
    const head = Buffer.alloc(4096);
    let length: number;
    try {
      const descriptor = openSync(path, 'r');
      try {
        length = readSync(descriptor, head, 0, head.length, null);
      } finally {
        closeSync(descriptor);
      }
    } catch {
      return [command, ...args];
    }
    const newline = head.subarray(0, length).indexOf(10);
    if (head[0] === 0x23 && head[1] === 0x21 && newline >= 0) {
      const interpreter = splitShellWords(head.subarray(2, newline + 1).toString('utf8').trim());
      if (interpreter.length) return [...interpreter, path, ...args];
    }
  }
  return [command, ...args];
}

export class OversizedFrame extends ValidationError {
  override name = 'OversizedFrame';
}

export function refusal(identity: unknown): Record<string, unknown> {
  return { id: identity, error: { code: -32601, message: 'Communication delivery cannot approve actions or execute tools' } };
}

const MAX_BUFFERED_FRAMES = 128;
const MAX_PENDING = 512;
const WRITE_TIMEOUT_MS = 30000;
/** How long a vendor process group gets after SIGTERM before SIGKILL; the parent-death watchdog uses the same grace. */
export const TERMINATE_GRACE_MS = 2000;

type Message = Record<string, unknown>;

/** A newline-delimited JSON frame reader that never buffers more than one frame beyond MAX_FRAME. */
class FrameReader {
  private chunks: Buffer = Buffer.alloc(0);
  private ended = false;
  readonly frames: (Message | Error)[] = [];
  private failed = false;
  private waiter: (() => void) | null = null;

  constructor(private readonly stream: NodeJS.ReadableStream) {
    stream.on('data', (chunk: Buffer) => {
      this.chunks = this.chunks.length ? Buffer.concat([this.chunks, chunk]) : chunk;
      this.pump();
    });
    stream.on('end', () => {
      this.ended = true;
      this.pump();
    });
    stream.on('error', (error: Error) => this.fail(error));
  }

  private fail(error: Error): void {
    if (this.failed) return;
    this.failed = true;
    this.frames.push(error);
    this.chunks = Buffer.alloc(0);
    this.wake();
  }

  private wake(): void {
    const waiter = this.waiter;
    this.waiter = null;
    waiter?.();
  }

  private line(): Buffer | null {
    const newline = this.chunks.indexOf(10);
    if (newline >= 0 && newline + 1 <= MAX_FRAME) {
      const data = this.chunks.subarray(0, newline + 1);
      this.chunks = this.chunks.subarray(newline + 1);
      return data;
    }
    if (this.chunks.length > MAX_FRAME) throw new OversizedFrame('JSON frame exceeds 8 MiB');
    if (this.ended && this.chunks.length) {
      const data = this.chunks;
      this.chunks = Buffer.alloc(0);
      return data;
    }
    return null;
  }

  private pump(): void {
    try {
      while (!this.failed && this.frames.length < MAX_BUFFERED_FRAMES) {
        const data = this.line();
        if (data === null) break;
        this.frames.push(parseJsonBytes(data) as Message);
      }
      if (!this.failed && this.ended && !this.chunks.length && this.frames.length < MAX_BUFFERED_FRAMES) this.fail(new Error('Vendor process closed stdout'));
    } catch (error) {
      this.fail(error as Error);
    }
    if (this.frames.length >= MAX_BUFFERED_FRAMES) this.stream.pause();
    this.wake();
  }

  /** The next frame or error, or undefined after `timeoutMs`. */
  async next(timeoutMs: number): Promise<Message | Error | undefined> {
    const end = monotonic() + timeoutMs;
    while (!this.frames.length) {
      const remaining = end - monotonic();
      if (remaining <= 0) break;
      await new Promise<void>(resolve => {
        const timer = setTimeout(resolve, remaining);
        this.waiter = () => {
          clearTimeout(timer);
          resolve();
        };
      });
      this.waiter = null;
    }
    const frame = this.frames.shift();
    if (this.frames.length < MAX_BUFFERED_FRAMES) {
      this.stream.resume();
      this.pump();
    }
    return frame;
  }
}

/** A vendor process speaking newline-delimited JSON on stdio; it is killed with its process group on close. */
export class Wire implements AsyncDisposable {
  readonly stop: Stop;
  readonly pending: Message[] = [];
  private sequence = 0;
  private stopped = false;
  private readonly child: ChildProcess;
  private readonly reader: FrameReader;
  private readonly exited: Promise<void>;
  private exitCode: number | null = null;

  constructor(command: string, args: readonly string[], cwd: string, environment: Iterable<readonly [string, string]> = [], private readonly deadline: number | null = null, stop?: Stop) {
    this.stop = stop ?? { aborted: false };
    const [file, ...rest] = executableArgv(command, args);
    this.child = spawn(file!, rest, { cwd, env: { ...process.env, ...Object.fromEntries(environment) }, stdio: ['pipe', 'pipe', 'inherit'], detached: process.platform !== 'win32' });
    this.reader = new FrameReader(this.child.stdout!);
    this.exited = new Promise(resolve => {
      this.child.once('exit', code => {
        this.exitCode = code ?? -1;
        resolve();
      });
      this.child.once('error', () => resolve());
    });
    this.child.stdin!.on('error', () => undefined);
  }

  get pid(): number | undefined {
    return this.child.pid;
  }

  private limit(): number {
    return Math.min(monotonic() + WRITE_TIMEOUT_MS, this.deadline ?? Infinity);
  }

  async send(value: unknown): Promise<void> {
    if (this.stopped) throw new Error('Vendor process closed');
    const frame = Buffer.concat([encode(value), Buffer.from('\n')]);
    if (frame.length > MAX_FRAME) throw new OversizedFrame('JSON frame exceeds 8 MiB');
    const limit = this.limit();
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => finish(new Error('Timed out writing to vendor')), Math.max(0, limit - monotonic()));
      const poll = setInterval(() => this.stop.aborted && finish(new Error('Worker stopped')), 100);
      const finish = (error?: Error): void => {
        clearTimeout(timer);
        clearInterval(poll);
        if (error) reject(error);
        else resolve();
      };
      this.child.stdin!.write(frame, error => finish(error ?? undefined));
    });
  }

  /** The next frame within `timeoutMs`, null on timeout; a reader failure is thrown. */
  async receive(timeoutMs: number): Promise<Message | null> {
    const value = await this.reader.next(timeoutMs);
    if (value instanceof Error) throw value;
    return value ?? null;
  }

  async event(timeoutMs: number): Promise<Message | null> {
    return this.pending.shift() ?? (await this.receive(timeoutMs));
  }

  request(method: string, params: Message): Promise<unknown> {
    return this.exchange(method, params, false);
  }

  piRequest(method: string, params: Message): Promise<unknown> {
    return this.exchange(method, params, true);
  }

  private async exchange(method: string, params: Message, pi: boolean): Promise<unknown> {
    this.sequence += 1;
    const identity = pi ? String(this.sequence) : this.sequence;
    await this.send(pi ? { ...params, id: identity, type: method } : { id: identity, method, params });
    const limit = this.limit();
    while (monotonic() < limit) {
      if (this.stop.aborted) throw new Error('Worker stopped');
      const value = await this.receive(Math.min(100, limit - monotonic()));
      if (value === null) continue;
      if (typeof value !== 'object' || Array.isArray(value)) throw new TypeError('Vendor sent a frame that is not a JSON object');
      if (value.id === identity && !('method' in value)) {
        if ('error' in value || (pi && value.success !== true)) throw new Error('Vendor request failed: ' + dumps(value));
        return value[pi ? 'data' : 'result'];
      }
      if ('id' in value && 'method' in value) await this.send(refusal(value.id));
      else {
        if (this.pending.length >= MAX_PENDING) throw new Error('Vendor notification queue full');
        this.pending.push(value);
      }
    }
    throw new Error('Timed out: ' + method);
  }

  async close(): Promise<void> {
    if (this.stopped) return;
    this.stopped = true;
    if (this.exitCode === null && this.child.pid !== undefined) {
      if (process.platform === 'win32') spawnSync('taskkill', ['/PID', String(this.child.pid), '/T', '/F'], { stdio: 'ignore' });
      else {
        const signal = (name: NodeJS.Signals): void => {
          try {
            process.kill(-this.child.pid!, name);
          } catch {
            /* the group is already gone */
          }
        };
        signal('SIGTERM');
        const timer = new Promise<void>(resolve => setTimeout(resolve, TERMINATE_GRACE_MS).unref());
        await Promise.race([this.exited, timer]);
        if (this.exitCode === null) signal('SIGKILL');
      }
      if (this.exitCode === null) this.child.kill('SIGKILL');
    }
    await this.exited;
    this.child.stdin!.destroy();
    this.child.stdout!.destroy();
  }

  [Symbol.asyncDispose](): Promise<void> {
    return this.close();
  }
}
