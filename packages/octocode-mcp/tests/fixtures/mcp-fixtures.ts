import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
  CallToolRequest,
  CallToolResult,
} from '@modelcontextprotocol/sdk/types.js';
import { vi } from 'vitest';

export interface MockMcpServer {
  server: McpServer;
  callTool: (
    name: string,
    args?: Record<string, unknown>,
    options?: { authInfo?: { token?: string }; sessionId?: string }
  ) => Promise<CallToolResult>;
  cleanup: () => void;
}

/**
 * Create a mock MCP server for testing
 */
export function createMockMcpServer(): MockMcpServer {
  const toolHandlers = new Map<string, Function>();

  const mockServer = {
    // Mock for the test's server.tool() method - handler is the 2nd parameter
    tool: vi.fn((name: string, handler: Function) => {
      toolHandlers.set(name, handler);
    }),
    // Mock for the actual tools' server.registerTool() method - handler is the 3rd parameter

    registerTool: vi.fn((name: string, _options: any, handler: Function) => {
      toolHandlers.set(name, handler);
    }),
    // Add other server methods as needed
    addTool: vi.fn(),
    listTools: vi.fn(),
  } as unknown as McpServer;

  const callTool = async (
    name: string,
    args?: Record<string, unknown>,
    options?: { authInfo?: { token?: string }; sessionId?: string }
  ): Promise<CallToolResult> => {
    const handler = toolHandlers.get(name);
    if (!handler) {
      throw new Error(`Tool '${name}' not found`);
    }

    const request: CallToolRequest = {
      method: 'tools/call',
      params: {
        name,
        arguments: args || {},
      },
    };

    return await handler(request.params.arguments, {
      authInfo: options?.authInfo,
      sessionId: options?.sessionId,
    });
  };

  const cleanup = () => {
    toolHandlers.clear();
    vi.clearAllMocks();
  };

  return {
    server: mockServer,
    callTool,
    cleanup,
  };
}

/**
 * Create a mock CallToolResult for testing
 */
export function createMockResult(
  data: unknown,
  isError = false
): CallToolResult {
  return {
    content: [
      {
        type: 'text',
        text: isError ? String(data) : JSON.stringify(data, null, 2),
      },
    ],
    isError,
  };
}

/**
 * Parse JSON from a CallToolResult
 */
export function parseResultJson<T = unknown>(result: CallToolResult): T {
  if (result.isError || !result.content?.[0]) {
    throw new Error('Cannot parse error result');
  }

  const firstContent = result.content[0];
  if (firstContent.type !== 'text') {
    throw new Error('Content is not text type');
  }

  const text = firstContent.text;
  if (typeof text !== 'string') {
    throw new Error('Result content is not a string');
  }

  return JSON.parse(text) as T;
}
