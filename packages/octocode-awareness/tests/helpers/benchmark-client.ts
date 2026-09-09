import { appendFileSync, closeSync, existsSync, openSync, readFileSync, readSync, statSync, writeFileSync } from 'node:fs';
import { StringDecoder } from 'node:string_decoder';
import { performance } from 'node:perf_hooks';

type Request = { command: string; params: Record<string, unknown> };
type Phase = 'work' | 'warmup' | 'measure' | 'close';
type Receipt = {
  mode: string; actor?: string; command?: string; actionKey?: string; request?: Request;
  effect?: string; phase?: string; workload?: string;
  /** Whole-call timing through execution; the final receipt append is outside this interval. */
  elapsed_ms?: number;
  execution_elapsed_ms?: number; response_bytes?: number;
  request_bytes?: number; schema_bytes?: number; expected?: boolean; payload?: unknown;
  error?: string; exitCode?: number; expectedExit?: number; subjectDigest?: string;
};

export interface BenchmarkClientOptions {
  actor: string; workspace: string; database: string; receiptPath: string; schemaPath: string;
  subjectDigest: string; maxCalls?: number; reserveCalls?: number;
  execute: (request: Request, context: {
    workspace: string; database: string; agentId: string; compact: boolean;
  }) => Promise<{ exitCode: number; payload?: unknown }>;
  describeCommand: (command: string) => unknown;
}
export interface BenchmarkCallOptions {
  expectedExit?: number; actionKey?: string; phase?: Phase; workload?: string;
}

const CLOSURE_COMMANDS = new Set([
  'work end', 'task submit', 'task release', 'lock release', 'verify mark', 'verify audit',
  'agent leave', 'signal ack', 'signal resolve', 'handoff clear',
]);
const bytes = (value: unknown) => Buffer.byteLength(JSON.stringify(value) ?? 'null');
const canonical = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical((value as Record<string, unknown>)[key])}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
};

type FileMetadata = { dev: number; ino: number; size: number; mtimeMs: number; ctimeMs: number };
type ActionState = { request: string; subjectDigest?: string; mode: 'intent' | 'call'; expected?: boolean; expectedExit?: number; error?: string; offset: number; length: number };
type TimingStats = { count: number; responseBytes: number; samples: number[] };
type ReceiptIndex = {
  path: string; offset: number; pending: string; pendingStart?: number; decoder: StringDecoder; metadata?: FileMetadata;
  calls: number; unexpected: number; schemas: number; schemaBytes: number; requestBytes: number; responseBytes: number;
  cacheHits: number; cacheHitOverheadMs: number; wholeCallElapsedMs: number; executionElapsedMs: number;
  measured: Map<string, TimingStats>; actorCalls: Map<string, number>; actions: Map<string, ActionState>;
};
type SchemaCache = { subjectDigest: string; commands: Record<string, unknown>; metadata?: FileMetadata };

const receiptIndexes = new Map<string, ReceiptIndex>();
const schemaCaches = new Map<string, SchemaCache>();

function actionIndexKey(actionKey: string, actor?: string): string {
  return `${actor ?? ''}\u0000${actionKey}`;
}

function newReceiptIndex(path: string): ReceiptIndex {
  return {
    path, offset: 0, pending: '', decoder: new StringDecoder('utf8'),
    calls: 0, unexpected: 0, schemas: 0, schemaBytes: 0, requestBytes: 0,
    responseBytes: 0, cacheHits: 0, cacheHitOverheadMs: 0, wholeCallElapsedMs: 0, executionElapsedMs: 0,
    measured: new Map(), actorCalls: new Map(), actions: new Map(),
  };
}

function metadata(path: string): FileMetadata | undefined {
  if (!existsSync(path)) return undefined;
  const stat = statSync(path);
  return { dev: stat.dev, ino: stat.ino, size: stat.size, mtimeMs: stat.mtimeMs, ctimeMs: stat.ctimeMs };
}

function sameIdentity(left: FileMetadata, right: FileMetadata): boolean {
  return left.dev === right.dev && left.ino === right.ino;
}

function sameFile(left: FileMetadata | undefined, right: FileMetadata | undefined): boolean {
  if (!left || !right) return left === right;
  return sameIdentity(left, right)
    && left.size === right.size
    && left.mtimeMs === right.mtimeMs
    && left.ctimeMs === right.ctimeMs;
}

