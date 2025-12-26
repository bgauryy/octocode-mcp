import { describe, it, expect } from 'vitest';
import {
  CONFIG_ERRORS,
  VALIDATION_ERRORS,
  FETCH_ERRORS,
  TOOL_METADATA_ERRORS,
  FILE_OPERATION_ERRORS,
  REPOSITORY_ERRORS,
  SEARCH_ERRORS,
  STARTUP_ERRORS,
  PROMISE_ERRORS,
  ALL_ERROR_CODES,
} from '../src/errorCodes.js';

describe('errorCodes', () => {
  describe('Error Constants', () => {
    describe('CONFIG_ERRORS', () => {
      it('should have NOT_INITIALIZED error', () => {
        expect(CONFIG_ERRORS.NOT_INITIALIZED).toMatchObject({
          code: 'CONFIG_NOT_INITIALIZED',
          message: expect.stringContaining('initialize()'),
        });
      });

      it('should have NO_GITHUB_TOKEN error', () => {
        expect(CONFIG_ERRORS.NO_GITHUB_TOKEN).toMatchObject({
          code: 'CONFIG_NO_GITHUB_TOKEN',
          message: expect.stringContaining('GitHub token'),
        });
      });
    });

    describe('VALIDATION_ERRORS', () => {
      it('should have PROMISES_NOT_ARRAY error', () => {
        expect(VALIDATION_ERRORS.PROMISES_NOT_ARRAY).toMatchObject({
          code: 'VALIDATION_PROMISES_NOT_ARRAY',
          message: 'promises must be an array',
        });
      });

      it('should have TIMEOUT_NOT_POSITIVE error', () => {
        expect(VALIDATION_ERRORS.TIMEOUT_NOT_POSITIVE).toMatchObject({
          code: 'VALIDATION_TIMEOUT_NOT_POSITIVE',
          message: 'timeout must be positive',
        });
      });

      it('should have CONCURRENCY_NOT_POSITIVE error', () => {
        expect(VALIDATION_ERRORS.CONCURRENCY_NOT_POSITIVE).toMatchObject({
          code: 'VALIDATION_CONCURRENCY_NOT_POSITIVE',
          message: 'concurrency must be positive',
        });
      });

      it('should have INVALID_PARAMETERS error', () => {
        expect(VALIDATION_ERRORS.INVALID_PARAMETERS).toMatchObject({
          code: 'VALIDATION_INVALID_PARAMETERS',
          message: expect.stringContaining('object'),
        });
      });

      it('should have INVALID_PARAMETER_KEY error with function message', () => {
        const error = VALIDATION_ERRORS.INVALID_PARAMETER_KEY;
        expect(error.code).toBe('VALIDATION_INVALID_PARAMETER_KEY');
        expect(error.message).toBeTypeOf('function');
        expect(error.message('testKey')).toContain('testKey');
      });

      it('should have INVALID_NESTED_OBJECT error with function message', () => {
        const error = VALIDATION_ERRORS.INVALID_NESTED_OBJECT;
        expect(error.code).toBe('VALIDATION_INVALID_NESTED_OBJECT');
        expect(error.message).toBeTypeOf('function');
        expect(error.message('testKey', 'warnings')).toContain('testKey');
        expect(error.message('testKey', 'warnings')).toContain('warnings');
      });
    });

    describe('FETCH_ERRORS', () => {
      it('should have FETCH_NOT_AVAILABLE error', () => {
        expect(FETCH_ERRORS.FETCH_NOT_AVAILABLE).toMatchObject({
          code: 'FETCH_NOT_AVAILABLE',
          message: expect.stringContaining('fetch'),
        });
      });

      it('should have FETCH_FAILED_AFTER_RETRIES error with function message', () => {
        const error = FETCH_ERRORS.FETCH_FAILED_AFTER_RETRIES;
        expect(error.code).toBe('FETCH_FAILED_AFTER_RETRIES');
        expect(error.message).toBeTypeOf('function');
        const msg = error.message(3, 'Network error');
        expect(msg).toContain('3');
        expect(msg).toContain('Network error');
      });

      it('should have FETCH_HTTP_ERROR error with function message', () => {
        const error = FETCH_ERRORS.FETCH_HTTP_ERROR;
        expect(error.code).toBe('FETCH_HTTP_ERROR');
        expect(error.message).toBeTypeOf('function');
        const msg = error.message(404, 'Not Found');
        expect(msg).toContain('404');
        expect(msg).toContain('Not Found');
      });
    });

    describe('TOOL_METADATA_ERRORS', () => {
      it('should have INVALID_FORMAT error', () => {
        expect(TOOL_METADATA_ERRORS.INVALID_FORMAT).toMatchObject({
          code: 'TOOL_METADATA_INVALID_FORMAT',
          message: expect.stringContaining('format'),
        });
      });

      it('should have INVALID_API_RESPONSE error', () => {
        expect(TOOL_METADATA_ERRORS.INVALID_API_RESPONSE).toMatchObject({
          code: 'TOOL_METADATA_INVALID_API_RESPONSE',
          message: expect.stringContaining('API response'),
        });
      });
    });

    describe('FILE_OPERATION_ERRORS', () => {
      it('should have PATH_IS_DIRECTORY error with function message', () => {
        const error = FILE_OPERATION_ERRORS.PATH_IS_DIRECTORY;
        expect(error.code).toBe('FILE_PATH_IS_DIRECTORY');
        expect(error.message).toBeTypeOf('function');
        expect(error.message('githubViewRepoStructure')).toContain(
          'githubViewRepoStructure'
        );
      });

      it('should have FILE_TOO_LARGE error with function message', () => {
        const error = FILE_OPERATION_ERRORS.FILE_TOO_LARGE;
        expect(error.code).toBe('FILE_TOO_LARGE');
        expect(error.message).toBeTypeOf('function');
        const msg = error.message(1000, 500, 'githubSearchCode');
        expect(msg).toContain('1000KB');
        expect(msg).toContain('500KB');
        expect(msg).toContain('githubSearchCode');
      });

      it('should have FILE_EMPTY error', () => {
        expect(FILE_OPERATION_ERRORS.FILE_EMPTY).toMatchObject({
          code: 'FILE_EMPTY',
          message: expect.stringContaining('empty'),
        });
      });

      it('should have BINARY_FILE error', () => {
        expect(FILE_OPERATION_ERRORS.BINARY_FILE).toMatchObject({
          code: 'FILE_BINARY',
          message: expect.stringContaining('Binary'),
        });
      });

      it('should have DECODE_FAILED error', () => {
        expect(FILE_OPERATION_ERRORS.DECODE_FAILED).toMatchObject({
          code: 'FILE_DECODE_FAILED',
          message: expect.stringContaining('decode'),
        });
      });

      it('should have UNSUPPORTED_TYPE error with function message', () => {
        const error = FILE_OPERATION_ERRORS.UNSUPPORTED_TYPE;
        expect(error.code).toBe('FILE_UNSUPPORTED_TYPE');
        expect(error.message).toBeTypeOf('function');
        expect(error.message('submodule')).toContain('submodule');
      });

      it('should have MATCH_STRING_NOT_FOUND error with function message', () => {
        const error = FILE_OPERATION_ERRORS.MATCH_STRING_NOT_FOUND;
        expect(error.code).toBe('FILE_MATCH_STRING_NOT_FOUND');
        expect(error.message).toBeTypeOf('function');
        expect(error.message('searchTerm')).toContain('searchTerm');
      });
    });

    describe('REPOSITORY_ERRORS', () => {
      it('should have NOT_FOUND error with function message', () => {
        const error = REPOSITORY_ERRORS.NOT_FOUND;
        expect(error.code).toBe('REPO_NOT_FOUND');
        expect(error.message).toBeTypeOf('function');
        const msg = error.message('owner', 'repo', 'Access denied');
        expect(msg).toContain('owner');
        expect(msg).toContain('repo');
        expect(msg).toContain('Access denied');
      });

      it('should have PATH_NOT_FOUND error with function message', () => {
        const error = REPOSITORY_ERRORS.PATH_NOT_FOUND;
        expect(error.code).toBe('REPO_PATH_NOT_FOUND');
        expect(error.message).toBeTypeOf('function');
        const msg = error.message('src/file.ts', 'owner', 'repo', 'main');
        expect(msg).toContain('src/file.ts');
        expect(msg).toContain('owner');
        expect(msg).toContain('repo');
        expect(msg).toContain('main');
      });

      it('should have PATH_NOT_FOUND_ANY_BRANCH error with function message', () => {
        const error = REPOSITORY_ERRORS.PATH_NOT_FOUND_ANY_BRANCH;
        expect(error.code).toBe('REPO_PATH_NOT_FOUND_ANY_BRANCH');
        expect(error.message).toBeTypeOf('function');
        const msg = error.message('src/file.ts', 'owner', 'repo');
        expect(msg).toContain('src/file.ts');
        expect(msg).toContain('owner');
        expect(msg).toContain('repo');
      });

      it('should have ACCESS_FAILED error with function message', () => {
        const error = REPOSITORY_ERRORS.ACCESS_FAILED;
        expect(error.code).toBe('REPO_ACCESS_FAILED');
        expect(error.message).toBeTypeOf('function');
        const msg = error.message('owner', 'repo', 'Network error');
        expect(msg).toContain('owner');
        expect(msg).toContain('repo');
        expect(msg).toContain('Network error');
      });

      it('should have BRANCH_NOT_FOUND error with function message', () => {
        const error = REPOSITORY_ERRORS.BRANCH_NOT_FOUND;
        expect(error.code).toBe('REPO_BRANCH_NOT_FOUND');
        expect(error.message).toBeTypeOf('function');
        expect(error.message('feature-branch')).toContain('feature-branch');
      });

      it('should have STRUCTURE_EXPLORATION_FAILED error', () => {
        expect(REPOSITORY_ERRORS.STRUCTURE_EXPLORATION_FAILED).toMatchObject({
          code: 'REPO_STRUCTURE_EXPLORATION_FAILED',
          message: expect.stringContaining('structure'),
        });
      });
    });

    describe('SEARCH_ERRORS', () => {
      it('should have QUERY_EMPTY error', () => {
        expect(SEARCH_ERRORS.QUERY_EMPTY).toMatchObject({
          code: 'SEARCH_QUERY_EMPTY',
          message: expect.stringContaining('empty'),
        });
      });

      it('should have NO_VALID_PARAMETERS error', () => {
        expect(SEARCH_ERRORS.NO_VALID_PARAMETERS).toMatchObject({
          code: 'SEARCH_NO_VALID_PARAMETERS',
          message: expect.stringContaining('parameters'),
        });
      });

      it('should have PR_REQUIRED_PARAMS error', () => {
        expect(SEARCH_ERRORS.PR_REQUIRED_PARAMS).toMatchObject({
          code: 'SEARCH_PR_REQUIRED_PARAMS',
          message: expect.stringContaining('required'),
        });
      });

      it('should have PR_SINGLE_VALUES error', () => {
        expect(SEARCH_ERRORS.PR_SINGLE_VALUES).toMatchObject({
          code: 'SEARCH_PR_SINGLE_VALUES',
          message: expect.stringContaining('single values'),
        });
      });

      it('should have API_REQUEST_FAILED error with function message', () => {
        const error = SEARCH_ERRORS.API_REQUEST_FAILED;
        expect(error.code).toBe('SEARCH_API_REQUEST_FAILED');
        expect(error.message).toBeTypeOf('function');
        expect(error.message('Rate limit exceeded')).toContain(
          'Rate limit exceeded'
        );
      });

      it('should have PULL_REQUEST_SEARCH_FAILED error with function message', () => {
        const error = SEARCH_ERRORS.PULL_REQUEST_SEARCH_FAILED;
        expect(error.code).toBe('SEARCH_PR_SEARCH_FAILED');
        expect(error.message).toBeTypeOf('function');
        expect(error.message('Invalid query')).toContain('Invalid query');
      });

      it('should have PULL_REQUEST_LIST_FAILED error with function message', () => {
        const error = SEARCH_ERRORS.PULL_REQUEST_LIST_FAILED;
        expect(error.code).toBe('SEARCH_PR_LIST_FAILED');
        expect(error.message).toBeTypeOf('function');
        expect(error.message('API error')).toContain('API error');
      });

      it('should have PULL_REQUEST_FETCH_FAILED error with function message', () => {
        const error = SEARCH_ERRORS.PULL_REQUEST_FETCH_FAILED;
        expect(error.code).toBe('SEARCH_PR_FETCH_FAILED');
        expect(error.message).toBeTypeOf('function');
        const msg = error.message(123, 'Not found');
        expect(msg).toContain('123');
        expect(msg).toContain('Not found');
      });
    });

    describe('STARTUP_ERRORS', () => {
      it('should have NO_TOOLS_REGISTERED error', () => {
        expect(STARTUP_ERRORS.NO_TOOLS_REGISTERED).toMatchObject({
          code: 'STARTUP_NO_TOOLS_REGISTERED',
          message: expect.stringContaining('tools'),
        });
      });

      it('should have UNCAUGHT_EXCEPTION error with function message', () => {
        const error = STARTUP_ERRORS.UNCAUGHT_EXCEPTION;
        expect(error.code).toBe('STARTUP_UNCAUGHT_EXCEPTION');
        expect(error.message).toBeTypeOf('function');
        expect(error.message('Division by zero')).toContain('Division by zero');
      });

      it('should have UNHANDLED_REJECTION error with function message', () => {
        const error = STARTUP_ERRORS.UNHANDLED_REJECTION;
        expect(error.code).toBe('STARTUP_UNHANDLED_REJECTION');
        expect(error.message).toBeTypeOf('function');
        expect(error.message('Promise rejected')).toContain('Promise rejected');
      });

      it('should have STARTUP_FAILED error with function message', () => {
        const error = STARTUP_ERRORS.STARTUP_FAILED;
        expect(error.code).toBe('STARTUP_FAILED');
        expect(error.message).toBeTypeOf('function');
        expect(error.message('Init failed')).toContain('Init failed');
      });
    });

    describe('PROMISE_ERRORS', () => {
      it('should have TIMEOUT error with function message', () => {
        const error = PROMISE_ERRORS.TIMEOUT;
        expect(error.code).toBe('PROMISE_TIMEOUT');
        expect(error.message).toBeTypeOf('function');
        const msg = error.message(0, 5000);
        expect(msg).toContain('0');
        expect(msg).toContain('5000ms');
      });

      it('should have NOT_A_FUNCTION error with function message', () => {
        const error = PROMISE_ERRORS.NOT_A_FUNCTION;
        expect(error.code).toBe('PROMISE_NOT_A_FUNCTION');
        expect(error.message).toBeTypeOf('function');
        expect(error.message(2)).toContain('2');
      });

      it('should have FUNCTION_UNDEFINED error', () => {
        expect(PROMISE_ERRORS.FUNCTION_UNDEFINED).toMatchObject({
          code: 'PROMISE_FUNCTION_UNDEFINED',
          message: expect.stringContaining('undefined'),
        });
      });
    });

    describe('ALL_ERROR_CODES', () => {
      it('should contain all error codes from all categories', () => {
        expect(ALL_ERROR_CODES).toMatchObject({
          ...CONFIG_ERRORS,
          ...VALIDATION_ERRORS,
          ...FETCH_ERRORS,
          ...TOOL_METADATA_ERRORS,
          ...FILE_OPERATION_ERRORS,
          ...REPOSITORY_ERRORS,
          ...SEARCH_ERRORS,
          ...STARTUP_ERRORS,
          ...PROMISE_ERRORS,
        });
      });

      it('should have unique error codes', () => {
        const codes = Object.values(ALL_ERROR_CODES).map(error =>
          typeof error.code === 'string' ? error.code : 'INVALID'
        );
        const uniqueCodes = new Set(codes);
        expect(codes.length).toBe(uniqueCodes.size);
      });
    });
  });
});
