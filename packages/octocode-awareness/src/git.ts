/**
 * git.ts — Git-based workspace/repo detection.
 * Pure functions: detectGit returns data; fillScope returns a NEW scope object.
 */

import { spawnSync } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import type { Scope, ScopePartial } from './types/locks-reflection.js';

export interface GitInfo {
  is_repo: false;
}

export interface GitRepo {
  is_repo: true;
  root: string;
  repo: string;
  branch: string | null;
  remote: string | null;
}

export type GitResult = GitInfo | GitRepo;

export interface GitChange {
  path: string;
  index_status: string;
  worktree_status: string;
  original_path?: string;
}

const MAX_STATUS_BYTES = 2 * 1024 * 1024;

function safeGitEnv(): NodeJS.ProcessEnv {
  return { ...Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_'))), GIT_OPTIONAL_LOCKS: '0' };
}

function runCmd(cmd: string, args: string[], cwd?: string): string | null {
  try {
    // A host's Git environment must not redirect discovery to another checkout.
    const r = spawnSync(cmd, args, { cwd: cwd ?? process.cwd(), env: safeGitEnv(),
      encoding: 'utf8', timeout: 5000, maxBuffer: 1024 * 1024 });
    return r.status === 0 ? r.stdout.replace(/\r?\n$/, '') : null;
  } catch {
    return null;
  }
}

/** Read the current checkout's staged/unstaged/untracked paths without Git env redirection. */
export function readGitStatus(workspacePath: string | null): GitChange[] {
  if (!workspacePath) throw new Error('workspace path is required');
  // Private snapshot objects are implementation state, never workspace work.
  // Exclude them during traversal without modifying the user's Git ignore rules.
  const result = spawnSync('git', ['-C', workspacePath, 'status', '--porcelain=v1', '-z', '--untracked-files=all', '--', '.', ':(exclude,literal).octocode/.localGit'], {
    cwd: workspacePath,
    env: safeGitEnv(),
    encoding: 'utf8',
    timeout: 5000,
    maxBuffer: MAX_STATUS_BYTES,
  });
  if (result.error && 'code' in result.error && result.error.code === 'ENOBUFS') throw Object.assign(new Error('Git status exceeded its output limit'), { code: 'GIT_STATUS_LIMIT', limitBytes: MAX_STATUS_BYTES });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(String(result.stderr || 'git status failed').trim());
  const output = String(result.stdout ?? '');
  if (output && !output.endsWith('\0')) throw new Error('git status returned incomplete porcelain output');
  const changes: GitChange[] = [];
  const fields = output.split('\0');
  for (let index = 0; index < fields.length; index += 1) {
    const record = fields[index]!;
    if (!record) continue;
    if (record.length < 4 || record[2] !== ' ') throw new Error('git status returned malformed porcelain output');
    const indexStatus = record[0]!;
    const worktreeStatus = record[1]!;
    const change: GitChange = { path: record.slice(3), index_status: indexStatus, worktree_status: worktreeStatus };
    if (indexStatus === 'R' || indexStatus === 'C' || worktreeStatus === 'R' || worktreeStatus === 'C') {
      const original = fields[index + 1];
      if (!original) throw new Error('git status returned an incomplete rename record');
      change.original_path = original;
      index += 1;
    }
    changes.push(change);
  }
  return changes;
}

/**
 * Detect git repo info for a working directory.
 */
export function detectGit(cwd?: string): GitResult {
  const root = runCmd('git', ['-C', cwd ?? '.', 'rev-parse', '--show-toplevel']);
  if (!root) return { is_repo: false };

  const branch = runCmd('git', ['-C', root, 'rev-parse', '--abbrev-ref', 'HEAD']);
  const remote = runCmd('git', ['-C', root, 'remote', 'get-url', 'origin']);
  const repoName = remote
    ? (remote.match(/github\.com[:/]([^/]+\/[^/]+?)(?:\.git)?$/) ?? [])[1] ?? basename(root)
    : basename(root);

  return { is_repo: true, root, repo: repoName, branch, remote };
}

/**
 * Canonicalize a path for scope-key purposes: resolve symlinks on the longest
 * existing ancestor and rejoin any not-yet-created tail segments.
 *
 * Without this, the SAME workspace can hash to two different scope keys —
 * e.g. macOS `/tmp` is a symlink to `/private/tmp`, and `git rev-parse
 * --show-toplevel` resolves symlinks while a plain `path.resolve()` does not.
 * A memory recorded via `path.resolve()` before a directory is a git repo
 * (or on a symlinked path) would otherwise become invisible once the same
 * directory is queried through git-root resolution (e.g. after `git init`),
 * with no error — just fewer results. Applying this canonicalization up
 * front, independent of git-repo detection, keeps the scope key stable
 * regardless of symlink components or git-init timing.
 */
export function canonicalizePath(input: string): string {
  let dir = resolve(input);
  const tail: string[] = [];
  for (let guard = 0; guard < 4096; guard += 1) {
    try {
      return tail.length ? join(realpathSync(dir), ...tail) : realpathSync(dir);
    } catch {
      const parent = dirname(dir);
      if (parent === dir) return resolve(input); // reached filesystem root
      tail.unshift(basename(dir));
      dir = parent;
    }
  }
  return resolve(input);
}

/**
 * Return a new scope object with workspace_path, repo, ref filled from git
 * when not already present in `partial`. NEVER mutates the input.
 */
export function fillScope(partial: ScopePartial, cwd?: string): Scope {
  const explicitWorkspace = partial.workspace_path ? canonicalizePath(partial.workspace_path) : null;
  const scope: Scope = {
    workspace_path: explicitWorkspace,
    artifact: partial.artifact ?? null,
    repo: partial.repo ?? null,
    ref: partial.ref ?? null,
  };

  // Detect from the explicit workspace when given — falling back to cwd here
  // used to tag a non-git workspace with whatever repo the process ran from.
  const git = detectGit(scope.workspace_path ?? cwd ?? process.cwd());
  if (!git.is_repo) return scope;

  // Workspace scope is repo-root based. If a caller passes a package/subdir as
  // workspace_path, normalize it so sibling package recalls meet the same row.
  // git.root is already symlink-resolved by `git rev-parse`, but canonicalize
  // it too so both code paths agree even if a future git version changes that.
  if (git.root) scope.workspace_path = canonicalizePath(git.root);
  if (!scope.repo && git.repo) scope.repo = git.repo;
  if (!scope.ref && git.branch) scope.ref = git.branch;

  return scope;
}

/**
 * Normalize a workspace filter/storage key the same way memory/refinement scope
 * does: an explicit path inside a git worktree becomes that repo root; a non-git
 * path remains an absolute path. Returns null only when no workspace/cwd exists.
 */
export function normalizeWorkspacePath(workspacePath?: string | null, cwd?: string): string | null {
  const candidate = workspacePath ? resolve(workspacePath) : cwd ? resolve(cwd) : null;
  const root = runCmd('git', ['rev-parse', '--show-toplevel'], candidate ?? process.cwd());
  return root ? canonicalizePath(root) : candidate ? canonicalizePath(candidate) : null;
}

/** Provenance is recorded by fillScope; read filters must only use explicit repo/ref values. */
export function readScope(partial: ScopePartial, cwd?: string): Scope {
  return { workspace_path: normalizeWorkspacePath(partial.workspace_path, cwd),
    artifact: partial.artifact ?? null, repo: partial.repo ?? null, ref: partial.ref ?? null };
}

function commonGitDirectory(workspace: string): string | null {
  const path = runCmd('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], workspace);
  return path ? canonicalizePath(path) : null;
}

/**
 * Git owns worktree membership. Share knowledge/messages only between extant
 * checkouts of this physical repository, never clones with the same remote/name.
 * Keep normalizeWorkspacePath physical: locks, writes and recovery use that key.
 */
export function repositoryWorkspacePaths(workspace: string): string[] {
  const root = normalizeWorkspacePath(workspace, workspace) ?? canonicalizePath(workspace);
  const common = commonGitDirectory(root);
  if (!common) return [root];
  const listing = runCmd('git', ['worktree', 'list', '--porcelain', '-z'], root);
  if (listing === null || !listing.endsWith('\0')) {
    throw new Error('Cannot enumerate Git worktrees completely; repository coordination scope is unavailable');
  }
  const paths = new Set([root]);
  for (const record of listing.split('\0\0')) {
    const fields = record.split('\0');
    if (fields.includes('bare')) continue;
    const field = fields.find(value => value.startsWith('worktree '));
    if (!field) continue;
    const candidate = canonicalizePath(field.slice('worktree '.length));
    // A stale registration can point at a path now occupied by an unrelated repo.
    if (candidate !== root && commonGitDirectory(candidate) === common) paths.add(candidate);
  }
  return [...paths].sort();
}
