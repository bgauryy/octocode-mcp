/**
 * Tool Metadata - Re-exports from modular structure.
 *
 * @deprecated Import directly from './toolMetadata/index.js' for cleaner imports.
 *
 * This file maintains  with existing imports.
 * All functionality has been split into:
 * - schemas.ts - Zod validation schemas
 * - state.ts - Metadata initialization and caching
 * - proxies.ts - Proxy-based lazy accessors
 * - schemaHelpers.ts - Tool-specific schema helpers
 */

// Re-export everything from the modular index
export * from './toolMetadata/index.js';
