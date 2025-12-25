/**
 * Security-related constants for the MCP server
 */

/**
 * Allowed Linux commands (whitelist)
 * Only commands actually used by the 4 active tools:
 * - rg: Ripgrep for fast pattern searching (used by local_ripgrep)
 * - ls: List directory contents (used by local_view_structure)
 * - find: Search for files and directories (used by local_find_files)
 */
export const ALLOWED_COMMANDS = [
  'rg', // Ripgrep - Fast pattern search (local_ripgrep tool)
  'ls', // List directory contents (local_view_structure tool)
  'find', // Find files/directories recursively (local_find_files tool)
] as const;

/**
 * Dangerous shell metacharacters for command injection prevention
 */
export const DANGEROUS_PATTERNS = [
  /[;&|`$(){}[\]<>]/, // Shell metacharacters
  /\${/, // Variable expansion
  /\$\(/, // Command substitution
] as const;

/**
 * Common file patterns to exclude for security and performance
 */
export const DEFAULT_EXCLUDE_PATTERNS = [
  '.git',
  '.svn',
  '.hg',
  'node_modules',
  'dist',
  'build',
  'coverage',
  '.next',
  '.cache',
  'vendor',
  '__pycache__',
  '*.pyc',
  '.DS_Store',
] as const;
