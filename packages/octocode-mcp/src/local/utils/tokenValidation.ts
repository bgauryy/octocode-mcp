/**
 * Centralized token validation utility
 *
 * Provides consistent token limit validation across all tools with context-aware hints.
 * Prevents MCP 25K token limit violations with clear error messages and actionable guidance.
 *
 * @module tokenValidation
 */

import { RESOURCE_LIMITS } from '../constants.js';
import { ERROR_CODES, type ErrorCode } from '../errors/errorCodes.js';

/**
 * Result of token validation check
 */
export interface TokenValidationResult {
  /** Whether the content is within token limits */
  isValid: boolean;
  /** Estimated number of tokens */
  estimatedTokens: number;
  /** Maximum allowed tokens */
  maxTokens: number;
  /** Error code if invalid */
  errorCode?: ErrorCode;
  /** Actionable hints for fixing the issue */
  hints?: string[];
}

/**
 * Options for token validation
 */
export interface TokenValidationOptions {
  /** Content to validate */
  content: string;
  /** Tool name for context */
  toolName: string;
  /** Number of queries in bulk operation (for per-query limit calculation) */
  queryCount?: number;
  /** Additional context information */
  context?: string;
}

/**
 * Validates content against MCP token limit with context-aware hints
 *
 * @param options - Validation options
 * @returns Validation result with error and hints if over limit
 *
 * @example
 * ```typescript
 * const result = validateTokenLimit({
 *   content: largeOutput,
 *   toolName: 'localSearchCode',
 *   queryCount: 5
 * });
 *
 * if (!result.isValid) {
 *   return {
 *     error: result.error,
 *     hints: result.hints
 *   };
 * }
 * ```
 */
export function validateTokenLimit(
  options: TokenValidationOptions
): TokenValidationResult {
  const { content, toolName, queryCount = 1, context } = options;

  const estimatedTokens = Math.ceil(
    content.length / RESOURCE_LIMITS.CHARS_PER_TOKEN
  );
  const maxTokens = RESOURCE_LIMITS.MCP_MAX_TOKENS;

  // Content is within limits
  if (estimatedTokens <= maxTokens) {
    return {
      isValid: true,
      estimatedTokens,
      maxTokens,
    };
  }

  // Content exceeds limits - generate helpful hints
  const hints: string[] = [];

  if (queryCount > 1) {
    // Bulk operation hints
    const perQueryLimit = Math.floor(maxTokens / queryCount);
    hints.push(
      `CRITICAL: Response exceeds MCP token limit`,
      `Size: ${estimatedTokens.toLocaleString()} tokens > ${maxTokens.toLocaleString()} max`,
      ``,
      `SOLUTIONS (Bulk Operation):`,
      `1. Use pagination (charLength=${RESOURCE_LIMITS.RECOMMENDED_CHAR_LENGTH}) on individual queries`,
      `2. Reduce number of queries per batch (currently ${queryCount} queries)`,
      `3. Use more specific filters:`,
      `   - matchString for targeted extraction`,
      `   - filesOnly=true for discovery (25x more efficient)`,
      `4. Split into smaller batches (try ${Math.floor(queryCount / 2)} queries per batch)`,
      ``,
      `Per-query token estimate: approximately ${Math.ceil(estimatedTokens / queryCount)} tokens each`,
      `Safe limit per query: approximately ${perQueryLimit} tokens`
    );
  } else {
    // Single operation hints
    hints.push(
      `CRITICAL: Response exceeds MCP token limit`,
      `Size: ${estimatedTokens.toLocaleString()} tokens > ${maxTokens.toLocaleString()} max`,
      ``,
      `SOLUTIONS:`,
      `1. Use charLength=${RESOURCE_LIMITS.RECOMMENDED_CHAR_LENGTH} for pagination`,
      `2. Use matchString for targeted extraction (85% savings)`,
      `3. Use filesOnly=true for discovery operations (25x more efficient)`,
      `4. Enable minified=true for code files (30-60% savings)`
    );
  }

  // Add tool-specific hints
  if (toolName === 'localSearchCode' || toolName === 'LOCAL_RIPGREP') {
    hints.push(
      ``,
      `Tool-specific (${toolName}):`,
      `- Use mode="discovery" to list matching files only`,
      `- Use maxMatchesPerFile=3 to limit matches per file`,
      `- Add excludeDir=["node_modules", ".git", "dist"] to skip large dirs`
    );
  } else if (
    toolName === 'localViewStructure' ||
    toolName === 'LOCAL_VIEW_STRUCTURE'
  ) {
    hints.push(
      ``,
      `Tool-specific (${toolName}):`,
      `- Reduce depth parameter (use depth=1 for overview)`,
      `- Use filesOnly=true to exclude directories`,
      `- Add extension filters to limit results`
    );
  }

  // Add context if provided
  if (context) {
    hints.push(``, `Context: ${context}`);
  }

  return {
    isValid: false,
    estimatedTokens,
    maxTokens,
    errorCode: ERROR_CODES.RESPONSE_TOO_LARGE,
    hints,
  };
}

/**
 * Validates token limit for bulk operations
 * Convenience wrapper for multi-query operations
 *
 * @param content - Combined content from all queries
 * @param toolName - Name of the tool
 * @param queryCount - Number of queries in the batch
 * @returns Validation result
 */
export function validateBulkTokenLimit(
  content: string,
  toolName: string,
  queryCount: number
): TokenValidationResult {
  return validateTokenLimit({ content, toolName, queryCount });
}
