/**
 * Security-related constants for the MCP server
 */

/**
 * Allowed Linux commands (whitelist)
 * Only commands actually used by the 4 active tools:
 * - rg: Ripgrep for fast pattern searching (used by localSearchCode)
 * - ls: List directory contents (used by localViewStructure)
 * - find: Search for files and directories (used by localFindFiles)
 */
export const ALLOWED_COMMANDS = [
  'rg', // Ripgrep - Fast pattern search (localSearchCode tool)
  'ls', // List directory contents (localViewStructure tool)
  'find', // Find files/directories recursively (localFindFiles tool)
] as const;

/**
 * Dangerous shell metacharacters for command injection prevention
 */
export const DANGEROUS_PATTERNS = [
  /[;&|`$(){}[\]<>]/, // Shell metacharacters
  /\${/, // Variable expansion
  /\$\(/, // Command substitution
] as const;
