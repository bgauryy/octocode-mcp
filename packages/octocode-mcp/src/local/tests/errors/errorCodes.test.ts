/**
 * Tests for local error codes and ToolError factory functions
 */

import { describe, it, expect } from 'vitest';
import {
  ERROR_CODES,
  ERROR_CODE_REGISTRY,
  ErrorCategory,
  ToolError,
  isToolError,
  toToolError,
  ToolErrors,
} from '../../errors/errorCodes.js';

describe('Local Error Codes', () => {
  describe('ERROR_CODES', () => {
    it('should have all required error codes defined', () => {
      expect(ERROR_CODES.PATH_VALIDATION_FAILED).toBe('pathValidationFailed');
      expect(ERROR_CODES.FILE_ACCESS_FAILED).toBe('fileAccessFailed');
      expect(ERROR_CODES.FILE_READ_FAILED).toBe('fileReadFailed');
      expect(ERROR_CODES.FILE_TOO_LARGE).toBe('fileTooLarge');
      expect(ERROR_CODES.NO_MATCHES).toBe('noMatches');
      expect(ERROR_CODES.PATTERN_TOO_BROAD).toBe('patternTooBroad');
      expect(ERROR_CODES.PAGINATION_REQUIRED).toBe('paginationRequired');
      expect(ERROR_CODES.OUTPUT_TOO_LARGE).toBe('outputTooLarge');
      expect(ERROR_CODES.RESPONSE_TOO_LARGE).toBe('responseTooLarge');
      expect(ERROR_CODES.COMMAND_EXECUTION_FAILED).toBe(
        'commandExecutionFailed'
      );
      expect(ERROR_CODES.QUERY_EXECUTION_FAILED).toBe('queryExecutionFailed');
      expect(ERROR_CODES.TOOL_EXECUTION_FAILED).toBe('toolExecutionFailed');
    });
  });

  describe('ERROR_CODE_REGISTRY', () => {
    it('should have metadata for all error codes', () => {
      Object.values(ERROR_CODES).forEach(code => {
        expect(ERROR_CODE_REGISTRY[code]).toBeDefined();
        expect(ERROR_CODE_REGISTRY[code].code).toBe(code);
        expect(ERROR_CODE_REGISTRY[code].category).toBeDefined();
        expect(ERROR_CODE_REGISTRY[code].description).toBeDefined();
        expect(ERROR_CODE_REGISTRY[code].recoverability).toBeDefined();
      });
    });

    it('should categorize errors correctly', () => {
      expect(ERROR_CODE_REGISTRY.pathValidationFailed.category).toBe(
        ErrorCategory.VALIDATION
      );
      expect(ERROR_CODE_REGISTRY.fileAccessFailed.category).toBe(
        ErrorCategory.FILE_SYSTEM
      );
      expect(ERROR_CODE_REGISTRY.noMatches.category).toBe(ErrorCategory.SEARCH);
      expect(ERROR_CODE_REGISTRY.paginationRequired.category).toBe(
        ErrorCategory.PAGINATION
      );
      expect(ERROR_CODE_REGISTRY.commandExecutionFailed.category).toBe(
        ErrorCategory.EXECUTION
      );
    });
  });

  describe('ToolError', () => {
    it('should create error with all properties', () => {
      const error = new ToolError(
        ERROR_CODES.FILE_ACCESS_FAILED,
        'Cannot access file',
        { path: '/test/file.txt' }
      );

      expect(error.errorCode).toBe('fileAccessFailed');
      expect(error.message).toBe('Cannot access file');
      expect(error.context).toEqual({ path: '/test/file.txt' });
      expect(error.category).toBe(ErrorCategory.FILE_SYSTEM);
      expect(error.recoverability).toBe('unrecoverable');
    });

    it('should include cause in stack trace', () => {
      const cause = new Error('Original error');
      const error = new ToolError(
        ERROR_CODES.FILE_READ_FAILED,
        'Read failed',
        undefined,
        cause
      );

      // The cause should be included in the stack trace
      expect(error.stack).toContain('Caused by:');
      expect(error.stack).toContain('Original error');
    });

    it('should check recoverability correctly', () => {
      const unrecoverable = new ToolError(
        ERROR_CODES.FILE_ACCESS_FAILED,
        'Access failed'
      );
      const userAction = new ToolError(
        ERROR_CODES.PATH_VALIDATION_FAILED,
        'Invalid path'
      );
      const noMatches = new ToolError(ERROR_CODES.NO_MATCHES, 'No matches');

      expect(unrecoverable.isRecoverable()).toBe(false);
      expect(unrecoverable.requiresUserAction()).toBe(false);
      expect(userAction.requiresUserAction()).toBe(true);
      expect(userAction.isRecoverable()).toBe(false);
      expect(noMatches.requiresUserAction()).toBe(true);
    });

    it('should serialize to JSON correctly', () => {
      const error = new ToolError(
        ERROR_CODES.FILE_TOO_LARGE,
        'File too large',
        { sizeKB: 1000, limitKB: 500 }
      );

      const json = error.toJSON();

      expect(json.name).toBe('ToolError');
      expect(json.errorCode).toBe('fileTooLarge');
      expect(json.category).toBe(ErrorCategory.FILE_SYSTEM);
      expect(json.message).toBe('File too large');
      expect(json.recoverability).toBe('user-action-required');
      expect(json.context).toEqual({ sizeKB: 1000, limitKB: 500 });
      expect(json.stack).toBeDefined();
    });
  });

  describe('isToolError', () => {
    it('should return true for ToolError instances', () => {
      const error = new ToolError(ERROR_CODES.NO_MATCHES, 'Test');
      expect(isToolError(error)).toBe(true);
    });

    it('should return false for regular errors', () => {
      const error = new Error('Test');
      expect(isToolError(error)).toBe(false);
    });

    it('should return false for non-error values', () => {
      expect(isToolError(null)).toBe(false);
      expect(isToolError(undefined)).toBe(false);
      expect(isToolError('error')).toBe(false);
      expect(isToolError({ message: 'error' })).toBe(false);
    });
  });

  describe('toToolError', () => {
    it('should return same error if already ToolError', () => {
      const original = new ToolError(ERROR_CODES.NO_MATCHES, 'Test');
      const result = toToolError(original);
      expect(result).toBe(original);
    });

    it('should convert Error to ToolError', () => {
      const original = new Error('Original message');
      const result = toToolError(original);

      expect(result).toBeInstanceOf(ToolError);
      expect(result.message).toBe('Original message');
      expect(result.errorCode).toBe(ERROR_CODES.TOOL_EXECUTION_FAILED);
    });

    it('should use custom error code when converting Error', () => {
      const original = new Error('Read error');
      const result = toToolError(original, ERROR_CODES.FILE_READ_FAILED);

      expect(result.errorCode).toBe(ERROR_CODES.FILE_READ_FAILED);
    });

    it('should convert string to ToolError', () => {
      const result = toToolError('String error');

      expect(result).toBeInstanceOf(ToolError);
      expect(result.message).toBe('String error');
    });

    it('should convert other types to ToolError', () => {
      const result = toToolError({ custom: 'object' });

      expect(result).toBeInstanceOf(ToolError);
      expect(result.message).toContain('object');
    });

    it('should include context when converting', () => {
      const original = new Error('Test');
      const result = toToolError(original, ERROR_CODES.FILE_ACCESS_FAILED, {
        path: '/test',
      });

      expect(result.context).toEqual({ path: '/test' });
    });
  });

  describe('ToolErrors factory functions', () => {
    it('should create pathValidationFailed error', () => {
      const error = ToolErrors.pathValidationFailed(
        '/invalid/path',
        'Outside workspace'
      );

      expect(error.errorCode).toBe(ERROR_CODES.PATH_VALIDATION_FAILED);
      expect(error.message).toBe('Outside workspace');
      expect(error.context).toEqual({ path: '/invalid/path' });
    });

    it('should create pathValidationFailed error with default message', () => {
      const error = ToolErrors.pathValidationFailed('/invalid/path');

      expect(error.errorCode).toBe(ERROR_CODES.PATH_VALIDATION_FAILED);
      expect(error.message).toContain('/invalid/path');
    });

    it('should create fileAccessFailed error', () => {
      const cause = new Error('ENOENT');
      const error = ToolErrors.fileAccessFailed('/missing/file.txt', cause);

      expect(error.errorCode).toBe(ERROR_CODES.FILE_ACCESS_FAILED);
      expect(error.message).toContain('/missing/file.txt');
      expect(error.context).toEqual({ path: '/missing/file.txt' });
      expect(error.stack).toContain('Caused by:');
    });

    it('should create fileReadFailed error', () => {
      const cause = new Error('Read error');
      const error = ToolErrors.fileReadFailed('/test/file.txt', cause);

      expect(error.errorCode).toBe(ERROR_CODES.FILE_READ_FAILED);
      expect(error.message).toContain('/test/file.txt');
      expect(error.stack).toContain('Caused by:');
    });

    it('should create fileTooLarge error with formatted sizes', () => {
      const error = ToolErrors.fileTooLarge('/big/file.bin', 1000, 500);

      expect(error.errorCode).toBe(ERROR_CODES.FILE_TOO_LARGE);
      expect(error.message).toContain('1000KB');
      expect(error.message).toContain('500KB');
      expect(error.context).toEqual({
        path: '/big/file.bin',
        sizeKB: 1000,
        limitKB: 500,
      });
    });

    it('should create fileTooLarge error with decimal sizes', () => {
      const error = ToolErrors.fileTooLarge('/big/file.bin', 1000.5, 500.25);

      expect(error.message).toContain('1000.5KB');
      expect(error.message).toContain('500.3KB'); // Rounded to 1 decimal
    });

    it('should create noMatches error', () => {
      const error = ToolErrors.noMatches('searchPattern', {
        directory: '/src',
      });

      expect(error.errorCode).toBe(ERROR_CODES.NO_MATCHES);
      expect(error.message).toContain('searchPattern');
      expect(error.context).toEqual({
        pattern: 'searchPattern',
        directory: '/src',
      });
    });

    it('should create patternTooBroad error', () => {
      const error = ToolErrors.patternTooBroad('.*', 10000);

      expect(error.errorCode).toBe(ERROR_CODES.PATTERN_TOO_BROAD);
      expect(error.message).toContain('10000');
      expect(error.context).toEqual({ pattern: '.*', matchCount: 10000 });
    });

    it('should create paginationRequired error', () => {
      const error = ToolErrors.paginationRequired(50000);

      expect(error.errorCode).toBe(ERROR_CODES.PAGINATION_REQUIRED);
      expect(error.message).toContain('50000');
      expect(error.context).toEqual({ itemCount: 50000 });
    });

    it('should create outputTooLarge error', () => {
      const error = ToolErrors.outputTooLarge(100000, 50000);

      expect(error.errorCode).toBe(ERROR_CODES.OUTPUT_TOO_LARGE);
      expect(error.message).toContain('100000');
      expect(error.message).toContain('50000');
      expect(error.context).toEqual({ size: 100000, limit: 50000 });
    });

    it('should create responseTooLarge error', () => {
      const error = ToolErrors.responseTooLarge(200000, 100000);

      expect(error.errorCode).toBe(ERROR_CODES.RESPONSE_TOO_LARGE);
      expect(error.message).toContain('200000');
      expect(error.message).toContain('100000');
      expect(error.context).toEqual({ tokens: 200000, limit: 100000 });
    });

    it('should create commandExecutionFailed error', () => {
      const cause = new Error('Timeout');
      const error = ToolErrors.commandExecutionFailed('find /path', cause);

      expect(error.errorCode).toBe(ERROR_CODES.COMMAND_EXECUTION_FAILED);
      expect(error.message).toContain('find /path');
      expect(error.context).toEqual({ command: 'find /path' });
      expect(error.stack).toContain('Caused by:');
    });

    it('should create queryExecutionFailed error', () => {
      const cause = new Error('Query timeout');
      const error = ToolErrors.queryExecutionFailed('query-123', cause);

      expect(error.errorCode).toBe(ERROR_CODES.QUERY_EXECUTION_FAILED);
      expect(error.context).toEqual({ queryId: 'query-123' });
      expect(error.stack).toContain('Caused by:');
    });

    it('should create toolExecutionFailed error', () => {
      const cause = new Error('Internal error');
      const error = ToolErrors.toolExecutionFailed('local_ripgrep', cause);

      expect(error.errorCode).toBe(ERROR_CODES.TOOL_EXECUTION_FAILED);
      expect(error.message).toContain('local_ripgrep');
      expect(error.context).toEqual({ toolName: 'local_ripgrep' });
      expect(error.stack).toContain('Caused by:');
    });
  });
});
