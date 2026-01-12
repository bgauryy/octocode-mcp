/**
 * LSP (Language Server Protocol) tools for octocode-mcp
 * Provides semantic code intelligence features
 * @module lsp
 */

// Types
export type {
  // Position & Range types
  FuzzyPosition,
  ExactPosition,
  LSPRange,
  CodeSnippet,
  SymbolKind,
  ReferenceLocation,
  // Call hierarchy types
  CallHierarchyItem,
  IncomingCall,
  OutgoingCall,
  // Pagination
  LSPPaginationInfo,
  // Result types
  GotoDefinitionResult,
  FindReferencesResult,
  CallHierarchyResult,
  // Configuration types
  LanguageServerConfig,
  UserLanguageServerConfig,
  LSPConfigFile,
  LanguageServerCommand,
} from './types.js';

// Symbol resolver
export {
  SymbolResolver,
  SymbolResolutionError,
  defaultResolver,
  resolveSymbolPosition,
} from './resolver.js';

// LSP Client
export { LSPClient } from './client.js';

// Client manager
export { createClient, isLanguageServerAvailable } from './manager.js';

// Configuration utilities
export {
  LANGUAGE_SERVER_COMMANDS,
  loadUserConfig,
  resolveLanguageServer,
  detectLanguageId,
  getLanguageServerForFile,
} from './config.js';

// URI utilities
export { toUri, fromUri } from './uri.js';

// Symbol conversion utilities
export { convertSymbolKind, toLSPSymbolKind } from './symbols.js';

// Validation utilities
export { validateLSPServerPath } from './validation.js';
export type { ValidationResult } from './validation.js';
