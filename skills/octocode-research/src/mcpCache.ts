/**
 * MCP Content Cache Module
 *
 * Loads mcpContent ONCE at server startup and provides cached access.
 * Routes should use getMcpContent() instead of calling loadToolContent() on each request.
 */

import type { CompleteMetadata } from 'octocode-mcp/public';
import { initialize, loadToolContent } from 'octocode-mcp/public';

let mcpContent: CompleteMetadata | null = null;
let initPromise: Promise<CompleteMetadata> | null = null;

/**
 * Initialize mcpContent - call ONCE at server startup
 * Safe to call multiple times (idempotent)
 */
export async function initializeMcpContent(): Promise<CompleteMetadata> {
  if (mcpContent) return mcpContent;

  if (initPromise) return initPromise;

  initPromise = (async () => {
    await initialize();
    const content = await loadToolContent();
    mcpContent = content;
    return content;
  })();

  return initPromise;
}

/**
 * Get cached mcpContent - use in routes
 * Throws if not initialized (indicates server startup failed)
 */
export function getMcpContent(): CompleteMetadata {
  if (!mcpContent) {
    throw new Error('mcpContent not initialized. Call initializeMcpContent() at server startup.');
  }
  return mcpContent;
}

/**
 * Check if mcpContent is initialized (for health checks)
 */
export function isMcpInitialized(): boolean {
  return mcpContent !== null;
}
