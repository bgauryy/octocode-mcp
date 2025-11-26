/**
 * local-explorer-mcp MCP Server
 * Provides local file system research capabilities using Linux commands
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { registerTools, registerPrompts } from './tools/toolsManager.js';
import { pathValidator } from './security/pathValidator.js';

const INSTRUCTION = `Purpose: fast local files/dirs search

Tools:
- local_view_structure: Directory overview for discovery
- local_find_files: Find paths by name/time/size/perm (metadata). Use before content reads and for search
- local_ripgrep: Content search by petterns/regex + byte offsets
- local_fetch_content: Extract sections or paginate content from file

Search Workflow: ripgrep → fetch_content.
Explore Workflow: view_structure/find_files → ripgrep → fetch_content.`;

async function main(): Promise<void> {
  const server = new McpServer(
    {
      name: 'local-explorer-mcp',
      version: '1.0.0',
    },
    {
      capabilities: {
        tools: {},
        prompts: {},
      },
      instructions: INSTRUCTION,
    }
  );

  const workspaceRoot = process.env.WORKSPACE_ROOT || process.cwd();
  pathValidator.addAllowedRoot(workspaceRoot);

  registerTools(server);
  registerPrompts(server);

  process.on('SIGINT', () => process.exit(0));
  process.on('SIGTERM', () => process.exit(0));

  process.on('uncaughtException', (_error) => {
    process.exit(1);
  });

  process.on('unhandledRejection', (_reason) => {
    process.exit(1);
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((_error) => {
  process.exit(1);
});
