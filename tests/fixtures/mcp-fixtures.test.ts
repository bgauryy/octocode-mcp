import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  createMockMcpServer,
  createMockResult,
  parseResultJson,
} from './mcp-fixtures.js';
import type { MockMcpServer } from './mcp-fixtures.js';

describe('MCP Test Fixtures', () => {
  let mockServer: MockMcpServer;

  beforeEach(() => {
    mockServer = createMockMcpServer();
  });

  afterEach(() => {
    mockServer.cleanup();
  });

  describe('createMockMcpServer', () => {
    it('should create a mock server with tool registration', () => {
      expect(mockServer.server).toBeDefined();
      expect(mockServer.callTool).toBeDefined();
      expect(mockServer.cleanup).toBeDefined();
      expect(typeof mockServer.server.tool).toBe('function');
    });

    it('should register and call tools correctly', async () => {
      // Register a test tool
      mockServer.server.tool(
        'test_tool',
        async (args: Record<string, unknown>) =>
          createMockResult({ received: args })
      );

      // Call the tool
      const result = await mockServer.callTool('test_tool', { input: 'test' });
      const data = parseResultJson(result);

      expect(result.isError).toBe(false);
      expect(data).toEqual({ received: { input: 'test' } });
    });

    it('should throw error for unregistered tools', async () => {
      await expect(mockServer.callTool('nonexistent_tool')).rejects.toThrow(
        "Tool 'nonexistent_tool' not found"
      );
    });

    it('should handle tool errors correctly', async () => {
      // Register a tool that throws an error
      mockServer.server.tool('error_tool', async () => {
        throw new Error('Tool execution failed');
      });

      await expect(mockServer.callTool('error_tool')).rejects.toThrow(
        'Tool execution failed'
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
