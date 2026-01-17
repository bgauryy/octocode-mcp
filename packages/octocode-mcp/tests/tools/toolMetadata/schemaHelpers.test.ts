import { describe, it, expect, beforeEach, vi } from 'vitest';
import { fetchWithRetries } from '../../../src/utils/http/fetch.js';

vi.mock('../../../src/utils/http/fetch.js');
vi.mock('../../../src/session.js', () => ({
  logSessionError: vi.fn(() => Promise.resolve()),
}));

const mockFetchWithRetries = vi.mocked(fetchWithRetries);

const mockMetadata = {
  instructions: 'Test',
  prompts: {},
  toolNames: {
    GITHUB_FETCH_CONTENT: 'githubGetFileContent',
    GITHUB_SEARCH_CODE: 'githubSearchCode',
    GITHUB_SEARCH_REPOSITORIES: 'githubSearchRepositories',
    LOCAL_RIPGREP: 'localSearchCode',
    LSP_GOTO_DEFINITION: 'lspGotoDefinition',
  },
  baseSchema: {
    mainResearchGoal: 'Main',
    researchGoal: 'Research',
    reasoning: 'Reason',
    bulkQueryTemplate: 'Query {toolName}',
  },
  tools: {
    githubGetFileContent: {
      name: 'githubGetFileContent',
      description: 'Get file content',
      schema: {
        owner: 'Repository owner',
        repo: 'Repository name',
        path: 'File path',
        branch: 'Branch name',
      },
      hints: { hasResults: [], empty: [] },
    },
    githubSearchCode: {
      name: 'githubSearchCode',
      description: 'Search code',
      schema: {
        keywordsToSearch: 'Keywords to search for',
        owner: 'Repo owner',
        repo: 'Repo name',
      },
      hints: { hasResults: [], empty: [] },
    },
    githubSearchRepositories: {
      name: 'githubSearchRepositories',
      description: 'Search repos',
      schema: {
        keywordsToSearch: 'Keywords',
        topicsToSearch: 'Topics',
        stars: 'Star count filter',
      },
      hints: { hasResults: [], empty: [] },
    },
    localSearchCode: {
      name: 'localSearchCode',
      description: 'Local search',
      schema: {
        pattern: 'Search pattern',
        path: 'Search path',
      },
      hints: { hasResults: [], empty: [] },
    },
    lspGotoDefinition: {
      name: 'lspGotoDefinition',
      description: 'Go to definition',
      schema: {
        uri: 'File URI',
        symbolName: 'Symbol name',
        lineHint: 'Line hint',
      },
      hints: { hasResults: [], empty: [] },
    },
  },
  baseHints: { hasResults: [], empty: [] },
  genericErrorHints: [],
};

