/**
 * Tests for bulk operations utility
 * Covers executeBulkOperation, processBulkQueries, createErrorResult, formatBulkResponse
 */

import { describe, it, expect, vi } from 'vitest';
import {
  executeBulkOperation,
  processBulkQueries,
  createErrorResult,
} from '../../utils/bulkOperations.js';
import { ERROR_CODES } from '../../errors/errorCodes.js';

describe('bulkOperations', () => {
  describe('executeBulkOperation', () => {
    it('should process queries and return formatted response', async () => {
      const queries = [{ path: '/test', id: 1 }];
      const processor = vi.fn().mockResolvedValue({
        status: 'hasResults',
        data: 'test data',
      });

      const result = await executeBulkOperation(queries, processor, {
        toolName: 'test_tool',
      });

      expect(result.isError).toBe(false);
      expect(result.content).toHaveLength(1);
      expect(result.content[0].type).toBe('text');
      expect(processor).toHaveBeenCalledWith(queries[0]);
    });

    it('should handle multiple queries', async () => {
      const queries = [
        { path: '/test1', id: 1 },
        { path: '/test2', id: 2 },
      ];
      const processor = vi
        .fn()
        .mockImplementation(q =>
          Promise.resolve({ status: 'hasResults', path: q.path })
        );

      const result = await executeBulkOperation(queries, processor, {
        toolName: 'test_tool',
      });

      expect(result.isError).toBe(false);
      expect(processor).toHaveBeenCalledTimes(2);
    });

    it('should handle empty results', async () => {
      const queries = [{ path: '/test' }];
      const processor = vi.fn().mockResolvedValue({
        status: 'empty',
        hints: ['No results found'],
      });

      const result = await executeBulkOperation(queries, processor, {
        toolName: 'test_tool',
      });

      expect(result.isError).toBe(false);
      expect(result.content[0].text).toContain('empty');
    });

    it('should handle error results', async () => {
      const queries = [{ path: '/test' }];
      const processor = vi.fn().mockResolvedValue({
        status: 'error',
        error: 'Something went wrong',
        errorCode: ERROR_CODES.TOOL_EXECUTION_FAILED,
      });

      const result = await executeBulkOperation(queries, processor, {
        toolName: 'test_tool',
      });

      expect(result.isError).toBe(false); // Response itself is not an error
      expect(result.content[0].text).toContain('error');
    });
  });

  describe('processBulkQueries', () => {
    it('should process all queries in parallel', async () => {
      const queries = [{ id: 1 }, { id: 2 }, { id: 3 }];
      const processor = vi.fn().mockImplementation(q =>
        Promise.resolve({
          status: 'hasResults' as const,
          id: q.id,
        })
      );

      const results = await processBulkQueries(queries, processor);

      expect(results).toHaveLength(3);
      expect(results.map(r => r.status)).toEqual([
        'hasResults',
        'hasResults',
        'hasResults',
      ]);
    });

    it('should handle mixed success and failure with continueOnError=true', async () => {
      const queries = [{ id: 1 }, { id: 2 }, { id: 3 }];
      const processor = vi.fn().mockImplementation(q => {
        if (q.id === 2) {
          return Promise.reject(new Error('Query 2 failed'));
        }
        return Promise.resolve({ status: 'hasResults' as const, id: q.id });
      });

      const results = await processBulkQueries(queries, processor, {
        continueOnError: true,
      });

      expect(results).toHaveLength(3);
      expect(results[0].status).toBe('hasResults');
      expect(results[1].status).toBe('error');
      expect(results[2].status).toBe('hasResults');
    });

    it('should throw on first error with continueOnError=false', async () => {
      const queries = [{ id: 1 }, { id: 2 }, { id: 3 }];
      const testError = new Error('Query failed');
      const processor = vi.fn().mockImplementation(q => {
        if (q.id === 2) {
          return Promise.reject(testError);
        }
        return Promise.resolve({ status: 'hasResults' as const, id: q.id });
      });

      await expect(
        processBulkQueries(queries, processor, { continueOnError: false })
      ).rejects.toThrow('Query failed');
    });

    it('should handle all queries failing', async () => {
      const queries = [{ id: 1 }, { id: 2 }];
      const processor = vi
        .fn()
        .mockRejectedValue(new Error('All queries failed'));

      const results = await processBulkQueries(queries, processor, {
        continueOnError: true,
      });

      expect(results).toHaveLength(2);
      expect(results.every(r => r.status === 'error')).toBe(true);
    });

    it('should handle empty queries array', async () => {
      const processor = vi.fn();

      const results = await processBulkQueries([], processor);

      expect(results).toHaveLength(0);
      expect(processor).not.toHaveBeenCalled();
    });
  });

  describe('createErrorResult', () => {
    it('should create error result with error code', () => {
      const error = new Error('Test error');
      const result = createErrorResult(error);

      expect(result.status).toBe('error');
      expect(result.errorCode).toBe(ERROR_CODES.QUERY_EXECUTION_FAILED);
    });

    it('should include base data in error result', () => {
      const error = new Error('Test error');
      const baseData = { researchGoal: 'Test goal', reasoning: 'Test reason' };
      const result = createErrorResult(error, baseData);

      expect(result.status).toBe('error');
      expect(result.researchGoal).toBe('Test goal');
      expect(result.reasoning).toBe('Test reason');
    });

    it('should handle string error', () => {
      const result = createErrorResult('String error message');

      expect(result.status).toBe('error');
      expect(result.errorCode).toBe(ERROR_CODES.QUERY_EXECUTION_FAILED);
    });

    it('should handle undefined error', () => {
      const result = createErrorResult(undefined);

      expect(result.status).toBe('error');
      expect(result.errorCode).toBe(ERROR_CODES.QUERY_EXECUTION_FAILED);
    });
  });

  describe('response size validation', () => {
    it('should return error when response is too large', async () => {
      const queries = [{ path: '/test' }];
      // Create a response that exceeds token limit (25K tokens * 4 chars = 100K chars)
      const largeData = 'x'.repeat(150000);
      const processor = vi.fn().mockResolvedValue({
        status: 'hasResults',
        data: largeData,
      });

      const result = await executeBulkOperation(queries, processor, {
        toolName: 'test_tool',
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('responseTooLarge');
    });
  });
});
