/**
 * Contextual hints for local file search tools
 *
 * This module provides centralized hints for all local file system tools.
 * Hints are organized by tool and status to guide LLMs in query refinement
 * and provide actionable next steps based on result outcomes.
 *
 * Following the pattern from octocode-mcp for better separation and maintainability.
 *
 * @module hints
 */

/**
 * Contextual hints for local file search tools
 * Organized by tool and status for better LLM guidance
 */
export const TOOL_HINTS = {
  LOCAL_SEARCH_CONTENT: {
    hasResults: [
      ' Semantic: Break concepts into multiple queries for comprehensive coverage',
      'Add contextLines=5-10 for code understanding',
      'Use filesOnly=true to identify files before deep search',
      'Narrow scope with include=["*.js","*.ts"] for speed',
      'Combine wholeWord=true to avoid partial matches',
    ],
    empty: [
      ' Semantic: Try synonyms, variations, abbreviations in separate queries',
      'Broader patterns: "error|fail|bug|exception" with regex=true',
      'Use caseInsensitive=true or smartCase=true',
      'Remove restrictive filters (include, excludeDir)',
      'Check path exists and contains searchable files',
    ],
    error: [
      'Ensure grep is installed: which grep',
      'Check path permissions: test -r <path>',
      'Verify regex syntax - escape special chars: \\(\\)',
      'For Perl regex: use perlRegex=true',
      'Path must be within workspace boundaries',
    ],
  },

  LOCAL_VIEW_STRUCTURE: {
    hasResults: [
      ' Semantic: Map concepts to multiple dirs for comprehensive view',
      'Sort by time: sortBy="time", details=true for recent changes',
      'Sort by size: sortBy="size", reverse=true, humanReadable=true',
      'Use depth=1-2 for controlled exploration',
      'Filter by extensions: extensions=["js","ts"]',
    ],
    empty: [
      ' Semantic: Try directory name variations in bulk queries',
      'Try hidden=true to show dotfiles (.git, .env)',
      'Remove restrictive filters (pattern, extension)',
      'Use recursive=true or depth=1-2 for subdirectories',
      'Check directory exists and is readable',
    ],
    error: [
      'Ensure ls available: which ls',
      'Check permissions: test -d <path> && test -r <path>',
      'Path must be within workspace boundaries',
      'Ensure depth is 1-5 if using recursive mode',
      'Use details=true + humanReadable=true for sizes',
    ],
  },

  LOCAL_FIND_FILES: {
    hasResults: [
      ' Semantic: Map concepts to file patterns in parallel queries',
      'Combine filters: type="f" + name + modifiedWithin',
      'Add details=true for size/permissions/timestamps',
      'Use names=["*.ts","*.js"] for multiple extensions',
      'containsPattern bridges file discovery + content search',
    ],
    empty: [
      ' Semantic: Think naming variations and conventions',
      'Broaden patterns: use wildcards or iname for case-insensitive',
      'Remove restrictive filters incrementally',
      'Increase maxDepth to search deeper',
      'Check excludeDir not filtering target files',
    ],
    error: [
      'Ensure find available: which find',
      'Check path exists: test -d <path>',
      'Time format: "7d" (days), "2h" (hours), "30m" (minutes)',
      'Size format: "10M" (MB), "100k" (KB), "1G" (GB)',
      'For regex: use regexType="posix-egrep"',
    ],
  },

  LOCAL_FETCH_CONTENT: {
    hasResults: [
      ' Semantic: Use matchString for targeted extraction with context',
      'Multiple matchStrings on same file for complete picture',
      'matchStringContextLines=5-15 balances context vs tokens',
      'For known locations: use startLine/endLine',
      'Set minified=false when exact formatting matters',
    ],
    empty: [
      ' Semantic: Try related terms or use LOCAL_SEARCH_CONTENT first',
      'matchString not found - broaden to synonyms',
      'Try fullContent=true to check file content',
      'Check file exists with LOCAL_FIND_FILES',
      'Binary files may not be readable as text',
    ],
    error: [
      'Check file exists: test -f <path> && test -r <path>',
      'Path must be within workspace boundaries',
      'Line numbers must be positive (startLine >= 1)',
      'startLine must be <= endLine',
      'Use partial reads for large files',
    ],
  },

  LOCAL_VIEW_BINARY: {
    hasResults: [
      ' Semantic: Use full-inspection for comprehensive first analysis',
      'Bulk operations: identify + strings + magic-bytes in single call',
      'For Windows PE: use strings-utf16le to extract wide strings',
      'minLength=8-10 reduces noise in string extraction',
      'Check magic-bytes against known signatures (MZ, ELF, WASM, etc.)',
    ],
    empty: [
      ' Semantic: Try different operations or increase sensitivity',
      'For strings: reduce minLength to 3-4 for more results',
      'Check if file is actually binary with operation="identify"',
      'UTF-16LE: use strings-utf16le for Windows executables',
      'Increase hexLines or maxBytes for more data',
    ],
    error: [
      'Ensure binary inspection tools available: strings, hexdump, iconv',
      'Check file exists: test -f <path> && test -r <path>',
      'Path must be within workspace boundaries',
      'Binary may be corrupted - try operation="identify" first',
      'For UTF-16LE on macOS: ensure iconv is available',
    ],
  },
} as const;

/**
 * Get hints for a specific tool and status
 *
 * @param toolName - The tool name (LOCAL_SEARCH_CONTENT, LOCAL_VIEW_STRUCTURE, LOCAL_FIND_FILES, LOCAL_FETCH_CONTENT, LOCAL_VIEW_BINARY)
 * @param status - The result status (hasResults, empty, error)
 * @returns Array of contextual hints for the given tool and status
 *
 * @example
 * const hints = getToolHints('LOCAL_SEARCH_CONTENT', 'empty');
 * // Returns array of hints for when search returns no results
 */
export function getToolHints(
  toolName: keyof typeof TOOL_HINTS,
  status: 'hasResults' | 'empty' | 'error'
): readonly string[] {
  return TOOL_HINTS[toolName]?.[status] || [];
}
