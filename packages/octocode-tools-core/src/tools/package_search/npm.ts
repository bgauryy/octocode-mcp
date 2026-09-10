import { searchPackage } from '../../utils/package/common.js';
import type {
  PackageResult,
  NpmPackageResult,
} from '../../utils/package/types.js';
import type {
  Artifact,
  ArtifactProviderResult,
  ArtifactProviderState,
} from '../../utils/artifact/types.js';
import { ArtifactProviderError } from '../../utils/artifact/index.js';
import type { ArtifactPageQuery } from './pagination.js';
import { isPackageNotFoundError } from './queryHelpers.js';

// npm's shorthand repository hosts (`github:owner/repo`, `gitlab:…`,
// `bitbucket:…`) map to these canonical hosts.
const SHORTHAND_REPO_HOSTS: Record<string, string> = {
  github: 'github.com',
  gitlab: 'gitlab.com',
  bitbucket: 'bitbucket.org',
};

/**
 * Normalize the many repository URL shapes npm packages carry
 * (ssh://git@…, git+https://…, git://…, git@host:owner/repo, and npm's
 * `github:owner/repo` / `gitlab:` / `bitbucket:` shorthands) into a
 * canonical `https://host/owner/repo` form. Falls back to the cleaned
 * original when the shape is unrecognized.
 */
export function normalizeRepoUrl(
  url: string | null | undefined
): string | undefined {
  if (!url) return undefined;
  let u = url.trim();
  if (!u) return undefined;

  // Strip leading VCS prefixes: git+https://, git+ssh://, git+ (etc.)
  u = u.replace(/^git\+/, '');
  // Drop a trailing .git suffix.
  const stripGit = (s: string): string => s.replace(/\.git$/, '');

  // npm shorthand: github:owner/repo, gitlab:owner/repo, bitbucket:owner/repo.
  // Must run before the scheme match — these have no `//` so they'd otherwise
  // fall through to the bare-form branch and never resolve to a GitHub repo.
  const shorthandMatch = u.match(/^(github|gitlab|bitbucket):(.+)$/i);
  if (shorthandMatch && shorthandMatch[1] && shorthandMatch[2]) {
    const host = SHORTHAND_REPO_HOSTS[shorthandMatch[1].toLowerCase()];
    return stripGit(`https://${host}/${shorthandMatch[2]}`);
  }

  // scp-like syntax: git@github.com:owner/repo(.git)
  const scpMatch = u.match(/^[^@/]+@([^:/]+):(.+)$/);
  if (scpMatch && scpMatch[1] && scpMatch[2]) {
    return stripGit(`https://${scpMatch[1]}/${scpMatch[2]}`);
  }

  // ssh://git@host/owner/repo, git://host/owner/repo, https://host/owner/repo
  const schemeMatch = u.match(/^(?:ssh|git|https?):\/\/(.+)$/);
  if (schemeMatch && schemeMatch[1]) {
    // Drop any userinfo (e.g. git@) from the authority component.
    const rest = schemeMatch[1].replace(/^[^@/]+@/, '');
    return stripGit(`https://${rest}`);
  }

  // Bare owner/repo or unknown shape: return cleaned form unchanged.
  return stripGit(u);
}

function isNpm(pkg: PackageResult): pkg is NpmPackageResult {
  return 'npmUrl' in pkg;
}

export function formatPackageData(
  pkg: PackageResult,
  registry = 'https://registry.npmjs.org'
): Artifact {
  const name = isNpm(pkg) && pkg.path ? pkg.path : pkg.name;
  const repository = normalizeRepoUrl(
    isNpm(pkg) ? pkg.repoUrl : pkg.repository
  );
  return {
    type: 'npm',
    name,
    registryUrl: `${registry.replace(/\/$/, '')}/${encodeURIComponent(name)}`,
    ...(isNpm(pkg)
      ? {
          ...(pkg.version && pkg.version !== 'unknown'
            ? { version: pkg.version }
            : {}),
          ...(pkg.description ? { description: pkg.description } : {}),
          ...(pkg.license ? { license: pkg.license } : {}),
          ...(pkg.homepage ? { homepage: pkg.homepage } : {}),
          ...(pkg.repositoryDirectory
            ? {
                repositoryDirectory: pkg.repositoryDirectory
                  .replace(/^\.\//, '')
                  .replace(/^\//, ''),
              }
            : {}),
        }
      : {}),
    ...(repository ? { repository } : {}),
  };
}

export async function searchNpmArtifacts(
  query: ArtifactPageQuery,
  state: ArtifactProviderState
): Promise<ArtifactProviderResult & { registry?: string }> {
  const isKeyword = query.keywords !== undefined;
  const size = query.pageSize ?? 10;
  const offset = state.offset ?? 0;
  const result = await searchPackage({
    name: query.packageName ?? query.keywords!.join(' '),
    registry: query.registry,
    mode: isKeyword ? 'keywords' : 'exact',
    ...(isKeyword ? { offset, itemsPerPage: size } : {}),
  });
  if ('error' in result) {
    if (!isKeyword && isPackageNotFoundError(result.error))
      return { artifacts: [], total: 0 };
    const code = /\b(?:401|403)\b|authentication/i.test(result.error)
      ? 'authentication'
      : /\b429\b|rate.?limit/i.test(result.error)
        ? 'rate_limit'
        : 'provider_error';
    throw new ArtifactProviderError(code, result.error);
  }
  const hasMore =
    isKeyword && offset + result.packages.length < result.totalFound;
  return {
    artifacts: result.packages.map(pkg =>
      formatPackageData(pkg, result.registry ?? query.registry)
    ),
    total: result.totalFound,
    ...(result.registry ? { registry: result.registry } : {}),
    ...(hasMore && result.packages.length
      ? { nextState: { offset: offset + result.packages.length } }
      : {}),
    ...(hasMore && !result.packages.length
      ? {
          terminalLimit: {
            reason: 'npm returned an empty page before its reported total.',
          },
        }
      : {}),
  };
}
