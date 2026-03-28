import { execSync } from 'node:child_process';
import path from 'node:path';

import { ALLOWED_EXTS } from '../types/index.js';


import type { DependencyState } from '../types/index.js';

/**
 * Resolves --affected: git changed files + transitive dependents.
 * Inspired by dependency-cruiser's --affected (uses watskeburt internally).
 */
export function resolveAffectedFiles(
  root: string,
  revision: string,
  dependencyState: DependencyState
): string[] {
  const changedFiles = getGitChangedFiles(root, revision);
  if (changedFiles.length === 0) return [];

  const changedRelPaths = new Set(changedFiles);
  const affected = new Set(changedRelPaths);
  collectTransitiveDependents(changedRelPaths, dependencyState, affected);

  return [...affected];
}

function getGitChangedFiles(root: string, revision: string): string[] {
  try {
    const stdout = execSync(
      `git diff --name-only --diff-filter=ACMRT ${revision}`,
      { cwd: root, encoding: 'utf8', timeout: 10000 }
    ).trim();

    if (!stdout) return [];

    return stdout
      .split('\n')
      .filter(f => {
        const ext = path.extname(f);
        return ALLOWED_EXTS.has(ext);
      });
  } catch {
    return [];
  }
}

/**
 * BFS: walk incoming edges to collect all transitive dependents of changed files.
 */
function collectTransitiveDependents(
  seeds: Set<string>,
  state: DependencyState,
  result: Set<string>
): void {
  const queue = [...seeds];
  while (queue.length > 0) {
    const current = queue.pop()!;
    const dependents = state.incoming.get(current);
    if (!dependents) continue;
    for (const dep of dependents) {
      if (!result.has(dep)) {
        result.add(dep);
        queue.push(dep);
      }
    }
  }
}
