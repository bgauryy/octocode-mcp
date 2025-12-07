import type { NpmPackageResult } from './package.js';

/**
 * Known mappings from npm scopes to GitHub organizations.
 * Add new mappings here when discovered.
 */
const SCOPE_TO_ORG: Record<string, string> = {
  wix: 'wix-private',
  types: 'DefinitelyTyped',
  babel: 'babel',
  angular: 'angular',
  vue: 'vuejs',
  react: 'facebook',
  modelcontextprotocol: 'modelcontextprotocol',
  vercel: 'vercel',
  nextjs: 'vercel',
  prisma: 'prisma',
  trpc: 'trpc',
};

/**
 * Known package name to repository mappings.
 * Useful for packages where the repo name doesn't match the package name.
 */
const KNOWN_PACKAGE_REPOS: Record<string, string> = {
  '@wix/design-system': 'https://github.com/wix-private/wix-design-systems',
  '@types/node': 'https://github.com/DefinitelyTyped/DefinitelyTyped',
  '@modelcontextprotocol/sdk':
    'https://github.com/modelcontextprotocol/typescript-sdk',
};

/**
 * Attempts to infer the GitHub repository for an npm package
 * when the npm registry doesn't have the repository field.
 *
 * Uses heuristics and known mappings - no API calls required.
 */
export function tryInferRepoUrl(
  packageName: string,
  existingResult: NpmPackageResult
): NpmPackageResult {
  // Skip if we already have a repo URL
  if (existingResult.repoUrl) {
    return existingResult;
  }

  // Check known package mappings first
  const knownRepo = KNOWN_PACKAGE_REPOS[packageName];
  if (knownRepo) {
    return {
      ...existingResult,
      repoUrl: knownRepo,
    };
  }

  // Try to infer from scoped package name
  const inferredUrl = inferRepoFromPackageName(packageName);
  if (inferredUrl) {
    return {
      ...existingResult,
      repoUrl: inferredUrl,
    };
  }

  return existingResult;
}

/**
 * Infer GitHub repo URL from package name using common patterns.
 */
function inferRepoFromPackageName(packageName: string): string | null {
  if (!packageName.startsWith('@')) {
    return null;
  }

  const parts = packageName.split('/');
  if (parts.length !== 2) {
    return null;
  }

  const scope = parts[0]?.slice(1); // Remove @ prefix
  const name = parts[1];

  if (!scope || !name) {
    return null;
  }

  const org = SCOPE_TO_ORG[scope];
  if (!org) {
    return null;
  }

  // For @types packages, they all live in DefinitelyTyped
  if (scope === 'types') {
    return 'https://github.com/DefinitelyTyped/DefinitelyTyped';
  }

  // Common pattern: @scope/package-name -> org/package-name
  return `https://github.com/${org}/${name}`;
}

/**
 * Add a new known package to repo mapping at runtime.
 * Useful for caching discovered mappings.
 */
export function addKnownPackageRepo(
  packageName: string,
  repoUrl: string
): void {
  KNOWN_PACKAGE_REPOS[packageName] = repoUrl;
}

/**
 * Get the GitHub organization for a given npm scope.
 */
export function getOrgForScope(scope: string): string | undefined {
  return SCOPE_TO_ORG[scope];
}
