import { describe, expect, it } from 'vitest';
import {
  buildPaginationHints,
  mapCodeSearchProviderResult,
  mapCodeSearchToolQuery,
  mapPullRequestToolQuery,
  mapRepoSearchProviderRepositories,
  mapRepoStructureProviderResult,
} from '../../src/tools/providerMappers.js';

describe('providerMappers', () => {
  it('should map code search tool queries to provider queries', () => {
    expect(
      mapCodeSearchToolQuery({
        keywordsToSearch: ['needle'],
        owner: 'owner',
        repo: 'repo',
        path: 'src',
      })
    ).toEqual(
      expect.objectContaining({
        keywords: ['needle'],
        projectId: 'owner/repo',
        path: 'src',
      })
    );
  });

  it('should map code search provider results into tool output shape', () => {
    const result = mapCodeSearchProviderResult(
      {
        items: [
          {
            path: 'src/index.ts',
            matches: [{ context: 'const test = 1;', positions: [] }],
            url: '',
            repository: {
              id: '1',
              name: 'owner/repo',
              url: '',
            },
          },
        ],
        totalCount: 1,
        pagination: {
          currentPage: 1,
          totalPages: 1,
          hasMore: false,
          totalMatches: 1,
        },
      },
      {
        keywordsToSearch: ['test'],
      }
    );

    expect(result.files).toEqual([
      expect.objectContaining({
        path: 'src/index.ts',
        owner: 'owner',
        repo: 'repo',
        text_matches: [{ value: 'const test = 1;' }],
      }),
    ]);
  });

  it('should preserve subgroup owners when mapping code search results', () => {
    const result = mapCodeSearchProviderResult(
      {
        items: [
          {
            path: 'src/index.ts',
            matches: [{ context: 'const test = 1;', positions: [] }],
            url: '',
            repository: {
              id: '1',
              name: 'group/subgroup/repo',
              url: '',
            },
          },
        ],
        totalCount: 1,
        pagination: {
          currentPage: 1,
          totalPages: 1,
          hasMore: false,
          totalMatches: 1,
        },
      },
      {
        keywordsToSearch: ['test'],
      }
    );

    expect(result.files).toEqual([
      expect.objectContaining({
        owner: 'group/subgroup',
        repo: 'repo',
      }),
    ]);
  });

  it('should preserve subgroup owners when mapping repository results', () => {
    const result = mapRepoSearchProviderRepositories([
      {
        id: '1',
        name: 'repo',
        fullPath: 'group/subgroup/repo',
        description: 'test',
        url: 'https://example.com/group/subgroup/repo',
        cloneUrl: 'https://example.com/group/subgroup/repo.git',
        defaultBranch: 'main',
        stars: 0,
        forks: 0,
        visibility: 'public',
        topics: [],
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
        lastActivityAt: '2024-01-01T00:00:00Z',
      },
    ]);

    expect(result[0]).toMatchObject({
      owner: 'group/subgroup',
      repo: 'repo',
    });
  });

  it('should preserve owner in code search query when repo is absent', () => {
    const result = mapCodeSearchToolQuery({
      keywordsToSearch: ['refund'],
      owner: 'wix-private',
    });

    expect(result.projectId).toBeUndefined();
    expect(result.owner).toBe('wix-private');
  });

  it('should preserve owner in PR search query when repo is absent', () => {
    const result = mapPullRequestToolQuery({
      owner: 'wix-private',
      state: 'open',
    });

    expect(result.projectId).toBeUndefined();
    expect(result.owner).toBe('wix-private');
  });

  it('should set both projectId and owner in code search when both are provided', () => {
    const result = mapCodeSearchToolQuery({
      keywordsToSearch: ['test'],
      owner: 'facebook',
      repo: 'react',
    });

    expect(result.projectId).toBe('facebook/react');
    expect(result.owner).toBe('facebook');
  });

  it('should set both projectId and owner in PR search when both are provided', () => {
    const result = mapPullRequestToolQuery({
      owner: 'facebook',
      repo: 'react',
      state: 'open',
    });

    expect(result.projectId).toBe('facebook/react');
    expect(result.owner).toBe('facebook');
  });

  it('should build pagination hints with stable wording', () => {
    expect(
      buildPaginationHints(
        {
          currentPage: 2,
          totalPages: 3,
          hasMore: true,
          totalMatches: 25,
          perPage: 10,
        },
        'matches'
      )
    ).toContain('Next: page=3');
  });

  it('should include branch fallback details for repo structure results', () => {
    const result = mapRepoStructureProviderResult(
      {
        projectPath: 'owner/repo',
        branch: 'main',
        defaultBranch: 'main',
        path: '',
        structure: {},
        summary: {
          totalFiles: 0,
          totalFolders: 0,
          truncated: false,
        },
      },
      {
        owner: 'owner',
        repo: 'repo',
        branch: 'feature-x',
      },
      {},
      'feature-x'
    );

    expect(result).toHaveProperty('branchFallback');
  });
});
