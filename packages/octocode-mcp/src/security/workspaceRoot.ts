/**
 * Unified workspace root resolution for all local and LSP tools.
 *
 * Single source of truth for determining the workspace root directory.
 * Priority chain:
 *   1. Explicit parameter (if provided)
 *   2. WORKSPACE_ROOT environment variable
 *   3. Config file (~/.octocode/.octocoderc → local.workspaceRoot)
 *   4. process.cwd() fallback
 */

import path from 'path';
import fs from 'fs';
import { getConfigSync } from 'octocode-shared';

function isExistingDirectory(candidate: string): boolean {
  try {
    return fs.statSync(candidate).isDirectory();
  } catch {
    return false;
  }
}

export function resolveWorkspaceRoot(explicit?: string): string {
  if (explicit) {
    return path.resolve(explicit);
  }

  const envRoot = process.env.WORKSPACE_ROOT?.trim();
  if (envRoot) {
    const resolvedEnvRoot = path.resolve(envRoot);
    if (isExistingDirectory(resolvedEnvRoot)) {
      return resolvedEnvRoot;
    }
  }

  try {
    const configRoot = getConfigSync().local.workspaceRoot;
    if (configRoot) {
      const resolvedConfigRoot = path.resolve(configRoot);
      if (isExistingDirectory(resolvedConfigRoot)) {
        return resolvedConfigRoot;
      }
    }
  } catch {
    // Config not available yet; fall through to cwd default below.
  }

  return process.cwd();
}