function resetIndex(index: ReceiptIndex): void {
  index.offset = 0;
  index.pending = '';
  index.pendingStart = undefined;
  index.decoder = new StringDecoder('utf8');
  index.metadata = undefined;
  index.calls = 0;
  index.unexpected = 0;
  index.schemas = 0;
  index.schemaBytes = 0;
  index.requestBytes = 0;
  index.responseBytes = 0;
  index.cacheHits = 0;
  index.cacheHitOverheadMs = 0;
  index.wholeCallElapsedMs = 0;
  index.executionElapsedMs = 0;
  index.measured.clear();
  index.actorCalls.clear();
  index.actions.clear();
}

function readBytes(path: string, start: number, length: number): Buffer {
  if (length <= 0) return Buffer.alloc(0);
  const fd = openSync(path, 'r');
  try {
    const result = Buffer.alloc(length);
    let read = 0;
    while (read < length) {
      const count = readSync(fd, result, read, length - read, start + read);
      if (count === 0) break;
      read += count;
    }
    return read === length ? result : result.subarray(0, read);
  } finally {
    closeSync(fd);
  }
}

function descriptorEffect(descriptor: unknown): string | undefined {
  if (descriptor === null || typeof descriptor !== 'object') return undefined;
  const record = descriptor as Record<string, unknown>;
  if (typeof record.effect === 'string') return record.effect;
  const inputSchema = record.inputSchema;
  if (inputSchema !== null && typeof inputSchema === 'object') {
    const marker = (inputSchema as Record<string, unknown>)['x-awareness-effect'];
    if (typeof marker === 'string') return marker;
  }
  return undefined;
}

function isReadEffect(effect: string | undefined): boolean {
  return effect === 'read' || effect === 'workspace-read';
}

function indexAction(index: ReceiptIndex, row: Receipt, lineOffset: number, lineLength: number): void {
  if (!row.actionKey || row.mode === 'cache-hit' || isReadEffect(row.effect)) return;
  if (row.mode !== 'intent' && row.mode !== 'call') return;
  const request = canonical(row.request);
  const previous = index.actions.get(actionIndexKey(row.actionKey, row.actor));
  if (row.mode === 'intent') {
    index.actions.set(actionIndexKey(row.actionKey, row.actor), {
      request, subjectDigest: row.subjectDigest, mode: 'intent',
      offset: lineOffset, length: lineLength,
    });
    return;
  }
  index.actions.set(actionIndexKey(row.actionKey, row.actor), {
    request: previous?.request ?? request,
    subjectDigest: previous?.subjectDigest ?? row.subjectDigest,
    mode: 'call', expected: row.expected, expectedExit: row.expectedExit, error: row.error,
    offset: lineOffset, length: lineLength,
  });
}

function indexRow(index: ReceiptIndex, row: Receipt, lineOffset: number, lineLength: number): void {
  if (row.mode === 'call') {
    index.calls += 1;
    if (row.actor) index.actorCalls.set(row.actor, (index.actorCalls.get(row.actor) ?? 0) + 1);
    if (row.expected === false) index.unexpected += 1;
    index.requestBytes += row.request_bytes ?? 0;
    index.responseBytes += row.response_bytes ?? 0;
    index.wholeCallElapsedMs += row.elapsed_ms ?? 0;
    index.executionElapsedMs += row.execution_elapsed_ms ?? row.elapsed_ms ?? 0;
    if (row.phase === 'measure') {
      const workload = row.workload ?? row.command ?? 'unknown';
      const stats = index.measured.get(workload) ?? { count: 0, responseBytes: 0, samples: [] };
      stats.count += 1;
      stats.responseBytes += row.response_bytes ?? 0;
      stats.samples.push(row.elapsed_ms ?? 0);
      index.measured.set(workload, stats);
    }
  } else if (row.mode === 'schema') {
    index.schemas += 1;
    index.schemaBytes += row.schema_bytes ?? 0;
  } else if (row.mode === 'cache-hit') {
    index.cacheHits += 1;
    index.cacheHitOverheadMs += row.elapsed_ms ?? 0;
  }
  indexAction(index, row, lineOffset, lineLength);
}

function ingestText(index: ReceiptIndex, text: string, readStart: number): void {
  if (index.pendingStart === undefined) index.pendingStart = readStart;
  index.pending += text;
  while (true) {
    const newline = index.pending.indexOf('\n');
    if (newline < 0) return;
    const line = index.pending.slice(0, newline);
    const lineLength = Buffer.byteLength(line, 'utf8') + 1;
    const lineOffset: number = index.pendingStart!;
    if (line.length > 0) indexRow(index, JSON.parse(line) as Receipt, lineOffset, lineLength);
    index.pending = index.pending.slice(newline + 1);
    index.pendingStart = lineOffset + lineLength;
    if (index.pending.length === 0) {
      index.pendingStart = undefined;
      return;
    }
  }
}

