import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  resolveDefaultBranch,
  clearOctokitInstances,
} from '../../src/github/client.js';

vi.mock('../../src/serverConfig.js', () => ({
  getGitHubToken: vi.fn(function () {}),
  getServerConfig: vi.fn(function () {
    return {
      timeout: 30000,
      version: '1.0.0',
    };
  }),
}));

vi.mock('octokit', () => {
  const mockOctokitInstance = {
    rest: {
      repos: {
        get: vi.fn(function () {}),
      },
    },
  };

  const mockOctokitClass = vi.fn(function () {
    return mockOctokitInstance;
  });

  Object.assign(mockOctokitClass, {
    plugin: vi.fn(function () {
      return mockOctokitClass;
    }),
  });

  return {
    Octokit: mockOctokitClass,
  };
});

vi.mock('@octokit/plugin-throttling', () => ({
  throttling: {},
}));

import { getGitHubToken, getServerConfig } from '../../src/serverConfig.js';
import { Octokit } from 'octokit';

const mockGetGitHubToken = vi.mocked(getGitHubToken);
const mockGetServerConfig = vi.mocked(getServerConfig);
const mockOctokit = vi.mocked(Octokit);

describe('resolveDefaultBranch - caching', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearOctokitInstances();

    mockGetServerConfig.mockReturnValue({
      version: '1.0.0',
      githubApiUrl: 'https://api.github.com',
      timeout: 30000,
      maxRetries: 3,
      loggingEnabled: true,
      enableLocal: true,
      enableClone: false,
      disablePrompts: false,
      tokenSource: 'env:GH_TOKEN',
    });
  });

  afterEach(() => {
    clearOctokitInstances();
  });

  it('should NOT call GitHub API twice for the same owner/repo', async () => {
    mockGetGitHubToken.mockResolvedValue('test-token');
    const mockReposGet = vi.fn().mockResolvedValue({
      data: { default_branch: 'develop' },
    });
    mockOctokit.mockImplementation(function () {
      return { rest: { repos: { get: mockReposGet } } };
    });

    // Call twice with the same owner/repo
    const branch1 = await resolveDefaultBranch('org', 'repo');
    const branch2 = await resolveDefaultBranch('org', 'repo');

    expect(branch1).toBe('develop');
    expect(branch2).toBe('develop');

    // The API should only be called once — second call should use cache
    expect(mockReposGet).toHaveBeenCalledTimes(1);
  });

  it('should call GitHub API separately for different repos', async () => {
    mockGetGitHubToken.mockResolvedValue('test-token');
    const mockReposGet = vi
      .fn()
      .mockResolvedValueOnce({ data: { default_branch: 'main' } })
      .mockResolvedValueOnce({ data: { default_branch: 'master' } });
    mockOctokit.mockImplementation(function () {
      return { rest: { repos: { get: mockReposGet } } };
    });

    const branch1 = await resolveDefaultBranch('org', 'repo-a');
    const branch2 = await resolveDefaultBranch('org', 'repo-b');

    expect(branch1).toBe('main');
    expect(branch2).toBe('master');
    expect(mockReposGet).toHaveBeenCalledTimes(2);
  });

  it('should cache "main" fallback when API fails', async () => {
    mockGetGitHubToken.mockResolvedValue('test-token');
    const mockReposGet = vi.fn().mockRejectedValue(new Error('Not found'));
    mockOctokit.mockImplementation(function () {
      return { rest: { repos: { get: mockReposGet } } };
    });

    const branch1 = await resolveDefaultBranch('org', 'missing-repo');
    const branch2 = await resolveDefaultBranch('org', 'missing-repo');

    expect(branch1).toBe('main');
    expect(branch2).toBe('main');

    // Should only call API once even for errors
    expect(mockReposGet).toHaveBeenCalledTimes(1);
  });

  it('should clear branch cache when clearOctokitInstances is called', async () => {
    mockGetGitHubToken.mockResolvedValue('test-token');
    const mockReposGet = vi
      .fn()
      .mockResolvedValueOnce({ data: { default_branch: 'develop' } })
      .mockResolvedValueOnce({ data: { default_branch: 'main' } });
    mockOctokit.mockImplementation(function () {
      return { rest: { repos: { get: mockReposGet } } };
    });

    // First call caches the result
    const branch1 = await resolveDefaultBranch('org', 'repo');
    expect(branch1).toBe('develop');

    // Clear all caches
    clearOctokitInstances();

    // Second call should fetch again (cache was cleared)
    const branch2 = await resolveDefaultBranch('org', 'repo');
    expect(branch2).toBe('main');

    expect(mockReposGet).toHaveBeenCalledTimes(2);
  });
});