describe('toolMetadata/schemaHelpers', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  describe('GITHUB_FETCH_CONTENT', () => {
    it('should access schema fields through proxy', async () => {
      const { initializeToolMetadata, _resetMetadataState } =
        await import('../../../src/tools/toolMetadata/state.js');
      const { GITHUB_FETCH_CONTENT } =
        await import('../../../src/tools/toolMetadata/schemaHelpers.js');
      _resetMetadataState();
      mockFetchWithRetries.mockResolvedValueOnce(mockMetadata);
      await initializeToolMetadata();

      expect(GITHUB_FETCH_CONTENT.scope.owner).toBe('Repository owner');
      expect(GITHUB_FETCH_CONTENT.scope.repo).toBe('Repository name');
      expect(GITHUB_FETCH_CONTENT.scope.path).toBe('File path');
    });

    it('should return empty string for unknown fields', async () => {
      const { initializeToolMetadata, _resetMetadataState } =
        await import('../../../src/tools/toolMetadata/state.js');
      const { GITHUB_FETCH_CONTENT } =
        await import('../../../src/tools/toolMetadata/schemaHelpers.js');
      _resetMetadataState();
      mockFetchWithRetries.mockResolvedValueOnce(mockMetadata);
      await initializeToolMetadata();

      const helper = GITHUB_FETCH_CONTENT as Record<
        string,
        Record<string, string>
      >;
      expect(helper['scope']!['unknown']).toBe('');
    });
  });

  describe('GITHUB_SEARCH_CODE', () => {
    it('should access search schema fields', async () => {
      const { initializeToolMetadata, _resetMetadataState } =
        await import('../../../src/tools/toolMetadata/state.js');
      const { GITHUB_SEARCH_CODE } =
        await import('../../../src/tools/toolMetadata/schemaHelpers.js');
      _resetMetadataState();
      mockFetchWithRetries.mockResolvedValueOnce(mockMetadata);
      await initializeToolMetadata();

      expect(GITHUB_SEARCH_CODE.search.keywordsToSearch).toBe(
        'Keywords to search for'
      );
      expect(GITHUB_SEARCH_CODE.scope.owner).toBe('Repo owner');
    });
  });

  describe('GITHUB_SEARCH_REPOS', () => {
    it('should access repo search schema fields', async () => {
      const { initializeToolMetadata, _resetMetadataState } =
        await import('../../../src/tools/toolMetadata/state.js');
      const { GITHUB_SEARCH_REPOS } =
        await import('../../../src/tools/toolMetadata/schemaHelpers.js');
      _resetMetadataState();
      mockFetchWithRetries.mockResolvedValueOnce(mockMetadata);
      await initializeToolMetadata();

      expect(GITHUB_SEARCH_REPOS.search.topicsToSearch).toBe('Topics');
      expect(GITHUB_SEARCH_REPOS.filters.stars).toBe('Star count filter');
    });
  });

  describe('LOCAL_RIPGREP', () => {
    it('should access local search schema fields', async () => {
      const { initializeToolMetadata, _resetMetadataState } =
        await import('../../../src/tools/toolMetadata/state.js');
      const { LOCAL_RIPGREP } =
        await import('../../../src/tools/toolMetadata/schemaHelpers.js');
      _resetMetadataState();
      mockFetchWithRetries.mockResolvedValueOnce(mockMetadata);
      await initializeToolMetadata();

      expect(LOCAL_RIPGREP.search.pattern).toBe('Search pattern');
      expect(LOCAL_RIPGREP.search.path).toBe('Search path');
    });
  });

  describe('LSP_GOTO_DEFINITION', () => {
    it('should access LSP schema fields', async () => {
      const { initializeToolMetadata, _resetMetadataState } =
        await import('../../../src/tools/toolMetadata/state.js');
      const { LSP_GOTO_DEFINITION } =
        await import('../../../src/tools/toolMetadata/schemaHelpers.js');
      _resetMetadataState();
      mockFetchWithRetries.mockResolvedValueOnce(mockMetadata);
      await initializeToolMetadata();

      expect(LSP_GOTO_DEFINITION.scope.uri).toBe('File URI');
      expect(LSP_GOTO_DEFINITION.scope.symbolName).toBe('Symbol name');
      expect(LSP_GOTO_DEFINITION.scope.lineHint).toBe('Line hint');
    });
  });

  describe('uninitialized state', () => {
    it('should return empty string when not initialized', async () => {
      const { _resetMetadataState } =
        await import('../../../src/tools/toolMetadata/state.js');
      const { GITHUB_FETCH_CONTENT } =
        await import('../../../src/tools/toolMetadata/schemaHelpers.js');
      _resetMetadataState();

      expect(GITHUB_FETCH_CONTENT.scope.owner).toBe('');
    });
  });

  describe('nested proxy access', () => {
    it('should handle any category access', async () => {
      const { initializeToolMetadata, _resetMetadataState } =
        await import('../../../src/tools/toolMetadata/state.js');
      const { GITHUB_SEARCH_CODE } =
        await import('../../../src/tools/toolMetadata/schemaHelpers.js');
      _resetMetadataState();
      mockFetchWithRetries.mockResolvedValueOnce(mockMetadata);
      await initializeToolMetadata();

      // Access through unknown category should still work
      const helper = GITHUB_SEARCH_CODE as Record<
        string,
        Record<string, string>
      >;
      expect(helper['anyCategory']!['anyField']).toBe('');
    });
  });
});
