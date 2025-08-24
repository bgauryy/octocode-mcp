import { z } from 'zod';
import { ResearchGoalEnum } from '../tools/utils/toolConstants';

// NPM package field enum for validation
const NpmFieldEnum = [
  'version',
  'description',
  'license',
  'author',
  'homepage',
  'repository',
  'dependencies',
  'devDependencies',
  'keywords',
  'main',
  'scripts',
  'engines',
  'files',
  'publishConfig',
  'dist-tags',
  'time',
] as const;

// NPM Package Query Schema
const NpmPackageQuerySchema = z.object({
  name: z.string().describe('NPM package name to search for'),
  searchLimit: z
    .number()
    .int()
    .min(1)
    .max(10)
    .optional()
    .describe(
      'Results limit for this query (1-10). Default: 1 for specific packages, up to 10 for exploration'
    ),
  npmSearchStrategy: z
    .enum(['individual', 'combined'])
    .optional()
    .describe('Search strategy for this query'),
  npmFetchMetadata: z
    .boolean()
    .optional()
    .describe('Whether to fetch detailed metadata for this package'),
  npmField: z
    .string()
    .optional()
    .describe('Specific field to retrieve from this NPM package'),
  npmMatch: z
    .union([z.enum(NpmFieldEnum), z.array(z.enum(NpmFieldEnum)), z.string()])
    .optional()
    .describe('Specific field(s) to retrieve from this NPM package'),
});

// Python Package Query Schema
const PythonPackageQuerySchema = z.object({
  name: z.string().describe('Python package name to search for'),
  searchLimit: z
    .number()
    .int()
    .min(1)
    .max(10)
    .optional()
    .describe(
      'Results limit for this query (1-10). Default: 1 for specific packages, up to 10 for exploration'
    ),
});

// Bulk Package Search Schema - main input schema
export const BulkPackageSearchSchema = z.object({
  // Global defaults
  searchLimit: z
    .number()
    .int()
    .min(1)
    .max(10)
    .optional()
    .default(1)
    .describe(
      'Global default results limit per query (1-10). Use 1 for specific packages, up to 10 for exploration. Can be overridden per query. Default: 1'
    ),

  npmSearchStrategy: z
    .enum(['individual', 'combined'])
    .optional()
    .default('individual')
    .describe(
      'Global default NPM search strategy. Can be overridden per query. Default: individual'
    ),

  npmFetchMetadata: z
    .boolean()
    .optional()
    .default(false)
    .describe(
      'Global default for NPM metadata fetching. Can be overridden per query. Default: false'
    ),

  researchGoal: z
    .enum(ResearchGoalEnum)
    .optional()
    .describe('Research goal to guide tool behavior and hint generation'),

  // Package arrays for bulk search
  npmPackages: z
    .array(NpmPackageQuerySchema)
    .max(10)
    .optional()
    .describe(
      'Array of NPM package queries (max 10). Each query can have individual parameters for customized search behavior.'
    ),
  pythonPackages: z
    .array(PythonPackageQuerySchema)
    .max(10)
    .optional()
    .describe(
      'Array of Python package queries (max 10). Each query searches PyPI for the specified package name with individual result limits.'
    ),
});

export type BulkPackageSearchParams = z.infer<typeof BulkPackageSearchSchema>;
export type PackageSearchQuery =
  | z.infer<typeof NpmPackageQuerySchema>
  | z.infer<typeof PythonPackageQuerySchema>;

// Package metadata types
export interface PythonPackageMetadata {
  name: string;
  version: string;
  description: string | null;
  keywords: string[];
  repository: string | null;
  homepage?: string;
  author?: string;
  license?: string;
}

export interface OptimizedNpmPackageResult {
  name: string;
  version: string;
  description: string;
  license: string;
  repository: string;
  size: string;
  created: string;
  updated: string;
  versions: Array<{
    version: string;
    date: string;
  }>;
  stats: {
    total_versions: number;
    weekly_downloads?: number;
  };
  exports?: { main: string; types?: string; [key: string]: unknown };
}

export interface EnhancedPackageMetadata {
  gitURL: string;
  metadata: OptimizedNpmPackageResult | PythonPackageMetadata;
}

// Result types following github_search_code pattern
export interface ProcessedPackageResult {
  queryId: string;
  packageName: string;
  ecosystem: 'npm' | 'python';
  data?: Record<string, unknown>;
  error?: string;
  failed?: boolean;
  hints?: string[];
  researchGoal?: string;
  metadata: {
    resultCount: number;
    hasRepositoryUrl: boolean;
  };
  meta?: PackageSearchMeta;
}

export interface PackageSearchMeta {
  queryArgs?: PackageSearchQuery;
  error?: string;
  searchType?: string;
  suggestions?: {
    broaderSearch?: string[];
    semanticAlternatives?: string[];
    splitQueries?: Array<Record<string, unknown>>;
    alternativeApproaches?: string[];
    recoveryActions?: string[];
  };
}

export interface AggregatedPackageContext {
  totalPackages: number;
  successfulQueries: number;
  ecosystems: Set<string>;
  foundRepositories: Set<string>;
  packageTypes: Set<string>;
  dataQuality: {
    hasResults: boolean;
    hasRepositoryLinks: boolean;
    hasMetadata: boolean;
  };
}

// Response types following github_search_code pattern
export interface PackageSearchResponse {
  data: ProcessedPackageResult[];
  meta: {
    researchGoal: string;
    totalOperations: number;
    successfulOperations: number;
    failedOperations: number;
    errors?: Array<{
      operationId: string;
      error: string;
      hints?: string[];
    }>;
    // Package search specific metadata
    totalPackages: number;
    ecosystems: string[];
    foundRepositories: string[];
    aggregatedContext?: {
      totalQueries: number;
      successfulQueries: number;
      failedQueries: number;
      ecosystems: string[];
      foundRepositories: string[];
      summary: {
        totalPackages: number;
        hasRepositoryLinks: boolean;
        hasMetadata: boolean;
      };
    };
  };
  hints: string[];
}

// Legacy result types for backward compatibility
export interface PackageSearchResult {
  total_count: number;
  npm?: Record<string, EnhancedPackageMetadata>;
  python?: Record<string, EnhancedPackageMetadata>;
  hints?: string[];
}

export interface PackageSearchError {
  error: string;
  hints?: string[];
  errors?: {
    npm: string[];
    python: string[];
  };
}

export interface BasicPackageSearchResult {
  total_count: number;
  npm?: Array<Record<string, unknown>>;
  python?: Array<Record<string, unknown>>;
  hints?: string[];
}
