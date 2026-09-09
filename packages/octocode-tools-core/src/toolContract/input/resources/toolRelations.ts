/**
 * Cross-field rules that cannot be represented by a flattened field list.
 * This is the canonical relation source for CLI/MCP schema rendering.
 */
const TOOL_SCHEMA_RELATIONS: Readonly<Record<string, readonly string[]>> = {
  ghSearch: [
    'Use only fields listed for the selected operation.',
    'match: code=file|path; repositories=name|description|readme.',
    "code cannot select branch; it searches GitHub's indexed default branch.",
  ],
  localSearch: ['searchText is required.', 'regex is literal, rust, or pcre2.'],
  astSearch: [
    'operation is match, files, tree, symbols, or topology.',
    'match requires exactly one of pattern or rule; langType is required for directory searches and inferred from a single source file.',
    'topology uses analysis to select dependencies, dependents, path, cycles, reachability, or deadCode.',
  ],
  localGetFileContent: [
    'Choose fullContent, a line range, or matchString.',
    'A line range needs startLine and endLine.',
    'matchString options apply with matchString.',
  ],
  lspSearch: [
    'workspaceSymbol needs symbolName and uri or workspaceRoot.',
    'documentSymbols/diagnostic need uri.',
    'definition | references | hover | callers | callees | callHierarchy | implementation | typeDefinition | supertypes | subtypes -> requires uri and exactly one anchor: position or symbolName+lineHint.',
  ],
  ghGetFileContent: [
    'Optionally choose fullContent, a line range, or matchString; extraction modes are exclusive.',
    'A line range needs startLine and endLine.',
    'matchString options apply with matchString.',
    'type:"directory" materializes; extraction fields read files.',
  ],
  npmSearch: [
    'Set exactly one non-empty packageName or keywords.',
    'page applies only to keyword discovery.',
  ],
};

export function getToolSchemaRelations(toolName: string): string[] {
  return [...(TOOL_SCHEMA_RELATIONS[toolName] ?? [])];
}
