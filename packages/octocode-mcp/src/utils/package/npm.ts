import { executeNpmCommand } from '../exec/index.js';
import { fetchWithRetries } from '../http/fetch.js';
import { generateCacheKey, withDataCache } from '../http/cache.js';
import {
  PackageSearchAPIResult,
  PackageSearchError,
  NpmPackageResult,
  DeprecationInfo,
} from './common.js';
import {
  NpmViewResultSchema,
  NpmRegistrySearchSchema,
  NpmDeprecationOutputSchema,
} from './schemas.js';

const DEFAULT_NPM_REGISTRY = 'https://registry.npmjs.org';

let _cachedRegistryUrl: string | null = null;

/**
 * Get the npm registry URL from `npm config get registry`.
 * Falls back to https://registry.npmjs.org if the command fails.
 * Result is cached for the process lifetime.
 */
export async function getNpmRegistryUrl(): Promise<string> {
  if (_cachedRegistryUrl) return _cachedRegistryUrl;

  try {
    const result = await executeNpmCommand(
      'config',
      ['get', 'registry', '--no-workspaces'],
      { timeout: 10000 }
    );
    if (!result.error && result.exitCode === 0) {
      const url = result.stdout.trim().replace(/\/+$/, '');
      if (url && url.startsWith('http')) {
        _cachedRegistryUrl = url;
        return url;
      }
    }
  } catch {
    // Fall through to default
  }

  _cachedRegistryUrl = DEFAULT_NPM_REGISTRY;
  return DEFAULT_NPM_REGISTRY;
}

/** Reset cached registry URL (for testing only). */
export function _resetNpmRegistryUrlCache(): void {
  _cachedRegistryUrl = null;
}

/**
 * Check if the npm registry is reachable with a lightweight HEAD request.
 * Uses the registry URL from `npm config get registry`.
 *
 * A HEAD request avoids body parsing issues — some registries (e.g. JFrog
 * Artifactory) return 200 with an empty body on GET /, which breaks JSON
 * parsing in fetchWithRetries.
 */
