import { describe, it, expect } from 'vitest';
import {
  createRoleBasedResult,
  QuickResult,
  StatusEmoji,
} from '../src/responses.js';

describe('responses.branches', () => {
  describe('createRoleBasedResult - system block combinations', () => {
    it('should create result with system block containing only instructions', () => {
      const result = createRoleBasedResult({
        system: {
          instructions: 'Test instructions',
        },
        assistant: { summary: 'Test summary' },
        data: { test: 'data' },
      });

      expect(result.content).toHaveLength(2); // system + assistant
      expect((result.content as any[])[0]?.annotations?.role).toBe('system');
      expect((result.content as any[])[0]?.text).toContain('Test instructions');
    });

    it('should create result with system block containing only pagination', () => {
      const result = createRoleBasedResult({
        system: {
          pagination: {
            currentPage: 1,
            totalPages: 5,
            hasMore: true,
          },
        },
        assistant: { summary: 'Test summary' },
        data: { test: 'data' },
      });

      expect(result.content).toHaveLength(2); // system + assistant
      expect((result.content as any[])[0]?.text).toContain('Page 1/5');
      expect((result.content as any[])[0]?.text).toContain('more available');
    });

    it('should create result with system block containing pagination without more', () => {
      const result = createRoleBasedResult({
        system: {
          pagination: {
            currentPage: 5,
            totalPages: 5,
            hasMore: false,
          },
        },
        assistant: { summary: 'Test summary' },
        data: { test: 'data' },
      });

      expect((result.content as any[])[0]?.text).toContain('Page 5/5');
      expect((result.content as any[])[0]?.text).not.toContain(
        'more available'
      );
    });

    it('should create result with system block containing only warnings', () => {
      const result = createRoleBasedResult({
        system: {
          warnings: ['Warning 1', 'Warning 2'],
        },
        assistant: { summary: 'Test summary' },
        data: { test: 'data' },
      });

      expect((result.content as any[])[0]?.text).toContain('⚠️ Warnings:');
      expect((result.content as any[])[0]?.text).toContain('- Warning 1');
      expect((result.content as any[])[0]?.text).toContain('- Warning 2');
    });

    it('should create result with system block containing only hints', () => {
      const result = createRoleBasedResult({
        system: {
          hints: ['Hint 1', 'Hint 2'],
        },
        assistant: { summary: 'Test summary' },
        data: { test: 'data' },
      });

      expect((result.content as any[])[0]?.text).toContain('Hints:');
      expect((result.content as any[])[0]?.text).toContain('- Hint 1');
      expect((result.content as any[])[0]?.text).toContain('- Hint 2');
    });

    it('should create result with system block containing all options', () => {
      const result = createRoleBasedResult({
        system: {
          instructions: 'Test instructions',
          pagination: {
            currentPage: 2,
            totalPages: 10,
            hasMore: true,
          },
          warnings: ['Warning 1'],
          hints: ['Hint 1', 'Hint 2'],
        },
        assistant: { summary: 'Test summary' },
        data: { test: 'data' },
      });

      const systemText = (result.content as any[])[0]?.text || '';
      expect(systemText).toContain('Test instructions');
      expect(systemText).toContain('Page 2/10');
      expect(systemText).toContain('more available');
      expect(systemText).toContain('⚠️ Warnings:');
      expect(systemText).toContain('Hints:');
    });

    it('should not create system block when systemParts is empty', () => {
      const result = createRoleBasedResult({
        system: {},
        assistant: { summary: 'Test summary' },
        data: { test: 'data' },
      });

      expect(result.content).toHaveLength(1); // Only assistant
      expect((result.content as any[])[0]?.annotations?.role).toBe('assistant');
    });
  });

  describe('createRoleBasedResult - assistant block variations', () => {
    it('should create result with assistant details in json format', () => {
      const result = createRoleBasedResult({
        assistant: {
          summary: 'Test summary',
          details: { key: 'value' } as any,
          format: 'json',
        },
        data: { test: 'data' },
      });

      expect(result.content).toHaveLength(2); // assistant summary + assistant data
      expect((result.content as any[])[1]?.text).toContain('"key"');
      expect((result.content as any[])[1]?.text).toContain('"value"');
    });

    it('should create result with assistant details in yaml format', () => {
      const result = createRoleBasedResult({
        assistant: {
          summary: 'Test summary',
          details: { key: 'value' } as any,
          format: 'yaml',
        },
        data: { test: 'data' },
      });

      expect(result.content).toHaveLength(2);
      expect((result.content as any[])[1]?.text).toContain('key:');
      expect((result.content as any[])[1]?.text).toContain('value');
    });

    it('should default to yaml format when format is not json or yaml', () => {
      const result = createRoleBasedResult({
        assistant: {
          summary: 'Test summary',
          details: { key: 'value' } as any,
          format: 'markdown' as 'yaml',
        },
        data: { test: 'data' },
      });

      expect(result.content).toHaveLength(2);
      // Should be YAML format (default)
      expect((result.content as any[])[1]?.text).toContain('key:');
    });

    it('should create result without assistant details', () => {
      const result = createRoleBasedResult({
        assistant: {
          summary: 'Test summary',
        },
        data: { test: 'data' },
      });

      expect(result.content).toHaveLength(1); // Only assistant summary
      expect((result.content as any[])[0]?.text).toBe('Test summary');
    });
  });

  describe('createRoleBasedResult - user block variations', () => {
    it('should create result with user block and emoji', () => {
      const result = createRoleBasedResult({
        assistant: { summary: 'Test summary' },
        user: {
          message: 'Operation completed',
          emoji: '✅',
        },
        data: { test: 'data' },
      });

      expect(result.content).toHaveLength(2); // assistant + user
      expect((result.content as any[])[1]?.annotations?.role).toBe('user');
      expect((result.content as any[])[1]?.text).toBe('✅ Operation completed');
    });

    it('should create result with user block without emoji', () => {
      const result = createRoleBasedResult({
        assistant: { summary: 'Test summary' },
        user: {
          message: 'Operation completed',
        },
        data: { test: 'data' },
      });

      expect(result.content).toHaveLength(2);
      expect((result.content as any[])[1]?.text).toBe('Operation completed');
    });

    it('should create result without user block', () => {
      const result = createRoleBasedResult({
        assistant: { summary: 'Test summary' },
        data: { test: 'data' },
      });

      expect(result.content).toHaveLength(1); // Only assistant
    });
  });

  describe('createRoleBasedResult - isError flag', () => {
    it('should set isError to true when provided', () => {
      const result = createRoleBasedResult({
        assistant: { summary: 'Test summary' },
        data: { test: 'data' },
        isError: true,
      });

      expect(result.isError).toBe(true);
    });

    it('should set isError to false when not provided', () => {
      const result = createRoleBasedResult({
        assistant: { summary: 'Test summary' },
        data: { test: 'data' },
      });

      expect(result.isError).toBe(false);
    });
  });

  describe('QuickResult.success', () => {
    it('should create success result with hints', () => {
      const result = QuickResult.success(
        'Operation completed',
        { files: ['file1.ts', 'file2.ts'] },
        ['Hint 1', 'Hint 2']
      );

      expect(result.isError).toBe(false);
      expect(result.content).toHaveLength(3); // system + assistant + user
      expect((result.content as any[])[0]?.annotations?.role).toBe('system');
      expect((result.content as any[])[0]?.text).toContain('Hints:');
      expect((result.content as any[])[2]?.text).toContain(StatusEmoji.success);
    });

    it('should create success result without hints', () => {
      const result = QuickResult.success('Operation completed', {
        files: ['file1.ts'],
      });

      expect(result.isError).toBe(false);
      expect(result.content).toHaveLength(2); // assistant + user (no system)
      expect((result.content as any[])[1]?.text).toContain(StatusEmoji.success);
    });
  });

  describe('QuickResult.error', () => {
    it('should create error result with details', () => {
      const result = QuickResult.error('Test error', {
        code: 'ERROR_CODE',
        message: 'Error message',
      });

      expect(result.isError).toBe(true);
      expect(result.content).toHaveLength(3); // system + assistant + user
      expect((result.content as any[])[0]?.text).toContain(
        'Tool execution failed. Error details provided for self-correction.'
      );
      expect((result.content as any[])[1]?.text).toContain('Error: Test error');
      expect((result.content as any[])[2]?.text).toContain(StatusEmoji.error);
    });

    it('should create error result without details', () => {
      const result = QuickResult.error('Test error');

      expect(result.isError).toBe(true);
      expect(result.content).toHaveLength(3);
      expect((result.content as any[])[1]?.text).toBe('Error: Test error');
    });
  });

  describe('QuickResult.empty', () => {
    it('should create empty result with custom hints', () => {
      const result = QuickResult.empty('No results found', [
        'Custom hint 1',
        'Custom hint 2',
      ]);

      expect(result.isError).toBe(false);
      expect(result.content).toHaveLength(3); // system + assistant + user
      expect((result.content as any[])[0]?.text).toContain('Custom hint 1');
      expect((result.content as any[])[0]?.text).toContain('Custom hint 2');
      expect((result.content as any[])[2]?.text).toContain(StatusEmoji.empty);
    });

    it('should create empty result with default hints when none provided', () => {
      const result = QuickResult.empty('No results found');

      expect(result.isError).toBe(false);
      expect(result.content).toHaveLength(3);
      const systemText = (result.content as any[])[0]?.text || '';
      expect(systemText).toContain('Try broader search terms');
      expect(systemText).toContain('Check spelling');
    });
  });

  describe('QuickResult.paginated', () => {
    it('should create paginated result with hints', () => {
      const result = QuickResult.paginated(
        'Found 50 results',
        { items: [1, 2, 3] },
        { page: 2, total: 10, hasMore: true },
        ['Use page parameter for next page']
      );

      expect(result.isError).toBe(false);
      expect(result.content).toHaveLength(3); // system + assistant + user
      expect((result.content as any[])[0]?.text).toContain('Page 2/10');
      expect((result.content as any[])[0]?.text).toContain('more available');
      expect((result.content as any[])[0]?.text).toContain(
        'Use page parameter for next page'
      );
      expect((result.content as any[])[2]?.text).toContain('📄');
    });

    it('should create paginated result without hints', () => {
      const result = QuickResult.paginated(
        'Found 50 results',
        { items: [1, 2, 3] },
        { page: 10, total: 10, hasMore: false }
      );

      expect(result.isError).toBe(false);
      expect(result.content).toHaveLength(3);
      expect((result.content as any[])[0]?.text).toContain('Page 10/10');
      expect((result.content as any[])[0]?.text).not.toContain(
        'more available'
      );
      expect((result.content as any[])[2]?.text).toContain(StatusEmoji.success);
    });
  });

  describe('cleanAndStructure - data type variations', () => {
    it('should return undefined for null data', () => {
      const result = createRoleBasedResult({
        assistant: { summary: 'Test' },
        data: null,
      });

      expect(result.structuredContent).toBeUndefined();
    });

    it('should return undefined for undefined data', () => {
      const result = createRoleBasedResult({
        assistant: { summary: 'Test' },
        data: undefined,
      });

      expect(result.structuredContent).toBeUndefined();
    });

    it('should return object for object data', () => {
      const result = createRoleBasedResult({
        assistant: { summary: 'Test' },
        data: { key: 'value', nested: { prop: 'val' } },
      });

      expect(result.structuredContent).toEqual({
        key: 'value',
        nested: { prop: 'val' },
      });
    });

    it('should wrap array data in object', () => {
      const result = createRoleBasedResult({
        assistant: { summary: 'Test' },
        data: [1, 2, 3],
      });

      expect(result.structuredContent).toEqual({ data: [1, 2, 3] });
    });

    it('should wrap string data in object', () => {
      const result = createRoleBasedResult({
        assistant: { summary: 'Test' },
        data: 'test string',
      });

      expect(result.structuredContent).toEqual({ data: 'test string' });
    });

    it('should wrap number data in object', () => {
      const result = createRoleBasedResult({
        assistant: { summary: 'Test' },
        data: 42,
      });

      expect(result.structuredContent).toEqual({ data: 42 });
    });

    it('should clean nested objects with undefined values', () => {
      const result = createRoleBasedResult({
        assistant: { summary: 'Test' },
        data: {
          key: 'value',
          undefinedKey: undefined,
          nullKey: null,
          nested: {
            prop: 'val',
            undefinedProp: undefined,
          },
        },
      });

      expect(result.structuredContent).toEqual({
        key: 'value',
        nested: {
          prop: 'val',
        },
      });
    });

    it('should clean arrays with undefined values', () => {
      const result = createRoleBasedResult({
        assistant: { summary: 'Test' },
        data: {
          items: [1, undefined, 2, null, 3],
        },
      });

      expect(result.structuredContent).toEqual({
        items: [1, 2, 3],
      });
    });
  });
});
