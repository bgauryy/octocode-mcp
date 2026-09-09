import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, mkdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { allowLocalFixtureProcesses } from '../../../test-utils/external-effects-guard.js';
import { initDb } from '../src/db-init.js';
import { attendWorkspace } from '../src/attend-presence.js';
import { registerAgent } from '../src/agents.js';
import { queryAwareness } from '../src/repo-query.js';
import { startWork } from '../src/work.js';
import { detectGit, normalizeWorkspacePath, readGitStatus, repositoryWorkspacePaths } from '../src/git.js';
import { gitDirtyFiles } from '../src/maintenance-git-status.js';

const roots: string[] = [];
let restoreProcesses: (() => void) | undefined;
beforeEach(() => { restoreProcesses = allowLocalFixtureProcesses(); });
afterEach(() => {
  restoreProcesses?.();
  restoreProcesses = undefined;
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function fixture() {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'workspace-git-isolation-')));
  roots.push(root);
  const main = join(root, 'main');
  const peer = join(root, 'peer with spaces');
  mkdirSync(main);
  mkdirSync(join(main, 'src'), { recursive: true });
  const git = (cwd: string, ...args: string[]) => execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8' }).trim();
  git(main, 'init', '-q', '-b', 'main');
  writeFileSync(join(main, 'src/staged.ts'), 'export const staged = 1;\n');
  writeFileSync(join(main, 'src/unstaged.ts'), 'export const unstaged = 1;\n');
  writeFileSync(join(main, 'src/rename-from.ts'), 'export const renamed = 1;\n');
  git(main, 'add', '.');
  git(main, '-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '-qm', 'seed');
  git(main, 'worktree', 'add', '-qb', 'peer', peer);
  mkdirSync(join(peer, 'src'), { recursive: true });
  return { root, main, peer, git };
}

describe('workspace Git isolation', () => {
  it('keeps private history objects out of workspace-change packets without changing Git ignore rules', () => {
    const { main, git } = fixture();
    const privateStore = join(main, '.octocode', '.localGit', 'database', 'repo.git', 'objects');
    mkdirSync(privateStore, { recursive: true });
    writeFileSync(join(privateStore, 'private-object'), 'captured bytes');
    writeFileSync(join(main, '.octocode', 'decision.md'), 'visible authored decision');
    writeFileSync(join(main, 'src', 'new.ts'), 'export const newFile = true;');
    expect(git(main, 'status', '--porcelain=v1', '--untracked-files=all')).toContain('private-object');
    const paths = readGitStatus(main).map(change => change.path);
    expect(paths.sort()).toEqual(['.octocode/decision.md', 'src/new.ts']);
  });

  it('sees linked membership but leaves raw peer Git changes outside attend/query', () => {
    const { main, peer, git } = fixture();
    mkdirSync(join(peer, 'src'), { recursive: true });
    writeFileSync(join(peer, 'src/staged.ts'), 'export const staged = 2;\n');
    git(peer, 'add', 'src/staged.ts');
    writeFileSync(join(peer, 'src/unstaged.ts'), 'export const unstaged = 2;\n');
    git(peer, 'mv', 'src/rename-from.ts', 'src/rename-to.ts');
    const unicodeAndNewline = 'src/unicode-é\nname.ts';
    writeFileSync(join(peer, unicodeAndNewline), 'export const odd = true;\n');
    const status = git(peer, 'status', '--porcelain=v1');
    expect(status).toContain('M  src/staged.ts');
    expect(status).toContain(' M src/unstaged.ts');
    expect(status).toContain('R  src/rename-from.ts -> src/rename-to.ts');
    expect(status).toContain('?? "src/unicode-\\303\\251\\nname.ts"');

    const db = new DatabaseSync(':memory:');
    try {
      initDb(db);
      registerAgent(db, { agentId: 'main-agent', workspacePath: main });
      registerAgent(db, { agentId: 'peer-agent', workspacePath: peer });

      const lobby = attendWorkspace(db, { workspacePath: peer, agentId: 'peer-agent' });
      if (!('mode' in lobby) || lobby.mode !== 'presence') throw new Error('expected presence lobby');
      expect(lobby.peers.map(peerRow => peerRow.agent_id).sort()).toEqual(['main-agent', 'peer-agent']);
      expect(lobby).not.toHaveProperty('git_status');
      expect(lobby).not.toHaveProperty('git_diff');

      const detail = attendWorkspace(db, { workspacePath: peer, details: true, limit: 20 });
      if (!('workboard' in detail)) throw new Error('expected detailed attend result');
      expect(detail.workboard.FilesUnderWork ?? []).toEqual([]);
      expect(queryAwareness(db, { view: 'files', workspacePath: peer }).rows).toEqual([]);
      expect(gitDirtyFiles(peer).sort()).toEqual([
        'src/rename-to.ts', 'src/staged.ts', 'src/unstaged.ts', unicodeAndNewline,
      ].sort());
      const changes = readGitStatus(peer);
      const byPath = new Map(changes.map(change => [change.path, change]));
      expect(byPath.get('src/staged.ts')).toMatchObject({ index_status: 'M', worktree_status: ' ' });
      expect(byPath.get('src/unstaged.ts')).toMatchObject({ index_status: ' ', worktree_status: 'M' });
      expect(byPath.get('src/rename-to.ts')).toMatchObject({ index_status: 'R', worktree_status: ' ', original_path: 'src/rename-from.ts' });
      expect(byPath.get(unicodeAndNewline)).toMatchObject({ index_status: '?', worktree_status: '?' });
    } finally {
      db.close();
    }
  });

  it('surfaces declared work only in the physical checkout and filters hostile Git context', () => {
    const { main, peer, root } = fixture();
    const inherited = {
      GIT_DIR: process.env.GIT_DIR,
    };
    process.env.GIT_DIR = join(root, 'missing.git');
    try {
      expect(detectGit(peer)).toMatchObject({ is_repo: true, root: peer, branch: 'peer' });
      expect(repositoryWorkspacePaths(peer)).toEqual([main, peer]);
      expect(normalizeWorkspacePath(peer, peer)).toBe(peer);
      expect(gitDirtyFiles(peer).sort()).toEqual([]);
      expect(() => readGitStatus(join(root, 'missing'))).toThrow();
    } finally {
      if (inherited.GIT_DIR === undefined) delete process.env.GIT_DIR;
      else process.env.GIT_DIR = inherited.GIT_DIR;
    }

    const db = new DatabaseSync(':memory:');
    try {
      initDb(db);
      const started = startWork(db, {
        agentId: 'peer-agent', workspacePath: peer, targetFiles: ['src/staged.ts'],
        rationale: 'declared peer edit', testPlan: 'run the focused check',
      });
      assert.equal(started.ok, true);
      const peerDetail = attendWorkspace(db, { workspacePath: peer, details: true, limit: 20 });
      if (!('workboard' in peerDetail)) throw new Error('expected detailed attend result');
      const files = peerDetail.workboard.FilesUnderWork ?? [];
      expect(files).toHaveLength(1);
      expect(files[0]).toMatchObject({ path: 'src/staged.ts', agents: ['peer-agent'] });
      const mainDetail = attendWorkspace(db, { workspacePath: main, details: true, limit: 20 });
      if (!('workboard' in mainDetail)) throw new Error('expected detailed attend result');
      expect(mainDetail.workboard.FilesUnderWork ?? []).toEqual([]);
    } finally {
      db.close();
    }
  });
});
