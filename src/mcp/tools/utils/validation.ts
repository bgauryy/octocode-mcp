/**
 * Shared validation utilities for MCP tools
 * Centralized validation logic to reduce duplication across tools
 */

/**
 * Creates a standardized tool suggestion message
 */
export function createToolSuggestion(
  currentTool: string,
  suggestedTools: Array<{ tool: string; reason: string }>
): string {
  if (suggestedTools.length === 0) {
    return '';
  }

  const suggestions = suggestedTools
    .map(({ tool, reason }) => `• Use ${tool} ${reason}`)
    .join('\n');

  return `\n\nCurrent tool: ${currentTool}\nAlternative tools:\n${suggestions}`;
}
