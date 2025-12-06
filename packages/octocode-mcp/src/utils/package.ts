import axios from 'axios';
import { generateCacheKey, withDataCache } from './cache.js';
import { executeNpmCommand } from './exec.js';

const MAX_DESCRIPTION_LENGTH = 200;
const MAX_KEYWORDS = 10;

// Input type for package search (before schema defaults are applied)
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

// Minimal package result (default - just name and repository)
export interface MinimalPackageResult {
  name: string;
  repository: string | null;
}

// Full package result interfaces (when npmFetchMetadata: true)
export interface NpmPackageResult {
  name: string;
  version: string;
  description: string | null;
  keywords: string[];
  repository: string | null;
  license?: string;
  homepage?: string;
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

/**
 * Search for a package based on the query
 */
export async function searchPackage(
  query: PackageSearchInput
): Promise<PackageSearchAPIResult | PackageSearchError> {
  // Use ecosystem-specific metadata flags
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
        // Use fuzzy search for Python when limit > 1
        if (searchLimit > 1) {
          return searchPyPIPackagesFuzzy(
            query.name,
            searchLimit,
            fetchMetadata
          );
        }
        return searchPythonPackage(query.name, fetchMetadata);
      }
    },
    {
      ttl: 14400, // 4 hours
      shouldCache: result => !('error' in result),
    }
  );
}

// NPM CLI search result interface
interface NpmCliSearchResult {
  name: string;
  version: string;
  description?: string;
  keywords?: string[];
  date?: string;
  links?: {
    npm?: string;
    homepage?: string;
    repository?: string;
  };
  author?: { name?: string };
  publisher?: { username?: string };
  maintainers?: Array<{ username?: string }>;
}

/**
 * Fetch repository URL from npm registry API
 * The npm search CLI doesn't return repository info, so we fetch it separately
 */
async function fetchNpmRepository(packageName: string): Promise<string | null> {
  try {
    const response = await axios.get(
      `https://registry.npmjs.org/${encodeURIComponent(packageName)}`,
      { timeout: 5000 }
    );
    const repoUrl = response.data?.repository?.url;
    if (repoUrl) {
      // Clean up git+ prefix and .git suffix
      return repoUrl.replace(/^git\+/, '').replace(/\.git$/, '');
    }
  } catch {
    // Silently fail - repository is optional
  }
  return null;
}

/**
 * Search NPM registry for packages using npm CLI
 * @param packageName - Name of the package to search
 * @param limit - Maximum number of results
 * @param fetchMetadata - If true, return full metadata; if false, return only name and repository
 */
