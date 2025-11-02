import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerResearchPrompt } from './research.js';
import { registerKudosPrompt } from './kudos.js';
import { registerUsePrompt } from './use.js';

/**
 * Register all prompts with the MCP server
 * Each prompt is defined in its own file under the prompts directory
 */
export function registerPrompts(server: McpServer): void {
  registerResearchPrompt(server);
  registerKudosPrompt(server);
  registerUsePrompt(server);
}
