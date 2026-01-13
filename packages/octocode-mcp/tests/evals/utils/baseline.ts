/**
 * Baseline utilities for storing and comparing eval results
 */

import { promises as fs } from 'fs';
import { join, dirname } from 'path';
import type { EvalResult } from '../scorers/types.js';

const BASELINES_DIR = join(
  dirname(import.meta.url.replace('file://', '')),
  '..',
  'baselines'
);

export interface BaselineMetadata {
  version: string;
  createdAt: string;
  description?: string;
  testCount: number;
  averageScore: number;
}

/**
 * Save eval results as a baseline
 */
export async function saveBaseline(
  name: string,
  results: EvalResult[],
  description?: string
): Promise<string> {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `${name}-${timestamp}.json`;
  const filepath = join(BASELINES_DIR, filename);

  const baseline = {
    metadata: {
      version: '1.0.0',
      createdAt: new Date().toISOString(),
      description,
      testCount: results.length,
      averageScore:
        results.reduce((sum, r) => sum + r.overall, 0) / results.length,
    },
    results,
  };

  await fs.mkdir(BASELINES_DIR, { recursive: true });
  await fs.writeFile(filepath, JSON.stringify(baseline, null, 2));

  return filepath;
}

/**
 * Load the latest baseline for comparison
 */
export async function loadLatestBaseline(
  namePrefix: string
): Promise<{ metadata: BaselineMetadata; results: EvalResult[] } | null> {
  try {
    const files = await fs.readdir(BASELINES_DIR);
    const matching = files
      .filter(f => f.startsWith(namePrefix) && f.endsWith('.json'))
      .sort()
      .reverse();

    const latestFile = matching[0];
    if (!latestFile) {
      return null;
    }

    const filepath = join(BASELINES_DIR, latestFile);
    const content = await fs.readFile(filepath, 'utf-8');
    return JSON.parse(content) as {
      metadata: BaselineMetadata;
      results: EvalResult[];
    };
  } catch {
    return null;
  }
}

/**
 * Load a specific baseline by filename
 */
export async function loadBaseline(
  filename: string
): Promise<{ metadata: BaselineMetadata; results: EvalResult[] } | null> {
  try {
    const filepath = join(BASELINES_DIR, filename);
    const content = await fs.readFile(filepath, 'utf-8');
    return JSON.parse(content) as {
      metadata: BaselineMetadata;
      results: EvalResult[];
    };
  } catch {
    return null;
  }
}

/**
 * List all available baselines
 */
export async function listBaselines(): Promise<
  Array<{ filename: string; metadata: BaselineMetadata }>
> {
  try {
    const files = await fs.readdir(BASELINES_DIR);
    const baselines: Array<{ filename: string; metadata: BaselineMetadata }> =
      [];

    for (const file of files) {
      if (file.endsWith('.json')) {
        try {
          const filepath = join(BASELINES_DIR, file);
          const content = await fs.readFile(filepath, 'utf-8');
          const data = JSON.parse(content) as { metadata: BaselineMetadata };
          baselines.push({ filename: file, metadata: data.metadata });
        } catch {
          // Skip invalid files
        }
      }
    }

    return baselines.sort((a, b) =>
      b.metadata.createdAt.localeCompare(a.metadata.createdAt)
    );
  } catch {
    return [];
  }
}

/**
 * Compare current results against a baseline
 */
export function compareToBaseline(
  current: EvalResult[],
  baseline: EvalResult[]
): {
  improved: number;
  degraded: number;
  unchanged: number;
  averageDelta: number;
  details: Array<{
    testCase: string;
    currentScore: number;
    baselineScore: number;
    delta: number;
  }>;
} {
  const details: Array<{
    testCase: string;
    currentScore: number;
    baselineScore: number;
    delta: number;
  }> = [];

  let improved = 0;
  let degraded = 0;
  let unchanged = 0;
  let totalDelta = 0;

  for (const currentResult of current) {
    const baselineResult = baseline.find(
      b => b.testCase === currentResult.testCase
    );

    if (baselineResult) {
      const delta = currentResult.overall - baselineResult.overall;
      totalDelta += delta;

      if (Math.abs(delta) < 0.01) {
        unchanged++;
      } else if (delta > 0) {
        improved++;
      } else {
        degraded++;
      }

      details.push({
        testCase: currentResult.testCase,
        currentScore: currentResult.overall,
        baselineScore: baselineResult.overall,
        delta,
      });
    }
  }

  return {
    improved,
    degraded,
    unchanged,
    averageDelta: details.length > 0 ? totalDelta / details.length : 0,
    details,
  };
}

/**
 * Delete old baselines, keeping only the N most recent
 */
export async function pruneBaselines(
  namePrefix: string,
  keepCount: number = 5
): Promise<string[]> {
  const files = await fs.readdir(BASELINES_DIR);
  const matching = files
    .filter(f => f.startsWith(namePrefix) && f.endsWith('.json'))
    .sort()
    .reverse();

  const toDelete = matching.slice(keepCount);
  const deleted: string[] = [];

  for (const file of toDelete) {
    try {
      await fs.unlink(join(BASELINES_DIR, file));
      deleted.push(file);
    } catch {
      // Ignore deletion errors
    }
  }

  return deleted;
}
