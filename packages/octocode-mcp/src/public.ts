/**
 * Public API exports for octocode-mcp
 *
 * This module provides types, schemas, and utilities for users
 * who want to programmatically interact with Octocode MCP metadata.
 *
 * @example
 * ```typescript
 * import {
 *   STATIC_TOOL_NAMES,
 *   type CompleteMetadata,
 *   type ToolNames,
 *   type ToolMetadata
 * } from 'octocode-mcp/public';
 * ```
 */

// ============================================================================
// Types - Core metadata types for Octocode MCP
// ============================================================================

export type {
  // Complete metadata structure returned by API
  CompleteMetadata,
  RawCompleteMetadata,
  // Tool metadata for individual tools
  ToolMetadata,
  // Tool name mappings
  ToolNames,
  // Base schema structure
  BaseSchema,
  // Prompt definitions
  PromptMetadata,
  PromptArgument,
  // Hint system types
  HintStatus,
  HintContext,
  HintGenerator,
  ToolHintGenerators,
} from './types/metadata.js';

// ============================================================================
// Tool Names - Constants for all available tools
// ============================================================================

/**
 * Static tool name constants for all Octocode MCP tools.
 * Use these for type-safe tool name references.
 *
 * @example
 * ```typescript
 * const toolName = STATIC_TOOL_NAMES.GITHUB_SEARCH_CODE;
 * // toolName = 'githubSearchCode'
 * ```
 */
export { STATIC_TOOL_NAMES } from './tools/toolNames.js';

// ============================================================================
// Tool Metadata Utilities - For accessing dynamic metadata
// ============================================================================

export {
  // Initialization
  initializeToolMetadata,
  loadToolContent,
  // Tool name proxy (requires initialization)
  TOOL_NAMES,
  // Schema proxies (requires initialization)
  BASE_SCHEMA,
  // Tool content accessors
  DESCRIPTIONS,
  TOOL_HINTS,
  GENERIC_ERROR_HINTS,
  // Schema helpers for each tool
  GITHUB_FETCH_CONTENT,
  GITHUB_SEARCH_CODE,
  GITHUB_SEARCH_REPOS,
  GITHUB_SEARCH_PULL_REQUESTS,
  GITHUB_VIEW_REPO_STRUCTURE,
  PACKAGE_SEARCH,
  LOCAL_RIPGREP,
  LOCAL_FETCH_CONTENT,
  LOCAL_FIND_FILES,
  LOCAL_VIEW_STRUCTURE,
  // Utility functions
  isToolInMetadata,
  getToolHintsSync,
  getGenericErrorHintsSync,
  getDynamicHints,
} from './tools/toolMetadata.js';

// Re-export the ToolName type alias
export type { ToolName } from './tools/toolMetadata.js';

// ============================================================================
// Server Registration - For building custom MCP servers
// ============================================================================

/**
 * Register all tools from the tool registry.
 * Use this to programmatically register Octocode tools with an MCP server.
 *
 * @example
 * ```typescript
 * import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
 * import { registerTools } from 'octocode-mcp/public';
 *
 * const server = new McpServer(...);
 * const { successCount, failedTools } = await registerTools(server);
 * ```
 */
export { registerTools } from './tools/toolsManager.js';

/**
 * Register all prompts with an MCP server.
 * Use this to programmatically register Octocode prompts.
 *
 * @example
 * ```typescript
 * import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
 * import { registerPrompts, loadToolContent } from 'octocode-mcp/public';
 *
 * const server = new McpServer(...);
 * const content = await loadToolContent();
 * registerPrompts(server, content);
 * ```
 */
export { registerPrompts } from './prompts/prompts.js';

// ============================================================================
// Tool Configuration - For tool filtering and configuration
// ============================================================================

export { ALL_TOOLS, type ToolConfig } from './tools/toolConfig.js';
