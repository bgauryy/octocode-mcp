import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  ensureUniqueQueryIds,
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

  describe('ensureUniqueQueryIds', () => {
    it('should generate unique IDs for queries without existing IDs', () => {
      const queries = [
        { name: 'query1' },
        { name: 'query2' },
        { name: 'query3' },
      ];

      const result = ensureUniqueQueryIds(queries);

      expect(result).toHaveLength(3);
      result.forEach((query, index) => {
        expect(query.id).toBeDefined();
        expect(typeof query.id).toBe('string');
        expect(query.name).toBe(`query${index + 1}`);
      });

      // All IDs should be unique
      const ids = result.map(q => q.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(3);
    });

    it('should preserve external IDs and generate fallbacks for missing ones', () => {
      const queries = [
        { id: 'custom-id-1', name: 'query1' },
        { name: 'query2' },
        { id: 'custom-id-3', name: 'query3' },
      ];

      const result = ensureUniqueQueryIds(queries);

      expect(result[0]?.id).toBe('custom-id-1');
      expect(result[1]?.id).toBe('query_2');
      expect(result[2]?.id).toBe('custom-id-3');
    });

    it('should handle empty query array', () => {
      const result = ensureUniqueQueryIds([]);
      expect(result).toEqual([]);
    });

    it('should handle queries with mixed ID types', () => {
      const queries = [
        { id: 'string-id', name: 'query1' },
        { id: null, name: 'query2' }, // Null ID
        { name: 'query3' }, // No ID
      ];

      const result = ensureUniqueQueryIds(queries);

      expect(result).toHaveLength(3);
      expect(result[0]?.id).toBe('string-id');
      expect(result[1]?.id).toBe('query_2'); // null ID gets fallback
      expect(result[2]?.id).toBe('query_3');
    });

    it('should use custom default prefix', () => {
      const queries = [{ name: 'query1' }, { name: 'query2' }];

      const result = ensureUniqueQueryIds(queries, 'custom');

      expect(result[0]?.id).toBe('custom_1');
      expect(result[1]?.id).toBe('custom_2');
    });

    it('should handle duplicate input IDs by preserving first and generating fallbacks', () => {
      const queries = [
        { id: 'duplicate', name: 'query1' },
        { id: 'duplicate', name: 'query2' },
        { id: 'duplicate', name: 'query3' },
      ];

      const result = ensureUniqueQueryIds(queries);

      expect(result[0]?.id).toBe('duplicate');
      expect(result[1]?.id).toBe('query_2'); // duplicate ID gets fallback
      expect(result[2]?.id).toBe('query_3'); // duplicate ID gets fallback
    });
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
        async (query: { id: string; data: string }) => ({
          queryId: query.id,
          data: { result: `processed-${query.data}` },
          metadata: { processed: true },
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
        async (query: { id: string; data: string }) => {
          if (query.data === 'bad') {
            throw new Error('Processing failed');
          }
          return {
            queryId: query.id,
            data: { result: 'success' },
            metadata: {},
          };
        }
      );

      const result = await processBulkQueries(queries, mockProcessor);

      expect(result.results).toHaveLength(1);
      expect(result.errors).toHaveLength(1);

      expect(result.errors[0]?.queryId).toBe('failure');
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
        { id: 'q1', queryTerms: ['test1'] },
        { id: 'q2', queryTerms: ['test2'] },
      ];

      const results = processedResults.map((r, index) => ({
        result: r,
        queryId: queries[index]?.id || `query_${index}`,
        originalQuery: queries[index] || {
          id: `query_${index}`,
          queryTerms: [],
        },
      }));
      const errors: QueryError[] = [];
      const context = {
        totalQueries: 2,
        successfulQueries: 2,
        failedQueries: 0,
        dataQuality: { hasResults: true, confidence: 'high' as const },
      };

      const config = {
        toolName: 'github_search_code' as ToolName,
      };

      const result = createBulkResponse(
        config,
        results,
        context,
        errors,
        queries
      );

      expect(result.isError).toBe(false);
      expect(result.content).toHaveLength(1);

      const responseText = result.content[0]?.text;
      const responseData =
        responseText &&
        typeof responseText === 'string' &&
        responseText.length > 0
          ? JSON.parse(responseText)
          : { data: [] };
      // The results exclude metadata (since verbose=false by default)
      expect(responseData.data.length).toBe(2);
      expect(responseData.data[0]).not.toHaveProperty('metadata');
      expect(responseData.data[0]?.data).toEqual(processedResults[0]?.data);
      // This test has no errors, so no need to check meta.errors
    });

    it('should create response with errors', () => {
      const processedResults: ProcessedBulkResult[] = [];
      const queries = [{ id: 'q1', queryTerms: ['test1'] }];
      const results = processedResults.map((r, index) => ({
        result: r,
        queryId: queries[index]?.id || `query_${index}`,
        originalQuery: queries[index] || {
          id: `query_${index}`,
          queryTerms: [],
        },
      }));
      const errors: QueryError[] = [
        {
          queryId: 'q1',
          error: 'API rate limit exceeded',
        },
      ];
      const context = {
        totalQueries: 1,
        successfulQueries: 0,
        failedQueries: 1,
        dataQuality: { hasResults: false, confidence: 'low' as const },
      };

      const config = {
        toolName: 'github_search_repos' as ToolName,
      };

      const result = createBulkResponse(
        config,
        results,
        context,
        errors,
        queries
      );

      expect(result.isError).toBe(false);
      const responseText = result.content[0]?.text;
      const responseData =
        responseText &&
        typeof responseText === 'string' &&
        responseText.length > 0
          ? JSON.parse(responseText)
          : { data: [] };
      // With improved bulk operations, errors are now included
      expect(responseData.data).toHaveLength(1);
    });

    it('should handle empty results and errors', () => {
      const processedResults: ProcessedBulkResult[] = [];
      const results = processedResults.map((r, index) => ({
        result: r,
        queryId: `query_${index}`,
        originalQuery: {
          id: `query_${index}`,
          queryTerms: [],
        },
      }));
      const errors: QueryError[] = [];
      const queries: Array<{ id: string; queryTerms: string[] }> = []; // No queries
      const context = {
        totalQueries: 0,
        successfulQueries: 0,
        failedQueries: 0,
        dataQuality: { hasResults: false, confidence: 'medium' as const },
      };

      const config = {
        toolName: 'githubSearchCode' as ToolName,
      };

      const result = createBulkResponse(
        config,
        results,
        context,
        errors,
        queries
      );

      expect(result.isError).toBe(false);
      const responseText = result.content[0]?.text;
      const responseData =
        responseText &&
        typeof responseText === 'string' &&
        responseText.length > 0
          ? JSON.parse(responseText)
          : { data: [] };
      // With no queries, no results, and no errors, data should be empty
      expect(responseData.data).toEqual([]);
    });

    it('should handle config options', () => {
      const processedResults: ProcessedBulkResult[] = [
        {
          data: { test: true },
          metadata: { processed: true },
        },
      ];

      const queries = [{ id: 'q1', queryTerms: ['test1'] }];
      const results = processedResults.map((r, index) => ({
        result: r,
        queryId: queries[index]?.id || `query_${index}`,
        originalQuery: queries[index] || {
          id: `query_${index}`,
          queryTerms: [],
        },
      }));
      const errors: QueryError[] = [];
      const context = {
        totalQueries: 1,
        successfulQueries: 1,
        failedQueries: 0,
        dataQuality: { hasResults: true, confidence: 'high' as const },
      };

      const config = {
        toolName: 'github_search_code' as ToolName,
        maxHints: 5,
      };

      const result = createBulkResponse(
        config,
        results,
        context,
        errors,
        queries
      );

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

      // Ensure unique IDs
      const queriesWithIds = ensureUniqueQueryIds(queries);

      // Process queries
      const mockProcessor = vi
        .fn()
        .mockImplementation(async (query: { id: string; name: string }) => ({
          queryId: query.id,
          data: {
            query: query.name,
            results: [`result for ${query.name}`],
          },
          metadata: { processed: true },
        }));

      const processResult = await processBulkQueries(
        queriesWithIds,
        mockProcessor
      );

      // Create bulk response
      const config = {
        toolName: 'github_search_code' as ToolName,
      };

      const context = {
        totalQueries: queriesWithIds.length,
        successfulQueries: processResult.results.length,
        failedQueries: processResult.errors.length,
        dataQuality: {
          hasResults: processResult.results.length > 0,
          confidence: 'high' as const,
        },
      };

      const bulkResponse = createBulkResponse(
        config,
        processResult.results,
        context,
        processResult.errors,
        queriesWithIds
      );

      expect(queriesWithIds).toHaveLength(2);
      expect(processResult.results).toHaveLength(2);
      expect(processResult.errors).toHaveLength(0);
      expect(bulkResponse.isError).toBe(false);

      // Check that IDs were generated
      queriesWithIds.forEach(query => {
        expect(query.id).toBeDefined();
        expect(typeof query.id).toBe('string');
      });

      expect(mockProcessor).toHaveBeenCalledTimes(2);
    });

    it('should handle mixed success and failure', async () => {
      const queries = ensureUniqueQueryIds([
        { name: 'success_query' },
        { name: 'fail_query' },
        { name: 'another_success' },
      ]);

      const mockProcessor = vi
        .fn()
        .mockImplementation(async (query: { id: string; name: string }) => {
          if (query.name === 'fail_query') {
            throw new Error('Processing failed');
          }
          return {
            queryId: query.id,
            data: { result: 'success' },
            metadata: {},
          };
        });

      const result = await processBulkQueries(queries, mockProcessor);

      expect(result.results).toHaveLength(2);
      expect(result.errors).toHaveLength(1);

      const context = {
        totalQueries: queries.length,
        successfulQueries: result.results.length,
        failedQueries: result.errors.length,
        dataQuality: {
          hasResults: result.results.length > 0,
          confidence: 'medium' as const,
        },
      };

      const bulkResponse = createBulkResponse(
        { toolName: 'githubSearchRepositories' as ToolName },
        result.results,
        context,
        result.errors,
        queries
      );

      expect(bulkResponse.isError).toBe(false);
    });
  });

  describe('reasoning propagation', () => {
    it('should propagate reasoning from queries to successful results', async () => {
      const queries = ensureUniqueQueryIds([
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
      ]);

      const mockProcessor = vi
        .fn()
        .mockImplementation(async (query: { id: string; name: string }) => ({
          queryId: query.id,
          data: { files: [{ path: 'test.py', content: 'test content' }] },
          metadata: {},
        }));

      const { results, errors } = await processBulkQueries(
        queries,
        mockProcessor
      );

      const context = {
        totalQueries: queries.length,
        successfulQueries: results.length,
        failedQueries: errors.length,
        dataQuality: { hasResults: true },
      };

      const bulkResponse = createBulkResponse(
        { toolName: 'githubSearchCode' as ToolName },
        results,
        context,
        errors,
        queries
      );

      const responseData = JSON.parse(
        (bulkResponse.content[0]?.text as string) || '{}'
      );

      // Check that reasoning is included in results
      expect(responseData.data).toHaveLength(3);
      expect(responseData.data[0]?.reasoning).toBe(
        'Find LangGraph implementations for AI agents'
      );
      expect(responseData.data[1]?.reasoning).toBe(
        'Search for context management patterns'
      );
      expect(responseData.data[2]?.reasoning).toBeUndefined(); // No reasoning in query
    });

    it('should propagate reasoning from queries to error results', async () => {
      const queries = ensureUniqueQueryIds([
        {
          id: 'error1',
          reasoning: 'This query will fail with reasoning',
          name: 'fail_query',
        },
        {
          id: 'error2',
          name: 'fail_query_no_reasoning', // No reasoning provided
        },
      ]);

      const mockProcessor = vi
        .fn()
        .mockImplementation(async (query: { id: string; name: string }) => {
          throw new Error(`Processing failed for ${query.name}`);
        });

      const { results, errors } = await processBulkQueries(
        queries,
        mockProcessor
      );

      const context = {
        totalQueries: queries.length,
        successfulQueries: results.length,
        failedQueries: errors.length,
        dataQuality: { hasResults: false },
      };

      const bulkResponse = createBulkResponse(
        { toolName: 'githubFetchContent' as ToolName },
        results,
        context,
        errors,
        queries
      );

      const responseData = JSON.parse(
        (bulkResponse.content[0]?.text as string) || '{}'
      );

      // Check that reasoning is included in error results
      expect(responseData.data).toHaveLength(2);
      expect(responseData.data[0]?.reasoning).toBe(
        'This query will fail with reasoning'
      );
      expect(responseData.data[0]?.error).toContain('Processing failed');
      expect(responseData.data[1]?.reasoning).toBeUndefined(); // No reasoning in query
      expect(responseData.data[1]?.error).toContain('Processing failed');
    });

    it('should preserve result reasoning over query reasoning when both exist', async () => {
      const queries = ensureUniqueQueryIds([
        {
          id: 'test1',
          reasoning: 'Query reasoning that should be overridden',
          name: 'query1',
        },
      ]);

      const mockProcessor = vi
        .fn()
        .mockImplementation(async (query: { id: string; name: string }) => ({
          queryId: query.id,
          reasoning: 'Result reasoning that should take precedence',
          data: { files: [{ path: 'test.py' }] },
          metadata: {},
        }));

      const { results, errors } = await processBulkQueries(
        queries,
        mockProcessor
      );

      const context = {
        totalQueries: queries.length,
        successfulQueries: results.length,
        failedQueries: errors.length,
        dataQuality: { hasResults: true },
      };

      const bulkResponse = createBulkResponse(
        { toolName: 'githubSearchRepositories' as ToolName },
        results,
        context,
        errors,
        queries
      );

      const responseData = JSON.parse(
        (bulkResponse.content[0]?.text as string) || '{}'
      );

      // Result reasoning should take precedence over query reasoning
      expect(responseData.data[0]?.reasoning).toBe(
        'Result reasoning that should take precedence'
      );
    });

    it('should handle mixed success and error results with reasoning', async () => {
      const queries = ensureUniqueQueryIds([
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
      ]);

      const mockProcessor = vi
        .fn()
        .mockImplementation(async (query: { id: string; name: string }) => {
          if (query.name.includes('fail')) {
            throw new Error(`Processing failed for ${query.name}`);
          }
          return {
            queryId: query.id,
            data: { repositories: [{ name: 'test-repo' }] },
            metadata: {},
          };
        });

      const { results, errors } = await processBulkQueries(
        queries,
        mockProcessor
      );

      const context = {
        totalQueries: queries.length,
        successfulQueries: results.length,
        failedQueries: errors.length,
        dataQuality: { hasResults: results.length > 0 },
      };

      const bulkResponse = createBulkResponse(
        { toolName: 'githubViewRepoStructure' as ToolName },
        results,
        context,
        errors,
        queries
      );

      const responseData = JSON.parse(
        (bulkResponse.content[0]?.text as string) || '{}'
      );

      expect(responseData.data).toHaveLength(4);

      // Find results by queryId to verify reasoning propagation
      const resultsByQueryId = responseData.data.reduce(
        (acc: Record<string, unknown>, item: Record<string, unknown>) => {
          acc[item.queryId as string] = item;
          return acc;
        },
        {}
      );

      // Successful results
      expect(resultsByQueryId['success1']?.reasoning).toBe(
        'Successful query with reasoning'
      );
      expect(resultsByQueryId['success1']?.error).toBeUndefined();
      expect(resultsByQueryId['success2']?.reasoning).toBeUndefined();
      expect(resultsByQueryId['success2']?.error).toBeUndefined();

      // Error results
      expect(resultsByQueryId['error1']?.reasoning).toBe(
        'Failed query with reasoning'
      );
      expect(resultsByQueryId['error1']?.error).toContain('Processing failed');
      expect(resultsByQueryId['error2']?.reasoning).toBeUndefined();
      expect(resultsByQueryId['error2']?.error).toContain('Processing failed');
    });

    it('should handle empty or whitespace-only reasoning', async () => {
      const queries = ensureUniqueQueryIds([
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
      ]);

      const mockProcessor = vi
        .fn()
        .mockImplementation(async (query: { id: string; name: string }) => ({
          queryId: query.id,
          data: { content: 'test content' },
          metadata: {},
        }));

      const { results, errors } = await processBulkQueries(
        queries,
        mockProcessor
      );

      const context = {
        totalQueries: queries.length,
        successfulQueries: results.length,
        failedQueries: errors.length,
        dataQuality: { hasResults: true },
      };

      const bulkResponse = createBulkResponse(
        { toolName: 'githubFetchContent' as ToolName },
        results,
        context,
        errors,
        queries
      );

      const responseData = JSON.parse(
        (bulkResponse.content[0]?.text as string) || '{}'
      );

      // Empty and whitespace-only reasoning should still be included
      expect(responseData.data[0]?.reasoning).toBe('');
      expect(responseData.data[1]?.reasoning).toBe('   ');
      expect(responseData.data[2]?.reasoning).toBe('Valid reasoning');
    });

    it('should maintain query order with reasoning in results', async () => {
      const queries = ensureUniqueQueryIds([
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
      ]);

      const mockProcessor = vi
        .fn()
        .mockImplementation(async (query: { id: string; name: string }) => ({
          queryId: query.id,
          data: { result: `Result for ${query.name}` },
          metadata: {},
        }));

      const { results, errors } = await processBulkQueries(
        queries,
        mockProcessor
      );

      const context = {
        totalQueries: queries.length,
        successfulQueries: results.length,
        failedQueries: errors.length,
        dataQuality: { hasResults: true },
      };

      const bulkResponse = createBulkResponse(
        { toolName: 'githubSearchPullRequests' as ToolName },
        results,
        context,
        errors,
        queries
      );

      const responseData = JSON.parse(
        (bulkResponse.content[0]?.text as string) || '{}'
      );

      // Verify order is maintained and reasoning is correct
      expect(responseData.data).toHaveLength(3);
      expect(responseData.data[0]?.queryId).toBe('first');
      expect(responseData.data[0]?.reasoning).toBe('First query reasoning');
      expect(responseData.data[1]?.queryId).toBe('second');
      expect(responseData.data[1]?.reasoning).toBe('Second query reasoning');
      expect(responseData.data[2]?.queryId).toBe('third');
      expect(responseData.data[2]?.reasoning).toBe('Third query reasoning');
    });
  });

  describe('GitHub API flow detection (empty vs content vs error)', () => {
    it('should treat code search empty result (total_count:0, items:[]) as no-results', () => {
      const queries = ensureUniqueQueryIds([
        { id: 'q1', name: 'code_search_empty' },
      ]);

      const results = [
        {
          queryId: 'q1',
          result: {
            queryId: 'q1',
            files: [],
            totalCount: 0,
            metadata: {},
          } as unknown as ProcessedBulkResult,
          originalQuery: queries[0]!,
        },
      ];

      const ctx = {
        totalQueries: 1,
        successfulQueries: 1,
        failedQueries: 0,
        dataQuality: { hasResults: false },
      };

      const resp = createBulkResponse(
        { toolName: 'githubSearchCode' as ToolName },
        results,
        ctx,
        [],
        queries
      );

      const payload = JSON.parse(resp.content[0]!.text as string);
      expect(payload.data).toHaveLength(1);
      // Expect metadata.queryArgs to be present for no-results
      expect(payload.data[0]?.metadata?.originalQuery?.id).toBe('q1');
    });

    it('should handle repo search empty and non-empty', () => {
      const queries = ensureUniqueQueryIds([
        { id: 'rq1', name: 'repos_empty' },
        { id: 'rq2', name: 'repos_non_empty' },
      ]);

      const results = [
        {
          queryId: 'rq1',
          result: {
            queryId: 'rq1',
            repositories: [],
            total_count: 0,
            metadata: {},
          } as unknown as ProcessedBulkResult,
          originalQuery: queries[0]!,
        },
        {
          queryId: 'rq2',
          result: {
            queryId: 'rq2',
            repositories: [{ owner_repo: 'a/b' }, { owner_repo: 'c/d' }],
            total_count: 2,
            metadata: {},
          } as unknown as ProcessedBulkResult,
          originalQuery: queries[1]!,
        },
      ];

      const ctx = {
        totalQueries: 2,
        successfulQueries: 2,
        failedQueries: 0,
        dataQuality: { hasResults: true },
      };

      const resp = createBulkResponse(
        { toolName: 'githubSearchRepositories' as ToolName },
        results,
        ctx,
        [],
        queries
      );

      const payload = JSON.parse(resp.content[0]!.text as string);
      const first = payload.data[0];
      expect(first?.queryId).toBe('rq1');
      expect(first?.metadata?.originalQuery?.id).toBe('rq1');
      const second = payload.data[1];
      expect(second?.queryId).toBe('rq2');
      expect(second?.metadata).toBeUndefined();
    });

    it('should handle pull request search empty and non-empty', () => {
      const queries = ensureUniqueQueryIds([
        { id: 'pq1', name: 'prs_empty' },
        { id: 'pq2', name: 'prs_non_empty' },
      ]);

      const results = [
        {
          queryId: 'pq1',
          result: {
            queryId: 'pq1',
            pull_requests: [],
            total_count: 0,
            metadata: {},
          } as unknown as ProcessedBulkResult,
          originalQuery: queries[0]!,
        },
        {
          queryId: 'pq2',
          result: {
            queryId: 'pq2',
            pull_requests: [{ number: 1, title: 'PR', url: 'u' }],
            total_count: 1,
            metadata: {},
          } as unknown as ProcessedBulkResult,
          originalQuery: queries[1]!,
        },
      ];

      const ctx = {
        totalQueries: 2,
        successfulQueries: 2,
        failedQueries: 0,
        dataQuality: { hasResults: true },
      };

      const resp = createBulkResponse(
        { toolName: 'githubSearchPullRequests' as ToolName },
        results,
        ctx,
        [],
        queries
      );

      const payload = JSON.parse(resp.content[0]!.text as string);
      const first = payload.data[0];
      expect(first?.queryId).toBe('pq1');
      expect(first?.metadata?.originalQuery?.id).toBe('pq1');
      const second = payload.data[1];
      expect(second?.queryId).toBe('pq2');
      expect(second?.metadata).toBeUndefined();
    });

    it('should handle repo structure empty and non-empty', () => {
      const queries = ensureUniqueQueryIds([
        { id: 'sq1', name: 'structure_empty' },
        { id: 'sq2', name: 'structure_non_empty' },
      ]);

      const results = [
        {
          queryId: 'sq1',
          result: {
            queryId: 'sq1',
            files: [],
            folders: [],
            metadata: {},
          } as unknown as ProcessedBulkResult,
          originalQuery: queries[0]!,
        },
        {
          queryId: 'sq2',
          result: {
            queryId: 'sq2',
            files: [{ path: 'README.md' }],
            folders: [{ path: 'src' }],
            metadata: {},
          } as unknown as ProcessedBulkResult,
          originalQuery: queries[1]!,
        },
      ];

      const ctx = {
        totalQueries: 2,
        successfulQueries: 2,
        failedQueries: 0,
        dataQuality: { hasResults: true },
      };

      const resp = createBulkResponse(
        { toolName: 'githubViewRepoStructure' as ToolName },
        results,
        ctx,
        [],
        queries
      );

      const payload = JSON.parse(resp.content[0]!.text as string);
      const first = payload.data[0];
      expect(first?.queryId).toBe('sq1');
      expect(first?.metadata?.originalQuery?.id).toBe('sq1');
      const second = payload.data[1];
      expect(second?.queryId).toBe('sq2');
      expect(second?.metadata).toBeUndefined();
    });
    it('should treat code search with items as meaningful content', () => {
      const queries = ensureUniqueQueryIds([
        { id: 'q1', name: 'code_search_non_empty' },
      ]);

      const results = [
        {
          queryId: 'q1',
          result: {
            queryId: 'q1',
            files: [{ path: 'src/index.ts', url: 'https://example' }],
            totalCount: 1,
            metadata: {},
          } as unknown as ProcessedBulkResult,
          originalQuery: queries[0]!,
        },
      ];

      const ctx = {
        totalQueries: 1,
        successfulQueries: 1,
        failedQueries: 0,
        dataQuality: { hasResults: true },
      };

      const resp = createBulkResponse(
        { toolName: 'githubSearchCode' as ToolName },
        results,
        ctx,
        [],
        queries
      );

      const payload = JSON.parse(resp.content[0]!.text as string);
      expect(payload.data).toHaveLength(1);
      // metadata should be removed when there are results and no error
      expect(payload.data[0]?.metadata).toBeUndefined();
    });

    it('should treat empty file content as error (per API) and non-empty as content', () => {
      const queries = ensureUniqueQueryIds([
        { id: 'q1', name: 'file_content_empty' },
        { id: 'q2', name: 'file_content_non_empty' },
      ]);

      const results = [
        {
          queryId: 'q2',
          result: {
            data: { content: 'console.log(1);' },
            metadata: {},
          } as unknown as ProcessedBulkResult,
          originalQuery: queries[1]!,
        },
      ];

      const ctx = {
        totalQueries: 2,
        successfulQueries: 1,
        failedQueries: 1,
        dataQuality: { hasResults: true },
      };

      const resp = createBulkResponse(
        { toolName: 'githubFetchContent' as ToolName },
        results,
        ctx,
        [
          {
            queryId: 'q1',
            error: 'File is empty - no content to display',
          } as QueryError,
        ],
        queries
      );

      const payload = JSON.parse(resp.content[0]!.text as string);
      // First item corresponds to q1 (error path), includes queryArgs
      const first = payload.data[0];
      expect(first?.queryId).toBe('q1');
      expect(first?.error).toContain('File is empty');
      expect(first?.metadata?.originalQuery?.id).toBe('q1');

      // Second item corresponds to q2 (success path), metadata removed
      const second = payload.data[1];
      expect(second?.queryId).toBe('q2');
      expect(second?.metadata).toBeUndefined();
    });

    it('should include errors as error results with query args', () => {
      const queries = ensureUniqueQueryIds([
        { id: 'qerr', name: 'error_case' },
      ]);

      const ctx = {
        totalQueries: 1,
        successfulQueries: 0,
        failedQueries: 1,
        dataQuality: { hasResults: false },
      };

      const resp = createBulkResponse(
        { toolName: 'githubSearchRepositories' as ToolName },
        [],
        ctx,
        [{ queryId: 'qerr', error: 'GitHub API error' } as QueryError],
        queries
      );

      const payload = JSON.parse(resp.content[0]!.text as string);
      expect(payload.data).toHaveLength(1);
      expect(payload.data[0]?.error).toContain('GitHub API error');
      expect(payload.data[0]?.metadata?.originalQuery?.id).toBe('qerr');
    });
  });
});
