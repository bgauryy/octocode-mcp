// Re-export schema types
export {
  PackageSearchResult,
  PackageSearchError,
  BasicPackageSearchResult,
} from './scheme/package_search';

export interface NpmPackage {
  name: string;
  version: string;
  description: string | null;
  keywords: string[];
  repository: string | null;
  links?: {
    repository?: string;
  };
}

export interface PythonPackage {
  name: string;
  version: string;
  description: string | null;
  keywords: string[];
  repository: string | null;
}

// NPM Package Types - Optimized
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

// Enhanced Package Search Types - Merged npm_view_package functionality
export interface EnhancedPackageMetadata {
  gitURL: string;
  metadata: OptimizedNpmPackageResult | PythonPackageMetadata;
}

export interface PythonPackageMetadata {
  name: string;
  version: string;
  description: string | null;
  keywords: string[];
  repository: string | null;
  // Additional Python-specific metadata can be added here
  homepage?: string;
  author?: string;
  license?: string;
}

export interface NpmPackageQuery {
  name: string; // Package name to search for
  searchLimit?: number; // Results limit per query (1-50)
  npmSearchStrategy?: 'individual' | 'combined'; // Search strategy
  npmFetchMetadata?: boolean; // Whether to fetch detailed metadata
  npmField?: string; // Specific field to retrieve
  npmMatch?: string | string[]; // Specific field(s) to retrieve
  id?: string; // Optional identifier for the query
}

export interface PythonPackageQuery {
  name: string; // Package name to search for
  searchLimit?: number; // Results limit for this query (1-10)
  id?: string; // Optional identifier for the query
}

export interface PackageSearchBulkParams {
  npmPackages?: NpmPackageQuery[]; // Array of NPM package queries
  pythonPackages?: PythonPackageQuery[]; // Array of Python package queries
  // Global defaults (can be overridden per query)
  searchLimit?: number;
  npmSearchStrategy?: 'individual' | 'combined';
  npmFetchMetadata?: boolean;
  researchGoal?: string; // Research goal to guide tool behavior and hint generation
}

/**
 * Generic standardized response structure for all MCP tools
 *
 * This provides a consistent format across all tools:
 * - data: The actual results/content from the tool operation
 * - meta: Metadata about the operation (counts, context, research info)
 * - hints: Actionable guidance for next steps or improvements
 *
 * Benefits:
 * - Consistent UX across all tools
 * - Predictable response parsing
 * - Standardized metadata and hint patterns
 * - Easy to extend with tool-specific meta fields
 */

/**
 * Base metadata that all tools should include
 */
export interface BaseToolMeta {
  /** Research goal driving this operation - helps guide tool behavior and hints */
  researchGoal: string;
  /** Total number of queries/operations performed */
  totalOperations: number;
  /** Number of successful operations */
  successfulOperations: number;
  /** Number of failed operations */
  failedOperations: number;
  /** Any errors that occurred during processing */
  errors?: Array<{
    operationId?: string;
    error: string;
    hints?: string[];
  }>;
}

/**
 * Generic response structure for all MCP tools
 *
 * @template TData - The type of data returned by the specific tool
 * @template TMeta - Additional metadata specific to the tool (extends BaseToolMeta)
 */
export interface GenericToolResponse<
  TData = unknown,
  TMeta extends BaseToolMeta = BaseToolMeta,
> {
  /** The actual results/content from the tool operation */
  data: TData[];

  /** Metadata about the operation and context */
  meta: TMeta;

  /** Actionable guidance for next steps, improvements, or tool usage */
  hints: string[];
}

/**
 * Helper type for tools that don't need additional metadata beyond the base
 */
export type SimpleToolResponse<TData = unknown> = GenericToolResponse<
  TData,
  BaseToolMeta
>;
