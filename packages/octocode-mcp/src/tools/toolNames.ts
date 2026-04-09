import { completeMetadata } from '@octocodeai/octocode-core';

export const STATIC_TOOL_NAMES = completeMetadata.toolNames;

const LOCAL_TOOL_NAMES_SET = new Set<string>([
  STATIC_TOOL_NAMES.LOCAL_RIPGREP,
  STATIC_TOOL_NAMES.LOCAL_FETCH_CONTENT,
  STATIC_TOOL_NAMES.LOCAL_FIND_FILES,
  STATIC_TOOL_NAMES.LOCAL_VIEW_STRUCTURE,
  STATIC_TOOL_NAMES.LSP_GOTO_DEFINITION,
  STATIC_TOOL_NAMES.LSP_FIND_REFERENCES,
  STATIC_TOOL_NAMES.LSP_CALL_HIERARCHY,
]);

export function isLocalTool(toolName: string): boolean {
  return LOCAL_TOOL_NAMES_SET.has(toolName);
}
