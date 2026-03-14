import { describe, it, expect, vi, beforeEach } from 'vitest';
import { clearAllCache } from '../../src/utils/http/cache.js';

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

vi.mock('../../src/bitbucket/fileContent.js', () => ({
  getBitbucketDefaultBranch: vi.fn().mockResolvedValue('main'),
}));

import { viewBitbucketRepoStructureAPI } from '../../src/bitbucket/repoStructure.js';

describe('viewBitbucketRepoStructureAPI', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearAllCache();
  });

  it('should return error when workspace is missing', async () => {
    const result = await viewBitbucketRepoStructureAPI({
      workspace: '',
      repoSlug: 'repo',
    });
    expect(result).toHaveProperty('error');
    expect((result as { status: number }).status).toBe(400);
  });

  it('should return error when repoSlug is missing', async () => {
    const result = await viewBitbucketRepoStructureAPI({
      workspace: 'ws',
      repoSlug: '',
    });
    expect(result).toHaveProperty('error');
    expect((result as { status: number }).status).toBe(400);
  });

  it('should return repo structure successfully', async () => {
    mockGET.mockResolvedValue({
      data: {
        values: [
          { type: 'commit_directory', path: 'src' },
          { type: 'commit_file', path: 'README.md', size: 200 },
          { type: 'commit_file', path: 'package.json', size: 400 },
        ],
        size: 3,
        page: 1,
      },
    });

    const result = await viewBitbucketRepoStructureAPI({
      workspace: 'ws',
      repoSlug: 'repo',
      ref: 'develop',
    });

    expect(result).toHaveProperty('data');
    const data = (
      result as { data: { entries: unknown[]; branch: string; path: string } }
    ).data;
    expect(data.entries).toHaveLength(3);
    expect(data.branch).toBe('develop');
    expect(data.path).toBe('');
  });

  it('should resolve default branch when ref is not provided', async () => {
    mockGET.mockResolvedValue({
      data: { values: [], size: 0, page: 1 },
    });

    const result = await viewBitbucketRepoStructureAPI({
      workspace: 'ws',
      repoSlug: 'repo',
    });

    const data = (result as { data: { branch: string } }).data;
    expect(data.branch).toBe('main');
  });

  it('should pass depth parameter when provided', async () => {
    mockGET.mockResolvedValue({
      data: { values: [], size: 0, page: 1 },
    });

    await viewBitbucketRepoStructureAPI({
      workspace: 'ws',
      repoSlug: 'repo',
      ref: 'main',
      depth: 2,
    });

    const callArgs = mockGET.mock.calls[0]![1];
    expect(callArgs.params.query.max_depth).toBe('2');
  });

  it('should not pass depth when not provided', async () => {
    mockGET.mockResolvedValue({
      data: { values: [], size: 0, page: 1 },
    });

    await viewBitbucketRepoStructureAPI({
      workspace: 'ws',
      repoSlug: 'repo',
      ref: 'main',
    });

    const callArgs = mockGET.mock.calls[0]![1];
    expect(callArgs.params.query.max_depth).toBeUndefined();
  });

  it('should use custom pagination params', async () => {
    mockGET.mockResolvedValue({
      data: { values: [], size: 0, page: 2 },
    });

    await viewBitbucketRepoStructureAPI({
      workspace: 'ws',
      repoSlug: 'repo',
      ref: 'main',
      entriesPerPage: 25,
      entryPageNumber: 2,
    });

    const callArgs = mockGET.mock.calls[0]![1];
    expect(callArgs.params.query.pagelen).toBe('25');
    expect(callArgs.params.query.page).toBe('2');
  });

  it('should handle pagination with next URL', async () => {
    mockGET.mockResolvedValue({
      data: {
        values: [{ type: 'commit_file', path: 'a.ts' }],
        size: 100,
        page: 1,
        next: 'https://api.bitbucket.org/2.0/...',
      },
    });

    const result = await viewBitbucketRepoStructureAPI({
      workspace: 'ws',
      repoSlug: 'repo',
      ref: 'main',
    });

    const data = (
      result as {
        data: { pagination: { hasMore: boolean; totalPages: number } };
      }
    ).data;
    expect(data.pagination.hasMore).toBe(true);
    expect(data.pagination.totalPages).toBe(2);
  });

  it('should handle API errors', async () => {
    mockGET.mockRejectedValue(
      Object.assign(new Error('Not found'), { status: 404 })
    );

    const result = await viewBitbucketRepoStructureAPI({
      workspace: 'ws',
      repoSlug: 'repo',
    });

    expect(result).toHaveProperty('error');
    expect((result as { status: number }).status).toBe(404);
  });

  it('should browse subdirectory with path', async () => {
    mockGET.mockResolvedValue({
      data: {
        values: [{ type: 'commit_file', path: 'src/index.ts' }],
        size: 1,
        page: 1,
      },
    });

    const result = await viewBitbucketRepoStructureAPI({
      workspace: 'ws',
      repoSlug: 'repo',
      ref: 'main',
      path: 'src',
    });

    const data = (result as { data: { path: string } }).data;
    expect(data.path).toBe('src');
    const callArgs = mockGET.mock.calls[0]![1];
    expect(callArgs.params.path.path).toBe('src');
  });
});
