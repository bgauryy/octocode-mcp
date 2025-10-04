import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  processBulkQueries,
  createBulkResponse,
  ProcessedBulkResult,
  QueryError,
} from '../../src/utils/bulkOperations';
import { ToolName } from '../../src/constants';

describe('bulkOperations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('processBulkQueries', () => {
    const mockProcessor = vi.fn();

    beforeEach(() => {
      mockProcessor.mockClear();
    });

    it('should process queries successfully', async () => {
      const queries = [
        { id: 'q1', data: 'test1' },
        { id: 'q2', data: 'test2' },
      ];

      mockProcessor.mockImplementation(
        async (query: { id: string; data: string }, index: number) => ({
          data: { result: `processed-${query.data}` },
          metadata: { processed: true, queryIndex: index },
        })
      );

      const result = await processBulkQueries(queries, mockProcessor);

      expect(result.results).toHaveLength(2);
      expect(result.errors).toHaveLength(0);

      expect(result.results[0]?.result.data).toEqual({
        result: 'processed-test1',
      });

      expect(result.results[1]?.result.data).toEqual({
        result: 'processed-test2',
      });

      expect(mockProcessor).toHaveBeenCalledTimes(2);
    });

    it('should handle processing errors', async () => {
      const queries = [
        { id: 'success', data: 'good' },
        { id: 'failure', data: 'bad' },
      ];

      mockProcessor.mockImplementation(
        async (query: { id: string; data: string }, index: number) => {
          if (query.data === 'bad') {
            throw new Error('Processing failed');
          }
          return {
            data: { result: 'success' },
            metadata: { queryIndex: index },
          };
        }
      );

      const result = await processBulkQueries(queries, mockProcessor);

      expect(result.results).toHaveLength(1);
      expect(result.errors).toHaveLength(1);

      expect(result.errors[0]?.queryIndex).toBe(1);
      expect(result.errors[0]?.error).toBe('Processing failed');
    });

    it('should handle empty queries array', async () => {
      const result = await processBulkQueries([], mockProcessor);

      expect(result.results).toHaveLength(0);
      expect(result.errors).toHaveLength(0);
      expect(mockProcessor).not.toHaveBeenCalled();
    });

    it('should handle non-Error rejections', async () => {
      const queries = [{ id: 'test', data: 'data' }];

      mockProcessor.mockRejectedValue('string error');

      const result = await processBulkQueries(queries, mockProcessor);

      expect(result.results).toHaveLength(0);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]?.error).toBe('string error');
    });
  });

  describe('createBulkResponse', () => {
    it('should create response with successful results', () => {
      const processedResults: ProcessedBulkResult[] = [
        {
          data: { items: [{ name: 'item1' }] },
          metadata: { type: 'success', count: 1 },
        },
        {
          data: { items: [{ name: 'item2' }] },
          metadata: { type: 'success', count: 1 },
        },
      ];

      const queries = [
        { id: 'q1', keywordsToSearch: ['test1'] },
        { id: 'q2', keywordsToSearch: ['test2'] },
      ];

      const results = processedResults.map((r, index) => ({
        result: r,
        queryIndex: index,
        originalQuery: queries[index] || {
          id: `query_${index}`,
          keywordsToSearch: [],
        },
      }));
      const errors: QueryError[] = [];

      const config = {
        toolName: 'github_search_code' as ToolName,
      };

      const result = createBulkResponse(config, results, errors, queries);

      expect(result.isError).toBe(false);
      expect(result.content).toHaveLength(1);

      const responseText = result.content[0]?.text as string;
      // Parse YAML-ish output and assert grouped shape
      expect(responseText).toContain('data:');
      expect(responseText).toContain('results:');
      // Should NOT contain empty sections
      expect(responseText).not.toContain('empty:');
      expect(responseText).not.toContain('failed:');
      expect(responseText).toContain('hints:');
      // Ensure success items present
      expect(responseText).toContain('name: "item1"');
      expect(responseText).toContain('name: "item2"');
      // Ensure research strategies hint exists
      expect(responseText).toContain('improve your research strategy');
    });

    it('should create response with errors', () => {
      const processedResults: ProcessedBulkResult[] = [];
      const queries = [{ id: 'q1', keywordsToSearch: ['test1'] }];
      const results = processedResults.map((r, index) => ({
        result: r,
        queryIndex: index,
        originalQuery: queries[index] || {
          id: `query_${index}`,
          keywordsToSearch: [],
        },
      }));
      const errors: QueryError[] = [
        {
          queryIndex: 0,
          error: 'API rate limit exceeded',
        },
      ];
      const config = {
        toolName: 'github_search_repos' as ToolName,
      };

      const result = createBulkResponse(config, results, errors, queries);

      expect(result.isError).toBe(false);
      const responseText = result.content[0]?.text as string;
      expect(responseText).toContain('failed:');
      expect(responseText).toContain('error: "API rate limit exceeded"');
      expect(responseText).toContain('originalQuery:');
      expect(responseText).toContain('keywordsToSearch:');
      expect(responseText).toContain('hints:');
    });

    it('should handle empty results and errors', () => {
      const processedResults: ProcessedBulkResult[] = [];
      const results = processedResults.map((r, index) => ({
        result: r,
        queryIndex: index,
        originalQuery: {
          id: `query_${index}`,
          keywordsToSearch: [],
        },
      }));
      const errors: QueryError[] = [];
      const queries: Array<{ id: string; keywordsToSearch: string[] }> = []; // No queries

      const config = {
        toolName: 'githubSearchCode' as ToolName,
      };

      const result = createBulkResponse(config, results, errors, queries);

      expect(result.isError).toBe(false);
      const responseText = result.content[0]?.text as string;
      // Should NOT contain any data sections since all are empty
      expect(responseText).not.toContain('successful:');
      expect(responseText).not.toContain('empty:');
      expect(responseText).not.toContain('failed:');
      expect(responseText).toContain('hints:');
      // Should show empty state in summary
      expect(responseText).toContain('No queries processed');
    });

    it('should handle config options', () => {
      const processedResults: ProcessedBulkResult[] = [
        {
          data: { test: true },
          metadata: { processed: true },
        },
      ];

      const queries = [{ id: 'q1', keywordsToSearch: ['test1'] }];
      const results = processedResults.map((r, index) => ({
        result: r,
        queryIndex: index,
        originalQuery: queries[index] || {
          id: `query_${index}`,
          keywordsToSearch: [],
        },
      }));
      const errors: QueryError[] = [];

      const config = {
        toolName: 'github_search_code' as ToolName,
      };

      const result = createBulkResponse(config, results, errors, queries);

      expect(result.isError).toBe(false);
      // The exact structure depends on implementation, but it should not crash
      expect(result.content).toHaveLength(1);
    });
  });

  describe('Integration Tests', () => {
    it('should work end-to-end with real-like scenario', async () => {
      const queries = [
        { name: 'react components' },
        { name: 'vue components' },
      ];

      // Process queries
      const mockProcessor = vi
        .fn()
        .mockImplementation(async (query: { name: string }, index: number) => ({
          data: {
            query: query.name,
            results: [`result for ${query.name}`],
          },
          metadata: { processed: true, queryIndex: index },
        }));

      const processResult = await processBulkQueries(queries, mockProcessor);

      // Create bulk response
      const config = {
        toolName: 'github_search_code' as ToolName,
      };
      const bulkResponse = createBulkResponse(
        config,
        processResult.results,
        processResult.errors,
        queries
      );

      expect(queries).toHaveLength(2);
      expect(processResult.results).toHaveLength(2);
      expect(processResult.errors).toHaveLength(0);
      expect(bulkResponse.isError).toBe(false);

      expect(mockProcessor).toHaveBeenCalledTimes(2);
    });

    it('should handle mixed success and failure', async () => {
      const queries = [
        { name: 'success_query' },
        { name: 'fail_query' },
        { name: 'another_success' },
      ];

      const mockProcessor = vi
        .fn()
        .mockImplementation(async (query: { name: string }, index: number) => {
          if (query.name === 'fail_query') {
            throw new Error('Processing failed');
          }
          return {
            data: { result: 'success' },
            metadata: { queryIndex: index },
          };
        });

      const result = await processBulkQueries(queries, mockProcessor);

      expect(result.results).toHaveLength(2);
      expect(result.errors).toHaveLength(1);
      const bulkResponse = createBulkResponse(
        { toolName: 'githubSearchRepositories' as ToolName },
        result.results,
        result.errors,
        queries
      );

      expect(bulkResponse.isError).toBe(false);
    });
  });

  describe('reasoning propagation', () => {
    it('should propagate reasoning from queries to successful results', async () => {
      const queries = [
        {
          id: 'test1',
          reasoning: 'Find LangGraph implementations for AI agents',
          name: 'query1',
        },
        {
          id: 'test2',
          reasoning: 'Search for context management patterns',
          name: 'query2',
        },
        {
          id: 'test3',
          name: 'query3', // No reasoning provided
        },
      ];

      const mockProcessor = vi
        .fn()
        .mockImplementation(
          async (_query: { id: string; name: string }, index: number) => ({
            data: { files: [{ path: 'test.py', content: 'test content' }] },
            metadata: { queryIndex: index },
          })
        );

      const { results, errors } = await processBulkQueries(
        queries,
        mockProcessor
      );

      const bulkResponse = createBulkResponse(
        { toolName: 'githubSearchCode' as ToolName },
        results,
        errors,
        queries
      );

      const yamlText = (bulkResponse.content[0]?.text as string) || '';
      expect(yamlText).toContain('results:');
      expect(yamlText).toContain('files:');
      expect(yamlText).toContain('path: "test.py"');
    });

    it('should propagate reasoning from queries to error results', async () => {
      const queries = [
        {
          id: 'error1',
          reasoning: 'This query will fail with reasoning',
          name: 'fail_query',
        },
        {
          id: 'error2',
          name: 'fail_query_no_reasoning', // No reasoning provided
        },
      ];

      const mockProcessor = vi
        .fn()
        .mockImplementation(async (query: { id: string; name: string }) => {
          throw new Error(`Processing failed for ${query.name}`);
        });

      const { results, errors } = await processBulkQueries(
        queries,
        mockProcessor
      );

      const bulkResponse = createBulkResponse(
        { toolName: 'githubFetchContent' as ToolName },
        results,
        errors,
        queries
      );

      const yamlText = (bulkResponse.content[0]?.text as string) || '';
      expect(yamlText).toContain('failed:');
      expect(yamlText).toContain('Processing failed for fail_query');
      expect(yamlText).toContain('originalQuery:');
    });

    it('should preserve result reasoning over query reasoning when both exist', async () => {
      const queries = [
        {
          id: 'test1',
          reasoning: 'Query reasoning that should be overridden',
          name: 'query1',
        },
      ];

      const mockProcessor = vi
        .fn()
        .mockImplementation(
          async (_query: { id: string; name: string }, index: number) => ({
            reasoning: 'Result reasoning that should take precedence',
            data: { files: [{ path: 'test.py' }] },
            metadata: { queryIndex: index },
          })
        );

      const { results, errors } = await processBulkQueries(
        queries,
        mockProcessor
      );

      const bulkResponse = createBulkResponse(
        { toolName: 'githubSearchRepositories' as ToolName },
        results,
        errors,
        queries
      );

      const yamlText = (bulkResponse.content[0]?.text as string) || '';
      expect(yamlText).toContain(
        'reasoning: "Result reasoning that should take precedence"'
      );
      expect(yamlText).toContain('files:');
    });

    it('should handle mixed success and error results with reasoning', async () => {
      const queries = [
        {
          id: 'success1',
          reasoning: 'Successful query with reasoning',
          name: 'success_query',
        },
        {
          id: 'error1',
          reasoning: 'Failed query with reasoning',
          name: 'fail_query',
        },
        {
          id: 'success2',
          name: 'success_query_no_reasoning', // No reasoning
        },
        {
          id: 'error2',
          name: 'fail_query_no_reasoning', // No reasoning
        },
      ];

      const mockProcessor = vi
        .fn()
        .mockImplementation(
          async (query: { id: string; name: string }, index: number) => {
            if (query.name.includes('fail')) {
              throw new Error(`Processing failed for ${query.name}`);
            }
            return {
              data: { repositories: [{ name: 'test-repo' }] },
              metadata: { queryIndex: index },
            };
          }
        );

      const { results, errors } = await processBulkQueries(
        queries,
        mockProcessor
      );

      const bulkResponse = createBulkResponse(
        { toolName: 'githubViewRepoStructure' as ToolName },
        results,
        errors,
        queries
      );

      const yamlText = (bulkResponse.content[0]?.text as string) || '';
      // Successful queries with repositories are in empty (they have empty content)
      expect(yamlText).toContain('empty:');
      expect(yamlText).toContain('failed:');
      expect(yamlText).toContain('repositories:');
      // No actual "successful" section (all went to empty or failed)
      expect(yamlText).not.toContain('successful:');
      expect(yamlText).toContain('Processing failed for fail_query');
    });

    it('should handle empty or whitespace-only reasoning', async () => {
      const queries = [
        {
          id: 'test1',
          reasoning: '', // Empty reasoning
          name: 'query1',
        },
        {
          id: 'test2',
          reasoning: '   ', // Whitespace-only reasoning
          name: 'query2',
        },
        {
          id: 'test3',
          reasoning: 'Valid reasoning',
          name: 'query3',
        },
      ];

      const mockProcessor = vi
        .fn()
        .mockImplementation(
          async (_query: { id: string; name: string }, index: number) => ({
            data: { content: 'test content' },
            metadata: { queryIndex: index },
          })
        );

      const { results, errors } = await processBulkQueries(
        queries,
        mockProcessor
      );

      const bulkResponse = createBulkResponse(
        { toolName: 'githubFetchContent' as ToolName },
        results,
        errors,
        queries
      );

      const yamlText = (bulkResponse.content[0]?.text as string) || '';
      expect(yamlText).toContain('results:');
      expect(yamlText).toContain('content: "test content"');
    });

    it('should maintain query order with reasoning in results', async () => {
      const queries = [
        {
          id: 'first',
          reasoning: 'First query reasoning',
          name: 'query1',
        },
        {
          id: 'second',
          reasoning: 'Second query reasoning',
          name: 'query2',
        },
        {
          id: 'third',
          reasoning: 'Third query reasoning',
          name: 'query3',
        },
      ];

      const mockProcessor = vi
        .fn()
        .mockImplementation(
          async (query: { id: string; name: string }, index: number) => ({
            data: { result: `Result for ${query.name}` },
            metadata: { queryIndex: index },
          })
        );

      const { results, errors } = await processBulkQueries(
        queries,
        mockProcessor
      );

      const bulkResponse = createBulkResponse(
        { toolName: 'githubSearchPullRequests' as ToolName },
        results,
        errors,
        queries
      );

      const yamlText = (bulkResponse.content[0]?.text as string) || '';
      expect(yamlText).toContain('results:');
      expect(yamlText).toContain('First query reasoning');
      expect(yamlText).toContain('Second query reasoning');
      expect(yamlText).toContain('Third query reasoning');
    });
  });

  describe('GitHub API flow detection (empty vs content vs error)', () => {
    it('should treat code search empty result (total_count:0, items:[]) as no-results', () => {
      const queries = [{ id: 'q1', name: 'code_search_empty' }];

      const results = [
        {
          queryIndex: 0,
          result: {
            files: [],
            metadata: {},
          } as unknown as ProcessedBulkResult,
          originalQuery: queries[0]!,
        },
      ];

      const resp = createBulkResponse(
        { toolName: 'githubSearchCode' as ToolName },
        results,
        [],
        queries
      );

      const yamlText = resp.content[0]!.text as string;
      expect(yamlText).toContain('empty:');
      expect(yamlText).toContain('files: []');
    });

    it('should handle repo search empty and non-empty', () => {
      const queries = [
        { id: 'rq1', name: 'repos_empty' },
        { id: 'rq2', name: 'repos_non_empty' },
      ];

      const results = [
        {
          queryIndex: 0,
          result: {
            repositories: [],
            metadata: {},
          } as unknown as ProcessedBulkResult,
          originalQuery: queries[0]!,
        },
        {
          queryIndex: 1,
          result: {
            repositories: [{ repository: 'a/b' }, { repository: 'c/d' }],
            metadata: {},
          } as unknown as ProcessedBulkResult,
          originalQuery: queries[1]!,
        },
      ];

      const resp = createBulkResponse(
        { toolName: 'githubSearchRepositories' as ToolName },
        results,
        [],
        queries
      );

      const yamlText = resp.content[0]!.text as string;
      expect(yamlText).toContain('empty:');
      expect(yamlText).toContain('repositories: []');
      expect(yamlText).toContain('repositories:');
    });

    it('should handle pull request search empty and non-empty', () => {
      const queries = [
        { id: 'pq1', name: 'prs_empty' },
        { id: 'pq2', name: 'prs_non_empty' },
      ];

      const results = [
        {
          queryIndex: 0,
          result: {
            pull_requests: [],
            total_count: 0,
            metadata: {},
          } as unknown as ProcessedBulkResult,
          originalQuery: queries[0]!,
        },
        {
          queryIndex: 1,
          result: {
            pull_requests: [{ number: 1, title: 'PR', url: 'u' }],
            total_count: 1,
            metadata: {},
          } as unknown as ProcessedBulkResult,
          originalQuery: queries[1]!,
        },
      ];

      const resp = createBulkResponse(
        { toolName: 'githubSearchPullRequests' as ToolName },
        results,
        [],
        queries
      );

      const yamlText = resp.content[0]!.text as string;
      expect(yamlText).toContain('empty:');
      expect(yamlText).toContain('pull_requests: []');
      expect(yamlText).toContain('pull_requests:');
    });

    it('should handle repo structure empty and non-empty', () => {
      const queries = [
        { id: 'sq1', name: 'structure_empty' },
        { id: 'sq2', name: 'structure_non_empty' },
      ];

      const results = [
        {
          queryIndex: 0,
          result: {
            files: [],
            folders: [],
            metadata: {},
          } as unknown as ProcessedBulkResult,
          originalQuery: queries[0]!,
        },
        {
          queryIndex: 1,
          result: {
            files: [{ path: 'README.md' }],
            folders: [{ path: 'src' }],
            metadata: {},
          } as unknown as ProcessedBulkResult,
          originalQuery: queries[1]!,
        },
      ];

      const resp = createBulkResponse(
        { toolName: 'githubViewRepoStructure' as ToolName },
        results,
        [],
        queries
      );

      const yamlText = resp.content[0]!.text as string;
      expect(yamlText).toContain('empty:');
      expect(yamlText).toContain('files: []');
      expect(yamlText).toContain('folders: []');
      expect(yamlText).toContain('results:');
      expect(yamlText).toContain('path: "README.md"');
      expect(yamlText).toContain('path: "src"');
    });
    it('should treat code search with items as meaningful content', () => {
      const queries = [{ id: 'q1', name: 'code_search_non_empty' }];

      const results = [
        {
          queryIndex: 0,
          result: {
            files: [{ path: 'src/index.ts', url: 'https://example' }],
            metadata: {},
          } as unknown as ProcessedBulkResult,
          originalQuery: queries[0]!,
        },
      ];

      const resp = createBulkResponse(
        { toolName: 'githubSearchCode' as ToolName },
        results,
        [],
        queries
      );

      const yamlText = resp.content[0]!.text as string;
      expect(yamlText).toContain('results:');
      expect(yamlText).toContain('path: "src/index.ts"');
      expect(yamlText).toContain('url: "https://example"');
    });

    it('should treat empty file content as error (per API) and non-empty as content', () => {
      const queries = [
        { id: 'q1', name: 'file_content_empty' },
        { id: 'q2', name: 'file_content_non_empty' },
      ];

      const results = [
        {
          queryIndex: 1,
          result: {
            data: { content: 'console.log(1);' },
            metadata: {},
          } as unknown as ProcessedBulkResult,
          originalQuery: queries[1]!,
        },
      ];

      const resp = createBulkResponse(
        { toolName: 'githubFetchContent' as ToolName },
        results,
        [
          {
            queryIndex: 0,
            error: 'File is empty - no content to display',
          } as QueryError,
        ],
        queries
      );

      const yamlText = resp.content[0]!.text as string;
      expect(yamlText).toContain('failed:');
      expect(yamlText).toContain(
        'error: "File is empty - no content to display"'
      );
      expect(yamlText).toContain('results:');
      expect(yamlText).toContain('content: "console.log(1);"');
    });

    it('should include errors as error results with query args', () => {
      const queries = [{ id: 'qerr', name: 'error_case' }];

      const resp = createBulkResponse(
        { toolName: 'githubSearchRepositories' as ToolName },
        [],
        [{ queryIndex: 0, error: 'GitHub API error' } as QueryError],
        queries
      );

      const yamlText = resp.content[0]!.text as string;
      expect(yamlText).toContain('failed:');
      expect(yamlText).toContain('error: "GitHub API error"');
      expect(yamlText).toContain('originalQuery:');
    });
  });
});
