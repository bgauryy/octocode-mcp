import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { parseArgs } from '../src/command-parser.js';

let root: string;
beforeEach(() => { root = mkdtempSync(join(tmpdir(), 'aw-bool-')); });
afterEach(() => { rmSync(root, { recursive: true, force: true }); });

function run(args: string[], expectedStatus = 0) {
  const result = spawnSync(process.execPath, [resolve(import.meta.dirname, '../out/octocode-awareness.js'), '--db', join(root, 'aw.sqlite3'), ...args], {
    cwd: root, encoding: 'utf8', timeout: 10000,
    env: { ...process.env, OCTOCODE_HOME: join(root, 'home') },
  });
  expect(result.status, result.stderr || result.stdout).toBe(expectedStatus);
  return JSON.parse(result.stdout);
}

describe('explicit CLI Boolean values', () => {
  it.each(['false', '0', 'no', 'FALSE'])('normalizes %s in both value syntaxes without changing text values', (value) => {
    expect(parseArgs([`--all-workspaces=${value}`, '--dry-run', value, '--observation', value])).toEqual({
      _: [], all_workspaces: false, dry_run: false, observation: value,
    });
  });
  it.each(['true', '1', 'yes', 'TRUE'])('normalizes %s in both value syntaxes', (value) => {
    expect(parseArgs([`--all-workspaces=${value}`, '--dry-run', value])).toEqual({ _: [], all_workspaces: true, dry_run: true });
  });
  it('keeps false recall scoped and enables cross-workspace recall only for true', () => {
    const workspaces = [join(root, 'alpha'), join(root, 'beta')];
    for (const [index, workspace] of workspaces.entries()) {
      mkdirSync(workspace);
      run(['memory', 'record', '--agent-id', 'author', '--workspace', workspace, '--task-context', 'scope regression', '--observation', `scopefixture ${index}`, '--importance', '7']);
    }
    const recall = (flag: string) => run(['memory', 'recall', '--query', 'scopefixture', '--workspace', workspaces[0]!, flag]);
    expect(recall('--all-workspaces=false').memories).toHaveLength(1);
    expect(recall('--all-workspaces=true').memories).toHaveLength(2);
    expect(recall('--no-all-workspaces').memories).toHaveLength(1);
  });
  it('previews true dry-run and applies false dry-run', () => {
    const { memory } = run(['memory', 'record', '--agent-id', 'author', '--workspace', root, '--task-context', 'cleanup regression', '--observation', 'cleanupfixture', '--importance', '7']);
    expect(memory.memory_id).toEqual(expect.any(String));
    const preview = run(['memory', 'forget', '--memory-id', memory.memory_id, '--dry-run=true']);
    expect(preview.dry_run).toBe(true);
    expect(preview.would_delete).toBe(1);
    expect(run(['memory', 'recall', '--query', 'cleanupfixture', '--workspace', root]).memories).toHaveLength(1);
    expect(run(['memory', 'forget', '--memory-id', memory.memory_id, '--dry-run=false']).deleted).toBe(1);
    expect(run(['memory', 'recall', '--query', 'cleanupfixture', '--workspace', root]).memories).toHaveLength(0);
  });
  it('rejects an unknown Boolean token instead of treating it as authorization', () => {
    const result = run(['memory', 'recall', '--query', 'x', '--all-workspaces=maybe'], 1);
    expect(result.error).toMatch(/all-workspaces.*boolean/i);
  });
});
