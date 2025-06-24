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
 * Checks if a query contains GitHub boolean operators (OR, AND, NOT)
 */
export function hasBooleanOperators(str: string): boolean {
  return /\b(OR|AND|NOT)\b/.test(str);
}

/**
 * Safely quotes a string for GitHub CLI if needed
 * Special handling for queries with boolean operators
 */
export function safeQuote(str: string): string {
  // Don't quote queries with boolean operators to preserve GitHub CLI parsing
  if (hasBooleanOperators(str)) {
    return str;
  }

  return needsQuoting(str) ? `"${str}"` : str;
}
