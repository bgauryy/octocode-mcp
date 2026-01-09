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

// Dynamic hints mock for local tools
const mockDynamicHints = {
  parallelTip: ['Use parallel queries for faster results'],
  multipleFiles: ['Multiple files found - use localGetFileContent to read'],
  grepFallback: ['Using grep fallback (ripgrep unavailable)'],
  grepFallbackEmpty: ['Try with ripgrep for better results'],
  nodeModulesSearch: [
    'Consider searching in packages/ instead of node_modules',
  ],
  largeResult: ['Large result set - narrow your search'],
  largeFile: ['Use matchString or charLength for large files'],
  patternTooBroad: ['Pattern matched too many results - narrow it'],
  parallelize: ['Parallelize: multiple directories found'],
  largeDirectory: ['Use entriesPerPage to paginate large directories'],
  batchParallel: ['Use parallel queries for batch operations'],
  manyResults: ['Many results found - consider filtering'],
  configFiles: ['Config files found - check for project settings'],
  singleRepo: ['Searching single repo: use githubGetFileContent for details'],
  multiRepo: ['Searching multiple repos: narrow with owner/repo'],
  pathEmpty: ['Path search empty - try match="file" instead'],
  crossRepoEmpty: ['Cross-repo search empty - specify owner/repo'],
  fileTooLarge: ['File too large - use matchString or line range'],
};

// LSP tool schema with descriptions
const lspGotoDefinitionSchema = {
  name: 'lspGotoDefinition',
  description: 'Navigate to symbol definition using Language Server Protocol',
  schema: {
    uri: 'File URI',
    symbolName: 'Symbol name to find',
    lineHint: 'Line number hint',
    orderHint: 'Order hint for multiple occurrences',
    contextLines: 'Lines of context to include',
  },
  hints: {
    ...mockToolHints,
    dynamic: {
      multipleDefinitions: ['Multiple definitions found - check all locations'],
      externalPackage: ['Definition in external package - use packageSearch'],
      fallbackMode: ['Using text-based fallback (LSP unavailable)'],
      symbolNotFound: ['Symbol not found - verify name and lineHint'],
      fileNotFound: ['File not found - check path'],
      timeout: ['LSP timeout - try again or use localSearchCode'],
    },
  },
};

const lspFindReferencesSchema = {
  name: 'lspFindReferences',
  description: 'Find all references to a symbol using Language Server Protocol',
  schema: {
    uri: 'File URI',
    symbolName: 'Symbol name to find',
    lineHint: 'Line number hint',
    orderHint: 'Order hint',
    includeDeclaration: 'Include declaration in results',
    contextLines: 'Lines of context',
    referencesPerPage: 'References per page',
    page: 'Page number',
  },
  hints: {
    ...mockToolHints,
    dynamic: {
      manyReferences: ['Many references - use pagination'],
      multipleFiles: ['References span multiple files'],
      pagination: ['More results available - increment page'],
      fallbackMode: ['Using text-based fallback (LSP unavailable)'],
      symbolNotFound: ['Symbol not found - verify name and lineHint'],
      timeout: ['LSP timeout - try localSearchCode instead'],
    },
  },
};

const lspCallHierarchySchema = {
  name: 'lspCallHierarchy',
  description: 'Explore function call hierarchy using Language Server Protocol',
  schema: {
    uri: 'File URI',
    symbolName: 'Symbol name',
    lineHint: 'Line number hint',
    orderHint: 'Order hint',
    direction: 'incoming or outgoing',
    depth: 'Call chain depth',
    contextLines: 'Lines of context',
    callsPerPage: 'Calls per page',
    page: 'Page number',
  },
  hints: {
    ...mockToolHints,
    dynamic: {
      incomingResults: ['Found callers - trace the call chain'],
      outgoingResults: ['Found callees - explore dependencies'],
      deepChain: ['Deep call chain - use depth=1 for performance'],
      pagination: ['More calls available - increment page'],
      fallbackMode: ['Using pattern-based fallback (LSP unavailable)'],
      noCallers: ['No callers found - function may be entry point'],
      noCallees: ['No callees found - function is leaf node'],
      notAFunction: ['Symbol is not a function - use lspFindReferences'],
      timeout: ['LSP timeout - reduce depth or use localSearchCode'],
    },
  },
};

// Enhanced local tool schemas with dynamic hints
const localRipgrepSchema = {
  name: 'localSearchCode',
  description: 'Search code with ripgrep',
  schema: {},
  hints: {
    ...mockToolHints,
    dynamic: mockDynamicHints,
  },
};

const localFetchContentSchema = {
  name: 'localGetFileContent',
  description: 'Read local file content',
  schema: {},
  hints: {
    ...mockToolHints,
    dynamic: mockDynamicHints,
  },
};

const localViewStructureSchema = {
  name: 'localViewStructure',
  description: 'Browse local directory structure',
  schema: {},
  hints: {
    ...mockToolHints,
    dynamic: mockDynamicHints,
  },
};

const localFindFilesSchema = {
  name: 'localFindFiles',
  description: 'Find files by metadata',
  schema: {},
  hints: {
    ...mockToolHints,
    dynamic: mockDynamicHints,
  },
};

// Enhanced GitHub tool schemas with dynamic hints
const githubSearchCodeSchema = {
  name: 'githubSearchCode',
  description: 'Search code across GitHub',
  schema: {},
  hints: {
    ...mockToolHints,
    dynamic: mockDynamicHints,
  },
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
    LSP_GOTO_DEFINITION: 'lspGotoDefinition',
    LSP_FIND_REFERENCES: 'lspFindReferences',
    LSP_CALL_HIERARCHY: 'lspCallHierarchy',
  },
  baseSchema: {
    mainResearchGoal: 'Main research goal description',
    researchGoal: 'Research goal description',
    reasoning: 'Reasoning description',
    bulkQueryTemplate: 'Research queries for {toolName}',
  },
  tools: {
    githubGetFileContent: githubFetchContentSchema,
    githubSearchCode: githubSearchCodeSchema,
    githubSearchPullRequests: mockToolSchema,
    githubSearchRepositories: mockToolSchema,
    githubViewRepoStructure: mockToolSchema,
    packageSearch: mockToolSchema,
    localSearchCode: localRipgrepSchema,
    localGetFileContent: localFetchContentSchema,
    localFindFiles: localFindFilesSchema,
    localViewStructure: localViewStructureSchema,
    lspGotoDefinition: lspGotoDefinitionSchema,
    lspFindReferences: lspFindReferencesSchema,
    lspCallHierarchy: lspCallHierarchySchema,
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
