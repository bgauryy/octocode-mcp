import { z } from 'zod';
import path from 'path';

// =============================================================================
// Custom Preprocessors
// =============================================================================

/**
 * Preprocess string to number (for query params)
 */
const toNumber = (val: unknown) => {
  if (typeof val === 'number') return val;
  if (typeof val === 'string' && /^\d+$/.test(val)) return parseInt(val, 10);
  return val;
};

/**
 * Preprocess string to boolean
 */
const toBoolean = (val: unknown) => {
  if (typeof val === 'boolean') return val;
  if (val === 'true') return true;
  if (val === 'false') return false;
  return val;
};

/**
 * Preprocess comma-separated string to array
 */
const toArray = (val: unknown) => {
  if (Array.isArray(val)) return val;
  if (typeof val === 'string') return val.split(',').map((s) => s.trim());
  return val;
};

// =============================================================================
// Reusable Schema Parts
// =============================================================================

const numericString = z.preprocess(toNumber, z.number().optional());
const requiredNumber = z.preprocess(toNumber, z.number());
const booleanString = z.preprocess(toBoolean, z.boolean().optional());
const stringArray = z.preprocess(toArray, z.array(z.string()));

/**
 * Safe path that blocks traversal attacks
 */
const safePath = z.string().refine(
  (p) => {
    const normalized = path.normalize(p);
    if (normalized.includes('..')) return false;
    if (p.includes('\0')) return false;
    return true;
  },
  { message: 'Path contains invalid traversal patterns' }
);

// =============================================================================
// Base Research Context
// =============================================================================

const researchDefaults = {
  mainResearchGoal: 'HTTP API request',
  researchGoal: 'Execute tool via HTTP',
  reasoning: 'HTTP API call',
};

// =============================================================================
// Local Route Schemas
// =============================================================================

export const localSearchSchema = z
  .object({
    pattern: z.string().min(1, 'Pattern is required'),
    path: safePath,
    type: z.string().optional(),
    include: z.string().optional(),
    exclude: z.string().optional(),
    maxResults: numericString,
    caseSensitive: booleanString,
    wholeWord: booleanString,
    multiline: booleanString,
    context: numericString,
    mainResearchGoal: z.string().optional(),
    researchGoal: z.string().optional(),
    reasoning: z.string().optional(),
  })
  .transform((data) => ({
    ...researchDefaults,
    ...data,
  }));

export const localContentSchema = z
  .object({
    path: safePath,
    startLine: numericString,
    endLine: numericString,
    mainResearchGoal: z.string().optional(),
    researchGoal: z.string().optional(),
    reasoning: z.string().optional(),
  })
  .transform((data) => ({
    ...researchDefaults,
    ...data,
  }));

export const localFindSchema = z
  .object({
    path: safePath,
    pattern: z.string().optional(),
    type: z.enum(['file', 'directory', 'all']).optional(),
    maxDepth: numericString,
    maxResults: numericString,
    modifiedAfter: z.string().optional(),
    modifiedBefore: z.string().optional(),
    mainResearchGoal: z.string().optional(),
    researchGoal: z.string().optional(),
    reasoning: z.string().optional(),
  })
  .transform((data) => ({
    ...researchDefaults,
    ...data,
  }));

export const localStructureSchema = z
  .object({
    path: safePath,
    depth: numericString,
    showHidden: booleanString,
    includeFiles: booleanString,
    mainResearchGoal: z.string().optional(),
    researchGoal: z.string().optional(),
    reasoning: z.string().optional(),
  })
  .transform((data) => ({
    ...researchDefaults,
    ...data,
  }));

// =============================================================================
// LSP Route Schemas
// =============================================================================

export const lspDefinitionSchema = z
  .object({
    uri: safePath,
    symbolName: z.string().min(1, 'Symbol name is required'),
    lineHint: requiredNumber.refine((n) => n >= 0, 'Line hint must be non-negative'),
    mainResearchGoal: z.string().optional(),
    researchGoal: z.string().optional(),
    reasoning: z.string().optional(),
  })
  .transform((data) => ({
    ...researchDefaults,
    ...data,
  }));

export const lspReferencesSchema = z
  .object({
    uri: safePath,
    symbolName: z.string().min(1, 'Symbol name is required'),
    lineHint: requiredNumber.refine((n) => n >= 0, 'Line hint must be non-negative'),
    includeDeclaration: booleanString,
    mainResearchGoal: z.string().optional(),
    researchGoal: z.string().optional(),
    reasoning: z.string().optional(),
  })
  .transform((data) => ({
    ...researchDefaults,
    ...data,
  }));

export const lspCallsSchema = z
  .object({
    uri: safePath,
    symbolName: z.string().min(1, 'Symbol name is required'),
    lineHint: requiredNumber.refine((n) => n >= 0, 'Line hint must be non-negative'),
    direction: z.enum(['incoming', 'outgoing'], {
      errorMap: () => ({ message: "Direction must be 'incoming' or 'outgoing'" }),
    }),
    mainResearchGoal: z.string().optional(),
    researchGoal: z.string().optional(),
    reasoning: z.string().optional(),
  })
  .transform((data) => ({
    ...researchDefaults,
    ...data,
  }));

