/**
 * octocode-local-files MCP Server
 * Provides local file system research capabilities using Linux commands
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { registerTools } from './tools/toolsManager.js';
import { pathValidator } from './security/pathValidator.js';
import { clearAllCache } from './utils/cache.js';

/**
 * Main server initialization
 */
async function main(): Promise<void> {
  // Create MCP server
  const server = new McpServer(
    {
      name: 'octocode-local-files',
      version: '1.0.0',
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  // Initialize path validator with workspace root if provided
  const workspaceRoot = process.env.WORKSPACE_ROOT || process.cwd();
  pathValidator.addAllowedRoot(workspaceRoot);

  // Register all tools
  registerTools(server);

  // Set up signal handlers for graceful shutdown
  const cleanup = () => {
    clearAllCache();
    process.exit(0);
  };

  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);

  process.on('uncaughtException', (_error) => {
    process.exit(1);
  });

  process.on('unhandledRejection', (_reason) => {
    process.exit(1);
  });

  // Start the server with stdio transport
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

// Run the server
main().catch((_error) => {
  process.exit(1);
});
