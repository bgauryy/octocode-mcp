import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { CallToolResult } from '@modelcontextprotocol/sdk/types';

// Use vi.hoisted to ensure mock is available during module initialization
const mockCacheInstance = vi.hoisted(() => ({
  get: vi.fn(),
  set: vi.fn(),
  del: vi.fn(),
  keys: vi.fn(),
  flushAll: vi.fn(),
}));

vi.mock('node-cache', () => {
  return {
    default: vi.fn(() => mockCacheInstance),
  };
});

// Import after mocking
import { generateCacheKey, withCache } from '../../src/utils/cache.js';

describe('Cache Utilities', () => {
  beforeEach(() => {
    // Clear all mocks before each test
    vi.clearAllMocks();
  });

  afterEach(() => {
    // Reset mock implementations
    mockCacheInstance.get.mockReset();
    mockCacheInstance.set.mockReset();
    mockCacheInstance.del.mockReset();
    mockCacheInstance.keys.mockReset();
    mockCacheInstance.flushAll.mockReset();
  });

  describe('generateCacheKey', () => {
    it('should generate consistent cache keys for identical parameters', () => {
      const params1 = { query: 'test', owner: 'facebook', limit: 10 };
      const params2 = { query: 'test', owner: 'facebook', limit: 10 };

      const key1 = generateCacheKey('github-search', params1);
      const key2 = generateCacheKey('github-search', params2);

      expect(key1).toBe(key2);
      expect(key1).toMatch(/^v1-github-search:[a-f0-9]{32}$/);
    });

    it('should generate different cache keys for different parameters', () => {
      const params1 = { query: 'test', owner: 'facebook' };
      const params2 = { query: 'test', owner: 'google' };

      const key1 = generateCacheKey('github-search', params1);
      const key2 = generateCacheKey('github-search', params2);

      expect(key1).not.toBe(key2);
      expect(key1).toMatch(/^v1-github-search:[a-f0-9]{32}$/);
      expect(key2).toMatch(/^v1-github-search:[a-f0-9]{32}$/);
    });

    it('should generate different cache keys for different prefixes', () => {
      const params = { query: 'test' };

      const key1 = generateCacheKey('github-search', params);
      const key2 = generateCacheKey('npm-search', params);

      expect(key1).not.toBe(key2);
      expect(key1).toMatch(/^v1-github-search:/);
      expect(key2).toMatch(/^v1-npm-search:/);
    });

    it('should generate same cache key regardless of parameter order', () => {
      const params1 = { query: 'test', owner: 'facebook', limit: 10 };
      const params2 = { limit: 10, owner: 'facebook', query: 'test' };

      const key1 = generateCacheKey('github-search', params1);
      const key2 = generateCacheKey('github-search', params2);

      expect(key1).toBe(key2);
    });

    it('should handle empty parameters', () => {
      const key = generateCacheKey('test', {});
      expect(key).toMatch(/^v1-test:[a-f0-9]{32}$/);
    });

    it('should handle null and undefined values', () => {
      const params1 = { query: 'test', owner: null, limit: undefined };
      const params2 = { query: 'test', owner: null, limit: undefined };

      const key1 = generateCacheKey('github-search', params1);
      const key2 = generateCacheKey('github-search', params2);

      expect(key1).toBe(key2);
    });

    it('should handle nested objects', () => {
      const params1 = {
        query: 'test',
        filters: { author: 'john', date: '>2023-01-01' },
      };
      const params2 = {
        query: 'test',
        filters: { author: 'john', date: '>2023-01-01' },
      };

      const key1 = generateCacheKey('github-search', params1);
      const key2 = generateCacheKey('github-search', params2);

      expect(key1).toBe(key2);
    });

    it('should generate different keys for different top-level values', () => {
      const params1 = {
        query: 'test',
        author: 'john',
        date: '>2023-01-01',
      };
      const params2 = {
        query: 'test',
        author: 'jane', 
        date: '>2023-01-01',
      };

      const key1 = generateCacheKey('github-search', params1);
      const key2 = generateCacheKey('github-search', params2);

      expect(key1).not.toBe(key2);
    });
  });

  describe('withCache', () => {
    const mockSuccessResult: CallToolResult = {
      isError: false,
      content: [{ type: 'text', text: 'Success result' }],
    };

    const mockErrorResult: CallToolResult = {
      isError: true,
      content: [{ type: 'text', text: 'Error result' }],
    };

    it('should return cached result when available', async () => {
      const cacheKey = 'test-key';
      mockCacheInstance.get.mockReturnValue(mockSuccessResult);

      const operation = vi.fn();
      const result = await withCache(cacheKey, operation);

      expect(mockCacheInstance.get).toHaveBeenCalledWith(cacheKey);
      expect(operation).not.toHaveBeenCalled();
      expect(result).toBe(mockSuccessResult);
    });

    it('should execute operation when cache miss', async () => {
      const cacheKey = 'test-key';
      mockCacheInstance.get.mockReturnValue(undefined);

      const operation = vi.fn().mockResolvedValue(mockSuccessResult);
      const result = await withCache(cacheKey, operation);

      expect(mockCacheInstance.get).toHaveBeenCalledWith(cacheKey);
      expect(operation).toHaveBeenCalledOnce();
      expect(result).toBe(mockSuccessResult);
    });

    it('should cache successful results', async () => {
      const cacheKey = 'test-key';
      mockCacheInstance.get.mockReturnValue(undefined);

      const operation = vi.fn().mockResolvedValue(mockSuccessResult);
      await withCache(cacheKey, operation);

      expect(mockCacheInstance.set).toHaveBeenCalledWith(
        cacheKey,
        mockSuccessResult
      );
    });

    it('should not cache error results', async () => {
      const cacheKey = 'test-key';
      mockCacheInstance.get.mockReturnValue(undefined);

      const operation = vi.fn().mockResolvedValue(mockErrorResult);
      const result = await withCache(cacheKey, operation);

      expect(mockCacheInstance.set).not.toHaveBeenCalled();
      expect(result).toBe(mockErrorResult);
    });

    it('should handle operation errors', async () => {
      const cacheKey = 'test-key';
      mockCacheInstance.get.mockReturnValue(undefined);

      const error = new Error('Operation failed');
      const operation = vi.fn().mockRejectedValue(error);

      await expect(withCache(cacheKey, operation)).rejects.toThrow(
        'Operation failed'
      );
      expect(mockCacheInstance.set).not.toHaveBeenCalled();
    });

    it('should handle async operations correctly', async () => {
      const cacheKey = 'test-key';
      mockCacheInstance.get.mockReturnValue(undefined);

      const operation = vi
        .fn()
        .mockImplementation(
          () =>
            new Promise(resolve =>
              setTimeout(() => resolve(mockSuccessResult), 10)
            )
        );

      const result = await withCache(cacheKey, operation);

      expect(result).toBe(mockSuccessResult);
      expect(mockCacheInstance.set).toHaveBeenCalledWith(
        cacheKey,
        mockSuccessResult
      );
    });

    it('should handle multiple concurrent requests for same key', async () => {
      const cacheKey = 'test-key';
      mockCacheInstance.get.mockReturnValue(undefined);

      let resolveOperation: (value: CallToolResult) => void;
      const operationPromise = new Promise<CallToolResult>(resolve => {
        resolveOperation = resolve;
      });

      const operation = vi.fn().mockReturnValue(operationPromise);

      // Start multiple concurrent requests
      const promise1 = withCache(cacheKey, operation);
      const promise2 = withCache(cacheKey, operation);

      // Resolve the operation
      resolveOperation!(mockSuccessResult);

      const [result1, result2] = await Promise.all([promise1, promise2]);

      // Both should get the same result
      expect(result1).toBe(mockSuccessResult);
      expect(result2).toBe(mockSuccessResult);

      // Operation should be called for each request (no built-in deduplication)
      expect(operation).toHaveBeenCalledTimes(2);
    });

    it('should handle different cache keys independently', async () => {
      const cacheKey1 = 'test-key-1';
      const cacheKey2 = 'test-key-2';

      mockCacheInstance.get.mockReturnValue(undefined);

      const operation1 = vi.fn().mockResolvedValue(mockSuccessResult);
      const operation2 = vi.fn().mockResolvedValue({
        isError: false,
        content: [{ type: 'text', text: 'Different result' }],
      });

      const [result1, result2] = await Promise.all([
        withCache(cacheKey1, operation1),
        withCache(cacheKey2, operation2),
      ]);

      expect(mockCacheInstance.get).toHaveBeenCalledWith(cacheKey1);
      expect(mockCacheInstance.get).toHaveBeenCalledWith(cacheKey2);
      expect(operation1).toHaveBeenCalledOnce();
      expect(operation2).toHaveBeenCalledOnce();
      expect(result1).toBe(mockSuccessResult);
      expect(result2.content[0].text).toBe('Different result');
    });

    it('should handle complex result objects', async () => {
      const cacheKey = 'test-key';
      const complexResult: CallToolResult = {
        isError: false,
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              data: {
                items: [{ id: 1, name: 'test' }],
                total: 1,
                metadata: { cached: true },
              },
            }),
          },
        ],
      };

      mockCacheInstance.get.mockReturnValue(undefined);

      const operation = vi.fn().mockResolvedValue(complexResult);
      const result = await withCache(cacheKey, operation);

      expect(result).toEqual(complexResult);
      expect(mockCacheInstance.set).toHaveBeenCalledWith(
        cacheKey,
        complexResult
      );
    });
  });

  describe('Cache Integration', () => {
    it('should work with real cache key generation', async () => {
      const params = { query: 'test-integration', owner: 'facebook' };
      const cacheKey = generateCacheKey('integration-test', params);

      mockCacheInstance.get.mockReturnValue(undefined);

      const mockResult: CallToolResult = {
        isError: false,
        content: [{ type: 'text', text: 'Integration test result' }],
      };

      const operation = vi.fn().mockResolvedValue(mockResult);
      const result = await withCache(cacheKey, operation);

      expect(result).toBe(mockResult);
      expect(mockCacheInstance.get).toHaveBeenCalledWith(cacheKey);
      expect(mockCacheInstance.set).toHaveBeenCalledWith(cacheKey, mockResult);
      expect(cacheKey).toMatch(/^v1-integration-test:[a-f0-9]{32}$/);
    });

    it('should demonstrate cache hit behavior', async () => {
      const params = { query: 'cache-hit-test' };
      const cacheKey = generateCacheKey('hit-test', params);

      const cachedResult: CallToolResult = {
        isError: false,
        content: [{ type: 'text', text: 'Cached result' }],
      };

      mockCacheInstance.get.mockReturnValue(cachedResult);

      const operation = vi.fn().mockResolvedValue({
        isError: false,
        content: [{ type: 'text', text: 'Fresh result' }],
      });

      const result = await withCache(cacheKey, operation);

      expect(result).toBe(cachedResult);
      expect(result.content[0].text).toBe('Cached result');
      expect(operation).not.toHaveBeenCalled();
    });
  });
});
