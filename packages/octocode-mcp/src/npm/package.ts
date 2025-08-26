import axios from 'axios';
import { executeNpmCommand } from '../utils/exec';
import {
  NpmPackageSearchBuilder,
  NpmPackageViewBuilder,
} from './NpmCommandBuilder';
import { generateCacheKey, withCache } from '../utils/cache';
import {
  toDDMMYYYY,
  humanizeBytes,
  simplifyRepoUrl,
  createResult,
} from '../responses';
import {
  PackageSearchResult,
  PackageSearchError,
  BasicPackageSearchResult,
  EnhancedPackageMetadata,
  PythonPackageMetadata,
  OptimizedNpmPackageResult,
} from '../scheme/package_search';
import { NpmPackage, PythonPackage } from '../tools/types';
import {
  PackageSearchBulkParams,
  NpmPackageQuery,
  PythonPackageQuery,
} from '../tools/types';
import { CallToolResult } from '@modelcontextprotocol/sdk/types';
import { isNPMEnabled } from './npmAPI';

const MAX_DESCRIPTION_LENGTH = 100;
const MAX_KEYWORDS = 10;

export async function searchPackagesAPI(
  params: PackageSearchBulkParams
): Promise<
  PackageSearchResult | PackageSearchError | BasicPackageSearchResult
