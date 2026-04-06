import type { BitbucketCodeSearchItem } from './types.js';

interface BitbucketRepositoryIdentity {
  workspace: string;
  repoSlug: string;
}

function safeDecodeURIComponent(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export function parseBitbucketRepositoryIdentityFromUrl(
  href?: string
): BitbucketRepositoryIdentity | undefined {
  if (!href) {
    return undefined;
  }

  try {
    const { pathname } = new URL(href);
    const segments = pathname
      .split('/')
      .filter(Boolean)
      .map(safeDecodeURIComponent);

    const repositoriesIndex = segments.indexOf('repositories');
    if (repositoriesIndex >= 0 && segments.length > repositoriesIndex + 2) {
      return {
        workspace: segments[repositoriesIndex + 1]!,
        repoSlug: segments[repositoriesIndex + 2]!,
      };
    }

    if (segments.length >= 2 && segments[0] !== '2.0') {
      return {
        workspace: segments[0]!,
        repoSlug: segments[1]!,
      };
    }
  } catch {
    return undefined;
  }

  return undefined;
}

export function getBitbucketRepositoryIdentity(
  item: BitbucketCodeSearchItem
): BitbucketRepositoryIdentity | undefined {
  return parseBitbucketRepositoryIdentityFromUrl(item.file?.links?.self?.href);
}

export function formatBitbucketRepositoryIdentity(
  identity?: BitbucketRepositoryIdentity
): string {
  return identity ? `${identity.workspace}/${identity.repoSlug}` : '';
}
