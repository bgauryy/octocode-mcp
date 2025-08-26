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

    it('should preserve existing IDs', () => {
      const queries = [
        { id: 'custom-id-1', name: 'query1' },
        { name: 'query2' },
        { id: 'custom-id-3', name: 'query3' },
      ];

      const result = ensureUniqueQueryIds(queries);

      expect(result[0]?.id).toBe('custom-id-1');
      expect(result[1]?.id).toBeDefined();
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
      expect(result[1]?.id).toBeDefined();
      expect(result[2]?.id).toBeDefined();
    });

    it('should use custom default prefix', () => {
      const queries = [{ name: 'query1' }, { name: 'query2' }];

      const result = ensureUniqueQueryIds(queries, 'custom');

      expect(result[0]?.id).toBe('custom_1');
      expect(result[1]?.id).toBe('custom_2');
    });

    it('should handle duplicate IDs by making them unique', () => {
      const queries = [
        { id: 'duplicate', name: 'query1' },
        { id: 'duplicate', name: 'query2' },
        { id: 'duplicate', name: 'query3' },
      ];

      const result = ensureUniqueQueryIds(queries);

      expect(result[0]?.id).toBe('duplicate');
      expect(result[1]?.id).toBe('duplicate_1');
      expect(result[2]?.id).toBe('duplicate_2');
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

      expect(result.results[0]?.queryId).toBe('q1');
      expect(result.results[0]?.result.data).toEqual({
        result: 'processed-test1',
      });

      expect(result.results[1]?.queryId).toBe('q2');
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

      expect(result.results[0]?.queryId).toBe('success');
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
          queryId: 'q1',
          data: { items: [{ name: 'item1' }] },
          metadata: { type: 'success', count: 1 },
        },
        {
          queryId: 'q2',
          data: { items: [{ name: 'item2' }] },
          metadata: { type: 'success', count: 1 },
        },
      ];

      const results = processedResults.map(r => ({
        queryId: r.queryId,
        result: r,
      }));
      const errors: QueryError[] = [];
      const queries = [
        { id: 'q1', queryTerms: ['test1'] },
        { id: 'q2', queryTerms: ['test2'] },
      ];
      const context = {
        totalQueries: 2,
        successfulQueries: 2,
        failedQueries: 0,
        dataQuality: { hasResults: true, confidence: 'high' as const },
      };

      const config = {
        toolName: 'github_search_code' as ToolName,
        includeAggregatedContext: true,
        includeErrors: true,
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

      const responseData = JSON.parse(result.content[0]?.text || '{}');
      expect(responseData.data).toEqual(processedResults);
      expect(responseData.meta.errors).toEqual(errors);
    });

    it('should create response with errors', () => {
      const processedResults: ProcessedBulkResult[] = [];
      const results = processedResults.map(r => ({
        queryId: r.queryId,
        result: r,
      }));
      const errors: QueryError[] = [
        {
          queryId: 'q1',
          error: 'API rate limit exceeded',
        },
      ];
      const queries = [{ id: 'q1', queryTerms: ['test1'] }];
      const context = {
        totalQueries: 1,
        successfulQueries: 0,
        failedQueries: 1,
        dataQuality: { hasResults: false, confidence: 'low' as const },
      };

      const config = {
        toolName: 'github_search_repos' as ToolName,
        includeErrors: true,
      };

      const result = createBulkResponse(
        config,
        results,
        context,
        errors,
        queries
      );

      expect(result.isError).toBe(false);
      const responseData = JSON.parse(result.content[0]?.text || '{}');
      expect(responseData.meta.errors).toEqual(errors);
    });

    it('should handle empty results and errors', () => {
      const processedResults: ProcessedBulkResult[] = [];
      const results = processedResults.map(r => ({
        queryId: r.queryId,
        result: r,
      }));
      const errors: QueryError[] = [];
      const queries = [{ id: 'q1', queryTerms: ['test1'] }];
      const context = {
        totalQueries: 1,
        successfulQueries: 0,
        failedQueries: 0,
        dataQuality: { hasResults: false, confidence: 'medium' as const },
      };

      const config = {
        toolName: 'package_search' as ToolName,
      };

      const result = createBulkResponse(
        config,
        results,
        context,
        errors,
        queries
      );

      expect(result.isError).toBe(false);
      const responseData = JSON.parse(result.content[0]?.text || '{}');
      expect(responseData.data).toEqual([]);
    });

    it('should handle config options', () => {
      const processedResults: ProcessedBulkResult[] = [
        {
          queryId: 'q1',
          data: { test: true },
          metadata: { processed: true },
        },
      ];

      const results = processedResults.map(r => ({
        queryId: r.queryId,
        result: r,
      }));
      const errors: QueryError[] = [];
      const queries = [{ id: 'q1', queryTerms: ['test1'] }];
      const context = {
        totalQueries: 1,
        successfulQueries: 1,
        failedQueries: 0,
        dataQuality: { hasResults: true, confidence: 'high' as const },
      };

      const config = {
        toolName: 'github_search_code' as ToolName,
        includeAggregatedContext: false,
        includeErrors: false,
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
        includeAggregatedContext: true,
        includeErrors: true,
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
        { toolName: 'github_search_repos' as ToolName },
        result.results,
        context,
        result.errors,
        queries
      );

      expect(bulkResponse.isError).toBe(false);
    });
  });
});
