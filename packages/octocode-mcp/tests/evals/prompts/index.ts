/**
 * Prompt loader for eval test cases
 */

import { promises as fs } from 'fs';
import { join, dirname } from 'path';
import type { EvalTestCase } from '../scorers/types.js';

const PROMPTS_DIR = dirname(import.meta.url.replace('file://', ''));

/**
 * Load prompts from JSON file
 */
export async function loadPrompts(filename: string): Promise<EvalTestCase[]> {
  const filepath = join(PROMPTS_DIR, filename);
  const content = await fs.readFile(filepath, 'utf-8');
  return JSON.parse(content) as EvalTestCase[];
}

/**
 * Load base manual prompts
 */
export async function loadBasePrompts(): Promise<EvalTestCase[]> {
  return loadPrompts('manual/research-scenarios.json');
}

/**
 * Load realistic/challenging prompts (post-cutoff, undocumented, etc.)
 */
export async function loadRealisticPrompts(): Promise<EvalTestCase[]> {
  return loadPrompts('manual/research-scenarios-realistic.json');
}

/**
 * Load all manual prompts (base + realistic)
 */
export async function loadManualPrompts(): Promise<EvalTestCase[]> {
  const [base, realistic] = await Promise.all([
    loadBasePrompts(),
    loadRealisticPrompts(),
  ]);
  return [...base, ...realistic];
}

/**
 * Load only realistic prompts for challenging evals
 */
export async function loadChallengingPrompts(): Promise<EvalTestCase[]> {
  return loadRealisticPrompts();
}

/**
 * Filter prompts by category
 */
export function filterByCategory(
  prompts: EvalTestCase[],
  categories: EvalTestCase['category'][]
): EvalTestCase[] {
  return prompts.filter(p => categories.includes(p.category));
}

/**
 * Filter prompts by tags
 */
export function filterByTags(
  prompts: EvalTestCase[],
  tags: string[],
  matchAll: boolean = false
): EvalTestCase[] {
  return prompts.filter(p => {
    if (!p.tags || p.tags.length === 0) return false;
    if (matchAll) {
      return tags.every(t => p.tags?.includes(t));
    }
    return tags.some(t => p.tags?.includes(t));
  });
}

/**
 * Get prompts by name pattern
 */
export function filterByName(
  prompts: EvalTestCase[],
  pattern: string | RegExp
): EvalTestCase[] {
  const regex =
    typeof pattern === 'string' ? new RegExp(pattern, 'i') : pattern;
  return prompts.filter(p => regex.test(p.name));
}

/**
 * Sample random prompts
 */
export function samplePrompts(
  prompts: EvalTestCase[],
  count: number
): EvalTestCase[] {
  const shuffled = [...prompts].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}

/**
 * Filter prompts by minimum difficulty level (1-5)
 */
export function filterByDifficulty(
  prompts: EvalTestCase[],
  minDifficulty: number,
  maxDifficulty?: number
): EvalTestCase[] {
  return prompts.filter(p => {
    const difficulty = (p as EvalTestCase & { difficulty?: number }).difficulty;
    if (difficulty === undefined) return false;
    if (maxDifficulty !== undefined) {
      return difficulty >= minDifficulty && difficulty <= maxDifficulty;
    }
    return difficulty >= minDifficulty;
  });
}
