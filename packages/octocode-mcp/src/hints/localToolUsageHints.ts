/**
 * Shared hint constants for local tool usage.
 *
 * These lists are referenced by clone and directory-fetch result builders
 * so that every "next-step" hint stays consistent across tools.
 *
 * @module hints/localToolUsageHints
 */

/** Local tool descriptions for use in clone/fetch hints */
export const LOCAL_TOOL_LIST: string[] = [
  '  localSearchCode – search code with ripgrep',
  '  localGetFileContent – read file content',
  '  localViewStructure – browse the directory tree',
  '  localFindFiles – find files by name/metadata',
];

/** LSP tool descriptions for full clone hints */
export const LSP_TOOL_LIST: string[] = [
  '  lspGotoDefinition – jump to symbol definitions (semantic)',
  '  lspFindReferences – find all usages of a symbol',
  '  lspCallHierarchy – trace call chains (incoming/outgoing)',
];
