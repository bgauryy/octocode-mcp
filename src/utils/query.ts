/**
 * Query processing utilities for GitHub search tools
 */

/**
 * Determines if a string needs quoting for GitHub CLI commands and shell safety
 *
 * Checks for:
 * - Spaces (would be interpreted as separate arguments)
 * - Quotes (could break string parsing)
 * - Whitespace characters (tabs, newlines that could break parsing)
 * - Shell special characters that could cause command injection
 */
export function needsQuoting(str: string): boolean {
  return (
    str.includes(' ') ||
    str.includes('"') ||
    str.includes('\t') ||
    str.includes('\n') ||
    str.includes('\r') ||
    /[<>(){}[\]\\|&;]/.test(str)
  );
}

/**
 * Safely quotes a string for GitHub CLI if needed
 */
export function safeQuote(str: string): string {
  return needsQuoting(str) ? `"${str}"` : str;
}
