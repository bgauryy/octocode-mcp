import { generateCacheKey, withDataCache } from './cache.js';
import { searchNpmPackage, checkNpmDeprecation } from './npmPackage.js';
import { searchPythonPackage } from './pythonPackage.js';

export interface PackageSearchInput {
  ecosystem: 'npm' | 'python';
  name: string;
  searchLimit?: number;
  npmFetchMetadata?: boolean;
  pythonFetchMetadata?: boolean;
  mainResearchGoal?: string;
  researchGoal?: string;
  reasoning?: string;
}

export interface MinimalPackageResult {
  name: string;
  repository: string | null;
}

export interface NpmPackageResult {
  repoUrl: string | null;
  path: string;
  version: string;
  mainEntry: string | null;
  typeDefinitions: string | null;
}

export interface PythonPackageResult {
  name: string;
  version: string;
  description: string | null;
  keywords: string[];
  repository: string | null;
  homepage?: string;
  author?: string;
  license?: string;
}

export type PackageResult =
  | MinimalPackageResult
  | NpmPackageResult
  | PythonPackageResult;

export interface PackageSearchAPIResult {
  packages: PackageResult[];
  ecosystem: 'npm' | 'python';
  totalFound: number;
}

export interface PackageSearchError {
  error: string;
  hints?: string[];
}

export interface DeprecationInfo {
  deprecated: boolean;
  message?: string;
}

export async function searchPackage(
  query: PackageSearchInput
): Promise<PackageSearchAPIResult | PackageSearchError> {
  const fetchMetadata =
    query.ecosystem === 'npm'
      ? (query.npmFetchMetadata ?? false)
      : (query.pythonFetchMetadata ?? false);

  const searchLimit = query.searchLimit ?? 1;

  const cacheKey = generateCacheKey(
    query.ecosystem === 'npm' ? 'npm-search' : 'pypi-search',
    { name: query.name, limit: searchLimit, metadata: fetchMetadata }
  );

  return withDataCache(
    cacheKey,
    async () => {
      if (query.ecosystem === 'npm') {
        return searchNpmPackage(query.name, searchLimit, fetchMetadata);
      } else {
        return searchPythonPackage(query.name, fetchMetadata);
      }
    },
    {
      ttl: 14400, // 4 hours
      shouldCache: result => !('error' in result),
    }
  );
}

export { checkNpmDeprecation };
