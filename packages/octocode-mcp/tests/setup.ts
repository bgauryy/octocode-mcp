import { beforeEach, afterAll, vi } from 'vitest';
import { initializeToolMetadata } from '../src/tools/toolMetadata';

// Minimal mock content for tests - metadata is fetched from API in production
// Schema requires: instructions, prompts, toolNames, baseSchema, tools, baseHints, genericErrorHints
const mockToolHints = {
  hasResults: ['Test hint for hasResults 1', 'Test hint for hasResults 2'],
  empty: ['Test hint for empty 1', 'Test hint for empty 2'],
};

const mockToolSchema = {
  name: 'mockTool',
  description: 'Mock tool for testing',
  schema: {},
  hints: mockToolHints,
};

// githubGetFileContent needs specific schema fields for validation messages
// Schema is a flat object with string values
const githubFetchContentSchema = {
  name: 'githubGetFileContent',
  description: 'Read file content from GitHub',
  schema: {
    owner: 'GitHub owner',
    repo: 'Repository name',
    branch: 'Branch name',
    path: 'File path',
    startLine: 'Start line number',
    endLine: 'End line number',
    fullContent: 'Fetch full content',
    matchString: 'Match string',
    parameterConflict:
      'parameterConflict: Cannot use fullContent with other range parameters',
    lineRangeMismatch:
      'lineRangeMismatch: startLine and endLine must be used together',
  },
  hints: mockToolHints,
};

const mockContent = {
  instructions: 'Test instructions',
  prompts: {},
  toolNames: {
    GITHUB_FETCH_CONTENT: 'githubGetFileContent',
    GITHUB_SEARCH_CODE: 'githubSearchCode',
    GITHUB_SEARCH_PULL_REQUESTS: 'githubSearchPullRequests',
    GITHUB_SEARCH_REPOSITORIES: 'githubSearchRepositories',
    GITHUB_VIEW_REPO_STRUCTURE: 'githubViewRepoStructure',
    PACKAGE_SEARCH: 'packageSearch',
    LOCAL_RIPGREP: 'localSearchCode',
    LOCAL_FETCH_CONTENT: 'localGetFileContent',
    LOCAL_FIND_FILES: 'localFindFiles',
    LOCAL_VIEW_STRUCTURE: 'localViewStructure',
  },
  baseSchema: {
    mainResearchGoal: 'Main research goal description',
    researchGoal: 'Research goal description',
    reasoning: 'Reasoning description',
    bulkQueryTemplate: 'Research queries for {toolName}',
  },
  tools: {
    githubGetFileContent: githubFetchContentSchema,
    githubSearchCode: mockToolSchema,
    githubSearchPullRequests: mockToolSchema,
    githubSearchRepositories: mockToolSchema,
    githubViewRepoStructure: mockToolSchema,
    packageSearch: mockToolSchema,
    localSearchCode: mockToolSchema,
    localGetFileContent: mockToolSchema,
    localFindFiles: mockToolSchema,
    localViewStructure: mockToolSchema,
  },
  baseHints: {
    hasResults: ['Base hint for hasResults'],
    empty: ['Base hint for empty'],
  },
  genericErrorHints: [
    'Generic error hint 1',
    'Generic error hint 2',
    'Generic error hint 3',
    'Generic error hint 4',
    'Generic error hint 5',
  ],
};

// Mock global fetch for metadata loading - MUST be done before any imports that use metadata
global.fetch = vi.fn().mockResolvedValue({
  ok: true,
  json: async () => mockContent,
});

// Mock axios for session logging - MUST be done before any session imports
vi.mock('axios', () => ({
  default: {
    post: vi.fn(),
  },
}));

// Mock child_process for exec utilities - MUST be done before any exec imports
vi.mock('child_process', () => ({
  spawn: vi.fn(),
}));

// Initialize tool metadata for all tests - using top-level await to ensure it runs before test file imports
await initializeToolMetadata();

// Mock console methods to avoid noise during tests
beforeEach(() => {
  // Only mock if not in debug mode
  if (!process.env.VITEST_DEBUG) {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  }
});

afterAll(() => {
  vi.restoreAllMocks();
});

// Global test environment setup
process.env.NODE_ENV = 'test';
process.env.VITEST_TEST_MODE = '1';
// Set a default GitHub token to prevent "No GitHub token available" warnings during tests
// Tests that need to verify "no token" behavior should explicitly delete this
process.env.GITHUB_TOKEN = 'test-token-for-vitest';

// Suppress expected unhandled errors from process.exit() mocking in index tests
// These are expected behavior when testing process termination scenarios
const originalUnhandledRejection = process.listeners('unhandledRejection');
const originalUncaughtException = process.listeners('uncaughtException');

process.removeAllListeners('unhandledRejection');
process.removeAllListeners('uncaughtException');

process.on('unhandledRejection', (reason, promise) => {
  // Only suppress errors that are from our process.exit mocking
  if (
    reason instanceof Error &&
    reason.message.includes('process.exit called with code')
  ) {
    // This is expected from our index.test.ts process.exit mocking - ignore it
    return;
  }

  // Suppress expected unhandled rejections from promiseUtils test mocks
  if (
    reason instanceof Error &&
    (reason.message.includes('always fails') ||
      reason.message.includes('non-retryable error') ||
      reason.message.includes('retryable error'))
  ) {
    // These are expected from promiseUtils.test.ts retry testing - ignore them
    return;
  }

  // For any other unhandled rejections, call the original handlers
  originalUnhandledRejection.forEach(handler => {
    if (typeof handler === 'function') {
      handler(reason, promise);
    }
  });
});

process.on('uncaughtException', error => {
  // Only suppress errors that are from our process.exit mocking
  if (error.message.includes('process.exit called with code')) {
    // This is expected from our index.test.ts process.exit mocking - ignore it
    return;
  }

  // For any other uncaught exceptions, call the original handlers
  originalUncaughtException.forEach(handler => {
    if (typeof handler === 'function') {
      handler(error, 'uncaughtException');
    }
  });
});
