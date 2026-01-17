/**
 * HTTP Query String Preprocessing Utilities
 *
 * HTTP query strings are always strings. These utilities convert them
 * to proper types before Zod schema validation.
 *
 * @module validation/httpPreprocess
 */

import { z } from 'zod';
import path from 'path';

// =============================================================================
// Preprocessors - Convert HTTP query strings to proper types
// =============================================================================

/**
 * Preprocess string to number (for query params)
 */
export const toNumber = (val: unknown): unknown => {
  if (typeof val === 'number') return val;
  if (typeof val === 'string' && /^\d+$/.test(val)) return parseInt(val, 10);
  return val;
};

/**
 * Preprocess string to boolean
 */
export const toBoolean = (val: unknown): unknown => {
  if (typeof val === 'boolean') return val;
  if (val === 'true') return true;
  if (val === 'false') return false;
  return val;
};

/**
 * Preprocess comma-separated string to array
 */
export const toArray = (val: unknown): unknown => {
  if (Array.isArray(val)) return val;
  if (typeof val === 'string') return val.split(',').map((s) => s.trim());
  return val;
};

// =============================================================================
// Reusable Schema Parts for HTTP
// =============================================================================

/** Numeric string that gets converted to number */
export const numericString = z.preprocess(toNumber, z.number().optional());

/** Required numeric string */
export const requiredNumber = z.preprocess(toNumber, z.number());

/** Boolean string that gets converted to boolean */
export const booleanString = z.preprocess(toBoolean, z.boolean().optional());

/** Comma-separated string that gets converted to array */
export const stringArray = z.preprocess(toArray, z.array(z.string()));

/**
 * Safe path that blocks traversal attacks
 */
export const safePath = z.string().refine(
  (p) => {
    const normalized = path.normalize(p);
    if (normalized.includes('..')) return false;
    if (p.includes('\0')) return false;
    return true;
  },
  { message: 'Path contains invalid traversal patterns' }
);

// =============================================================================
// Default Research Context
// =============================================================================

/**
 * Default research context values for HTTP requests
 */
export const researchDefaults = {
  mainResearchGoal: 'HTTP API request',
  researchGoal: 'Execute tool via HTTP',
  reasoning: 'HTTP API call',
};
