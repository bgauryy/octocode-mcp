/**
 * Narrow public API for programmatic Octocode consumers.
 *
 * This package is the MCP interface, so this facade only exposes the pieces a
 * non-MCP caller needs to initialize metadata/config state and run the same
 * tool executors through core. MCP registration internals and direct-tool
 * catalog helpers intentionally stay out of this surface.
 */

export type { CompleteMetadata } from '@octocodeai/octocode-tools-core';

export {
  executeDirectTool,
  initialize,
  initializeProviders,
} from '@octocodeai/octocode-tools-core';

export { DIRECT_TOOL_DISCOVERY_DEFINITIONS } from '@octocodeai/octocode-core/schema';
