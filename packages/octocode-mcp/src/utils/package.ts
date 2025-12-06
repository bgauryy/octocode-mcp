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

/**
 * Search for a package based on the query
 */
export async function searchPackage(
  query: PackageSearchInput
): Promise<PackageSearchAPIResult | PackageSearchError> {
  const fetchMetadata = query.npmFetchMetadata ?? false;
  const cacheKey = generateCacheKey(
    query.ecosystem === 'npm' ? 'npm-search' : 'pypi-search',
    { name: query.name, limit: query.searchLimit, metadata: fetchMetadata }
  );

  return withDataCache(
    cacheKey,
    async () => {
      if (query.ecosystem === 'npm') {
        return searchNpmPackage(
          query.name,
          query.searchLimit ?? 1,
          fetchMetadata
        );
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

    // Return minimal or full results based on fetchMetadata flag
    const packages: PackageResult[] = searchResults.map(
      (pkg: NpmCliSearchResult) => {
        const repository = pkg.links?.repository || null;

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
      }
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
