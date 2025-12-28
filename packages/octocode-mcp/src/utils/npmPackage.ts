import { executeNpmCommand } from './exec/index.js';
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
  description?: string;
  keywords?: string[];
  license?: string | { type?: string };
  homepage?: string;
  author?: string | { name?: string; email?: string; url?: string };
  maintainers?: Array<{ name?: string; email?: string }>;
  engines?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  time?: {
    modified?: string;
    created?: string;
    [version: string]: string | undefined;
  };
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

function mapToResult(
  data: NpmViewResult,
  includeExtendedMetadata: boolean = false
): NpmPackageResult {
  let repoUrl: string | null = null;
  if (data.repository) {
    if (typeof data.repository === 'string') {
      repoUrl = cleanRepoUrl(data.repository);
    } else if (data.repository.url) {
      repoUrl = cleanRepoUrl(data.repository.url);
    }
  }

  let lastPublished: string | undefined;
  if (data.time) {
    const versionTime = data.version ? data.time[data.version] : undefined;
    const timeStr = versionTime || data.time.modified;
    if (timeStr) {
      lastPublished = timeStr;
    }
  }

  const result: NpmPackageResult = {
    repoUrl,
    path: data.name,
    version: data.version || 'latest',
    mainEntry: data.main || null,
    typeDefinitions: data.types || data.typings || null,
    lastPublished,
  };

  // Extended metadata - only included when explicitly requested
  if (includeExtendedMetadata) {
    // Extract license (can be string or object)
    if (data.license) {
      result.license =
        typeof data.license === 'string' ? data.license : data.license.type;
    }

    // Extract author (can be string or object)
    if (data.author) {
      if (typeof data.author === 'string') {
        result.author = data.author;
      } else if (data.author.name) {
        result.author = data.author.name;
      }
    }

    if (data.description) {
      result.description = data.description;
    }
    if (data.keywords && data.keywords.length > 0) {
      result.keywords = data.keywords;
    }
    if (data.homepage) {
      result.homepage = data.homepage;
    }
    if (data.engines && Object.keys(data.engines).length > 0) {
      result.engines = data.engines;
    }
    if (data.dependencies && Object.keys(data.dependencies).length > 0) {
      result.dependencies = data.dependencies;
    }
    if (
      data.peerDependencies &&
      Object.keys(data.peerDependencies).length > 0
    ) {
      result.peerDependencies = data.peerDependencies;
    }
  }

  return result;
}

async function fetchPackageDetails(
  packageName: string,
  includeExtendedMetadata: boolean = false
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
      if (!data) return null;
    } catch {
      return null;
    }

    return mapToResult(data, includeExtendedMetadata);
  } catch {
    return null;
  }
}

async function fetchNpmPackageByView(
  packageName: string,
  fetchMetadata: boolean
): Promise<PackageSearchAPIResult | PackageSearchError> {
  const pkg = await fetchPackageDetails(packageName, fetchMetadata);

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

    searchResults = searchResults.slice(0, limit);

    const packages = await Promise.all(
      searchResults.map(async item => {
        if (fetchMetadata) {
          const details = await fetchPackageDetails(item.name, true);
          if (details) return details;
        }

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
  // If limit is > 1, we want to see alternatives, so force a search
  // even if the name looks like an exact match.
  if (limit === 1 && isExactPackageName(packageName)) {
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