function syncIndex(index: ReceiptIndex): void {
  const current = metadata(index.path);
  if (!current) {
    if (index.offset > 0 || index.pending.length > 0 || index.metadata) resetIndex(index);
    return;
  }
  const replaced = index.metadata !== undefined && !sameIdentity(index.metadata, current);
  const truncated = current.size < index.offset;
  const rewritten = index.metadata !== undefined
    && current.size === index.offset
    && (current.mtimeMs !== index.metadata.mtimeMs || current.ctimeMs !== index.metadata.ctimeMs);
  if (replaced || truncated || rewritten) resetIndex(index);
  if (current.size > index.offset) {
    const start = index.offset;
    const bytesToRead = current.size - start;
    const chunk = readBytes(index.path, start, bytesToRead);
    index.offset += chunk.byteLength;
    ingestText(index, index.decoder.write(chunk), start);
  }
  index.metadata = metadata(index.path) ?? current;
}

function getReceiptIndex(path: string): ReceiptIndex {
  const existing = receiptIndexes.get(path);
  if (existing) {
    syncIndex(existing);
    return existing;
  }
  const created = newReceiptIndex(path);
  receiptIndexes.set(path, created);
  syncIndex(created);
  return created;
}

function cachedPayload(index: ReceiptIndex, state: ActionState): unknown {
  const line = readBytes(index.path, state.offset, state.length).toString('utf8').replace(/\n$/, '');
  return (JSON.parse(line) as Receipt).payload;
}

function summarizeIndex(index: ReceiptIndex) {
  const measured: Record<string, { count: number; p50_ms: number; p95_ms: number; response_bytes: number }> = {};
  for (const [workload, stats] of index.measured) {
    const times = [...stats.samples].sort((a, b) => a - b);
    const middle = Math.floor(times.length / 2);
    measured[workload] = {
      count: stats.count,
      p50_ms: times.length % 2 ? times[middle]! : (times[middle - 1]! + times[middle]!) / 2,
      p95_ms: times[Math.ceil(times.length * 0.95) - 1]!,
      response_bytes: stats.responseBytes,
    };
  }
  return {
    calls: index.calls,
    whole_calls: index.calls,
    unexpected: index.unexpected,
    schema_calls: index.schemas,
    schema_bytes: index.schemaBytes,
    request_bytes: index.requestBytes,
    response_bytes: index.responseBytes,
    measured,
    cache_hits: index.cacheHits,
    cache_hit_overhead_ms: index.cacheHitOverheadMs,
    whole_call_elapsed_ms: index.wholeCallElapsedMs,
    execution_elapsed_ms: index.executionElapsedMs,
  };
}

