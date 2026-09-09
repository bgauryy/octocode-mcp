import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync, appendFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createBenchmarkClient, summarizeReceipts } from './helpers/benchmark-client.js';

const roots: string[] = [];
afterEach(() => roots.splice(0).forEach(root => rmSync(root, { recursive: true, force: true })));
function fixture(overrides: Record<string, unknown> = {}) {
  const root = mkdtempSync(join(tmpdir(), 'awareness-benchmark-client-'));
  roots.push(root);
  const execute = vi.fn(async () => ({ exitCode: 0, payload: { ok: true, run: { run_id: 'run-one' } } }));
  const describeCommand = vi.fn((command: string) => ({ command, inputSchema: { type: 'object' } }));
  const options = { actor: 'agent-a', workspace: root, database: join(root, 'ledger.sqlite3'),
    receiptPath: join(root, 'receipts.jsonl'), schemaPath: join(root, 'schemas.json'),
    subjectDigest: 'build-one', execute, describeCommand, maxCalls: 4, reserveCalls: 1, ...overrides };
  return { root, execute, describeCommand, options, client: createBenchmarkClient(options) };
}

describe('live benchmark client guardrails', () => {
  it('describes once across process-like resumes and invalidates on a new build', () => {
    const f = fixture();
    f.client.describe('work start');
    createBenchmarkClient(f.options).describe('work start');
    expect(f.describeCommand).toHaveBeenCalledTimes(1);
    createBenchmarkClient({ ...f.options, subjectDigest: 'build-two' }).describe('work start');
    expect(f.describeCommand).toHaveBeenCalledTimes(2);
  });

  it('reserves closure calls and enforces the hard ceiling before mutation', async () => {
    const f = fixture({ maxCalls: 3, reserveCalls: 1 });
    await f.client.call('attend');
    await f.client.call('attend');
    await expect(f.client.call('work start')).rejects.toThrow(/reserve/);
    await expect(f.client.call('work start', {}, { phase: 'close' })).rejects.toThrow(/closure/);
    await f.client.call('agent leave', {}, { phase: 'close' });
    await expect(f.client.call('agent leave', {}, { phase: 'close' })).rejects.toThrow(/budget/);
    expect(f.execute).toHaveBeenCalledTimes(3);
  });

  it('resumes completed keyed calls without replay and rejects key reuse with other input', async () => {
    const f = fixture();
    const one = await f.client.call('signal publish', { subject: 'one' }, { actionKey: 'startup' });
    const two = await createBenchmarkClient(f.options).call('signal publish', { subject: 'one' }, { actionKey: 'startup' });
    expect(two).toEqual(one);
    expect(f.execute).toHaveBeenCalledTimes(1);
    await expect(f.client.call('signal publish', { subject: 'two' }, { actionKey: 'startup' })).rejects.toThrow(/different request/);
  });

  it('does not replay a keyed mutation whose completion receipt was lost', async () => {
    const f = fixture();
    appendFileSync(f.options.receiptPath, JSON.stringify({ mode: 'intent', actionKey: 'publish', request: { command: 'signal publish', params: {} } }) + '\n');
    await expect(createBenchmarkClient(f.options).call('signal publish', {}, { actionKey: 'publish' })).rejects.toThrow(/uncertain/);
    expect(f.execute).not.toHaveBeenCalled();
  });

  it('logs unexpected exit codes and thrown calls without accepting them as success', async () => {
    const f = fixture();
    f.execute.mockResolvedValueOnce({ exitCode: 0, payload: { ok: true, run: { run_id: 'run-one' } } });
    await expect(f.client.call('lock acquire', {}, { expectedExit: 2 })).rejects.toThrow(/expected exit 2/);
    f.execute.mockRejectedValueOnce(new Error('transport failed'));
    await expect(f.client.call('attend')).rejects.toThrow('transport failed');
    const summary = f.client.summary();
    expect(summary.calls).toBe(2);
    expect(summary.unexpected).toBe(2);
  });

  it('computes final metrics from measured receipts and excludes tagged warmups', () => {
    const rows = [
      { mode: 'call', command: 'attend', phase: 'warmup', elapsed_ms: 1000, response_bytes: 4000 },
      ...Array.from({ length: 10 }, (_, i) => ({ mode: 'call', command: 'attend', phase: 'measure', workload: 'revision', elapsed_ms: i + 1, response_bytes: 100, expected: true })),
      { mode: 'schema', command: 'attend', schema_bytes: 200 },
      { mode: 'call', command: 'agent leave', phase: 'close', elapsed_ms: 1, response_bytes: 50, expected: true },
    ];
    const result = summarizeReceipts(rows);
    expect(result.calls).toBe(12);
    expect(result.measured.revision).toEqual({ count: 10, p50_ms: 5.5, p95_ms: 10, response_bytes: 1000 });
    expect(result.schema_calls).toBe(1);
  });
});
