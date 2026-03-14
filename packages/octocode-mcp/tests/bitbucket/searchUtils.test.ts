import { describe, it, expect } from 'vitest';
import {
  parseBitbucketRepositoryIdentityFromUrl,
  getBitbucketRepositoryIdentity,
  formatBitbucketRepositoryIdentity,
} from '../../src/bitbucket/searchUtils.js';
import type { BitbucketCodeSearchItem } from '../../src/bitbucket/types.js';

describe('parseBitbucketRepositoryIdentityFromUrl', () => {
  it('should parse standard repositories URL', () => {
    const result = parseBitbucketRepositoryIdentityFromUrl(
      'https://api.bitbucket.org/2.0/repositories/myworkspace/myrepo/src/main/file.ts'
    );
    expect(result).toEqual({ workspace: 'myworkspace', repoSlug: 'myrepo' });
  });

  it('should return undefined for empty href', () => {
    expect(parseBitbucketRepositoryIdentityFromUrl('')).toBeUndefined();
    expect(parseBitbucketRepositoryIdentityFromUrl(undefined)).toBeUndefined();
  });

  it('should handle URL-encoded segments', () => {
    const result = parseBitbucketRepositoryIdentityFromUrl(
      'https://api.bitbucket.org/2.0/repositories/my%20workspace/my%20repo/src'
    );
    expect(result).toEqual({
      workspace: 'my workspace',
      repoSlug: 'my repo',
    });
  });

  it('should handle invalid URL gracefully (catch path)', () => {
    const result = parseBitbucketRepositoryIdentityFromUrl(
      'not a valid url at all %%%'
    );
    expect(result).toBeUndefined();
  });

  it('should handle malformed percent-encoded segments', () => {
    const result = parseBitbucketRepositoryIdentityFromUrl(
      'https://api.bitbucket.org/2.0/repositories/ws%ZZ/repo/src'
    );
    expect(result).toBeDefined();
    expect(result!.workspace).toBe('ws%ZZ');
  });

  it('should parse URL without /repositories/ path (fallback)', () => {
    const result = parseBitbucketRepositoryIdentityFromUrl(
      'https://bitbucket.org/myworkspace/myrepo'
    );
    expect(result).toEqual({ workspace: 'myworkspace', repoSlug: 'myrepo' });
  });

  it('should return undefined for single-segment path with 2.0 prefix', () => {
    const result = parseBitbucketRepositoryIdentityFromUrl(
      'https://api.bitbucket.org/2.0'
    );
    expect(result).toBeUndefined();
  });

  it('should return undefined for path with only repositories keyword and no children', () => {
    const result = parseBitbucketRepositoryIdentityFromUrl(
      'https://api.bitbucket.org/2.0/repositories/ws'
    );
    expect(result).toBeUndefined();
  });
});

describe('getBitbucketRepositoryIdentity', () => {
  it('should extract identity from item with file links', () => {
    const item = {
      file: {
        links: {
          self: {
            href: 'https://api.bitbucket.org/2.0/repositories/ws/repo/src/main/file.ts',
          },
        },
      },
    } as unknown as BitbucketCodeSearchItem;

    const result = getBitbucketRepositoryIdentity(item);
    expect(result).toEqual({ workspace: 'ws', repoSlug: 'repo' });
  });

  it('should return undefined for item without file links', () => {
    const item = {} as BitbucketCodeSearchItem;
    const result = getBitbucketRepositoryIdentity(item);
    expect(result).toBeUndefined();
  });
});

describe('formatBitbucketRepositoryIdentity', () => {
  it('should format identity as workspace/repoSlug', () => {
    expect(
      formatBitbucketRepositoryIdentity({
        workspace: 'ws',
        repoSlug: 'repo',
      })
    ).toBe('ws/repo');
  });

  it('should return empty string for undefined identity', () => {
    expect(formatBitbucketRepositoryIdentity(undefined)).toBe('');
  });
});