/** One serial caller per actor receipt file. The supervisor freezes the subject before use. */
export function createBenchmarkClient(options: BenchmarkClientOptions) {
  const maxCalls = options.maxCalls ?? 120;
  const reserveCalls = options.reserveCalls ?? 12;
  if (!Number.isInteger(maxCalls) || !Number.isInteger(reserveCalls) || reserveCalls < 0 || maxCalls <= reserveCalls) {
    throw new Error('Invalid call budget or closure reserve.');
  }
  const index = getReceiptIndex(options.receiptPath);
  const record = (row: Receipt) => {
    const durable = {
      ...row,
      actor: row.actor ?? options.actor,
      subjectDigest: row.subjectDigest ?? options.subjectDigest,
      at: new Date().toISOString(),
    };
    appendFileSync(options.receiptPath, `${JSON.stringify(durable)}\n`);
    syncIndex(index);
  };

  function describe(command: string): unknown {
    const schemaMetadata = metadata(options.schemaPath);
    const previous = schemaCaches.get(options.schemaPath);
    let cache: SchemaCache;
    if (previous?.subjectDigest === options.subjectDigest && sameFile(previous.metadata, schemaMetadata)) {
      cache = previous;
    } else {
      const saved = existsSync(options.schemaPath)
        ? JSON.parse(readFileSync(options.schemaPath, 'utf8')) as { subjectDigest: string; commands: Record<string, unknown> }
        : undefined;
      cache = saved?.subjectDigest === options.subjectDigest
        ? { subjectDigest: saved.subjectDigest, commands: saved.commands, metadata: schemaMetadata }
        : { subjectDigest: options.subjectDigest, commands: {}, metadata: schemaMetadata };
      schemaCaches.set(options.schemaPath, cache);
    }
    if (Object.hasOwn(cache.commands, command)) return cache.commands[command];
    const descriptor = options.describeCommand(command);
    cache.commands[command] = descriptor;
    writeFileSync(options.schemaPath, JSON.stringify({ subjectDigest: cache.subjectDigest, commands: cache.commands }));
    cache.metadata = metadata(options.schemaPath);
    record({ mode: 'schema', command, schema_bytes: bytes(descriptor) });
    return descriptor;
  }

  async function call(command: string, params: Record<string, unknown> = {}, callOptions: BenchmarkCallOptions = {}): Promise<unknown> {
    const { phase = 'work', expectedExit = 0, actionKey, workload } = callOptions;
    const request = { command, params };
    const callStarted = performance.now();
    const descriptor = describe(command);
    const effect = descriptorEffect(descriptor);
    const mutation = !isReadEffect(effect);
    syncIndex(index);
    if (actionKey && mutation) {
      const previous = index.actions.get(actionIndexKey(actionKey, options.actor))
        ?? index.actions.get(actionIndexKey(actionKey, undefined));
      if (previous) {
        if (previous.request !== canonical(request)) throw new Error(`Action key ${actionKey} has a different request.`);
        if (previous.subjectDigest && previous.subjectDigest !== options.subjectDigest) throw new Error(`Action key ${actionKey} belongs to a different subject.`);
        if (previous.mode === 'call') {
          if (!previous.expected || previous.expectedExit !== expectedExit) {
            throw new Error(previous.error ?? `Action ${actionKey} did not produce the expected result.`);
          }
          const payload = cachedPayload(index, previous);
          record({ mode: 'cache-hit', command, request, actionKey, effect, phase, workload,
            elapsed_ms: performance.now() - callStarted, response_bytes: bytes(payload) });
          return payload;
        }
        throw new Error(`Action ${actionKey} has an uncertain completion; inspect state before recovery.`);
      }
    }
    if (phase === 'close' && !CLOSURE_COMMANDS.has(command)) throw new Error(`${command} is not a closure command.`);
    const calls = index.actorCalls.get(options.actor) ?? 0;
    if (calls >= maxCalls) throw new Error(`Hard call budget ${maxCalls} exhausted.`);
    if (phase !== 'close' && calls >= maxCalls - reserveCalls) throw new Error(`Closure reserve of ${reserveCalls} calls reached.`);
    if (actionKey) record({ mode: 'intent', command, request, actionKey, effect });
    const started = performance.now();
    let result: { exitCode: number; payload?: unknown };
    try {
      result = await options.execute(request, {
        workspace: options.workspace, database: options.database, agentId: options.actor, compact: true,
      });
    } catch (error) {
      record({ mode: 'call', command, request, actionKey, effect, phase, workload, expectedExit,
        elapsed_ms: performance.now() - callStarted, execution_elapsed_ms: performance.now() - started,
        request_bytes: bytes(request), expected: false,
        error: error instanceof Error ? error.message : String(error) });
      throw error;
    }
    const expected = result.exitCode === expectedExit;
    const error = expected ? undefined : `${command}: expected exit ${expectedExit}, received ${result.exitCode}: ${JSON.stringify(result.payload)}`;
    record({ mode: 'call', command, request, actionKey, effect, phase, workload, expectedExit,
      elapsed_ms: performance.now() - callStarted, execution_elapsed_ms: performance.now() - started,
      request_bytes: bytes(request), response_bytes: bytes(result.payload),
      exitCode: result.exitCode, payload: result.payload, expected, error });
    if (!expected) throw new Error(error);
    return result.payload;
  }
  return {
    call,
    describe,
    summary: () => {
      syncIndex(index);
      return summarizeIndex(index);
    },
  };
}

export function summarizeReceipts(rows: Receipt[]) {
  const index = newReceiptIndex('summary');
  rows.forEach((row, rowIndex) => indexRow(index, row, rowIndex, 0));
  return summarizeIndex(index);
}

/** Guard one pagination chain against repeating the same command/params tuple. */
export function createContinuationGuard(): (request: Request) => void {
  const seen = new Set<string>();
  return (request: Request) => {
    const tuple = canonical({ command: request.command, params: request.params });
    if (seen.has(tuple)) throw new Error('Pagination repeated the same request tuple.');
    seen.add(tuple);
  };
}
