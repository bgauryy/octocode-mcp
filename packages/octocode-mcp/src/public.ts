/**
 * Public API exports for octocode-mcp
 *
 * This module provides types, schemas, and utilities for users
 * who want to programmatically interact with Octocode MCP metadata.
 * Split into focused section modules — this barrel re-exports everything.
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

// Types, tool names, and metadata utilities
export * from './public/types.js';

// Server registration and configuration
export * from './public/server.js';

// Tool execution functions and security
export * from './public/tools.js';

// Zod schemas for input validation
export * from './public/schemas.js';

// Response formatting
export * from './public/responses.js';

// Session management
export * from './public/session.js';
