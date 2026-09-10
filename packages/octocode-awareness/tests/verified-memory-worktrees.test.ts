import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { executeAwarenessCommand, type AwarenessCommandCall } from '../src/command-api.js';
import { allowLocalFixtureProcesses } from '../../../test-utils/external-effects-guard.js';

const roots: string[] = [];
let restoreProcesses: () => void;
beforeEach(() => { restoreProcesses = allowLocalFixtureProcesses(); });
afterEach(() => { restoreProcesses(); roots.splice(0).forEach(root => rmSync(root, { recursive: true, force: true })); });

function fixture() {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'verified-worktrees-')));
  roots.push(root);
  const main = join(root, 'main');
  const peer = join(root, 'peer with spaces');
  const clone = join(root, 'clone');
  mkdirSync(main);
  const git = (cwd: string, ...args: string[]) => execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8' });
  git(main, 'init', '-q', '-b', 'main');
  git(main, '-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '--allow-empty', '-qm', 'seed');
  git(main, 'worktree', 'add', '-qb', 'peer', peer);
  git(root, 'clone', '-q', main, clone);
  const context = { workspace: peer, database: join(root, 'ledger.sqlite3'), compact: true };
  return { main, peer, clone, context, git };
}

describe('verified memories across Git worktrees', () => {
  it('exposes the source history route and distinguishes incomplete or unavailable evidence', async () => {
    const { main, context } = fixture();
    writeFileSync(join(main, 'source.ts'), 'export const evidence = 1;\n');
    const captured = await executeAwarenessCommand({ command: 'history checkpoint', params: {
      operation_id: 'source-checkpoint', file: ['source.ts'], agent_id: 'author',
    } }, { ...context, workspace: main });
    expect(captured.exitCode, JSON.stringify(captured.payload)).toBe(0);
    const stored = await executeAwarenessCommand({ command: 'memory store-verified', params: {
      label: 'TEST', text: 'A reusable source lesson', source_digest: 'source-v1', history_ref: 'source-checkpoint', file: 'source.ts',
    } }, { ...context, workspace: main });
    expect(stored.exitCode, JSON.stringify(stored.payload)).toBe(0);
    const id = (stored.payload as { memoryId: string }).memoryId;
    const recall = async () => (await executeAwarenessCommand({ command: 'memory recall-verified', params: { memory_id: id } }, context)).payload as {
      revision: string; memories: Array<{ historyEvidence: { state: string; next?: { call: AwarenessCommandCall } } }>;
    };
    const page = await recall();
    expect(page.memories[0]?.historyEvidence).toMatchObject({ state: 'recorded', next: { call: {
      command: 'history inspect', params: { operation_id: 'source-checkpoint', source_workspace: main },
    } } });
    const inspected = await executeAwarenessCommand(page.memories[0]!.historyEvidence.next!.call, context);
    expect(inspected.exitCode, JSON.stringify(inspected.payload)).toBe(0);
    const inspection = inspected.payload as { rows: Array<{ next: { after: { call: AwarenessCommandCall } } }> };
    expect(inspection.rows).toHaveLength(1);
    const readCall = inspection.rows[0]!.next.after.call;
    expect(readCall.params).toMatchObject({ workspace: context.workspace, source_workspace: main, operation_id: 'source-checkpoint', file: 'source.ts' });
    const read = await executeAwarenessCommand(readCall, context);
    expect(read.exitCode, JSON.stringify(read.payload)).toBe(0);
    expect(Buffer.from((read.payload as { content: string }).content, 'base64').toString()).toBe('export const evidence = 1;\n');
    const foreignWrite = await executeAwarenessCommand({ command: 'memory store-verified', params: {
      label: 'TEST', text: 'Foreign history cannot authorize a local store', source_digest: 'source-v1', history_ref: 'source-checkpoint',
    } }, context);
    expect(foreignWrite.exitCode).toBe(1);
    expect(JSON.stringify(foreignWrite.payload)).toContain('existing history operation in this workspace');
    const db = new DatabaseSync(context.database);
    try {
      db.prepare("UPDATE local_history_operations SET status = 'partial' WHERE operation_id = ?").run('source-checkpoint');
      expect((await recall()).memories[0]?.historyEvidence.state).toBe('incomplete');
      const restarted = await executeAwarenessCommand({ command: 'memory recall-verified', params: { memory_id: id, revision: page.revision } }, context);
      expect(restarted.payload).toMatchObject({ partialReasons: ['snapshot_changed'], next: { call: { params: { memory_id: id, offset: 0 } } } });
      db.prepare('DELETE FROM local_history_versions WHERE operation_id = ?').run('source-checkpoint');
      db.prepare('DELETE FROM local_history_operations WHERE operation_id = ?').run('source-checkpoint');
      expect((await recall()).memories[0]?.historyEvidence).toMatchObject({ state: 'unavailable' });
      expect((await recall()).memories[0]?.historyEvidence.next).toBeUndefined();
    } finally { db.close(); }
  });

  it('recalls exact sibling evidence with source-relative files and retains explicit filters', async () => {
    const { main, peer, clone, context } = fixture();
    const stored = await executeAwarenessCommand({ command: 'memory store-verified', params: {
      label: 'TEST', text: 'Linked source evidence', source_digest: 'source-a', scope: 'artifact', artifact: 'parser',
      file: ['src/parser.ts', 'src/types.ts'], area: 'parsing', verified_at: '2026-09-01T00:00:00Z', valid_until: '2026-10-01T00:00:00Z',
    } }, { ...context, workspace: main });
    expect(stored.exitCode, JSON.stringify(stored.payload)).toBe(0);
    const memoryId = (stored.payload as { memoryId: string }).memoryId;
    const params = { memory_id: memoryId, source_digest: 'source-a', scope: 'artifact', artifact: 'parser',
      file: ['src/parser.ts', join(peer, 'src/types.ts')], area: 'parsing', now: '2026-09-10T00:00:00Z' };
    const recalled = await executeAwarenessCommand({ command: 'memory recall-verified', params }, context);
    expect(recalled.exitCode, JSON.stringify(recalled.payload)).toBe(0);
    expect(recalled.payload).toMatchObject({ memories: [{ memoryId, workspacePath: main, file: ['src/parser.ts', 'src/types.ts'] }] });
    const strict = await executeAwarenessCommand({ command: 'memory recall-verified', params: { ...params, strict_scope: true } }, context);
    expect(strict.payload).toMatchObject({ memories: [] });
    for (const changed of [{ source_digest: 'other' }, { scope: 'project' }, { artifact: 'other' }, { file: 'parser.ts' },
      { file: ['src/parser.ts', 'src/missing.ts'] }, { area: 'other' }, { now: '2026-10-01T00:00:00Z' }]) {
      const result = await executeAwarenessCommand({ command: 'memory recall-verified', params: { ...params, ...changed } }, context);
      expect(result.payload).toMatchObject({ memories: [] });
    }
    const foreign = await executeAwarenessCommand({ command: 'memory recall-verified', params: { memory_id: memoryId } }, { ...context, workspace: clone });
    expect(foreign.payload).toMatchObject({ memories: [] });
  });

  it('executes complete sibling page chains and binds revisions to the query and physical caller', async () => {
    const { main, clone, context, git } = fixture();
    const ids = new Set<string>();
    for (const [index, workspace] of [main, context.workspace, main].entries()) {
      const stored = await executeAwarenessCommand({ command: 'memory store-verified', params: {
        label: 'TEST', text: `Shared page ${index}`, source_digest: `source-${index}`, file: 'src/parser.ts',
      } }, { ...context, workspace });
      expect(stored.exitCode).toBe(0);
      ids.add((stored.payload as { memoryId: string }).memoryId);
    }
    type Page = { memories: Array<{ memoryId: string }>; partial: boolean; partialReasons: string[]; revision: string; next?: { call: AwarenessCommandCall } };
    const first = (await executeAwarenessCommand({ command: 'memory recall-verified', params: { query: 'Shared page', file: 'src/parser.ts', limit: 1 } }, context)).payload as Page;
    expect(first.partial).toBe(true);
    expect(first.next).toBeDefined();
    const received = new Set(first.memories.map(memory => memory.memoryId));
    let page = first;
    while (page.next) {
      page = (await executeAwarenessCommand(page.next.call, context)).payload as Page;
      expect(page.partialReasons).not.toContain('snapshot_changed');
      for (const memory of page.memories) { expect(received.has(memory.memoryId)).toBe(false); received.add(memory.memoryId); }
    }
    expect(received).toEqual(ids);
    for (const changed of [{ ...first.next!.call, params: { ...first.next!.call.params, query: 'different' } }]) {
      const result = (await executeAwarenessCommand(changed, context)).payload as Page;
      expect(result.partialReasons).toEqual(['snapshot_changed']);
    }
    for (const workspace of [main, clone]) {
      const result = (await executeAwarenessCommand(first.next!.call, { ...context, workspace })).payload as Page;
      expect(result.partialReasons).toEqual(['snapshot_changed']);
    }
    git(main, 'worktree', 'add', '-qb', 'new-peer', join(main, '..', 'new-peer'));
    const membershipChanged = (await executeAwarenessCommand(first.next!.call, context)).payload as Page;
    expect(membershipChanged.partialReasons).toEqual(['snapshot_changed']);
  });
});
