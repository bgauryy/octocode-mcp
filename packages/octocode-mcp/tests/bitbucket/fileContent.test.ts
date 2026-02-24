import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/bitbucket/client.js', () => ({
  getBitbucketClient: vi.fn(() => ({ GET: vi.fn() })),
  getAuthHeader: vi.fn(() => 'Bearer test-token'),
}));

vi.mock('../../src/bitbucketConfig.js', () => ({
  getBitbucketHost: vi.fn(() => 'https://api.bitbucket.org/2.0'),
  getBitbucketToken: vi.fn(() => 'test-token'),
  getBitbucketUsername: vi.fn(() => null),
}));

import {
  fetchBitbucketFileContentAPI,
  getBitbucketDefaultBranch,
} from '../../src/bitbucket/fileContent.js';

const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('fetchBitbucketFileContentAPI', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return error when workspace is missing', async () => {
    const result = await fetchBitbucketFileContentAPI({
      workspace: '',
      repoSlug: 'repo',
      path: 'file.ts',
    });
    expect(result).toHaveProperty('error');
    expect((result as { status: number }).status).toBe(400);
  });

  it('should return error when repoSlug is missing', async () => {
    const result = await fetchBitbucketFileContentAPI({
      workspace: 'ws',
      repoSlug: '',
      path: 'file.ts',
    });
    expect(result).toHaveProperty('error');
    expect((result as { status: number }).status).toBe(400);
  });

  it('should return error when path is missing', async () => {
    const result = await fetchBitbucketFileContentAPI({
      workspace: 'ws',
      repoSlug: 'repo',
      path: '',
    });
    expect(result).toHaveProperty('error');
    expect((result as { status: number }).status).toBe(400);
  });

  it('should fetch file content successfully', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      text: () => Promise.resolve('console.log("hello")'),
    });

    const result = await fetchBitbucketFileContentAPI({
      workspace: 'ws',
      repoSlug: 'repo',
      path: 'src/index.ts',
      ref: 'main',
    });

    expect(result).toHaveProperty('data');
    const data = (
      result as { data: { content: string; path: string; ref: string } }
    ).data;
    expect(data.content).toBe('console.log("hello")');
    expect(data.path).toBe('src/index.ts');
    expect(data.ref).toBe('main');
  });

  it('should use "main" as default ref when not provided', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      text: () => Promise.resolve('content'),
    });

    await fetchBitbucketFileContentAPI({
      workspace: 'ws',
      repoSlug: 'repo',
      path: 'file.ts',
    });

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/main/'),
      expect.any(Object)
    );
  });

  it('should handle HTTP error responses', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 404,
      text: () => Promise.resolve('Not found'),
    });

    const result = await fetchBitbucketFileContentAPI({
      workspace: 'ws',
      repoSlug: 'repo',
      path: 'missing.ts',
    });

    expect(result).toHaveProperty('error');
    expect((result as { status: number }).status).toBe(404);
  });

  it('should handle HTTP error when text() fails', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      text: () => Promise.reject(new Error('stream error')),
    });

    const result = await fetchBitbucketFileContentAPI({
      workspace: 'ws',
      repoSlug: 'repo',
      path: 'file.ts',
    });

    expect(result).toHaveProperty('error');
    expect((result as { status: number }).status).toBe(500);
  });

  it('should handle network errors', async () => {
    mockFetch.mockRejectedValue(new TypeError('fetch failed'));

    const result = await fetchBitbucketFileContentAPI({
      workspace: 'ws',
      repoSlug: 'repo',
      path: 'file.ts',
    });

    expect(result).toHaveProperty('error');
    expect((result as { type: string }).type).toBe('network');
  });

  it('should properly encode path segments', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      text: () => Promise.resolve('data'),
    });

    await fetchBitbucketFileContentAPI({
      workspace: 'ws',
      repoSlug: 'repo',
      path: 'src/my file.ts',
      ref: 'main',
    });

    const calledUrl = mockFetch.mock.calls[0][0] as string;
    expect(calledUrl).toContain('my%20file.ts');
  });
});

describe('getBitbucketDefaultBranch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return the repository default branch', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          mainbranch: { name: 'develop' },
        }),
    });

    const branch = await getBitbucketDefaultBranch('ws', 'repo');
    expect(branch).toBe('develop');
  });

  it('should return "main" when API response has no mainbranch', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({}),
    });

    const branch = await getBitbucketDefaultBranch('ws', 'repo');
    expect(branch).toBe('main');
  });

  it('should return "main" on non-OK response', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 404,
    });

    const branch = await getBitbucketDefaultBranch('ws', 'repo');
    expect(branch).toBe('main');
  });

  it('should return "main" on network error', async () => {
    mockFetch.mockRejectedValue(new Error('connection refused'));

    const branch = await getBitbucketDefaultBranch('ws', 'repo');
    expect(branch).toBe('main');
  });
});
