/**
 * Test helpers for type guards and common test utilities
 */

import type { ContentBlock } from '@modelcontextprotocol/sdk/types.js';

/**
 * Type guard to check if a ContentBlock is TextContent
 */
function isTextContent(
  content: ContentBlock | undefined
): content is { type: 'text'; text: string } {
  return content?.type === 'text';
}

/**
 * Extracts text from a ContentBlock array, asserting it's text content
 * @throws Error if content is not text type
 */
export function getTextContent(content: ContentBlock[]): string {
  const firstContent = content[0];
  if (!isTextContent(firstContent)) {
    throw new Error(
      `Expected text content, got ${firstContent?.type || 'undefined'}`
    );
  }
  return firstContent.text;
}
