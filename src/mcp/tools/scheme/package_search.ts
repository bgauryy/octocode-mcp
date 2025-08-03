import { NpmPackage } from '../../types';

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

export interface EnhancedPackageMetadata {
  gitURL: string;
  metadata: OptimizedNpmPackageResult | PythonPackageMetadata;
}

export interface BasicPackageSearchResult {
  total_count: number;
  npm?: NpmPackage[];
  python?: NpmPackage[];
  hints?: string[];
}
