import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  CallToolRequest,
  CallToolResult,
} from '@modelcontextprotocol/sdk/types.js';
import { vi } from 'vitest';

export interface MockServer {
  server: Server;
  callTool: (
    name: string,
    args?: Record<string, unknown>
  ) => Promise<CallToolResult>;
  cleanup: () => void;
}

/**
 * Create a mock MCP server for testing
 */
export function createMockServer(): MockServer {
  const toolHandlers = new Map<string, Function>();

  const mockServer = {
    // Mock for setRequestHandler - used by the new Server API
    setRequestHandler: vi.fn(),
    // Add other server methods as needed
    connect: vi.fn(),
    close: vi.fn(),
  } as unknown as Server;

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

    return await handler(request.params.arguments, {
      authInfo: undefined,
      sessionId: undefined,
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

  const text = result.content[0].text;
  if (typeof text !== 'string') {
    throw new Error('Result content is not a string');
  }

  return JSON.parse(text) as T;
}
