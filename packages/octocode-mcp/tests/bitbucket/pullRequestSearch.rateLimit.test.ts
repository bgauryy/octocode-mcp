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

import {
  searchBitbucketPRsAPI,
  fetchBitbucketPRSupplementalData,
} from '../../src/bitbucket/pullRequestSearch.js';

const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('Bitbucket PR rate limit handling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('fetchPRDiff - 429 rate limit', () => {
    it('should re-throw rate limit error from diff response', async () => {
      mockGET.mockResolvedValue({
        data: {
          id: 1,
          title: 'PR',
          state: 'OPEN',
          author: { display_name: 'user' },
          source: { branch: { name: 'feat' } },
          destination: { branch: { name: 'main' } },
          created_on: '2024-01-01',
          updated_on: '2024-01-01',
        },
      });

      mockFetch.mockResolvedValue({
        ok: false,
        status: 429,
      });

      const result = await searchBitbucketPRsAPI({
        workspace: 'ws',
        repoSlug: 'repo',
        prNumber: 1,
        withDiff: true,
      });

      expect(result).toHaveProperty('error');
    });

    it('should re-throw rate limit error from diff fetch error', async () => {
      mockGET.mockResolvedValue({
        data: {
          id: 1,
          title: 'PR',
          state: 'OPEN',
          author: { display_name: 'user' },
          source: { branch: { name: 'feat' } },
          destination: { branch: { name: 'main' } },
          created_on: '2024-01-01',
          updated_on: '2024-01-01',
        },
      });

      const rateLimitError = Object.assign(new Error('Rate limited'), {
        status: 429,
      });
      mockFetch.mockRejectedValue(rateLimitError);

      const result = await searchBitbucketPRsAPI({
        workspace: 'ws',
        repoSlug: 'repo',
        prNumber: 1,
        withDiff: true,
      });

      expect(result).toHaveProperty('error');
    });
  });

  describe('fetchPRComments - 429 rate limit', () => {
    it('should re-throw rate limit error from comments', async () => {
      mockGET.mockResolvedValue({
        data: {
          id: 1,
          title: 'PR',
          state: 'OPEN',
          author: { display_name: 'user' },
          source: { branch: { name: 'feat' } },
          destination: { branch: { name: 'main' } },
          created_on: '2024-01-01',
          updated_on: '2024-01-01',
        },
      });

      const rateLimitError = Object.assign(new Error('Rate limited'), {
        status: 429,
      });
      mockFetch.mockRejectedValue(rateLimitError);

      const result = await searchBitbucketPRsAPI({
        workspace: 'ws',
        repoSlug: 'repo',
        prNumber: 1,
        withComments: true,
      });

      expect(result).toHaveProperty('error');
    });
  });

  describe('fetchPRDiffstat - 429 rate limit', () => {
    it('should re-throw rate limit error from diffstat', async () => {
      mockGET.mockResolvedValue({
        data: {
          id: 1,
          title: 'PR',
          state: 'OPEN',
          author: { display_name: 'user' },
          source: { branch: { name: 'feat' } },
          destination: { branch: { name: 'main' } },
          created_on: '2024-01-01',
          updated_on: '2024-01-01',
        },
      });

      const rateLimitError = Object.assign(new Error('Rate limited'), {
        status: 429,
      });
      mockFetch.mockRejectedValue(rateLimitError);

      const result = await searchBitbucketPRsAPI({
        workspace: 'ws',
        repoSlug: 'repo',
        prNumber: 1,
        withDiffstat: true,
      });

      expect(result).toHaveProperty('error');
    });
  });

  describe('fetchPaginatedCollection - 429 rate limit', () => {
    it('should throw rate limit error during pagination', async () => {
      mockGET.mockResolvedValue({
        data: {
          id: 1,
          title: 'PR',
          state: 'OPEN',
          author: { display_name: 'user' },
          source: { branch: { name: 'feat' } },
          destination: { branch: { name: 'main' } },
          created_on: '2024-01-01',
          updated_on: '2024-01-01',
        },
      });

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              values: [{ id: 1, content: { raw: 'ok' } }],
              next: 'https://api.bitbucket.org/next-page',
            }),
        })
        .mockResolvedValueOnce({
          ok: false,
          status: 429,
        });

      const result = await searchBitbucketPRsAPI({
        workspace: 'ws',
        repoSlug: 'repo',
        prNumber: 1,
        withComments: true,
      });

      expect(result).toHaveProperty('error');
    });
  });

  describe('fetchBitbucketPRSupplementalData', () => {
    it('should return supplemental data with comments', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            values: [
              {
                id: 1,
                content: { raw: 'Nice' },
                user: { display_name: 'reviewer' },
                created_on: '2024-01-01',
                updated_on: '2024-01-01',
              },
            ],
          }),
      });

      const result = await fetchBitbucketPRSupplementalData({
        workspace: 'ws',
        repoSlug: 'repo',
        prNumber: 1,
        withComments: true,
      });

      expect(result.comments).toHaveLength(1);
    });

    it('should return supplemental data with diff', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        text: () => Promise.resolve('diff content'),
      });

      const result = await fetchBitbucketPRSupplementalData({
        workspace: 'ws',
        repoSlug: 'repo',
        prNumber: 1,
        withDiff: true,
      });

      expect(result.diff).toBe('diff content');
    });

    it('should return supplemental data with diffstat', async () => {
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

      const result = await fetchBitbucketPRSupplementalData({
        workspace: 'ws',
        repoSlug: 'repo',
        prNumber: 1,
        withDiffstat: true,
      });

      expect(result.diffstat).toHaveLength(1);
    });

    it('should return empty result when no flags set', async () => {
      const result = await fetchBitbucketPRSupplementalData({
        workspace: 'ws',
        repoSlug: 'repo',
        prNumber: 1,
      });

      expect(result).toEqual({});
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });
});
