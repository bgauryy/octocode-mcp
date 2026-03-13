/**
 * Initialization wrapper for octocode-mcp engine.
 * Sets up config, providers, and tool metadata before CLI commands execute.
 */

import { initialize, initializeProviders } from 'octocode-mcp/public';
import { loadToolContent } from 'octocode-mcp/public';

let initialized = false;

export async function ensureInitialized(): Promise<void> {
  if (initialized) return;

  await initialize();
  await initializeProviders();

  try {
    await loadToolContent();
  } catch {
    // Metadata fetch failure is non-fatal — hints won't work but commands still execute
    process.stderr.write(
      'Warning: Could not load tool metadata. Hints may be unavailable.\n'
    );
  }

  initialized = true;
}
