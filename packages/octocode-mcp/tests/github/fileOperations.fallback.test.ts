import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchGitHubFileContentAPI } from '../../src/github/fileOperations.js';
import { getOctokit } from '../../src/github/client.js';
import { clearAllCache } from '../../src/utils/http/cache.js';
import { RequestError } from 'octokit';

vi.mock('../../src/github/client.js');
vi.mock('../../src/session.js', () => ({
  logSessionError: vi.fn(() => Promise.resolve()),
}));

describe('File Operations - Branch Fallback & Caching', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearAllCache();
  });

  it('should fallback to default branch and cache it', async () => {
    const getContentMock = vi.fn();
    const getRepoMock = vi.fn();

    const mockOctokit = {
      rest: {
        repos: {
          get: getRepoMock,
          getContent: getContentMock,
          listCommits: vi.fn().mockResolvedValue({ data: [] }),
        },
      },
    };

    vi.mocked(getOctokit).mockResolvedValue(
      mockOctokit as unknown as ReturnType<typeof getOctokit>
    );

    // Helper to create 404 error
    const create404 = () =>
      new RequestError('Not Found', 404, {
        request: { method: 'GET', url: '', headers: {} },
        response: {
          status: 404,
          url: '',
          headers: {},
          data: {},
          retryCount: 0,
        },
      });

    // Scenario: User asks for 'main', but repo uses 'develop'
    // 1. Try 'main' -> 404
    getContentMock.mockRejectedValueOnce(create404());

    // 2. Fetch repo info -> default_branch = 'develop'
    getRepoMock.mockResolvedValue({ data: { default_branch: 'develop' } });

    // 3. Try 'develop' -> 200
    getContentMock.mockResolvedValueOnce({
      data: { type: 'file', content: 'base64encoded', encoding: 'base64' },
    });

    // First call
    await fetchGitHubFileContentAPI({
      owner: 'test',
      repo: 'repo',
      path: 'file.txt',
      branch: 'main',
    });

    // Check calls
    expect(getContentMock).toHaveBeenCalledTimes(2); // main, then develop
    expect(getRepoMock).toHaveBeenCalledTimes(1);

    // RESET MOCKS for Second call
    getContentMock.mockClear();
    getRepoMock.mockClear();

    // Second call - asking for 'main' again, but different file (to avoid data cache)
    // We expect:
    // 1. Try 'main' -> 404 (mock needed)
    // 2. Fallback to 'develop' (cached) -> Success

    getContentMock.mockRejectedValueOnce(create404());
    getContentMock.mockResolvedValueOnce({
      data: { type: 'file', content: 'base64encoded', encoding: 'base64' },
    });

    await fetchGitHubFileContentAPI({
      owner: 'test',
      repo: 'repo',
      path: 'file2.txt',
      branch: 'main',
    });

    expect(getRepoMock).toHaveBeenCalledTimes(0); // CACHED!
    expect(getContentMock).toHaveBeenCalledTimes(2); // main (fail) -> develop (success)
  });
});
