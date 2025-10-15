#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from '@modelcontextprotocol/sdk/types.js';
import NodeCache from 'node-cache';

// Initialize cache with configuration from design document
const cache = new NodeCache({
  stdTTL: 3600, // Default TTL: 1 hour
  checkperiod: 120, // Cleanup every 2 minutes
  useClones: false, // Performance optimization
});

// Tool definitions
const TOOLS: Tool[] = [
  {
    name: 'setStorage',
    description:
      "Store a value in cache with optional expiration - IMMEDIATE response. Use namespaced keys: 'task:1', 'lock:file.ts', 'status:agent-1'",
    inputSchema: {
      type: 'object',
      properties: {
        key: {
          type: 'string',
          description:
            "Storage key identifier (use namespaced keys: 'task:1', 'lock:file.ts', 'status:agent-1')",
          minLength: 1,
          maxLength: 255,
          pattern: '^[a-zA-Z0-9:_./-]+$',
        },
        value: {
          type: 'string',
          description: 'Value to store (typically JSON stringified)',
          maxLength: 10485760, // 10MB
        },
        ttl: {
          type: 'number',
          description: 'Time-to-live in seconds (default: 3600)',
          minimum: 1,
          maximum: 86400, // 24 hours max
        },
      },
      required: ['key', 'value'],
    },
  },
  {
    name: 'getStorage',
    description:
      'Retrieve a value from cache by key - IMMEDIATE return with value',
    inputSchema: {
      type: 'object',
      properties: {
        key: {
          type: 'string',
          description: 'Storage key to retrieve',
          minLength: 1,
          maxLength: 255,
          pattern: '^[a-zA-Z0-9:_./-]+$',
        },
      },
      required: ['key'],
    },
  },
  {
    name: 'deleteStorage',
    description:
      'Delete a key from cache - IMMEDIATE removal. Returns success even if key does not exist.',
    inputSchema: {
      type: 'object',
      properties: {
        key: {
          type: 'string',
          description: 'Storage key to delete',
          minLength: 1,
          maxLength: 255,
          pattern: '^[a-zA-Z0-9:_./-]+$',
        },
      },
      required: ['key'],
    },
  },
];

// Input validation functions
function validateKey(key: unknown): string {
  if (!key || typeof key !== 'string' || key.length === 0) {
    throw new Error('Key must be a non-empty string');
  }
  if (key.length > 255) {
    throw new Error('Key exceeds 255 characters');
  }
  if (!/^[a-zA-Z0-9:_./-]+$/.test(key)) {
    throw new Error(
      'Invalid key format. Use only alphanumeric characters, colons, underscores, dots, slashes, and hyphens'
    );
  }
  return key;
}

function validateValue(value: unknown): string {
  if (value === undefined || value === null) {
    throw new Error('Value cannot be undefined or null');
  }
  if (typeof value !== 'string') {
    throw new Error('Value must be a string');
  }
  if (value.length > 10485760) {
    throw new Error('Value exceeds 10MB limit');
  }
  return value;
}

function validateTTL(ttl: unknown): number | undefined {
  if (ttl === undefined) {
    return undefined;
  }
  if (typeof ttl !== 'number' || ttl < 1 || ttl > 86400) {
    throw new Error('TTL must be a number between 1 and 86400 seconds');
  }
  return ttl;
}

// Server implementation
const server = new Server(
  {
    name: 'octocode-local-memory',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// List available tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: TOOLS,
  };
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    if (name === 'setStorage') {
      // Validate inputs
      const key = validateKey(args?.key);
      const value = validateValue(args?.value);
      const ttl = validateTTL(args?.ttl);

      // Store in cache (fire-and-forget for immediate response)
      if (ttl !== undefined) {
        cache.set(key, value, ttl);
      } else {
        cache.set(key, value);
      }

      // Immediate success response
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: true,
              key: key,
              timestamp: new Date().toISOString(),
            }),
          },
        ],
      };
    } else if (name === 'getStorage') {
      // Validate input
      const key = validateKey(args?.key);

      // Get from cache (O(1) lookup)
      const value = cache.get<string>(key);

      // Return result (success: true even if key doesn't exist)
      if (value !== undefined) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: true,
                key: key,
                value: value,
                exists: true,
                timestamp: new Date().toISOString(),
              }),
            },
          ],
        };
      } else {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: true,
                key: key,
                value: null,
                exists: false,
                timestamp: new Date().toISOString(),
              }),
            },
          ],
        };
      }
    } else if (name === 'deleteStorage') {
      // Validate input
      const key = validateKey(args?.key);

      // Delete from cache (returns count of deleted keys: 0 or 1)
      const deleted = cache.del(key);

      // Return result (success: true regardless of whether key existed)
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: true,
              key: key,
              deleted: deleted > 0,
              timestamp: new Date().toISOString(),
            }),
          },
        ],
      };
    } else {
      throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    // Error response
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            success: false,
            error: errorMessage,
          }),
        },
      ],
      isError: true,
    };
  }
});

// Graceful shutdown - clears all cached data
async function shutdown() {
  console.error('Shutting down octocode-local-memory server...');
  console.error('Clearing all cached data...');
  cache.flushAll();
  cache.close();
  await server.close();
  process.exit(0);
}

// Error shutdown - clears all cached data
async function shutdownOnError(error: unknown) {
  console.error('Fatal error occurred, shutting down...');
  console.error('Error:', error);
  console.error('Clearing all cached data...');
  cache.flushAll();
  cache.close();
  try {
    await server.close();
  } catch (closeError) {
    console.error('Error closing server:', closeError);
  }
  process.exit(1);
}

process.on('SIGINT', () => {
  shutdown().catch(console.error);
});
process.on('SIGTERM', () => {
  shutdown().catch(console.error);
});
process.on('uncaughtException', (error) => {
  shutdownOnError(error).catch(console.error);
});
process.on('unhandledRejection', (error) => {
  shutdownOnError(error).catch(console.error);
});

// Start server
async function main() {
  console.error('Starting octocode-local-memory MCP server...');
  console.error('Cache configuration:', {
    stdTTL: 3600,
    checkperiod: 120,
    useClones: false,
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error('octocode-local-memory server running on stdio');
  console.error('Ready for agent communication');
}

main().catch(shutdownOnError);