> {
  try {
    // Check NPM availability internally
    const npmEnabled = await isNPMEnabled();

    // Use bulk format directly
    let normalizedNpmQueries: NpmPackageQuery[] = npmEnabled
      ? params.npmPackages || []
      : [];
    let normalizedPythonQueries: PythonPackageQuery[] =
      params.pythonPackages || [];

    // Apply global defaults
    const globalDefaults = {
      searchLimit: params.searchLimit || 1,
      npmSearchStrategy: params.npmSearchStrategy || 'individual',
      npmFetchMetadata: params.npmFetchMetadata || false,
    };

    if (npmEnabled) {
      normalizedNpmQueries = normalizedNpmQueries.map(query => ({
        ...query,
        searchLimit: query.searchLimit ?? globalDefaults.searchLimit,
        npmSearchStrategy:
          query.npmSearchStrategy ?? globalDefaults.npmSearchStrategy,
        npmFetchMetadata:
          query.npmFetchMetadata ?? globalDefaults.npmFetchMetadata,
      }));
    }

    normalizedPythonQueries = normalizedPythonQueries.map(query => ({
      ...query,
      searchLimit: query.searchLimit ?? globalDefaults.searchLimit,
    }));

    if (
      normalizedNpmQueries.length === 0 &&
      normalizedPythonQueries.length === 0
    ) {
      return {
        error: 'No valid package queries found after processing parameters',
        hints: [
          'Ensure package names are not empty strings',
          'Check array format for bulk queries',
          npmEnabled
            ? 'Provide npmPackages or pythonPackages arrays with package objects'
            : 'Provide pythonPackages array with package objects',
        ],
      };
    }

    const errors: { npm: string[]; python: string[] } = {
      npm: [],
      python: [],
    };

    // Create concurrent search promises
    const searchPromises: Promise<{
      type: 'npm' | 'python';
      packages: (NpmPackage | PythonPackage)[];
      errors: string[];
    }>[] = [];

    // Add Python search promise if specified
    if (normalizedPythonQueries.length > 0) {
      const pythonSearchPromises = normalizedPythonQueries.map(query => {
        return searchPythonPackage(query.name)
          .then(pythonPackage => ({
            type: 'python' as const,
            packages: pythonPackage ? [pythonPackage] : [],
            errors: pythonPackage
              ? []
              : [`Python package '${query.name}' not found on PyPI`],
          }))
          .catch(error => {
            const errorMsg =
              error instanceof Error ? error.message : String(error);
            return {
              type: 'python' as const,
              packages: [],
              errors: [`Python search failed for '${query.name}': ${errorMsg}`],
            };
          });
      });

      searchPromises.push(
        Promise.all(pythonSearchPromises).then(results => {
          const allPackages = results.flatMap(r => r.packages);
          const allErrors = results.flatMap(r => r.errors);
          return {
            type: 'python' as const,
            packages: allPackages,
            errors: allErrors,
          };
        })
      );
    }

    // Add NPM search promises if specified and NPM is enabled
    if (npmEnabled && normalizedNpmQueries.length > 0) {
      const npmSearchPromises = normalizedNpmQueries.map(query => {
        return searchNpmPackage(query.name, query.searchLimit || 1)
          .then(packages => ({
            type: 'npm' as const,
            packages,
            errors:
              packages.length === 0
                ? [`NPM package '${query.name}' not found`]
                : [],
          }))
          .catch(error => {
            const errorMsg =
              error instanceof Error ? error.message : String(error);
            return {
              type: 'npm' as const,
              packages: [],
              errors: [`NPM search failed for '${query.name}': ${errorMsg}`],
            };
          });
      });

      searchPromises.push(
        Promise.all(npmSearchPromises).then(results => {
          const allPackages = results.flatMap(r => r.packages);
          const allErrors = results.flatMap(r => r.errors);
          return {
            type: 'npm' as const,
            packages: allPackages,
            errors: allErrors,
          };
        })
      );
    }

    // Execute all searches concurrently
    const searchResults = await Promise.all(searchPromises);

    // Aggregate results by type
    const npmPackages: NpmPackage[] = [];
    const pythonPackages: PythonPackage[] = [];

    for (const result of searchResults) {
      if (result.type === 'npm') {
        npmPackages.push(...(result.packages as NpmPackage[]));
        errors.npm.push(...result.errors);
      } else {
        pythonPackages.push(...(result.packages as PythonPackage[]));
        errors.python.push(...result.errors);
      }
    }

    const deduplicatedNpmPackages = deduplicatePackagesOptimized(npmPackages);
    const deduplicatedPythonPackages =
      deduplicatePackagesOptimized(pythonPackages);
    const totalCount =
      deduplicatedNpmPackages.length + deduplicatedPythonPackages.length;

    if (totalCount === 0) {
      return {
        error: 'No packages found',
        errors,
        hints: generateSearchFailureHints(
          errors,
          normalizedNpmQueries,
          normalizedPythonQueries,
          npmEnabled
        ),
      };
    }

    // Check if enhanced metadata fetching is requested for NPM packages
    const shouldFetchMetadata =
      npmEnabled &&
      normalizedNpmQueries.some(q => q.npmFetchMetadata) &&
      deduplicatedNpmPackages.length > 0;

    if (shouldFetchMetadata) {
      try {
        // Fetch enhanced metadata
        const enhancedNpmResults = await fetchNpmMetadata(
          deduplicatedNpmPackages,
          normalizedNpmQueries
        );
        const enhancedPythonResults = createPythonMetadataResults(
          deduplicatedPythonPackages
        );

        const enhancedResult: PackageSearchResult = {
          total_count: totalCount,
        };

        if (Object.keys(enhancedNpmResults).length > 0) {
          enhancedResult.npm = enhancedNpmResults;
        }

        if (Object.keys(enhancedPythonResults).length > 0) {
          enhancedResult.python = enhancedPythonResults;
        }

        return enhancedResult;
      } catch (error) {
        // Fall back to basic response if metadata fetching fails
      }
    }

    // Return basic response format
    const basicResult: BasicPackageSearchResult = {
      total_count: totalCount,
      python: deduplicatedPythonPackages as unknown as Array<
        Record<string, unknown>
      >,
    };

    if (npmEnabled && deduplicatedNpmPackages.length > 0) {
      basicResult.npm = deduplicatedNpmPackages as unknown as Array<
        Record<string, unknown>
      >;
    }

    return basicResult;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    return {
      error: `Package search failed: ${errorMsg}`,
      hints: [
        'Check network connection',
        'Verify package names are correct',
        'Try again in a few moments',
      ],
    };
  }
}

