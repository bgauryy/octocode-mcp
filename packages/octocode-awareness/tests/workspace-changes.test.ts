import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { executeAwarenessCommand, type AwarenessCommandCall } from '../src/command-api.js';
import { executeAwarenessCli } from '../src/command-cli.js';
import { allowLocalFixtureProcesses } from '../../../test-utils/external-effects-guard.js';

interface Page {
  mode: string; count: number; total: number; partial: boolean; revision: string;
  partialReasons: string[];
  rows: Array<{ kind: string; workspace_path: string; path: string; agent_id?: string;
    rationale?: string; test_plan?: string; detail_omitted?: boolean;
    next?: { inspect: { command: AwarenessCommandCall } } }>;
  next?: { list: { command: AwarenessCommandCall } };
}
let root: string;
let main: string;
let peer: string;
let database: string;
let restoreProcesses: () => void;
const git = (cwd: string, ...args: string[]) => execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8' });
beforeEach(() => {
  restoreProcesses = allowLocalFixtureProcesses();
  root = realpathSync(mkdtempSync(join(tmpdir(), 'awareness-changes-')));
  main = join(root, 'main'); peer = join(root, 'peer with spaces'); database = join(root, 'awareness.sqlite3');
  mkdirSync(main);
  git(main, 'init', '-q', '-b', 'main');
  writeFileSync(join(main, 'tracked.ts'), 'export const value = 1;\n');
  git(main, 'add', '.');
  git(main, '-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-qm', 'seed');
  git(main, 'worktree', 'add', '-qb', 'peer', peer);
});
afterEach(() => { restoreProcesses(); rmSync(root, { recursive: true, force: true }); });
async function call(request: AwarenessCommandCall, compact = false): Promise<Page> {
  const result = await executeAwarenessCommand(request, { database, workspace: main, agentId: 'lead', compact });
  expect(result.exitCode, JSON.stringify(result.payload)).toBe(0);
  return result.payload as Page;
}

describe('opt-in workspace changes', () => {
  it.each([false, true])('executes every Git/work page and intent continuation under host bindings (compact=%s)', async compact => {
    writeFileSync(join(main, 'tracked.ts'), 'export const value = 2;\n');
    git(main, 'add', 'tracked.ts');
    writeFileSync(join(peer, 'tracked.ts'), 'export const value = 3;\n');
    writeFileSync(join(peer, ' spaced\nname.ts'), 'untracked');
    const rationale = 'A declared task is separate from Git attribution. '.repeat(6).trim();
    const started = await executeAwarenessCommand({ command: 'work start', params: {
      file: ['tracked.ts', 'planned.ts'], rationale, test_plan: 'Run the focused parser test',
    } }, { database, workspace: peer, agentId: 'peer' });
    expect(started.exitCode).toBe(0);
    const indexBefore = readFileSync(join(main, '.git', 'index'));
    const peerIndex = git(peer, 'rev-parse', '--git-path', 'index').trim();
    const peerIndexBefore = readFileSync(peerIndex);
    const all: Page['rows'] = [];
    let request: AwarenessCommandCall | undefined = { command: 'attend', params: { changes: true, limit: 1 } };
    for (let guard = 0; request && guard < 10; guard++) {
      const page = await call(request, compact);
      expect(page.mode).toBe('changes');
      expect(page.total).toBe(5);
      all.push(...page.rows);
      request = page.next?.list.command;
    }
    expect(request).toBeUndefined();
    expect(all).toHaveLength(5);
    expect(new Set(all.map(row => `${row.kind}:${row.workspace_path}:${row.path}`)).size, JSON.stringify(all)).toBe(5);
    expect(all.filter(row => row.kind === 'git')).toHaveLength(3);
    const intent = all.find(row => row.kind === 'work' && row.path === 'tracked.ts')!;
    expect(intent).toMatchObject({ agent_id: 'peer', workspace_path: peer, detail_omitted: true });
    const detail = await call(intent.next!.inspect.command, compact);
    expect(detail.rows[0]).toMatchObject({ rationale, test_plan: 'Run the focused parser test' });
    expect(readFileSync(join(main, '.git', 'index'))).toEqual(indexBefore);
    expect(readFileSync(peerIndex)).toEqual(peerIndexBefore);
    expect(await call({ command: 'attend' }, compact)).toMatchObject({ mode: 'presence' });
  });

  it('detects a changed path/status page and returns an executable restart', async () => {
    writeFileSync(join(main, 'a.ts'), 'a'); writeFileSync(join(peer, 'b.ts'), 'b');
    const first = await call({ command: 'attend', params: { changes: true, limit: 1 } });
    writeFileSync(join(main, 'c.ts'), 'c');
    const changed = await call(first.next!.list.command);
    expect(changed).toMatchObject({ count: 0, partial: true, partialReasons: ['snapshot_changed'] });
    expect(await call(changed.next!.list.command)).toMatchObject({ count: 1, total: 3 });
  });

  it('handles clean checkouts, rejects incompatible filters, and reaches the CLI adapter', async () => {
    expect(await call({ command: 'attend', params: { changes: true } })).toMatchObject({ count: 0, total: 0, partial: false });
    const rejected = await executeAwarenessCommand({ command: 'attend', params: { changes: true, details: true } }, { database, workspace: main });
    expect(rejected.exitCode).toBe(1);
    const cli = await executeAwarenessCli(['attend', '--db', database, '--workspace', main, '--changes', '--compact']);
    expect(cli.exitCode).toBe(0);
    expect(cli.payload).toMatchObject({ mode: 'changes', count: 0 });
  });
});
