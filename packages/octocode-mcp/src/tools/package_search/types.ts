/**
 * Types for package_search tool (packageSearch)
 * @module tools/package_search/types
 */

// ============================================================================
// INPUT TYPES
// ============================================================================

/**
 * Base query for package search
 */
interface PackageSearchBaseQuery {
  name: string;
  searchLimit?: number;
  mainResearchGoal?: string;
  researchGoal?: string;
  reasoning?: string;
}

/**
 * NPM-specific package search query
 */
export interface NpmPackageSearchQuery extends PackageSearchBaseQuery {
  ecosystem: 'npm';
  npmFetchMetadata?: boolean;
}

/**
 * Python-specific package search query
 */
export interface PythonPackageSearchQuery extends PackageSearchBaseQuery {
  ecosystem: 'python';
  pythonFetchMetadata?: boolean;
}

/**
 * Combined package search query type
 */
export type PackageSearchQuery =
  | NpmPackageSearchQuery
  | PythonPackageSearchQuery;

// ============================================================================
// OUTPUT TYPES
// ============================================================================

/**
 * Minimal package result (common fields)
 */
export interface MinimalPackageResult {
  name: string;
  version?: string;
  description?: string;
  homepage?: string;
  repository?: string | null;
}

/**
 * NPM package result
 */
export interface NpmPackageResult extends MinimalPackageResult {
  path: string;
  repoUrl: string;
  score?: number;
  downloads?: number;
  keywords?: string[];
  license?: string;
  publishedAt?: string;
  updatedAt?: string;
  maintainers?: string[];
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

/**
 * Python package result
 */
export interface PythonPackageResult extends MinimalPackageResult {
  author?: string;
  authorEmail?: string;
  maintainer?: string;
  maintainerEmail?: string;
  license?: string;
  keywords?: string[];
  classifiers?: string[];
  requiresPython?: string;
  projectUrls?: Record<string, string>;
}

/**
 * Combined package result type
 */
export type PackageResult =
  | MinimalPackageResult
  | NpmPackageResult
  | PythonPackageResult;

/**
 * Package result with parsed repository info
 */
export interface PackageResultWithRepo extends MinimalPackageResult {
  repoUrl?: string;
  owner?: string;
  repo?: string;
  path?: string;
}

/**
 * Deprecation information for a package
 */
export interface DeprecationInfo {
  deprecated: boolean;
  message?: string;
}

/**
 * Successful package search API result
 */
export interface PackageSearchAPIResult {
  packages: PackageResult[];
  totalFound: number;
}

/**
 * Package search error
 */
export interface PackageSearchError {
  error: string;
}

/**
 * Package search result
 */
export interface PackageSearchResult {
  packages: PackageResultWithRepo[];
  totalFound: number;
}
