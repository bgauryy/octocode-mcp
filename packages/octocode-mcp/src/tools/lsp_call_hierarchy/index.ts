// Registration
export { registerLSPCallHierarchyTool } from './register.js';

// Execution functions
export { executeCallHierarchy } from './execution.js';
export {
  processCallHierarchy,
  parseRipgrepJsonOutput,
  parseGrepOutput,
  extractFunctionBody,
  inferSymbolKind,
  createRange,
  escapeRegex,
} from './callHierarchy.js';

// Types
export type {
  LSPCallHierarchyQuery,
  ExactPosition,
  LSPRange,
  SymbolKind,
  CallHierarchyItem,
  IncomingCall,
  OutgoingCall,
  LSPPaginationInfo,
  LSPErrorType,
  CallHierarchyResult,
} from './types.js';
