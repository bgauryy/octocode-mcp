import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';

type Request = { command: string; params: Record<string, unknown> };
type Phase = 'work' | 'warmup' | 'measure' | 'close';
type Receipt = {
  mode: string; command?: string; actionKey?: string; request?: Request;
  phase?: string; workload?: string; elapsed_ms?: number; response_bytes?: number;
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

/** One serial caller per actor receipt file. The supervisor freezes the subject before use. */
export function createBenchmarkClient(options: BenchmarkClientOptions) {
  const maxCalls = options.maxCalls ?? 120;
  const reserveCalls = options.reserveCalls ?? 12;
  if (!Number.isInteger(maxCalls) || !Number.isInteger(reserveCalls) || reserveCalls < 0 || maxCalls <= reserveCalls) {
    throw new Error('Invalid call budget or closure reserve.');
  }
  const rows = (): Receipt[] => existsSync(options.receiptPath)
    ? readFileSync(options.receiptPath, 'utf8').split('\n').filter(Boolean).map(line => JSON.parse(line) as Receipt) : [];
  const record = (row: Receipt) => appendFileSync(options.receiptPath, `${JSON.stringify({
    ...row, actor: options.actor, subjectDigest: options.subjectDigest, at: new Date().toISOString(),
  })}\n`);

  function describe(command: string): unknown {
    const saved = existsSync(options.schemaPath)
      ? JSON.parse(readFileSync(options.schemaPath, 'utf8')) as { subjectDigest: string; commands: Record<string, unknown> }
      : undefined;
    const cache = saved?.subjectDigest === options.subjectDigest ? saved : { subjectDigest: options.subjectDigest, commands: {} };
    if (Object.hasOwn(cache.commands, command)) return cache.commands[command];
    const descriptor = options.describeCommand(command);
    cache.commands[command] = descriptor;
    writeFileSync(options.schemaPath, JSON.stringify(cache));
    record({ mode: 'schema', command, schema_bytes: bytes(descriptor) });
    return descriptor;
  }

  async function call(command: string, params: Record<string, unknown> = {}, callOptions: BenchmarkCallOptions = {}): Promise<unknown> {
    const { phase = 'work', expectedExit = 0, actionKey, workload } = callOptions;
    const request = { command, params };
    const previous = rows();
    if (actionKey) {
      const matches = previous.filter(row => row.actionKey === actionKey);
      if (matches.some(row => canonical(row.request) !== canonical(request))) throw new Error(`Action key ${actionKey} has a different request.`);
      if (matches.some(row => row.subjectDigest && row.subjectDigest !== options.subjectDigest)) throw new Error(`Action key ${actionKey} belongs to a different subject.`);
      const completed = [...matches].reverse().find(row => row.mode === 'call');
      if (completed) {
        if (!completed.expected || completed.expectedExit !== expectedExit) throw new Error(completed.error ?? `Action ${actionKey} did not produce the expected result.`);
        return completed.payload;
      }
      if (matches.length) throw new Error(`Action ${actionKey} has an uncertain completion; inspect state before recovery.`);
    }
    if (phase === 'close' && !CLOSURE_COMMANDS.has(command)) throw new Error(`${command} is not a closure command.`);
    const calls = previous.filter(row => row.mode === 'call').length;
    if (calls >= maxCalls) throw new Error(`Hard call budget ${maxCalls} exhausted.`);
    if (phase !== 'close' && calls >= maxCalls - reserveCalls) throw new Error(`Closure reserve of ${reserveCalls} calls reached.`);
    if (actionKey) record({ mode: 'intent', command, request, actionKey });
    const started = performance.now();
    let result: { exitCode: number; payload?: unknown };
    try {
      result = await options.execute(request, {
        workspace: options.workspace, database: options.database, agentId: options.actor, compact: true,
      });
    } catch (error) {
      record({ mode: 'call', command, request, actionKey, phase, workload, expectedExit,
        elapsed_ms: performance.now() - started, request_bytes: bytes(request), expected: false,
        error: error instanceof Error ? error.message : String(error) });
      throw error;
    }
    const expected = result.exitCode === expectedExit;
    const error = expected ? undefined : `${command}: expected exit ${expectedExit}, received ${result.exitCode}: ${JSON.stringify(result.payload)}`;
    record({ mode: 'call', command, request, actionKey, phase, workload, expectedExit,
      elapsed_ms: performance.now() - started, request_bytes: bytes(request), response_bytes: bytes(result.payload),
      exitCode: result.exitCode, payload: result.payload, expected, error });
    if (!expected) throw new Error(error);
    return result.payload;
  }
  return { call, describe, summary: () => summarizeReceipts(rows()) };
}

export function summarizeReceipts(rows: Receipt[]) {
  const calls = rows.filter(row => row.mode === 'call');
  const schemas = rows.filter(row => row.mode === 'schema');
  const measured: Record<string, { count: number; p50_ms: number; p95_ms: number; response_bytes: number }> = {};
  const groups = new Map<string, Receipt[]>();
  for (const row of calls.filter(row => row.phase === 'measure')) {
    const name = row.workload ?? row.command ?? 'unknown';
    const group = groups.get(name) ?? [];
    group.push(row);
    groups.set(name, group);
  }
  for (const [workload, samples] of groups) {
    const times = samples.map(row => row.elapsed_ms ?? 0).sort((a, b) => a - b);
    const middle = Math.floor(times.length / 2);
    measured[workload] = {
      count: times.length,
      p50_ms: times.length % 2 ? times[middle]! : (times[middle - 1]! + times[middle]!) / 2,
      p95_ms: times[Math.ceil(times.length * 0.95) - 1]!,
      response_bytes: samples.reduce((sum, row) => sum + (row.response_bytes ?? 0), 0),
    };
  }
  return {
    calls: calls.length, unexpected: calls.filter(row => row.expected === false).length,
    schema_calls: schemas.length, schema_bytes: schemas.reduce((sum, row) => sum + (row.schema_bytes ?? 0), 0),
    request_bytes: calls.reduce((sum, row) => sum + (row.request_bytes ?? 0), 0),
    response_bytes: calls.reduce((sum, row) => sum + (row.response_bytes ?? 0), 0), measured,
  };
}
