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
    args?: Record<string, unknown>
  ) => Promise<CallToolResult>;
  cleanup: () => void;
}

/**
 * Create a mock MCP server for testing
 */
export function createMockMcpServer(): MockMcpServer {
  const toolHandlers = new Map<string, Function>();

  const mockServer = {
    tool: vi.fn(
      (
        name: string,
        description: any,
        schema: any,
        metadata: any,
        handler: Function
      ) => {
        toolHandlers.set(name, handler);
      }
    ),
    // Add the registerTool method that the actual tools are calling
    registerTool: vi.fn((name: string, options: any, handler: Function) => {
      toolHandlers.set(name, handler);
    }),
    // Add other server methods as needed
    addTool: vi.fn(),
    listTools: vi.fn(),
  } as unknown as McpServer;

  const callTool = async (
    name: string,
    args?: Record<string, unknown>
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

    return await handler(request.params.arguments);
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

  const text = result.content[0].text;
  if (typeof text !== 'string') {
    throw new Error('Result content is not a string');
  }

  return JSON.parse(text) as T;
}
