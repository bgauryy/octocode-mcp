import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerResearchPrompt } from './research.js';
import { registerUsePrompt } from './use.js';
import { registerSecurityReviewPrompt } from './review_security.js';
import type { CompleteMetadata } from '../tools/toolMetadata.js';

/**
 * Register all prompts with the MCP server
 * Each prompt is defined in its own file under the prompts directory
 */
export function registerPrompts(
  server: McpServer,
  content: CompleteMetadata
): void {
  const hasResearch =
    !!content?.prompts?.research &&
    typeof content.prompts.research.name === 'string' &&
    content.prompts.research.name.trim().length > 0 &&
    typeof content.prompts.research.description === 'string' &&
    content.prompts.research.description.trim().length > 0 &&
    typeof content.prompts.research.content === 'string' &&
    content.prompts.research.content.trim().length > 0;

  if (hasResearch) {
    registerResearchPrompt(server, content);
  }

  const hasUse =
    !!content?.prompts?.use &&
    typeof content.prompts.use.name === 'string' &&
    content.prompts.use.name.trim().length > 0 &&
    typeof content.prompts.use.description === 'string' &&
    content.prompts.use.description.trim().length > 0 &&
    typeof content.prompts.use.content === 'string' &&
    content.prompts.use.content.trim().length > 0;

  if (hasUse) {
    registerUsePrompt(server, content);
  }

  const hasSecurityReview =
    !!content?.prompts?.reviewSecurity &&
    typeof content.prompts.reviewSecurity.name === 'string' &&
    content.prompts.reviewSecurity.name.trim().length > 0 &&
    typeof content.prompts.reviewSecurity.description === 'string' &&
    content.prompts.reviewSecurity.description.trim().length > 0 &&
    typeof content.prompts.reviewSecurity.content === 'string' &&
    content.prompts.reviewSecurity.content.trim().length > 0;

  if (hasSecurityReview) {
    registerSecurityReviewPrompt(server, content);
  }
}
