/**
 * Edge case tests for final branch coverage
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/session.js', () => ({
  logSessionError: vi.fn(() => Promise.resolve()),
}));

vi.mock('../../src/utils/http/fetch.js');

describe('toolMetadata - Final Edge Cases', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  describe('Concurrent initialization (line 146)', () => {
    it('should handle concurrent initializeToolMetadata calls', async () => {
      const { fetchWithRetries } =
        await import('../../src/utils/http/fetch.js');

      // Mock a slow response to create concurrency scenario
      vi.mocked(fetchWithRetries).mockImplementation(
        () =>
          new Promise(resolve => {
            setTimeout(() => {
              resolve({
                toolNames: {
                  GITHUB_FETCH_CONTENT: 'githubGetFileContent',
                  GITHUB_SEARCH_CODE: 'githubSearchCode',
                  GITHUB_SEARCH_REPOSITORIES: 'githubSearchRepositories',
                  GITHUB_SEARCH_PULL_REQUESTS: 'githubSearchPullRequests',
                  GITHUB_VIEW_REPO_STRUCTURE: 'githubViewRepoStructure',
                },
                baseSchema: {
                  mainResearchGoal: 'goal',
                  researchGoal: 'goal',
                  reasoning: 'reasoning',
                  bulkQueryTemplate: 'template',
                },
                tools: {},
                baseHints: { hasResults: [], empty: [] },
                genericErrorHints: [],
                prompts: {},
                instructions: 'test',
              });
            }, 50);
          })
      );

      const { initializeToolMetadata } =
        await import('../../src/tools/toolMetadata/index.js');

      // Call initializeToolMetadata multiple times concurrently
      // Second call should hit line 146 (return initializationPromise)
      const promise1 = initializeToolMetadata();
      const promise2 = initializeToolMetadata();
      const promise3 = initializeToolMetadata();

      await Promise.all([promise1, promise2, promise3]);

      // Fetch should only be called once
      expect(vi.mocked(fetchWithRetries)).toHaveBeenCalledTimes(1);
    });
  });

  describe('loadToolContent auto-initialization (line 206)', () => {
    it('should auto-initialize when metadata is null', async () => {
      const { fetchWithRetries } =
        await import('../../src/utils/http/fetch.js');

      vi.mocked(fetchWithRetries).mockResolvedValue({
        toolNames: {
          GITHUB_FETCH_CONTENT: 'githubGetFileContent',
          GITHUB_SEARCH_CODE: 'githubSearchCode',
          GITHUB_SEARCH_REPOSITORIES: 'githubSearchRepositories',
          GITHUB_SEARCH_PULL_REQUESTS: 'githubSearchPullRequests',
          GITHUB_VIEW_REPO_STRUCTURE: 'githubViewRepoStructure',
        },
        baseSchema: {
          mainResearchGoal: 'goal',
          researchGoal: 'goal',
          reasoning: 'reasoning',
          bulkQueryTemplate: 'template',
        },
        tools: {},
        baseHints: { hasResults: [], empty: [] },
        genericErrorHints: [],
        prompts: {},
        instructions: 'test',
      });

      const { loadToolContent } =
        await import('../../src/tools/toolMetadata/index.js');

      // This should trigger line 206 (await initializeToolMetadata())
      const content = await loadToolContent();

      expect(content).toBeDefined();
      expect(content.toolNames).toBeDefined();
    });

    it('should not reinitialize if metadata already loaded', async () => {
      const { fetchWithRetries } =
        await import('../../src/utils/http/fetch.js');

      vi.mocked(fetchWithRetries).mockResolvedValue({
        toolNames: {
          GITHUB_FETCH_CONTENT: 'githubGetFileContent',
          GITHUB_SEARCH_CODE: 'githubSearchCode',
          GITHUB_SEARCH_REPOSITORIES: 'githubSearchRepositories',
          GITHUB_SEARCH_PULL_REQUESTS: 'githubSearchPullRequests',
          GITHUB_VIEW_REPO_STRUCTURE: 'githubViewRepoStructure',
        },
        baseSchema: {
          mainResearchGoal: 'goal',
          researchGoal: 'goal',
          reasoning: 'reasoning',
          bulkQueryTemplate: 'template',
        },
        tools: {},
        baseHints: { hasResults: [], empty: [] },
        genericErrorHints: [],
        prompts: {},
        instructions: 'test',
      });

      const { initializeToolMetadata, loadToolContent } =
        await import('../../src/tools/toolMetadata/index.js');

      // Initialize first
      await initializeToolMetadata();
      const callCount1 = vi.mocked(fetchWithRetries).mock.calls.length;

      // Load tool content - should NOT call fetch again
      await loadToolContent();
      const callCount2 = vi.mocked(fetchWithRetries).mock.calls.length;

      expect(callCount1).toBe(callCount2); // Same count = no additional fetch
    });
  });
});
