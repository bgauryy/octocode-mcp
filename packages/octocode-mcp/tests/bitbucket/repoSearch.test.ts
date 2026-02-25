import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockGET = vi.fn();
vi.mock('../../src/bitbucket/client.js', () => ({
  getBitbucketClient: vi.fn(() => ({ GET: mockGET })),
}));

vi.mock('../../src/bitbucketConfig.js', () => ({
  getBitbucketHost: vi.fn(() => 'https://api.bitbucket.org/2.0'),
  getBitbucketToken: vi.fn(() => 'test-token'),
  getBitbucketUsername: vi.fn(() => null),
}));

import { searchBitbucketReposAPI } from '../../src/bitbucket/repoSearch.js';

describe('searchBitbucketReposAPI', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return error when workspace is missing', async () => {
    const result = await searchBitbucketReposAPI({ workspace: '' });
    expect(result).toHaveProperty('error');
    expect((result as { status: number }).status).toBe(400);
  });

  it('should return repos successfully', async () => {
    mockGET.mockResolvedValue({
      data: {
        values: [
          {
            uuid: '{uuid-1}',
            name: 'my-repo',
            full_name: 'ws/my-repo',
            slug: 'my-repo',
            description: 'Test repo',
            is_private: false,
            language: 'TypeScript',
            updated_on: '2024-01-01T00:00:00Z',
            created_on: '2023-01-01T00:00:00Z',
          },
        ],
        size: 1,
        page: 1,
        next: undefined,
      },
    });

    const result = await searchBitbucketReposAPI({ workspace: 'myws' });
    expect(result).toHaveProperty('data');
    const data = (
      result as {
        data: { repositories: unknown[]; pagination: { hasMore: boolean } };
      }
    ).data;
    expect(data.repositories).toHaveLength(1);
    expect(data.pagination.hasMore).toBe(false);
  });

  it('should build query filter with keywords', async () => {
    mockGET.mockResolvedValue({ data: { values: [], size: 0 } });

    await searchBitbucketReposAPI({
      workspace: 'ws',
      keywords: ['api', 'service'],
    });

    const callArgs = mockGET.mock.calls[0]![1];
    expect(callArgs.params.query.q).toContain('name ~ "api"');
    expect(callArgs.params.query.q).toContain('name ~ "service"');
  });

  it('should build query filter with topics', async () => {
    mockGET.mockResolvedValue({ data: { values: [], size: 0 } });

    await searchBitbucketReposAPI({
      workspace: 'ws',
      topics: ['typescript'],
    });

    const callArgs = mockGET.mock.calls[0]![1];
    expect(callArgs.params.query.q).toContain('topic = "typescript"');
  });

  it('should filter by visibility=public', async () => {
    mockGET.mockResolvedValue({ data: { values: [], size: 0 } });

    await searchBitbucketReposAPI({
      workspace: 'ws',
      visibility: 'public',
    });

    const callArgs = mockGET.mock.calls[0]![1];
    expect(callArgs.params.query.q).toContain('is_private = false');
  });

  it('should filter by visibility=private', async () => {
    mockGET.mockResolvedValue({ data: { values: [], size: 0 } });

    await searchBitbucketReposAPI({
      workspace: 'ws',
      visibility: 'private',
    });

    const callArgs = mockGET.mock.calls[0]![1];
    expect(callArgs.params.query.q).toContain('is_private = true');
  });

  it('should map sort field "updated"', async () => {
    mockGET.mockResolvedValue({ data: { values: [], size: 0 } });

    await searchBitbucketReposAPI({
      workspace: 'ws',
      sort: 'updated',
    });

    const callArgs = mockGET.mock.calls[0]![1];
    expect(callArgs.params.query.sort).toBe('-updated_on');
  });

  it('should map sort field "name"', async () => {
    mockGET.mockResolvedValue({ data: { values: [], size: 0 } });

    await searchBitbucketReposAPI({
      workspace: 'ws',
      sort: 'name',
    });

    const callArgs = mockGET.mock.calls[0]![1];
    expect(callArgs.params.query.sort).toBe('name');
  });

  it('should not include sort when not provided', async () => {
    mockGET.mockResolvedValue({ data: { values: [], size: 0 } });

    await searchBitbucketReposAPI({ workspace: 'ws' });

    const callArgs = mockGET.mock.calls[0]![1];
    expect(callArgs.params.query.sort).toBeUndefined();
  });

  it('should handle pagination with next URL', async () => {
    mockGET.mockResolvedValue({
      data: {
        values: [
          {
            uuid: '{u1}',
            name: 'r1',
            full_name: 'ws/r1',
            slug: 'r1',
            description: '',
            is_private: false,
            language: '',
            updated_on: '',
            created_on: '',
          },
        ],
        size: 30,
        page: 2,
        next: 'https://api.bitbucket.org/2.0/repositories/ws?page=3',
      },
    });

    const result = await searchBitbucketReposAPI({
      workspace: 'ws',
      page: 2,
      limit: 10,
    });

    const data = (
      result as {
        data: {
          pagination: {
            hasMore: boolean;
            totalPages: number;
            currentPage: number;
          };
        };
      }
    ).data;
    expect(data.pagination.hasMore).toBe(true);
    expect(data.pagination.totalPages).toBe(3);
    expect(data.pagination.currentPage).toBe(2);
  });

  it('should handle API errors', async () => {
    mockGET.mockRejectedValue(
      Object.assign(new Error('server error'), { status: 503 })
    );

    const result = await searchBitbucketReposAPI({ workspace: 'ws' });
    expect(result).toHaveProperty('error');
    expect((result as { status: number }).status).toBe(503);
  });

  it('should use default page and limit', async () => {
    mockGET.mockResolvedValue({ data: { values: [], size: 0 } });

    await searchBitbucketReposAPI({ workspace: 'ws' });

    const callArgs = mockGET.mock.calls[0]![1];
    expect(callArgs.params.query.pagelen).toBe('10');
    expect(callArgs.params.query.page).toBe('1');
  });

  it('should handle missing pagination data in response', async () => {
    mockGET.mockResolvedValue({
      data: {
        values: [
          {
            uuid: '{u1}',
            name: 'r',
            full_name: 'ws/r',
            slug: 'r',
            description: '',
            is_private: false,
            language: '',
            updated_on: '',
            created_on: '',
          },
        ],
      },
    });

    const result = await searchBitbucketReposAPI({ workspace: 'ws' });
    const data = (
      result as {
        data: { pagination: { currentPage: number; totalMatches: number } };
      }
    ).data;
    expect(data.pagination.currentPage).toBe(1);
    expect(data.pagination.totalMatches).toBe(1);
  });
});
