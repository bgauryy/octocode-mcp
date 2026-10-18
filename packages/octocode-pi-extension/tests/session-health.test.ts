import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { tmp } from './helpers.js';

const script = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'scripts', 'session-health.mjs');

function run(...args: string[]): { stdout: string; stderr: string; status: number | null } {
  const result = spawnSync(process.execPath, [script, ...args], { encoding: 'utf8' });
  return { stdout: result.stdout, stderr: result.stderr, status: result.status };
}

const at = (second: number): string => `2026-01-01T00:00:${String(second).padStart(2, '0')}.000Z`;

interface Usage { input: number; cacheRead: number; cacheWrite: number; cost: number }

function assistant(id: string, second: number, usage: Usage, options: { drops?: Array<[string, string]>; content?: unknown[] } = {}): object {
  const transformations = (options.drops ?? []).map(([reason, dropPath]) => ({ type: 'thinking_dropped', path: dropPath, reason }));
  return {
    type: 'message',
    id,
    timestamp: at(second),
    message: {
      role: 'assistant',
      model: 'claude-test',
      api: 'anthropic-messages',
      usage: { input: usage.input, output: 1, cacheRead: usage.cacheRead, cacheWrite: usage.cacheWrite, cost: { total: usage.cost } },
      stopReason: 'stop',
      content: options.content ?? [{ type: 'text', text: 'ok' }],
      ...(transformations.length ? { diagnostics: [{ type: 'anthropic_input_transformations', details: { transformations } }] } : {}),
    },
  };
}

