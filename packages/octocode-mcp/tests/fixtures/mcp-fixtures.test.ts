import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  createMockServer,
  createMockResult,
  parseResultJson,
} from './mcp-fixtures.js';
import type { MockServer } from './mcp-fixtures.js';

describe('MCP Test Fixtures', () => {
  let mockServer: MockServer;

  beforeEach(() => {
    mockServer = createMockServer();
  });

  afterEach(() => {
    mockServer.cleanup();
  });

  describe('createMockServer', () => {
    it('should throw error for unregistered tools', async () => {
      await expect(mockServer.callTool('nonexistent_tool')).rejects.toThrow(
        "Tool 'nonexistent_tool' not found"
      );
    });
  });

  describe('createMockResult', () => {
    it('should create success result with JSON data', () => {
      const data = { message: 'success', value: 42 };
      const result = createMockResult(data);

      expect(result.isError).toBe(false);
      expect(result.content).toHaveLength(1);
      expect(result.content[0]?.type).toBe('text');
      expect(result.content[0]?.text).toBe(JSON.stringify(data, null, 2));
    });

    it('should create error result with string message', () => {
      const errorMessage = 'Something went wrong';
      const result = createMockResult(errorMessage, true);

      expect(result.isError).toBe(true);
      expect(result.content).toHaveLength(1);
      expect(result.content[0]?.type).toBe('text');
      expect(result.content[0]?.text).toBe(errorMessage);
    });
  });

  describe('parseResultJson', () => {
    it('should parse JSON from successful result', () => {
      const originalData = { test: 'data', number: 123 };
      const result = createMockResult(originalData);
      const parsedData = parseResultJson(result);

      expect(parsedData).toEqual(originalData);
    });

    it('should throw error for error results', () => {
      const result = createMockResult('Error message', true);

      expect(() => parseResultJson(result)).toThrow(
        'Cannot parse error result'
      );
    });

    it('should throw error for results without content', () => {
      const result = { isError: false, content: [] };

      expect(() => parseResultJson(result)).toThrow(
        'Cannot parse error result'
      );
    });

    it('should throw error for non-string content', () => {
      const result = {
        isError: false,
        content: [{ type: 'text', text: 123 as unknown }],
      } as unknown as Parameters<typeof parseResultJson>[0];

      expect(() => parseResultJson(result)).toThrow(
        'Result content is not a string'
      );
    });

    it('should throw error for invalid JSON', () => {
      const result = {
        isError: false,
        content: [{ type: 'text', text: 'invalid json {' }],
      } as unknown as Parameters<typeof parseResultJson>[0];

      expect(() => parseResultJson(result)).toThrow();
    });
  });
});
