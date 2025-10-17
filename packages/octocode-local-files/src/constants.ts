/**
 * Tool names for the MCP server
 */
export const TOOL_NAMES = {
  LOCAL_SEARCH_CONTENT: 'local_search_content',
  LOCAL_VIEW_STRUCTURE: 'local_view_structure',
  LOCAL_FIND_FILES: 'local_find_files',
  LOCAL_FETCH_CONTENT: 'local_fetch_content',
} as const;

/**
 * Allowed Linux commands (whitelist)
 */
/**
 * Allowed Linux commands (whitelist)
 * - grep: Search for patterns in files (text search, filtering)
 * - ls: List directory contents (structure, file listing)
 * - find: Search for files and directories (powerful file discovery)
 * - wc: Count words, lines, characters (output size, stats)
 * - file: Determine file types (file metadata)
 * - stat: Display detailed file or filesystem status (metadata like size, time)
 */
export const ALLOWED_COMMANDS = [
  'grep', // Text search for patterns in files
  'ls', // List directory contents and file info
  'find', // Find files/directories recursively based on conditions
  'wc', // Count lines, words, characters (stats)
  'file', // Identify file type by inspecting content
  'stat', // Show detailed file/directory metadata (size, permissions, timestamps)
] as const;

/**
 * Default configuration values
 */
export const DEFAULTS = {
  COMMAND_TIMEOUT: 30000, // 30 seconds in milliseconds
  MAX_OUTPUT_SIZE: 10 * 1024 * 1024, // 10MB
  MAX_RESULTS: 100,
  CONTEXT_LINES: 3,
} as const;

/**
 * Common file patterns to exclude
 */
export const DEFAULT_EXCLUDE_PATTERNS = [
  'node_modules',
  '.git',
  '.svn',
  '.hg',
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

/**
 * Dangerous shell metacharacters for command injection prevention
 */
export const DANGEROUS_PATTERNS = [
  /[;&|`$(){}[\]<>]/, // Shell metacharacters
  /\${/, // Variable expansion
  /\$\(/, // Command substitution
] as const;

/**
 * File type mappings for the 'file' command
 */
export const FILE_TYPES = {
  f: 'file',
  d: 'directory',
  l: 'symlink',
  b: 'block device',
  c: 'character device',
  p: 'named pipe',
  s: 'socket',
} as const;

/**
 * Sort options for ls command
 */
export const SORT_OPTIONS = {
  name: 'name',
  size: 'size',
  time: 'time',
  extension: 'extension',
} as const;
