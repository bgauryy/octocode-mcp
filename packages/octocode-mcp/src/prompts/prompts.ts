import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerResearchPrompt } from './research.js';
import { registerKudosPrompt } from './kudos.js';
import { registerUsePrompt } from './use.js';
import type { CompleteMetadata } from '../tools/toolMetadata.js';

/**
 * Register all prompts with the MCP server
 * Each prompt is defined in its own file under the prompts directory
 */
export function registerPrompts(
  server: McpServer,
  content: CompleteMetadata
): void {
  registerResearchPrompt(server, content);
  registerKudosPrompt(server, content);
  registerUsePrompt(server, content);
}
