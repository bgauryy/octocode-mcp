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
import { getConfigSync } from 'octocode-shared';

export function resolveWorkspaceRoot(explicit?: string): string {
  if (explicit) {
    return path.resolve(explicit);
  }

  const envRoot = process.env.WORKSPACE_ROOT?.trim();
  if (envRoot) {
    return path.resolve(envRoot);
  }

  try {
    const configRoot = getConfigSync().local.workspaceRoot;
    if (configRoot) {
      return path.resolve(configRoot);
    }
  } catch {
    // Config not loaded yet, fall through
  }

  return process.cwd();
}
