import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockGET = vi.fn();
vi.mock('../../src/bitbucket/client.js', () => ({
  getBitbucketClient: vi.fn(() => ({ GET: mockGET })),
  getAuthHeader: vi.fn(() => 'Bearer test-token'),
}));

vi.mock('../../src/bitbucketConfig.js', () => ({
  getBitbucketHost: vi.fn(() => 'https://api.bitbucket.org/2.0'),
  getBitbucketToken: vi.fn(() => 'test-token'),
  getBitbucketUsername: vi.fn(() => null),
}));

import { searchBitbucketPRsAPI } from '../../src/bitbucket/pullRequestSearch.js';

const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('searchBitbucketPRsAPI', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return error when workspace is missing', async () => {
    const result = await searchBitbucketPRsAPI({
      workspace: '',
      repoSlug: 'repo',
    });
    expect(result).toHaveProperty('error');
    expect((result as { status: number }).status).toBe(400);
  });

  it('should return error when repoSlug is missing', async () => {
    const result = await searchBitbucketPRsAPI({
      workspace: 'ws',
      repoSlug: '',
    });
    expect(result).toHaveProperty('error');
    expect((result as { status: number }).status).toBe(400);
  });

  describe('single PR fetch', () => {
    it('should fetch a single PR by number', async () => {
      mockGET.mockResolvedValue({
        data: {
          id: 42,
          title: 'Fix bug',
          description: 'A fix',
          state: 'OPEN',
          author: { display_name: 'john', uuid: '{u}' },
          source: { branch: { name: 'fix' }, commit: { hash: 'abc' } },
          destination: { branch: { name: 'main' }, commit: { hash: 'def' } },
          created_on: '2024-01-01T00:00:00Z',
          updated_on: '2024-01-02T00:00:00Z',
        },
      });

      const result = await searchBitbucketPRsAPI({
        workspace: 'ws',
        repoSlug: 'repo',
        prNumber: 42,
      });

      expect(result).toHaveProperty('data');
      const data = (
        result as {
          data: { pullRequests: Array<{ id: number; title: string }> };
        }
      ).data;
      expect(data.pullRequests).toHaveLength(1);
      expect(data.pullRequests[0]!.id).toBe(42);
      expect(data.pullRequests[0]!.title).toBe('Fix bug');
    });

    it('should fetch PR with comments when withComments=true', async () => {
      mockGET.mockResolvedValue({
        data: {
          id: 1,
          title: 'PR',
          state: 'OPEN',
          author: { display_name: 'user', uuid: '{u}' },
          source: { branch: { name: 'feat' } },
          destination: { branch: { name: 'main' } },
          created_on: '2024-01-01T00:00:00Z',
          updated_on: '2024-01-01T00:00:00Z',
        },
      });
      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            values: [
              {
                id: 100,
                content: { raw: 'Nice work!' },
                user: { display_name: 'reviewer' },
                created_on: '2024-01-01T00:00:00Z',
                updated_on: '2024-01-01T00:00:00Z',
              },
            ],
          }),
      });

      const result = await searchBitbucketPRsAPI({
        workspace: 'ws',
        repoSlug: 'repo',
        prNumber: 1,
        withComments: true,
      });

      const data = (result as { data: { comments: Array<{ id: number }> } })
        .data;
      expect(data.comments).toHaveLength(1);
      expect(data.comments[0]!.id).toBe(100);
    });

    it('should fetch PR with diff when withDiff=true', async () => {
      mockGET.mockResolvedValue({
        data: {
          id: 1,
          title: 'PR',
          state: 'OPEN',
          author: { display_name: 'user', uuid: '{u}' },
          source: { branch: { name: 'feat' } },
          destination: { branch: { name: 'main' } },
          created_on: '2024-01-01T00:00:00Z',
          updated_on: '2024-01-01T00:00:00Z',
        },
      });
      mockFetch.mockResolvedValue({
        ok: true,
        text: () =>
          Promise.resolve(
            '--- a/file.ts\n+++ b/file.ts\n@@ -1 +1 @@\n-old\n+new'
          ),
      });

      const result = await searchBitbucketPRsAPI({
        workspace: 'ws',
        repoSlug: 'repo',
        prNumber: 1,
        withDiff: true,
      });

      const data = (result as { data: { diff: string } }).data;
      expect(data.diff).toContain('--- a/file.ts');
    });

    it('should fetch PR with diffstat when withDiffstat=true', async () => {
      mockGET.mockResolvedValue({
        data: {
          id: 1,
          title: 'PR',
          state: 'OPEN',
          author: { display_name: 'user', uuid: '{u}' },
          source: { branch: { name: 'feat' } },
          destination: { branch: { name: 'main' } },
          created_on: '2024-01-01T00:00:00Z',
          updated_on: '2024-01-01T00:00:00Z',
        },
      });
      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            values: [
              {
                type: 'diffstat',
                status: 'modified',
                new: { path: 'file.ts' },
                lines_added: 5,
                lines_removed: 2,
              },
            ],
          }),
      });

      const result = await searchBitbucketPRsAPI({
        workspace: 'ws',
        repoSlug: 'repo',
        prNumber: 1,
        withDiffstat: true,
      });

      const data = (result as { data: { diffstat: Array<{ status: string }> } })
        .data;
      expect(data.diffstat).toHaveLength(1);
      expect(data.diffstat[0]!.status).toBe('modified');
    });

    it('should handle comments fetch failure gracefully', async () => {
      mockGET.mockResolvedValue({
        data: {
          id: 1,
          title: 'PR',
          state: 'OPEN',
          author: { display_name: 'user', uuid: '{u}' },
          source: { branch: { name: 'feat' } },
          destination: { branch: { name: 'main' } },
          created_on: '2024-01-01T00:00:00Z',
          updated_on: '2024-01-01T00:00:00Z',
        },
      });
      mockFetch.mockResolvedValue({
        ok: false,
        status: 404,
      });

      const result = await searchBitbucketPRsAPI({
        workspace: 'ws',
        repoSlug: 'repo',
        prNumber: 1,
        withComments: true,
      });

      const data = (result as { data: { comments: unknown[] } }).data;
      expect(data.comments).toEqual([]);
    });

    it('should handle diff fetch failure gracefully', async () => {
      mockGET.mockResolvedValue({
        data: {
          id: 1,
          title: 'PR',
          state: 'OPEN',
          author: { display_name: 'user', uuid: '{u}' },
          source: { branch: { name: 'feat' } },
          destination: { branch: { name: 'main' } },
          created_on: '2024-01-01T00:00:00Z',
          updated_on: '2024-01-01T00:00:00Z',
        },
      });
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
      });

      const result = await searchBitbucketPRsAPI({
        workspace: 'ws',
        repoSlug: 'repo',
        prNumber: 1,
        withDiff: true,
      });

      const data = (result as { data: { diff: string | undefined } }).data;
      expect(data.diff).toBeUndefined();
    });

    it('should handle diffstat fetch network error gracefully', async () => {
      mockGET.mockResolvedValue({
        data: {
          id: 1,
          title: 'PR',
          state: 'OPEN',
          author: { display_name: 'user', uuid: '{u}' },
          source: { branch: { name: 'feat' } },
          destination: { branch: { name: 'main' } },
          created_on: '2024-01-01T00:00:00Z',
          updated_on: '2024-01-01T00:00:00Z',
        },
      });
      mockFetch.mockRejectedValue(new Error('network error'));

      const result = await searchBitbucketPRsAPI({
        workspace: 'ws',
        repoSlug: 'repo',
        prNumber: 1,
        withDiffstat: true,
      });

      const data = (result as { data: { diffstat: unknown[] } }).data;
      expect(data.diffstat).toEqual([]);
    });

    it('should handle comments network error gracefully', async () => {
      mockGET.mockResolvedValue({
        data: {
          id: 1,
          title: 'PR',
          state: 'OPEN',
          author: { display_name: 'user', uuid: '{u}' },
          source: { branch: { name: 'feat' } },
          destination: { branch: { name: 'main' } },
          created_on: '2024-01-01T00:00:00Z',
          updated_on: '2024-01-01T00:00:00Z',
        },
      });
      mockFetch.mockRejectedValue(new Error('connection refused'));

      const result = await searchBitbucketPRsAPI({
        workspace: 'ws',
        repoSlug: 'repo',
        prNumber: 1,
        withComments: true,
      });

      const data = (result as { data: { comments: unknown[] } }).data;
      expect(data.comments).toEqual([]);
    });

    it('should handle diff network error gracefully', async () => {
      mockGET.mockResolvedValue({
        data: {
          id: 1,
          title: 'PR',
          state: 'OPEN',
          author: { display_name: 'user', uuid: '{u}' },
          source: { branch: { name: 'feat' } },
          destination: { branch: { name: 'main' } },
          created_on: '2024-01-01T00:00:00Z',
          updated_on: '2024-01-01T00:00:00Z',
        },
      });
      mockFetch.mockRejectedValue(new Error('network error'));

      const result = await searchBitbucketPRsAPI({
        workspace: 'ws',
        repoSlug: 'repo',
        prNumber: 1,
        withDiff: true,
      });

      const data = (result as { data: { diff: string | undefined } }).data;
      expect(data.diff).toBeUndefined();
    });
  });

  describe('list PRs', () => {
    it('should list PRs with state filter', async () => {
      mockGET.mockResolvedValue({
        data: {
          values: [
            {
              id: 1,
              title: 'Open PR',
              state: 'OPEN',
              author: { display_name: 'user', uuid: '{u}' },
              source: { branch: { name: 'feat' } },
              destination: { branch: { name: 'main' } },
              created_on: '2024-01-01T00:00:00Z',
              updated_on: '2024-01-01T00:00:00Z',
            },
          ],
          size: 1,
          page: 1,
        },
      });

      const result = await searchBitbucketPRsAPI({
        workspace: 'ws',
        repoSlug: 'repo',
        state: 'OPEN',
      });

      const data = (result as { data: { pullRequests: unknown[] } }).data;
      expect(data.pullRequests).toHaveLength(1);
    });

    it('should apply author filter', async () => {
      mockGET.mockResolvedValue({ data: { values: [], size: 0, page: 1 } });

      await searchBitbucketPRsAPI({
        workspace: 'ws',
        repoSlug: 'repo',
        author: 'john',
      });

      const callArgs = mockGET.mock.calls[0]![1];
      expect(callArgs.params.query.q).toContain('author.display_name ~ "john"');
    });

    it('should apply baseBranch filter', async () => {
      mockGET.mockResolvedValue({ data: { values: [], size: 0, page: 1 } });

      await searchBitbucketPRsAPI({
        workspace: 'ws',
        repoSlug: 'repo',
        baseBranch: 'main',
      });

      const callArgs = mockGET.mock.calls[0]![1];
      expect(callArgs.params.query.q).toContain(
        'destination.branch.name = "main"'
      );
    });

    it('should apply headBranch filter', async () => {
      mockGET.mockResolvedValue({ data: { values: [], size: 0, page: 1 } });

      await searchBitbucketPRsAPI({
        workspace: 'ws',
        repoSlug: 'repo',
        headBranch: 'feature-x',
      });

      const callArgs = mockGET.mock.calls[0]![1];
      expect(callArgs.params.query.q).toContain(
        'source.branch.name = "feature-x"'
      );
    });

    it('should apply sort=updated', async () => {
      mockGET.mockResolvedValue({ data: { values: [], size: 0, page: 1 } });

      await searchBitbucketPRsAPI({
        workspace: 'ws',
        repoSlug: 'repo',
        sort: 'updated',
      });

      const callArgs = mockGET.mock.calls[0]![1];
      expect(callArgs.params.query.sort).toBe('-updated_on');
    });

    it('should apply sort=created', async () => {
      mockGET.mockResolvedValue({ data: { values: [], size: 0, page: 1 } });

      await searchBitbucketPRsAPI({
        workspace: 'ws',
        repoSlug: 'repo',
        sort: 'created',
      });

      const callArgs = mockGET.mock.calls[0]![1];
      expect(callArgs.params.query.sort).toBe('-created_on');
    });

    it('should handle pagination', async () => {
      mockGET.mockResolvedValue({
        data: {
          values: [
            {
              id: 1,
              title: 'PR',
              state: 'OPEN',
              author: { display_name: 'user', uuid: '{u}' },
              source: { branch: { name: 'feat' } },
              destination: { branch: { name: 'main' } },
              created_on: '2024-01-01T00:00:00Z',
              updated_on: '2024-01-01T00:00:00Z',
            },
          ],
          size: 25,
          page: 2,
          next: 'https://api.bitbucket.org/2.0/...',
        },
      });

      const result = await searchBitbucketPRsAPI({
        workspace: 'ws',
        repoSlug: 'repo',
        page: 2,
        limit: 5,
      });

      const data = (
        result as {
          data: { pagination: { hasMore: boolean; currentPage: number } };
        }
      ).data;
      expect(data.pagination.hasMore).toBe(true);
      expect(data.pagination.currentPage).toBe(2);
    });

    it('should handle missing values in paginated response', async () => {
      mockGET.mockResolvedValue({
        data: {},
      });

      const result = await searchBitbucketPRsAPI({
        workspace: 'ws',
        repoSlug: 'repo',
      });

      const data = (result as { data: { pullRequests: unknown[] } }).data;
      expect(data.pullRequests).toEqual([]);
    });
  });

  it('should handle API errors in list mode', async () => {
    mockGET.mockRejectedValue(
      Object.assign(new Error('Unauthorized'), { status: 401 })
    );

    const result = await searchBitbucketPRsAPI({
      workspace: 'ws',
      repoSlug: 'repo',
    });

    expect(result).toHaveProperty('error');
    expect((result as { status: number }).status).toBe(401);
  });
});
