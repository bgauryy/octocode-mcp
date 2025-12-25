/**
 * Tests for tool helpers utilities
 * Covers validateToolPath, createErrorResult, checkLargeOutputSafety
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  validateToolPath,
  createErrorResult,
  checkLargeOutputSafety,
  type ToolQuery,
} from '../../utils/toolHelpers.js';
import { ERROR_CODES, ToolError } from '../../errors/errorCodes.js';

// Mock pathValidator
vi.mock('../../security/pathValidator.js', () => ({
  pathValidator: {
    validate: vi.fn(),
  },
}));

import { pathValidator } from '../../security/pathValidator.js';

describe('toolHelpers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('validateToolPath', () => {
    it('should return valid result for allowed path', () => {
      vi.mocked(pathValidator.validate).mockReturnValue({
        isValid: true,
        sanitizedPath: '/workspace/src/file.ts',
      });

      const query: ToolQuery = {
        path: '/workspace/src/file.ts',
        researchGoal: 'Test goal',
        reasoning: 'Test reason',
      };

      const result = validateToolPath(query, 'LOCAL_RIPGREP');

      expect(result.isValid).toBe(true);
      if (result.isValid) {
        expect(result.sanitizedPath).toBe('/workspace/src/file.ts');
        expect(result.query).toBe(query);
      }
    });

    it('should return error result for invalid path', () => {
      vi.mocked(pathValidator.validate).mockReturnValue({
        isValid: false,
        error: 'Path is outside workspace',
      });

      const query: ToolQuery = {
        path: '/etc/passwd',
        researchGoal: 'Test goal',
        reasoning: 'Test reason',
      };

      const result = validateToolPath(query, 'LOCAL_RIPGREP');

      expect(result.isValid).toBe(false);
      if (!result.isValid) {
        expect(result.errorResult.status).toBe('error');
        expect(result.errorResult.errorCode).toBe(
          ERROR_CODES.PATH_VALIDATION_FAILED
        );
        expect(result.errorResult.error).toBe('Path is outside workspace');
        expect(result.errorResult.researchGoal).toBe('Test goal');
        expect(result.errorResult.reasoning).toBe('Test reason');
      }
    });

    it('should include hints for error results', () => {
      vi.mocked(pathValidator.validate).mockReturnValue({
        isValid: false,
        error: 'Invalid path',
      });

      const query: ToolQuery = { path: '/invalid' };
      const result = validateToolPath(query, 'LOCAL_FIND_FILES');

      expect(result.isValid).toBe(false);
      if (!result.isValid) {
        expect(result.errorResult.hints).toBeDefined();
      }
    });
  });

  describe('createErrorResult', () => {
    it('should create error result from ToolError', () => {
      const toolError = new ToolError(
        ERROR_CODES.FILE_ACCESS_FAILED,
        'Cannot access file',
        { path: '/test' }
      );

      const query: ToolQuery = {
        path: '/test',
        researchGoal: 'Test goal',
        reasoning: 'Test reason',
      };

      const result = createErrorResult(toolError, 'LOCAL_FETCH_CONTENT', query);

      expect(result.status).toBe('error');
      expect(result.errorCode).toBe(ERROR_CODES.FILE_ACCESS_FAILED);
      expect(result.researchGoal).toBe('Test goal');
      expect(result.reasoning).toBe('Test reason');
      expect(result.hints).toBeDefined();
    });

    it('should convert unknown error to ToolError', () => {
      const error = new Error('Unknown error');
      const query: ToolQuery = { path: '/test' };

      const result = createErrorResult(error, 'LOCAL_RIPGREP', query);

      expect(result.status).toBe('error');
      expect(result.errorCode).toBe(ERROR_CODES.TOOL_EXECUTION_FAILED);
    });

    it('should handle string error', () => {
      const query: ToolQuery = { path: '/test' };

      const result = createErrorResult(
        'String error message',
        'LOCAL_VIEW_STRUCTURE',
        query
      );

      expect(result.status).toBe('error');
      expect(result.errorCode).toBe(ERROR_CODES.TOOL_EXECUTION_FAILED);
    });

    it('should include additional fields when provided', () => {
      const error = new Error('Test error');
      const query: ToolQuery = { path: '/test' };

      const result = createErrorResult(error, 'LOCAL_RIPGREP', query, {
        customField: 'custom value',
        anotherField: 123,
      });

      expect(result.customField).toBe('custom value');
      expect(result.anotherField).toBe(123);
    });

    it('should include context from ToolError', () => {
      const toolError = new ToolError(
        ERROR_CODES.FILE_TOO_LARGE,
        'File too large',
        { path: '/test', sizeKB: 500, limitKB: 100 }
      );

      const query: ToolQuery = { path: '/test' };
      const result = createErrorResult(toolError, 'LOCAL_FETCH_CONTENT', query);

      expect(result.context).toEqual({
        path: '/test',
        sizeKB: 500,
        limitKB: 100,
      });
    });
  });

  describe('checkLargeOutputSafety', () => {
    it('should allow output when charLength is specified', () => {
      const result = checkLargeOutputSafety(500, true, {
        threshold: 100,
        itemType: 'file',
      });

      expect(result.shouldBlock).toBe(false);
    });

    it('should allow output below threshold', () => {
      const result = checkLargeOutputSafety(50, false, {
        threshold: 100,
        itemType: 'file',
      });

      expect(result.shouldBlock).toBe(false);
    });

    it('should block output above threshold without charLength', () => {
      const result = checkLargeOutputSafety(200, false, {
        threshold: 100,
        itemType: 'file',
      });

      expect(result.shouldBlock).toBe(true);
      expect(result.errorCode).toBe(ERROR_CODES.OUTPUT_TOO_LARGE);
      expect(result.hints).toBeDefined();
      expect(result.hints!.length).toBeGreaterThan(0);
    });

    it('should calculate token estimate for file items', () => {
      const result = checkLargeOutputSafety(200, false, {
        threshold: 100,
        itemType: 'file',
        avgSizePerItem: 100,
      });

      expect(result.shouldBlock).toBe(true);
      expect(result.estimatedTokens).toBeDefined();
      // 200 items * 100 bytes / 4 chars per token = 5000 tokens
      expect(result.estimatedTokens).toBe(5000);
    });

    it('should use detailed average size when detailed=true', () => {
      const result = checkLargeOutputSafety(200, false, {
        threshold: 100,
        itemType: 'file',
        detailed: true,
      });

      expect(result.shouldBlock).toBe(true);
      // Default detailed avg is 150 bytes
      // 200 * 150 / 4 = 7500 tokens
      expect(result.estimatedTokens).toBe(7500);
    });

    it('should use simple average size when detailed=false', () => {
      const result = checkLargeOutputSafety(200, false, {
        threshold: 100,
        itemType: 'entry',
        detailed: false,
      });

      expect(result.shouldBlock).toBe(true);
      // Default simple avg is 50 bytes
      // 200 * 50 / 4 = 2500 tokens
      expect(result.estimatedTokens).toBe(2500);
    });

    it('should use 1 byte for char items', () => {
      const result = checkLargeOutputSafety(10000, false, {
        threshold: 5000,
        itemType: 'char',
      });

      expect(result.shouldBlock).toBe(true);
      // 10000 chars / 4 = 2500 tokens
      expect(result.estimatedTokens).toBe(2500);
    });

    it('should include charLength recommendation in hints', () => {
      const result = checkLargeOutputSafety(200, false, {
        threshold: 100,
        itemType: 'file',
      });

      expect(result.shouldBlock).toBe(true);
      expect(result.hints!.some(h => h.includes('charLength'))).toBe(true);
    });

    it('should include custom hints when provided', () => {
      const result = checkLargeOutputSafety(200, false, {
        threshold: 100,
        itemType: 'file',
        customHints: ['Custom hint 1', 'Custom hint 2'],
      });

      expect(result.shouldBlock).toBe(true);
      expect(result.hints!.some(h => h.includes('Custom hint 1'))).toBe(true);
      expect(result.hints!.some(h => h.includes('Custom hint 2'))).toBe(true);
    });

    it('should handle exactly threshold count', () => {
      const result = checkLargeOutputSafety(100, false, {
        threshold: 100,
        itemType: 'file',
      });

      expect(result.shouldBlock).toBe(false);
    });
  });
});
