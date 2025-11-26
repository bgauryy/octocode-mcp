/**
 * Tests for bulkOperations utility
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  executeBulkOperation,
  processBulkQueries,
  createErrorResult,
} from '../../src/utils/bulkOperations.js';
import { ERROR_CODES, type ErrorCode } from '../../src/errors/errorCodes.js';

interface TestQuery {
  path: string;
  pattern?: string;
}

interface TestResult {
  status: 'hasResults' | 'empty' | 'error';
  path?: string;
  data?: string;
  errorCode?: ErrorCode;
  hints?: readonly string[];
}

describe('bulkOperations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('processBulkQueries', () => {
    it('should process all queries in parallel', async () => {
      const queries: TestQuery[] = [
        { path: '/path1' },
        { path: '/path2' },
        { path: '/path3' },
      ];

      const processor = vi.fn(
        async (query: TestQuery): Promise<TestResult> => ({
          status: 'hasResults',
          path: query.path,
          data: `data for ${query.path}`,
        })
      );

      const results = await processBulkQueries(queries, processor);

      expect(processor).toHaveBeenCalledTimes(3);
      expect(results).toHaveLength(3);
      expect(results[0].status).toBe('hasResults');
      expect(results[1].status).toBe('hasResults');
      expect(results[2].status).toBe('hasResults');
    });

    it('should continue processing on error by default', async () => {
      const queries: TestQuery[] = [
        { path: '/path1' },
        { path: '/fail' },
        { path: '/path3' },
      ];

      const processor = vi.fn(async (query: TestQuery): Promise<TestResult> => {
        if (query.path === '/fail') {
          throw new Error('Processing failed');
        }
        return {
          status: 'hasResults',
          path: query.path,
        };
      });

      const results = await processBulkQueries(queries, processor);

      expect(results).toHaveLength(3);
      expect(results[0].status).toBe('hasResults');
      expect(results[1].status).toBe('error');
      expect(results[2].status).toBe('hasResults');
    });

    it('should throw on error when continueOnError is false', async () => {
      const queries: TestQuery[] = [
        { path: '/path1' },
        { path: '/fail' },
        { path: '/path3' },
      ];

      const processor = vi.fn(async (query: TestQuery): Promise<TestResult> => {
        if (query.path === '/fail') {
          throw new Error('Processing failed');
        }
        return {
          status: 'hasResults',
          path: query.path,
        };
      });

      await expect(
        processBulkQueries(queries, processor, { continueOnError: false })
      ).rejects.toThrow('Processing failed');
    });

    it('should handle empty query array', async () => {
      const processor = vi.fn(
        async (_query: TestQuery): Promise<TestResult> => ({
          status: 'hasResults',
        })
      );

      const results = await processBulkQueries([], processor);

      expect(results).toHaveLength(0);
      expect(processor).not.toHaveBeenCalled();
    });

    it('should preserve query order in results', async () => {
      const queries: TestQuery[] = [
        { path: '/a' },
        { path: '/b' },
        { path: '/c' },
      ];

      const processor = vi.fn(
        async (query: TestQuery): Promise<TestResult> => ({
          status: 'hasResults',
          path: query.path,
        })
      );

      const results = await processBulkQueries(queries, processor);

      expect(results[0].path).toBe('/a');
      expect(results[1].path).toBe('/b');
      expect(results[2].path).toBe('/c');
    });
  });

  describe('createErrorResult', () => {
    it('should create error result with default error code', () => {
      const result = createErrorResult<TestResult>(new Error('Test error'));

      expect(result.status).toBe('error');
      expect(result.errorCode).toBe(ERROR_CODES.QUERY_EXECUTION_FAILED);
    });

    it('should include base data in error result', () => {
      const baseData = { path: '/test/path' };
      const result = createErrorResult<TestResult>(
        new Error('Test error'),
        baseData
      );

      expect(result.status).toBe('error');
      expect(result.path).toBe('/test/path');
    });

    it('should handle string errors', () => {
      const result = createErrorResult<TestResult>('String error');

      expect(result.status).toBe('error');
      expect(result.errorCode).toBe(ERROR_CODES.QUERY_EXECUTION_FAILED);
    });

    it('should handle undefined error', () => {
      const result = createErrorResult<TestResult>(undefined);

      expect(result.status).toBe('error');
    });
  });

  describe('executeBulkOperation', () => {
    it('should execute bulk operation and return CallToolResult', async () => {
      const queries: TestQuery[] = [{ path: '/path1' }, { path: '/path2' }];

      const processor = vi.fn(
        async (query: TestQuery): Promise<TestResult> => ({
          status: 'hasResults',
          path: query.path,
          data: 'test data',
        })
      );

      const result = await executeBulkOperation(queries, processor, {
        toolName: 'local_ripgrep',
      });

      expect(result.isError).toBe(false);
      expect(result.content).toHaveLength(1);
      expect(result.content[0].type).toBe('text');
    });

    it('should handle mixed success and error results', async () => {
      const queries: TestQuery[] = [{ path: '/success' }, { path: '/fail' }];

      const processor = vi.fn(async (query: TestQuery): Promise<TestResult> => {
        if (query.path === '/fail') {
          throw new Error('Failed');
        }
        return {
          status: 'hasResults',
          path: query.path,
        };
      });

      const result = await executeBulkOperation(queries, processor, {
        toolName: 'local_ripgrep',
      });

      // Should not be an error overall (individual queries can fail)
      expect(result.content).toHaveLength(1);
      const content = result.content[0] as { type: 'text'; text: string };
      expect(content.text).toContain('results:');
    });

    it('should format results as YAML', async () => {
      const queries: TestQuery[] = [{ path: '/test' }];

      const processor = vi.fn(
        async (): Promise<TestResult> => ({
          status: 'hasResults',
          path: '/test',
          hints: ['hint1', 'hint2'],
        })
      );

      const result = await executeBulkOperation(queries, processor, {
        toolName: 'local_ripgrep',
      });

      const content = result.content[0] as { type: 'text'; text: string };
      expect(content.text).toContain('results:');
      expect(content.text).toContain('status:');
      expect(content.text).toContain('hasResults');
    });

    it('should return error when response exceeds token limit', async () => {
      const queries: TestQuery[] = [{ path: '/test' }];

      // Create a processor that returns a very large result
      const processor = vi.fn(
        async (): Promise<TestResult> => ({
          status: 'hasResults',
          path: '/test',
          // Generate huge data that exceeds token limit
          data: 'x'.repeat(500000),
        })
      );

      const result = await executeBulkOperation(queries, processor, {
        toolName: 'local_ripgrep',
      });

      expect(result.isError).toBe(true);
      const content = result.content[0] as { type: 'text'; text: string };
      expect(content.text).toContain(ERROR_CODES.RESPONSE_TOO_LARGE);
    });
  });
});