// =============================================================================
// GitHub Route Schemas
// =============================================================================

export const githubSearchSchema = z
  .object({
    keywordsToSearch: stringArray,
    owner: z.string().optional(),
    repo: z.string().optional(),
    language: z.string().optional(),
    path: z.string().optional(),
    extension: z.string().optional(),
    maxResults: numericString,
    mainResearchGoal: z.string().optional(),
    researchGoal: z.string().optional(),
    reasoning: z.string().optional(),
  })
  .transform((data) => ({
    ...researchDefaults,
    ...data,
  }));

export const githubContentSchema = z
  .object({
    owner: z.string().min(1, 'Owner is required'),
    repo: z.string().min(1, 'Repo is required'),
    path: z.string().min(1, 'Path is required'),
    branch: z.string().optional(),
    startLine: numericString,
    endLine: numericString,
    mainResearchGoal: z.string().optional(),
    researchGoal: z.string().optional(),
    reasoning: z.string().optional(),
  })
  .transform((data) => ({
    ...researchDefaults,
    ...data,
  }));

export const githubReposSchema = z
  .object({
    // Search terms (at least one of keywordsToSearch or topicsToSearch required)
    keywordsToSearch: stringArray.optional(),
    topicsToSearch: stringArray.optional(),
    // Filters
    owner: z.string().optional(),
    stars: z.string().optional(), // e.g., ">1000", "100..500"
    size: z.string().optional(), // e.g., ">1000" (KB)
    created: z.string().optional(), // e.g., ">2020-01-01"
    updated: z.string().optional(), // e.g., ">2024-01-01"
    match: z.preprocess(toArray, z.array(z.enum(['name', 'description', 'readme'])).optional()),
    // Sorting & pagination
    sort: z.enum(['stars', 'forks', 'updated', 'best-match']).optional(),
    limit: numericString,
    page: numericString,
    // Research context
    mainResearchGoal: z.string().optional(),
    researchGoal: z.string().optional(),
    reasoning: z.string().optional(),
  })
  .refine(
    (data) =>
      (data.keywordsToSearch && data.keywordsToSearch.length > 0) ||
      (data.topicsToSearch && data.topicsToSearch.length > 0),
    {
      message: "At least one of 'keywordsToSearch' or 'topicsToSearch' is required",
      path: ['keywordsToSearch'],
    }
  )
  .transform((data) => ({
    ...researchDefaults,
    ...data,
  }));

export const githubStructureSchema = z
  .object({
    owner: z.string().min(1, 'Owner is required'),
    repo: z.string().min(1, 'Repo is required'),
    branch: z.string().min(1, 'Branch is required'),
    path: z.string().optional(),
    depth: numericString,
    mainResearchGoal: z.string().optional(),
    researchGoal: z.string().optional(),
    reasoning: z.string().optional(),
  })
  .transform((data) => ({
    ...researchDefaults,
    ...data,
  }));

export const githubPRsSchema = z
  .object({
    query: z.string().optional(),
    owner: z.string().optional(),
    repo: z.string().optional(),
    state: z.enum(['open', 'closed']).optional(),
    sort: z.enum(['created', 'updated', 'comments']).optional(),
    order: z.enum(['asc', 'desc']).optional(),
    maxResults: numericString,
    mainResearchGoal: z.string().optional(),
    researchGoal: z.string().optional(),
    reasoning: z.string().optional(),
  })
  .transform((data) => ({
    ...researchDefaults,
    ...data,
  }));

// =============================================================================
// Package Route Schemas
// =============================================================================

export const packageSearchSchema = z
  .object({
    name: z.string().min(1, 'Package name is required'),
    ecosystem: z.enum(['npm', 'pypi']).optional().default('npm'),
    maxResults: numericString,
    mainResearchGoal: z.string().optional(),
    researchGoal: z.string().optional(),
    reasoning: z.string().optional(),
  })
  .transform((data) => ({
    ...researchDefaults,
    ...data,
  }));

// =============================================================================
// Type Exports (output types after transform)
// =============================================================================

export type LocalSearchQuery = z.output<typeof localSearchSchema>;
export type LocalContentQuery = z.output<typeof localContentSchema>;
export type LocalFindQuery = z.output<typeof localFindSchema>;
export type LocalStructureQuery = z.output<typeof localStructureSchema>;

export type LspDefinitionQuery = z.output<typeof lspDefinitionSchema>;
export type LspReferencesQuery = z.output<typeof lspReferencesSchema>;
export type LspCallsQuery = z.output<typeof lspCallsSchema>;

export type GithubSearchQuery = z.output<typeof githubSearchSchema>;
export type GithubContentQuery = z.output<typeof githubContentSchema>;
export type GithubReposQuery = z.output<typeof githubReposSchema>;
export type GithubStructureQuery = z.output<typeof githubStructureSchema>;
export type GithubPRsQuery = z.output<typeof githubPRsSchema>;

export type PackageSearchQuery = z.output<typeof packageSearchSchema>;
