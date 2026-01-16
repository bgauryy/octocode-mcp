/**
 * Test fixtures for mocking the provider layer
 *
 * Since tool execution now routes through the provider layer,
 * tests need to mock the provider instead of direct GitHub APIs.
 */

import { vi } from 'vitest';

/**
 * Creates a mock provider with all methods stubbed
 */
export function createMockProvider() {
  return {
    searchCode: vi.fn(),
    getFileContent: vi.fn(),
    searchRepos: vi.fn(),
    searchPullRequests: vi.fn(),
    getRepoStructure: vi.fn(),
  };
}

/**
 * Standard provider configuration mock
 */
export const mockProviderConfig = {
  provider: 'github' as const,
  baseUrl: undefined,
  token: 'mock-token',
};

/**
 * Creates mock for serverConfig with provider functions
 */
export function createServerConfigMock(overrides = {}) {
  return {
    initialize: vi.fn(),
    getServerConfig: vi.fn().mockReturnValue({
      version: '4.0.5',
      enableTools: [],
      disableTools: [],
      enableLogging: true,
      timeout: 30000,
      maxRetries: 3,
      loggingEnabled: false,
    }),
    getGitHubToken: vi.fn(() => Promise.resolve('mock-token')),
    isLoggingEnabled: vi.fn(() => false),
    getActiveProviderConfig: vi.fn(() => mockProviderConfig),
    ...overrides,
  };
}

/**
 * Creates a successful provider response
 */
export function createProviderResponse<T>(data: T, hints: string[] = []) {
  return {
    data,
    status: 200,
    provider: 'github' as const,
    hints,
  };
}

/**
 * Creates an error provider response
 */
export function createProviderErrorResponse(error: string, status = 500) {
  return {
    error,
    status,
    provider: 'github' as const,
  };
}

/**
 * Standard mock for empty search results
 */
export const emptySearchResult = createProviderResponse({
  items: [],
  totalCount: 0,
  pagination: {
    currentPage: 1,
    totalPages: 0,
    hasMore: false,
  },
});

/**
 * Creates a mock code search item
 */
export function createMockCodeItem(
  path: string,
  matches: Array<{ context: string }> = [],
  repo = 'test-repo'
) {
  return {
    path,
    matches: matches.map(m => ({
      context: m.context,
      positions: [] as [number, number][],
    })),
    url: `https://github.com/test/${repo}/blob/main/${path}`,
    repository: {
      id: '1',
      name: repo,
      url: `https://github.com/test/${repo}`,
    },
  };
}

/**
 * Creates a mock repository
 */
export function createMockRepository(
  name: string,
  overrides: Partial<{
    fullPath: string;
    description: string;
    stars: number;
    forks: number;
    visibility: 'public' | 'private' | 'internal';
  }> = {}
) {
  return {
    id: '1',
    name,
    fullPath: overrides.fullPath || `test/${name}`,
    description: overrides.description || `Description for ${name}`,
    url: `https://github.com/test/${name}`,
    cloneUrl: `https://github.com/test/${name}.git`,
    defaultBranch: 'main',
    stars: overrides.stars ?? 100,
    forks: overrides.forks ?? 10,
    visibility: overrides.visibility || 'public',
    topics: [],
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
    lastActivityAt: '2024-01-01T00:00:00Z',
  };
}

/**
 * Creates a mock pull request item
 */
export function createMockPullRequest(
  number: number,
  overrides: Partial<{
    title: string;
    state: 'open' | 'closed' | 'merged';
    draft: boolean;
  }> = {}
) {
  return {
    number,
    title: overrides.title || `PR #${number}`,
    body: null,
    url: `https://github.com/test/repo/pull/${number}`,
    state: overrides.state || 'open',
    draft: overrides.draft ?? false,
    author: 'test-user',
    assignees: [],
    labels: [],
    sourceBranch: 'feature',
    targetBranch: 'main',
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
  };
}
