import { executeNpmCommand } from './exec.js';
import {
  PackageSearchAPIResult,
  PackageSearchError,
  NpmPackageResult,
  DeprecationInfo,
} from './package.js';

interface NpmViewResult {
  name: string;
  version: string;
  repository?: string | { url?: string; type?: string };
  main?: string;
  types?: string;
  typings?: string;
}

interface NpmCliSearchResult {
  name: string;
  version: string;
  links?: {
    npm?: string;
    homepage?: string;
    repository?: string;
  };
}

function cleanRepoUrl(url: string): string {
  return url.replace(/^git\+/, '').replace(/\.git$/, '');
}

function isExactPackageName(query: string): boolean {
  if (query.startsWith('@') && query.includes('/')) {
    return true;
  }
  if (query.includes(' ')) {
    return false;
  }
  return /^[a-z0-9][a-z0-9._-]*$/i.test(query);
}

function mapToResult(data: NpmViewResult): NpmPackageResult {
  let repoUrl: string | null = null;
  if (data.repository) {
    if (typeof data.repository === 'string') {
      repoUrl = cleanRepoUrl(data.repository);
    } else if (data.repository.url) {
      repoUrl = cleanRepoUrl(data.repository.url);
    }
  }

  return {
    repoUrl,
    path: data.name,
    version: data.version || 'latest',
    mainEntry: data.main || null,
    typeDefinitions: data.types || data.typings || null,
  };
}

async function fetchPackageDetails(
  packageName: string
): Promise<NpmPackageResult | null> {
  try {
    const result = await executeNpmCommand('view', [packageName, '--json']);

    if (result.error || result.exitCode !== 0) {
      return null;
    }

    const output = result.stdout.trim();
    if (!output || output === 'undefined') {
      return null;
    }

    let data: NpmViewResult;
    try {
      const parsed = JSON.parse(output);
      data = Array.isArray(parsed) ? parsed[0] : parsed;
    } catch {
      return null;
    }

    return mapToResult(data);
  } catch {
    return null;
  }
}

async function fetchNpmPackageByView(
  packageName: string,
  _fetchMetadata: boolean
): Promise<PackageSearchAPIResult | PackageSearchError> {
  // For exact match, we always try to fetch details to confirm existence and get full info
  // Even if fetchMetadata is false, getting the basic details via 'view' is accurate.
  const pkg = await fetchPackageDetails(packageName);

  if (!pkg) {
    return {
      packages: [],
      ecosystem: 'npm',
      totalFound: 0,
    };
  }

  return {
    packages: [pkg],
    ecosystem: 'npm',
    totalFound: 1,
  };
}

async function searchNpmPackageViaSearch(
  keywords: string,
  limit: number,
  fetchMetadata: boolean
): Promise<PackageSearchAPIResult | PackageSearchError> {
  try {
    const result = await executeNpmCommand('search', [
      keywords,
      '--json',
      `--searchlimit=${limit}`,
    ]);

    if (result.error) {
      return {
        error: `NPM search failed: ${result.error.message}`,
        hints: [
          'Ensure npm is installed and available in PATH',
          'Check package name for typos',
        ],
      };
    }

    if (result.exitCode !== 0) {
      const errorMsg = result.stderr?.trim() || 'Unknown error';
      return {
        error: `NPM search failed: ${errorMsg}`,
        hints: [
          'Check package name for typos',
          'Try searching with a simpler term',
        ],
      };
    }

    let searchResults: NpmCliSearchResult[];
    try {
      const output = result.stdout.trim();
      if (!output || output === '[]') {
        return {
          packages: [],
          ecosystem: 'npm',
          totalFound: 0,
        };
      }
      searchResults = JSON.parse(output);
    } catch {
      return {
        error: 'Failed to parse npm search output',
        hints: ['Try a different search term', 'Check npm CLI version'],
      };
    }

    if (!Array.isArray(searchResults)) {
      return {
        error: 'Invalid npm search response format',
        hints: ['Try a different search term'],
      };
    }

    // Limit manually just in case
    searchResults = searchResults.slice(0, limit);

    const packages = await Promise.all(
      searchResults.map(async item => {
        if (fetchMetadata) {
          const details = await fetchPackageDetails(item.name);
          if (details) return details;
        }

        // Fast path or fallback
        return {
          repoUrl: item.links?.repository
            ? cleanRepoUrl(item.links.repository)
            : null,
          path: item.name,
          version: item.version,
          mainEntry: null,
          typeDefinitions: null,
        } as NpmPackageResult;
      })
    );

    return {
      packages,
      ecosystem: 'npm',
      totalFound: packages.length,
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    return {
      error: `NPM search failed: ${errorMsg}`,
      hints: [
        'Check package name for typos',
        'Try searching with a simpler term',
        'Ensure npm is installed',
      ],
    };
  }
}

export async function searchNpmPackage(
  packageName: string,
  limit: number,
  fetchMetadata: boolean
): Promise<PackageSearchAPIResult | PackageSearchError> {
  if (isExactPackageName(packageName)) {
    return fetchNpmPackageByView(packageName, fetchMetadata);
  }
  return searchNpmPackageViaSearch(packageName, limit, fetchMetadata);
}

export async function checkNpmDeprecation(
  packageName: string
): Promise<DeprecationInfo | null> {
  try {
    const result = await executeNpmCommand('view', [
      packageName,
      'deprecated',
      '--json',
    ]);

    if (result.error || result.exitCode !== 0) {
      return null;
    }

    const output = result.stdout.trim();

    if (!output || output === 'undefined' || output === '') {
      return { deprecated: false };
    }

    try {
      const message = JSON.parse(output);
      return {
        deprecated: true,
        message:
          typeof message === 'string' ? message : 'This package is deprecated',
      };
    } catch {
      return {
        deprecated: true,
        message: output,
      };
    }
  } catch {
    return null;
  }
}
