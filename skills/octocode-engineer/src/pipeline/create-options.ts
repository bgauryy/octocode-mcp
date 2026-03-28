import path from 'node:path';

import { ALL_CATEGORIES, PILLAR_CATEGORIES } from '../types/index.js';

import type { AnalysisOptions } from '../types/index.js';

export interface CreateOptionsInput {
  args: AnalysisOptions;
}

/**
 * Transforms raw parsed CLI args into validated, normalized runtime options.
 * This is Layer 2 in the 3-layer CLI pattern (args → options → engine).
 *
 * Responsible for:
 * - Deriving computed fields (packageRoot)
 * - Auto-enabling flags based on feature selection (test-quality → includeTests)
 *
 * Inspired by knip's create-options.ts, eslint's translate-cli-options.js,
 * and dependency-cruiser's normalize-cli-options.mjs.
 */
export function createOptions({ args }: CreateOptionsInput): AnalysisOptions {
  const opts = { ...args };

  opts.packageRoot = path.join(opts.root, 'packages');
  autoEnableTestQuality(opts);

  return opts;
}

function autoEnableTestQuality(opts: AnalysisOptions): void {
  if (opts.features === null) return;

  const testQualityCats = new Set(PILLAR_CATEGORIES['test-quality']);
  if ([...opts.features].some(f => testQualityCats.has(f))) {
    opts.includeTests = true;
  }
}

/**
 * Resolves `--exclude` into a features set by subtracting from ALL_CATEGORIES.
 * Called during CLI arg parsing when --exclude is used.
 */
export function resolveExcludeToFeatures(
  excludeSet: Set<string>
): Set<string> {
  return new Set([...ALL_CATEGORIES].filter(c => !excludeSet.has(c)));
}

export class OptionsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OptionsError';
  }
}