async function searchNpmPackage(
  query: string,
  searchLimit: number
): Promise<NpmPackage[]> {
  const builder = new NpmPackageSearchBuilder();
  const args = builder.build({ query, searchLimit });

  const result = await executeNpmCommand('search', args, {
    cache: true,
  });

  if (!result.isError && result.content?.[0]?.text) {
    const responseText = result.content[0].text as string;

    try {
      // Try to parse as wrapped response first
      const maybeWrapped = JSON.parse(responseText);

      // Check if this looks like a wrapped response (has data field)
      if (
        maybeWrapped &&
        typeof maybeWrapped === 'object' &&
        'data' in maybeWrapped
      ) {
        // This is a wrapped response, extract the npm output
        return parseNpmSearchOutput(maybeWrapped.data || '');
      } else {
        // This is direct npm output (test mocks)
        return parseNpmSearchOutput(responseText);
      }
    } catch (parseError) {
      throw new Error('Failed to parse npm search response');
    }
  } else {
    throw new Error(String(result.content?.[0]?.text) || 'Unknown NPM error');
  }
}

async function searchPythonPackage(
  packageName: string
): Promise<PythonPackage | null> {
  // Normalize package name for PyPI API (lowercase, underscores to hyphens)
  const normalizedName = packageName.toLowerCase().replace(/_/g, '-');

  // Also try variations with underscores instead of hyphens
  const alternativeNames = [
    normalizedName,
    packageName.toLowerCase(),
    packageName,
    packageName.replace(/-/g, '_').toLowerCase(), // Try underscore version
  ];

  // Remove duplicates while preserving order
  const uniqueNames = [...new Set(alternativeNames)];

  for (const nameToTry of uniqueNames) {
    try {
      // URL encode the package name to handle special characters
      const encodedName = encodeURIComponent(nameToTry);

      // Use axios with proper security headers and timeout
      const response = await axios.get(
        `https://pypi.org/pypi/${encodedName}/json`,
        {
          timeout: 15000,
          headers: {
            'User-Agent': 'octocode-mcp/2.3.21',
            Accept: 'application/json',
          },
          validateStatus: status => status === 200,
        }
      );

      const packageInfo = response.data;

      // Validate response structure
      if (!packageInfo.info || packageInfo.message?.includes('Not Found')) {
        continue;
      }

      const info = packageInfo.info;

      // Extract repository URL with improved logic
      let repositoryUrl: string | null = null;

      // Check multiple possible sources for repository URL
      if (info.project_urls) {
        const urlKeys = [
          'Source',
          'Repository',
          'Homepage',
          'Source Code',
          'GitHub',
          'GitLab',
          'Bitbucket',
        ];
        for (const key of urlKeys) {
          const url = info.project_urls[key];
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

      // Fallback to home_page if no repository found
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

      // Parse keywords properly
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

      // Limit keywords to prevent oversized responses
      keywords = keywords.slice(0, MAX_KEYWORDS);

      // Truncate description if too long
      let description = info.summary || info.description || null;
      if (description && description.length > MAX_DESCRIPTION_LENGTH) {
        description = description.substring(0, MAX_DESCRIPTION_LENGTH) + '...';
      }

      // Return package in NpmPackage format (success - return immediately)
      return {
        name: info.name || packageName,
        version: info.version || 'latest',
        description,
        keywords,
        repository: repositoryUrl,
      };
    } catch (error) {
      // Continue to next name variation
      continue;
    }
  }

  // If we get here, all name variations failed
  return null;
}

export function parseNpmSearchOutput(output: string): NpmPackage[] {
  try {
    const parsed = JSON.parse(output);
    let packages: Array<{
      name?: string;
      version?: string;
      description?: string;
      keywords?: string[];
      links?: { repository?: string };
      repository?: { url?: string };
    }> = [];

    // Handle different npm search output formats
    if (Array.isArray(parsed)) {
      // Direct array format (npm CLI --json output)
      packages = parsed;
    } else if (parsed.result) {
      // Wrapped format (from executeNpmCommand)
      const commandResult = parsed.result;
      if (Array.isArray(commandResult)) {
        packages = commandResult;
      } else if (
        commandResult?.objects &&
        Array.isArray(commandResult.objects)
      ) {
        packages = commandResult.objects.map(
          (obj: {
            package?: {
              name?: string;
              version?: string;
              description?: string;
              keywords?: string[];
              links?: { repository?: string };
              repository?: { url?: string };
            };
            [key: string]: unknown;
          }) => obj.package || obj
        );
      } else if (
        commandResult?.results &&
        Array.isArray(commandResult.results)
      ) {
        packages = commandResult.results;
      }
    } else if (parsed?.objects && Array.isArray(parsed.objects)) {
      packages = parsed.objects.map(
        (obj: {
          package?: {
            name?: string;
            version?: string;
            description?: string;
            keywords?: string[];
            links?: { repository?: string };
            repository?: { url?: string };
          };
          [key: string]: unknown;
        }) => obj.package || obj
      );
    } else if (parsed?.results && Array.isArray(parsed.results)) {
      packages = parsed.results;
    }

    return packages.map(normalizePackage);
  } catch (error) {
    return [];
  }
}

function normalizePackage(pkg: {
  name?: string;
  version?: string;
  description?: string;
  keywords?: string[];
  links?: { repository?: string };
  repository?: { url?: string };
}): NpmPackage {
  const description = pkg.description || null;
  const truncatedDescription =
    description && description.length > MAX_DESCRIPTION_LENGTH
      ? description.substring(0, MAX_DESCRIPTION_LENGTH) + '...'
      : description;

  const keywords = pkg.keywords || [];
  const limitedKeywords = keywords.slice(0, MAX_KEYWORDS);

  // Extract repository URL from NPM CLI format
  let repositoryUrl = null;
  if (pkg.links?.repository) {
    repositoryUrl = pkg.links.repository;
  } else if (pkg.repository?.url) {
    repositoryUrl = pkg.repository.url;
  }

  return {
    name: pkg.name || '',
    version: pkg.version || '',
    description: truncatedDescription,
    keywords: limitedKeywords,
    repository: repositoryUrl,
  };
}

function deduplicatePackagesOptimized<T extends { name: string }>(
  packages: T[]
): T[] {
  const packageMap = new Map<string, T>();

  for (const pkg of packages) {
    if (!packageMap.has(pkg.name)) {
      packageMap.set(pkg.name, pkg);
    }
  }

  return Array.from(packageMap.values());
}

async function fetchNpmMetadata(
  packages: NpmPackage[],
  queries: NpmPackageQuery[]
): Promise<Record<string, EnhancedPackageMetadata>> {
  const results: Record<string, EnhancedPackageMetadata> = {};
  const batchSize = 5;

  // Create metadata promises
  const metadataPromises = packages.map(async pkg => {
    const query = queries.find(q => q.name === pkg.name);
    try {
      const metadataResult = await viewNpmPackage(
        pkg.name,
        query?.npmField,
        query?.npmMatch
      );

      if (metadataResult.isError) {
        // Fallback to basic data
        return {
          packageName: pkg.name,
          metadata: {
            gitURL: pkg.repository || '',
            metadata: {
              name: pkg.name,
              version: pkg.version,
              description: pkg.description || '',
              license: 'Unknown',
              repository: pkg.repository || '',
              size: 'Unknown',
              created: 'Unknown',
              updated: 'Unknown',
              versions: [],
              stats: { total_versions: 0 },
            } as OptimizedNpmPackageResult,
          },
        };
      }

      // Parse the npm view result
      const execResult = JSON.parse(metadataResult.content[0]?.text as string);
      let packageData;

      // Handle different response formats based on field/match parameters
      if (query?.npmField) {
        packageData = {
          name: pkg.name,
          [query.npmField]: execResult.result,
          version: pkg.version,
          description: pkg.description,
          repository: pkg.repository,
        };
      } else if (query?.npmMatch) {
        packageData = {
          name: pkg.name,
          ...execResult.result,
          version: execResult.result.version || pkg.version,
          description: execResult.result.description || pkg.description,
          repository: execResult.result.repository || pkg.repository,
        };
      } else {
        packageData = execResult.result;
      }

      // Transform to optimized format if full metadata was requested
      const optimizedMetadata =
        query?.npmField || query?.npmMatch
          ? packageData
          : transformNPMToOptimizedFormat(packageData);

      // Extract git URL (repository URL)
      const gitURL = optimizedMetadata.repository || pkg.repository || '';

      return {
        packageName: pkg.name,
        metadata: {
          gitURL,
          metadata: optimizedMetadata,
        },
      };
    } catch (error) {
      // Fallback to basic data on error
      return {
        packageName: pkg.name,
        metadata: {
          gitURL: pkg.repository || '',
          metadata: {
            name: pkg.name,
            version: pkg.version,
            description: pkg.description || '',
            license: 'Unknown',
            repository: pkg.repository || '',
            size: 'Unknown',
            created: 'Unknown',
            updated: 'Unknown',
            versions: [],
            stats: { total_versions: 0 },
          } as OptimizedNpmPackageResult,
        },
      };
    }
  });

  // Execute with rate limiting
  for (let i = 0; i < metadataPromises.length; i += batchSize) {
    const batch = metadataPromises.slice(i, i + batchSize);
    const batchResults = await Promise.all(batch);

    for (const result of batchResults) {
      results[result.packageName] = result.metadata;
    }
  }

  return results;
}

function createPythonMetadataResults(
  packages: PythonPackage[]
): Record<string, EnhancedPackageMetadata> {
  const results: Record<string, EnhancedPackageMetadata> = {};

  for (const pkg of packages) {
    const pythonMetadata: PythonPackageMetadata = {
      name: pkg.name,
      version: pkg.version,
      description: pkg.description,
      keywords: pkg.keywords,
      repository: pkg.repository,
    };

    results[pkg.name] = {
      gitURL: pkg.repository || '',
      metadata: pythonMetadata,
    };
  }

  return results;
}

async function viewNpmPackage(
  packageName: string,
  field?: string,
  match?: string | string[],
  sessionId?: string
): Promise<CallToolResult> {
  const cacheKey = generateCacheKey(
    'npm-view',
    { packageName, field, match },
    sessionId
  );

  return withCache(cacheKey, async () => {
    try {
      const builder = new NpmPackageViewBuilder();
      let args: string[];

      if (field) {
        args = builder.build({ packageName, field });
      } else if (match) {
        let parsedMatch = match;
        if (
          typeof match === 'string' &&
          match.startsWith('[') &&
          match.endsWith(']')
        ) {
          try {
            parsedMatch = JSON.parse(match);
          } catch (e) {
            parsedMatch = match;
          }
        }

        const matchFields = Array.isArray(parsedMatch)
          ? parsedMatch
          : [parsedMatch];
        args = builder.build({ packageName, match: matchFields });
      } else {
        args = builder.build({ packageName });
      }

      const result = await executeNpmCommand('view', args, {
        cache: false,
      });
      return result;
    } catch (error) {
      const errorMessage = (error as Error).message || '';

      if (errorMessage.includes('404')) {
        return createResult({
          error:
            'Package not found on NPM registry. Verify the exact package name',
        });
      }

      return createResult({
        error: 'Failed to execute NPM command. Check npm installation',
      });
    }
  });
}

export function transformNPMToOptimizedFormat(
  packageData: Record<string, unknown>
): OptimizedNpmPackageResult {
  // Extract repository URL and simplify
  const repoUrl =
    (packageData.repository as Record<string, unknown>)?.url ||
    (packageData.repositoryGitUrl as string) ||
    '';
  const repository = repoUrl ? simplifyRepoUrl(repoUrl as string) : '';

  // Simplify exports to essential entry points only
  const exports = packageData.exports
    ? simplifyNPMExports(packageData.exports)
    : undefined;

  // Get version timestamps from time object and limit to last 5
  const timeData = (packageData.time as Record<string, unknown>) || {};
  const versionList = Array.isArray(packageData.versions)
    ? (packageData.versions as string[])
    : [];
  const recentVersions = versionList.slice(-5).map((version: string) => ({
    version,
    date: timeData[version]
      ? toDDMMYYYY(timeData[version] as string)
      : 'Unknown',
  }));

  const result: OptimizedNpmPackageResult = {
    name: packageData.name as string,
    version: packageData.version as string,
    description: (packageData.description as string) || '',
    license: (packageData.license as string) || 'Unknown',
    repository,
    size: humanizeBytes(
      ((packageData.dist as Record<string, unknown>)?.unpackedSize as number) ||
        0
    ),
    created: timeData.created
      ? toDDMMYYYY(timeData.created as string)
      : 'Unknown',
    updated: timeData.modified
      ? toDDMMYYYY(timeData.modified as string)
      : 'Unknown',
    versions: recentVersions,
    stats: {
      total_versions: versionList.length,
      weekly_downloads: packageData.weeklyDownloads as number,
    },
  };

  // Add exports only if they exist and are useful
  if (exports && Object.keys(exports).length > 0) {
    result.exports = exports;
  }

  return result;
}

function simplifyNPMExports(exports: unknown): {
  main: string;
  types?: string;
  [key: string]: unknown;
} {
  if (typeof exports === 'string') {
    return { main: exports };
  }

  if (typeof exports === 'object' && exports !== null) {
    const exportsObj = exports as Record<string, unknown>;
    const simplified: Record<string, unknown> = {};

    // Extract main entry point
    if (exportsObj['.']) {
      const mainExport = exportsObj['.'];
      if (typeof mainExport === 'string') {
        simplified.main = mainExport;
      } else if (typeof mainExport === 'object' && mainExport !== null) {
        const mainExportObj = mainExport as Record<string, unknown>;
        if (mainExportObj.default) {
          simplified.main = mainExportObj.default;
        } else if (mainExportObj.import) {
          simplified.main = mainExportObj.import;
        }
      }
    }

    // Extract types if available with safe property access
    if (
      exportsObj['./types'] ||
      (exportsObj['.'] &&
        typeof exportsObj['.'] === 'object' &&
        exportsObj['.'] !== null &&
        (exportsObj['.'] as Record<string, unknown>).types)
    ) {
      simplified.types =
        exportsObj['./types'] ||
        (exportsObj['.'] as Record<string, unknown>).types;
    }

    // Add a few other important exports (max 3 total)
    let count = 0;
    for (const [key, value] of Object.entries(exportsObj)) {
      if (count >= 3 || key === '.' || key === './types') continue;
      if (key.includes('package.json') || key.includes('node_modules'))
        continue;

      simplified[key] =
        typeof value === 'object' && value !== null
          ? (value as Record<string, unknown>).default || value
          : value;
      count++;
    }

    return simplified as {
      main: string;
      types?: string;
      [key: string]: unknown;
    };
  }

  return { main: 'index.js' };
}

function generateSearchFailureHints(
  errors: { npm: string[]; python: string[] },
  npmQueries: NpmPackageQuery[],
  pythonQueries: PythonPackageQuery[],
  npmEnabled: boolean
): string[] {
  const hints: string[] = [];

  // Add specific errors
  if (errors.npm.length > 0) {
    hints.push('NPM Search Issues:');
    errors.npm.forEach(error => hints.push(`   ${error}`));
  }

  if (errors.python.length > 0) {
    hints.push('Python Search Issues:');
    errors.python.forEach(error => hints.push(`   ${error}`));
  }

  // Smart fallback suggestions
  const hasSpecificTerms = npmQueries.some(
    q => q.name.includes('-') || q.name.includes('@') || q.name.length > 15
  );

  const hasFrameworkTerms = npmQueries.some(q =>
    ['react', 'vue', 'angular', 'express', 'fastify'].some(fw =>
      q.name.toLowerCase().includes(fw)
    )
  );

  let fallbackSuggestions = [
    ' Try broader functional terms: "testing" instead of "jest-unit-test"',
    ' Remove version numbers or specific constraints',
    ' Use single keywords: "http" instead of "http-client-library"',
  ];

  if (hasSpecificTerms) {
    fallbackSuggestions = [
      ' Use simpler terms: "validation" instead of "schema-validation-library"',
      ' Try category terms: "database", "testing", "auth"',
      ...fallbackSuggestions.slice(1),
    ];
  }

  if (hasFrameworkTerms) {
    fallbackSuggestions.unshift(
      ' Try specific framework searches: "react hooks", "vue components"'
    );
  }

  // Add ecosystem-specific suggestions
  if (pythonQueries.length > 0 && errors.python.length > 0) {
    fallbackSuggestions.push(
      ' For Python: Try alternative names (e.g., "pillow" instead of "PIL")'
    );
    fallbackSuggestions.push(
      ' For Python: Check exact spelling on https://pypi.org'
    );
  }

  if (npmEnabled && npmQueries.length > 0 && errors.npm.length > 0) {
    fallbackSuggestions.push(
      ' For NPM: Check package availability on https://npmjs.com'
    );
    fallbackSuggestions.push(
      ' For NPM: Try searching with exact package names'
    );
  }

  hints.push(...fallbackSuggestions);

  return hints;
}