export async function checkNpmRegistryReachable(): Promise<boolean> {
  try {
    const registryUrl = await getNpmRegistryUrl();
    const f = (globalThis as unknown as { fetch?: typeof fetch }).fetch;
    if (!f) return false;
    const res = await f(registryUrl, {
      method: 'HEAD',
      signal: AbortSignal.timeout(5000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

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

interface NpmRegistrySearchItem {
  name: string | null | undefined;
  version: string | null | undefined;
  description?: string | null;
  links?: {
    npm?: string | null;
    homepage?: string | null;
    repository?: string | null;
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

/**
 * Encode a package name for use in the npm registry URL.
 * Scoped packages (@scope/pkg) need the '/' encoded as %2F to avoid
 * being treated as a URL path separator.
 */
function encodeRegistryPackageName(packageName: string): string {
  if (packageName.startsWith('@')) {
    return '@' + packageName.slice(1).replace('/', '%2F');
  }
  return packageName;
}

async function fetchPackageDetailsWithError(
  packageName: string,
  includeExtendedMetadata: boolean = false
): Promise<{ pkg: NpmPackageResult | null; errorDetail?: string }> {
  try {
    const registryUrl = await getNpmRegistryUrl();
    const urlName = encodeRegistryPackageName(packageName);
    const url = `${registryUrl}/${urlName}/latest`;

    let raw: unknown;
    try {
      raw = await fetchWithRetries(url, {
        maxRetries: 1,
        initialDelayMs: 500,
        headers: { Accept: 'application/json' },
      });
    } catch (fetchErr) {
      const msg =
        fetchErr instanceof Error ? fetchErr.message : String(fetchErr);
      if (msg.includes('404') || msg.toLowerCase().includes('not found')) {
        return { pkg: null };
      }
      return { pkg: null, errorDetail: msg };
    }

    if (!raw || typeof raw !== 'object') {
      return { pkg: null };
    }

    const validation = NpmViewResultSchema.safeParse(raw);
    if (!validation.success) {
      return { pkg: null, errorDetail: 'Invalid npm registry response format' };
    }

    return {
      pkg: mapToResult(
        validation.data as NpmViewResult,
        includeExtendedMetadata
      ),
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return { pkg: null, errorDetail: msg };
  }
}

async function fetchPackageDetails(
  packageName: string,
  includeExtendedMetadata: boolean = false
): Promise<NpmPackageResult | null> {
  const { pkg } = await fetchPackageDetailsWithError(
    packageName,
    includeExtendedMetadata
  );
  return pkg;
}

async function fetchNpmPackageByView(
  packageName: string,
  fetchMetadata: boolean
): Promise<PackageSearchAPIResult | PackageSearchError> {
  const { pkg, errorDetail } = await fetchPackageDetailsWithError(
    packageName,
    fetchMetadata
  );

  if (!pkg) {
    if (errorDetail) {
      return {
        error: `NPM view failed for '${packageName}': ${errorDetail}`,
        hints: [
          'Ensure npm is installed and available in PATH',
          'Check package name for typos',
          `Try: npm view ${packageName} --json`,
        ],
      };
    }
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
    const registryUrl = await getNpmRegistryUrl();
    const url = `${registryUrl}/-/v1/search?text=${encodeURIComponent(keywords)}&size=${limit}`;

    let raw: unknown;
    try {
      raw = await fetchWithRetries(url, {
        maxRetries: 1,
        initialDelayMs: 500,
      });
    } catch (fetchErr) {
      const msg =
        fetchErr instanceof Error ? fetchErr.message : String(fetchErr);
      return {
        error: `NPM registry search failed: ${msg}`,
        hints: [
          'Check package name for typos',
          'Try searching with a simpler term',
        ],
      };
    }

    if (!raw || typeof raw !== 'object') {
      return { packages: [], ecosystem: 'npm', totalFound: 0 };
    }

    const validation = NpmRegistrySearchSchema.safeParse(raw);
    if (!validation.success) {
      const issues = validation.error.issues.map(i => i.message).join('; ');
      return {
        error: `Invalid npm registry search response format: ${issues}`,
        hints: [
          'Try a different search term',
          'Try searchLimit=1 for an exact package lookup',
        ],
      };
    }

    const searchResults = (
      validation.data.objects
        .map(obj => obj.package as NpmRegistrySearchItem)
        .filter(
          (pkg): pkg is NpmRegistrySearchItem & { name: string } =>
            typeof pkg.name === 'string' && pkg.name.length > 0
        ) as (NpmRegistrySearchItem & { name: string })[]
    ).slice(0, limit);

    const packages = await Promise.all(
      searchResults.map(async item => {
        if (fetchMetadata) {
          const details = await fetchPackageDetails(item.name, true);
          if (details) return details;
        }

        return {
          repoUrl:
            item.links?.repository && typeof item.links.repository === 'string'
              ? cleanRepoUrl(item.links.repository)
              : null,
          path: item.name,
          version: item.version ?? 'unknown',
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
      error: `NPM registry search failed: ${errorMsg}`,
      hints: [
        'Check package name for typos',
        'Try searching with a simpler term',
        'Ensure npm registry is accessible',
      ],
    };
  }
}

export async function searchNpmPackage(
  packageName: string,
  limit: number,
  fetchMetadata: boolean
): Promise<PackageSearchAPIResult | PackageSearchError> {
  const cacheKey = generateCacheKey('npm-search', {
    name: packageName,
    limit,
    metadata: fetchMetadata,
  });

  return withDataCache(
    cacheKey,
    async () => {
      // If limit is > 1, we want to see alternatives, so force a search
      // even if the name looks like an exact match.
      if (limit === 1 && isExactPackageName(packageName)) {
        return fetchNpmPackageByView(packageName, fetchMetadata);
      }
      return searchNpmPackageViaSearch(packageName, limit, fetchMetadata);
    },
    {
      // Don't cache errors or empty results. Empty results may indicate
      // transient npm failures (e.g. shebang PATH issues, network errors)
      // and should be retried on the next call instead of being stuck for
      // the entire cache TTL (4 hours).
      shouldCache: result => {
        if ('error' in result) return false;
        if ('totalFound' in result && result.totalFound === 0) return false;
        return true;
      },
    }
  );
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
      const raw = JSON.parse(output);
      const validation = NpmDeprecationOutputSchema.safeParse(raw);
      const message = validation.success ? validation.data : output;
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