/** Two segments: five requests, a compaction keeping the last two, then two more requests. */
function fixture(): string {
  const entries: object[] = [
    { type: 'session', id: 'sess-1', timestamp: at(0), cwd: '/work' },
    { type: 'message', id: 'u1', timestamp: at(1), message: { role: 'user', content: 'hello' } },
    assistant('a1', 2, { input: 10, cacheRead: 0, cacheWrite: 90, cost: 0.1 }),
    assistant('a2', 3, { input: 5, cacheRead: 90, cacheWrite: 5, cost: 0.02 }, { drops: [['prefix_binding_mismatch', 'messages.2.content.0'], ['prefix_binding_mismatch', 'messages.4.content.0']] }),
    assistant('a3', 4, { input: 5, cacheRead: 0, cacheWrite: 100, cost: 0.2 }, { drops: [['prefix_binding_mismatch', 'messages.2.content.0'], ['prefix_binding_mismatch', 'messages.4.content.0']] }),
    { type: 'message', id: 'u2', timestamp: at(5), message: { role: 'user', content: 'again' } },
    assistant('a4', 6, { input: 5, cacheRead: 100, cacheWrite: 5, cost: 0.03 }, {
      drops: [['other', 'messages.1.content.0'], ['other', 'messages.3.content.0'], ['other', 'messages.5.content.0']],
      content: [{ type: 'thinking', thinking: 't'.repeat(10) }, { type: 'text', text: 'x'.repeat(20) }, { type: 'toolCall', id: 'c1', name: 'read', arguments: { path: 'a' } }],
    }),
    assistant('a5', 7, { input: 5, cacheRead: 20, cacheWrite: 80, cost: 0.05 }, { content: [{ type: 'thinking', thinking: 'u'.repeat(5) }, { type: 'text', text: 'y'.repeat(8) }] }),
    {
      type: 'compaction',
      id: 'c1',
      timestamp: at(8),
      summary: 'S'.repeat(50),
      firstKeptEntryId: 'a4',
      tokensBefore: 1234,
      usage: { input: 7, output: 3, cacheRead: 100, cacheWrite: 4, cost: { total: 0.5 } },
      details: { summaryMethod: { method: 'cache-shared' }, readFiles: [], modifiedFiles: [] },
    },
    { type: 'custom', id: 'x1', timestamp: at(9), customType: 'note', data: {} },
    assistant('a6', 10, { input: 5, cacheRead: 0, cacheWrite: 200, cost: 0.3 }),
    assistant('a7', 11, { input: 5, cacheRead: 200, cacheWrite: 5, cost: 0.01 }),
  ];
  const file = path.join(tmp(), '--work--', 'one.jsonl');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${entries.map((entry) => JSON.stringify(entry)).join('\n')}\n`);
  return file;
}

interface Report {
  sessions: Array<{
    id: string;
    requests: number;
    cost: number;
    compactionCost: number;
    cacheHitRate: number;
    models: string[];
    segments: Array<{
      index: number;
      requests: number;
      cost: number;
      cacheHitRate: number;
      usage: { input: number; cacheRead: number; cacheWrite: number };
      thinkingDrops: { total: number; min: number; max: number; constant: boolean; requestsWithDrops: number; reasons: Record<string, number>; firstPath: string | null };
      cacheResets: Array<{ id: string; timestamp: string; kind: string; cacheRead: number; previousCacheRead: number; afterCompaction: boolean }>;
      compaction: null | {
        tokensBefore: number;
        summaryChars: number;
        method: string;
        cost: number;
        usage: { input: number; output: number; cacheRead: number; cacheWrite: number };
        keptMessages: number;
        keptChars: number;
        keptThinkingBlocks: number;
      };
    }>;
  }>;
}

describe('scripts/session-health.mjs', () => {
  it('reports per-session and per-segment numbers as JSON', () => {
    const result = run('--json', fixture());
    expect(result.status).toBe(0);
    const report = JSON.parse(result.stdout) as Report;
    expect(report.sessions).toHaveLength(1);
    const session = report.sessions[0];
    expect(session.id).toBe('sess-1');
    expect(session.requests).toBe(7);
    expect(session.models).toEqual(['claude-test']);
    expect(session.compactionCost).toBeCloseTo(0.5);
    expect(session.cost).toBeCloseTo(1.21);
    expect(session.segments).toHaveLength(2);

    const [first, second] = session.segments;
    expect(first.requests).toBe(5);
    expect(first.usage).toMatchObject({ input: 30, cacheRead: 210, cacheWrite: 280 });
    expect(first.cacheHitRate).toBeCloseTo(210 / 520);
    expect(first.cost).toBeCloseTo(0.4);
    expect(first.thinkingDrops).toMatchObject({
      total: 7, min: 0, max: 3, constant: false, requestsWithDrops: 3,
      reasons: { prefix_binding_mismatch: 4, other: 3 },
      firstPath: 'messages.2.content.0',
    });
    expect(first.cacheResets.map((r) => [r.id, r.kind, r.previousCacheRead, r.cacheRead, r.afterCompaction])).toEqual([
      ['a3', 'zero', 90, 0, false],
      ['a5', 'drop', 100, 20, false],
    ]);
    expect(first.cacheResets[0].timestamp).toBe(at(4));
    expect(first.compaction).toEqual({
      id: 'c1',
      timestamp: at(8),
      tokensBefore: 1234,
      summaryChars: 50,
      method: 'cache-shared',
      cost: 0.5,
      usage: { input: 7, output: 3, cacheRead: 100, cacheWrite: 4 },
      keptMessages: 2,
      keptChars: 55,
      keptThinkingBlocks: 2,
      keptFound: true,
    });

    expect(second.requests).toBe(2);
    expect(second.usage).toMatchObject({ input: 10, cacheRead: 200, cacheWrite: 205 });
    expect(second.cacheHitRate).toBeCloseTo(200 / 415);
    expect(second.thinkingDrops).toMatchObject({ total: 0, min: 0, max: 0, constant: true, firstPath: null });
    expect(second.cacheResets.map((r) => [r.id, r.kind, r.afterCompaction])).toEqual([['a6', 'zero', true]]);
    expect(second.compaction).toBeNull();
    expect(session.cacheHitRate).toBeCloseTo(410 / 935);
  });

  it('prints plain text with the same numbers', () => {
    const result = run(fixture());
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('sess-1');
    expect(result.stdout).toContain('segment 1');
    expect(result.stdout).toContain('thinking drops: total 7, per request 0..3 (varies)');
    expect(result.stdout).toContain('prefix_binding_mismatch 4');
    expect(result.stdout).toContain('first dropped path: messages.2.content.0');
    expect(result.stdout).toContain('cache hit rate: 40.4%');
    expect(result.stdout).toContain('thinking drops: total 0, per request 0..0 (constant)');
    expect(result.stdout).toMatch(/a3.*cacheRead 90 -> 0/);
    expect(result.stdout).toContain('tokensBefore 1234');
    expect(result.stdout).toContain('summary 50 chars');
    expect(result.stdout).toContain('kept 2 messages, 55 chars, 2 thinking blocks');
    expect(result.stdout).toContain('cost $1.2100');
  });

  it('selects the newest sessions from a folder and filters with --session', () => {
    const root = tmp();
    const write = (folder: string, name: string, age: number): void => {
      const file = path.join(root, folder, name);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, `${JSON.stringify({ type: 'session', id: name, timestamp: at(0) })}\n`);
      const time = new Date(Date.now() - age * 1000);
      fs.utimesSync(file, time, time);
    };
    write('--a--', 'old.jsonl', 300);
    write('--b--', 'mid.jsonl', 200);
    write('--b--', 'new.jsonl', 100);
    const ids = (...args: string[]): string[] => (JSON.parse(run('--json', '--dir', root, ...args).stdout) as Report).sessions.map((s) => s.id);
    expect(ids('--limit', '2')).toEqual(['new.jsonl', 'mid.jsonl']);
    expect(ids()).toEqual(['new.jsonl', 'mid.jsonl', 'old.jsonl']);
    expect(ids('--session', 'old.jsonl')).toEqual(['old.jsonl']);
  });

  it('pages long text output without cutting lines', () => {
    const file = fixture();
    const full = run(file).stdout.trimEnd().split('\n');
    const first = run('--page-size', '10', file).stdout.trimEnd().split('\n');
    expect(first.slice(0, 10)).toEqual(full.slice(0, 10));
    expect(first[10]).toMatch(/^-- page 1 of \d+; next: --page 2/);
    const pages = Number(/of (\d+);/.exec(first[10])?.[1]);
    expect(pages).toBe(Math.ceil(full.length / 10));
    const last = run('--page-size', '10', '--page', String(pages), file).stdout.trimEnd().split('\n');
    expect(last.slice(0, -1)).toEqual(full.slice(10 * (pages - 1)));
    expect(last.at(-1)).toBe(`-- page ${pages} of ${pages}`);
  });

  it('prints help and rejects bad input', () => {
    expect(run('--help').stdout).toContain('Usage: session-health.mjs');
    expect(run('--bogus').status).toBe(2);
    const missing = run(path.join(tmp(), 'missing.jsonl'));
    expect(missing.status).toBe(1);
    expect(missing.stderr).toContain('missing.jsonl');
  });
});