async function searchNpmPackage(
  packageName: string,
  limit: number,
  fetchMetadata: boolean
): Promise<PackageSearchAPIResult | PackageSearchError> {
  try {
    const result = await executeNpmCommand('search', [
      packageName,
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

    // Handle non-zero exit code
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

    // Parse JSON output
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

    // Bug #4 fix: Ensure we don't exceed the requested limit
    // npm CLI doesn't always respect --searchlimit
    searchResults = searchResults.slice(0, limit);

    // Bug #1 fix: Fetch repository URLs from npm registry API
    // npm search CLI doesn't include repository info
    const packages: PackageResult[] = await Promise.all(
      searchResults.map(async (pkg: NpmCliSearchResult) => {
        const repository = await fetchNpmRepository(pkg.name);

        // Default: return only name and repository
        if (!fetchMetadata) {
          return {
            name: pkg.name || packageName,
            repository,
          } as MinimalPackageResult;
        }

        // Full metadata requested
        const description = pkg.description || null;
        const truncatedDescription =
          description && description.length > MAX_DESCRIPTION_LENGTH
            ? description.substring(0, MAX_DESCRIPTION_LENGTH) + '...'
            : description;

        const keywords = (pkg.keywords || []).slice(0, MAX_KEYWORDS);

        return {
          name: pkg.name || packageName,
          version: pkg.version || 'latest',
          description: truncatedDescription,
          keywords,
          repository,
          license: undefined, // npm search --json doesn't include license
          homepage: pkg.links?.homepage || undefined,
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

/**
 * Search PyPI for Python packages
 * @param packageName - Name of the package to search
 * @param fetchMetadata - If true, return full metadata; if false, return only name and repository
 */
async function searchPythonPackage(
  packageName: string,
  fetchMetadata: boolean
): Promise<PackageSearchAPIResult | PackageSearchError> {
  // Normalize package name for PyPI API
  const normalizedName = packageName.toLowerCase().replace(/_/g, '-');

  // Try multiple name variations
  const namesToTry = [
    normalizedName,
    packageName.toLowerCase(),
    packageName,
    packageName.replace(/-/g, '_').toLowerCase(),
  ];

  // Remove duplicates
  const uniqueNames = [...new Set(namesToTry)];

  for (const nameToTry of uniqueNames) {
    try {
      const encodedName = encodeURIComponent(nameToTry);
      const response = await axios.get(
        `https://pypi.org/pypi/${encodedName}/json`,
        {
          timeout: 15000,
          headers: {
            Accept: 'application/json',
            'User-Agent': 'octocode-mcp/8.0.0',
          },
          validateStatus: status => status === 200,
        }
      );

      const packageInfo = response.data;
      if (!packageInfo.info) {
        continue;
      }

      const info = packageInfo.info;

      // Extract repository URL (case-insensitive key matching)
      let repositoryUrl: string | null = null;
      if (info.project_urls) {
        const urlKeys = [
          'source',
          'repository',
          'homepage',
          'source code',
          'github',
          'gitlab',
        ];
        // Get all keys from project_urls for case-insensitive matching
        const projectUrlKeys = Object.keys(info.project_urls);
        for (const targetKey of urlKeys) {
          const matchedKey = projectUrlKeys.find(
            k => k.toLowerCase() === targetKey
          );
          if (matchedKey) {
            const url = info.project_urls[matchedKey];
            if (
              url &&
              (url.includes('github') ||
                url.includes('gitlab') ||
                url.includes('bitbucket'))
            ) {
              repositoryUrl = url;
              break;
            }
          }
        }
      }

      // Fallback to home_page
      if (!repositoryUrl && info.home_page) {
        const homeUrl = info.home_page;
        if (
          homeUrl.includes('github') ||
          homeUrl.includes('gitlab') ||
          homeUrl.includes('bitbucket')
        ) {
          repositoryUrl = homeUrl;
        }
      }

      // Default: return only name and repository
      if (!fetchMetadata) {
        const minimalResult: MinimalPackageResult = {
          name: info.name || packageName,
          repository: repositoryUrl,
        };

        return {
          packages: [minimalResult],
          ecosystem: 'python',
          totalFound: 1,
        };
      }

      // Full metadata requested
      // Parse keywords
      let keywords: string[] = [];
      if (info.keywords) {
        if (typeof info.keywords === 'string') {
          keywords = info.keywords
            .split(/[,\s]+/)
            .filter((k: string) => k.trim());
        } else if (Array.isArray(info.keywords)) {
          keywords = info.keywords;
        }
      }
      keywords = keywords.slice(0, MAX_KEYWORDS);

      // Truncate description
      let description = info.summary || info.description || null;
      if (description && description.length > MAX_DESCRIPTION_LENGTH) {
        description = description.substring(0, MAX_DESCRIPTION_LENGTH) + '...';
      }

      const result: PythonPackageResult = {
        name: info.name || packageName,
        version: info.version || 'latest',
        description,
        keywords,
        repository: repositoryUrl,
        homepage: info.home_page || undefined,
        author: info.author || undefined,
        license: info.license || undefined,
      };

      return {
        packages: [result],
        ecosystem: 'python',
        totalFound: 1,
      };
    } catch (error) {
      // Continue to next name variation
      if (axios.isAxiosError(error) && error.response?.status === 404) {
        continue;
      }
      // For other errors, throw to be caught by outer handler
      throw error;
    }
  }

  // If we get here, all name variations failed - return empty result (not error)
  // This standardizes behavior with NPM which also returns empty for not found
  return {
    packages: [],
    ecosystem: 'python',
    totalFound: 0,
  };
}

// PyPI Simple API response interface
interface PyPISimpleProject {
  name: string;
}

interface PyPISimpleResponse {
  projects: PyPISimpleProject[];
}

// Cache for PyPI package list (700K+ packages, refresh every 24 hours)
let pypiPackageListCache: { names: string[]; timestamp: number } | null = null;
const PYPI_CACHE_TTL = 86400000; // 24 hours in ms

/**
 * Reset the PyPI package list cache
 * Exported for test isolation - call in beforeEach to prevent test pollution
 */
export function resetPyPICache(): void {
  pypiPackageListCache = null;
}

/**
 * Fetch PyPI package list from Simple API
 */
async function fetchPyPIPackageList(): Promise<string[]> {
  // Check cache
  if (
    pypiPackageListCache &&
    Date.now() - pypiPackageListCache.timestamp < PYPI_CACHE_TTL
  ) {
    return pypiPackageListCache.names;
  }

  const response = await axios.get<PyPISimpleResponse>(
    'https://pypi.org/simple/',
    {
      timeout: 30000,
      headers: {
        Accept: 'application/vnd.pypi.simple.v1+json',
        'User-Agent': 'octocode-mcp/8.0.0',
      },
    }
  );

  const names = response.data.projects.map(p => p.name);

  // Update cache
  pypiPackageListCache = { names, timestamp: Date.now() };

  return names;
}

/**
 * Fetch details for a single PyPI package
 */
async function fetchPyPIPackageDetails(
  packageName: string,
  fetchMetadata: boolean
): Promise<PackageResult | null> {
  try {
    const response = await axios.get(
      `https://pypi.org/pypi/${encodeURIComponent(packageName)}/json`,
      {
        timeout: 15000,
        headers: {
          Accept: 'application/json',
          'User-Agent': 'octocode-mcp/8.0.0',
        },
        validateStatus: status => status === 200,
      }
    );

    const info = response.data?.info;
    if (!info) return null;

    // Extract repository URL
    let repositoryUrl: string | null = null;
    if (info.project_urls) {
      const urlKeys = [
        'source',
        'repository',
        'homepage',
        'source code',
        'github',
        'gitlab',
      ];
      const projectUrlKeys = Object.keys(info.project_urls);
      for (const targetKey of urlKeys) {
        const matchedKey = projectUrlKeys.find(
          k => k.toLowerCase() === targetKey
        );
        if (matchedKey) {
          const url = info.project_urls[matchedKey];
          if (
            url &&
            (url.includes('github') ||
              url.includes('gitlab') ||
              url.includes('bitbucket'))
          ) {
            repositoryUrl = url;
            break;
          }
        }
      }
    }

    if (!repositoryUrl && info.home_page) {
      const homeUrl = info.home_page;
      if (
        homeUrl.includes('github') ||
        homeUrl.includes('gitlab') ||
        homeUrl.includes('bitbucket')
      ) {
        repositoryUrl = homeUrl;
      }
    }

    if (!fetchMetadata) {
      return {
        name: info.name || packageName,
        repository: repositoryUrl,
      } as MinimalPackageResult;
    }

    // Full metadata
    let keywords: string[] = [];
    if (info.keywords) {
      if (typeof info.keywords === 'string') {
        keywords = info.keywords
          .split(/[,\s]+/)
          .filter((k: string) => k.trim());
      } else if (Array.isArray(info.keywords)) {
        keywords = info.keywords;
      }
    }
    keywords = keywords.slice(0, MAX_KEYWORDS);

    let description = info.summary || info.description || null;
    if (description && description.length > MAX_DESCRIPTION_LENGTH) {
      description = description.substring(0, MAX_DESCRIPTION_LENGTH) + '...';
    }

    return {
      name: info.name || packageName,
      version: info.version || 'latest',
      description,
      keywords,
      repository: repositoryUrl,
      homepage: info.home_page || undefined,
      author: info.author || undefined,
      license: info.license || undefined,
    } as PythonPackageResult;
  } catch {
    return null;
  }
}

/**
 * Search PyPI packages using fuzzy matching via Simple API
 * @param query - Search query string
 * @param limit - Maximum number of results
 * @param fetchMetadata - If true, return full metadata
 */
async function searchPyPIPackagesFuzzy(
  query: string,
  limit: number,
  fetchMetadata: boolean
): Promise<PackageSearchAPIResult | PackageSearchError> {
  try {
    const allPackages = await fetchPyPIPackageList();
    const lowerQuery = query.toLowerCase();

    // Bug #3 fix: Add relevance ranking to prioritize better matches
    // Priority: exact match > starts with > contains
    const exactMatches = allPackages.filter(
      name => name.toLowerCase() === lowerQuery
    );

    const startsWithMatches = allPackages.filter(
      name =>
        name.toLowerCase().startsWith(lowerQuery) &&
        name.toLowerCase() !== lowerQuery
    );

    const containsMatches = allPackages.filter(
      name =>
        name.toLowerCase().includes(lowerQuery) &&
        !name.toLowerCase().startsWith(lowerQuery)
    );

    // Combine with priority order and limit
    const ranked = [...exactMatches, ...startsWithMatches, ...containsMatches];
    const matches = ranked.slice(0, limit);

    if (matches.length === 0) {
      // Fallback to exact match
      return searchPythonPackage(query, fetchMetadata);
    }

    // Fetch details for each match in parallel
    const packagePromises = matches.map(name =>
      fetchPyPIPackageDetails(name, fetchMetadata)
    );
    const results = await Promise.all(packagePromises);
    const packages = results.filter(
      (pkg): pkg is PackageResult => pkg !== null
    );

    return {
      packages,
      ecosystem: 'python',
      totalFound: packages.length,
    };
  } catch {
    // Fallback to exact match on error
    return searchPythonPackage(query, fetchMetadata);
  }
}

/**
 * Check if an npm package is deprecated using npm view
 * @param packageName - Name of the package to check
 * @returns Deprecation info or null if check failed
 */
export async function checkNpmDeprecation(
  packageName: string
): Promise<DeprecationInfo | null> {
  try {
    const result = await executeNpmCommand('view', [
      packageName,
      'deprecated',
      '--json',
    ]);

    // Command failed - return null to indicate we couldn't check
    if (result.error || result.exitCode !== 0) {
      return null;
    }

    const output = result.stdout.trim();

    // Empty output or "undefined" means not deprecated
    if (!output || output === 'undefined' || output === '') {
      return { deprecated: false };
    }

    // Parse the deprecation message
    try {
      const message = JSON.parse(output);
      return {
        deprecated: true,
        message:
          typeof message === 'string' ? message : 'This package is deprecated',
      };
    } catch {
      // If JSON parse fails but there's output, it's likely deprecated
      return {
        deprecated: true,
        message: output,
      };
    }
  } catch {
    return null;
  }
}
