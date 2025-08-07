// Re-export schema types
export {
  PackageSearchResult,
  PackageSearchError,
  BasicPackageSearchResult,
} from '../scheme/package_search';

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
