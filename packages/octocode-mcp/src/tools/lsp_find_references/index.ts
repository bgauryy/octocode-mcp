// Registration
export { registerLSPFindReferencesTool } from './lsp_find_references.js';

// Execution functions
export { executeFindReferences } from './execution.js';
export {
  findWorkspaceRoot,
  isLikelyDefinition,
  findReferences,
  findReferencesWithLSP,
  findReferencesWithPatternMatching,
  matchesFilePatterns,
  buildRipgrepGlobArgs,
  buildGrepFilterArgs,
} from './lsp_find_references.js';

// Types
export type {
  LSPFindReferencesQuery,
  ExactPosition,
  LSPRange,
  SymbolKind,
  CodeSnippet,
  ReferenceLocation,
  LSPPaginationInfo,
  LSPErrorType,
  FindReferencesResult,
} from './types.js';
