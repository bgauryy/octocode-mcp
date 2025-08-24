import { CallToolResult } from '@modelcontextprotocol/sdk/types';
import { createResult } from '../responses';
import { ContentSanitizer } from '../../security/contentSanitizer';

/**
 * Security validation decorator
 * Provides input sanitization and content validation
 */
export function withSecurityValidation<T extends Record<string, unknown>>(
  toolHandler: (sanitizedArgs: T) => Promise<CallToolResult>
): (args: unknown) => Promise<CallToolResult> {
  return async (args: unknown): Promise<CallToolResult> => {
    try {
      // 1. Validate and sanitize input parameters for security
      const validation = ContentSanitizer.validateInputParameters(
        args as Record<string, unknown>
      );

      // Check if validation failed due to structural/security issues
      if (!validation.isValid) {
        return createResult({
          error: `Security validation failed: ${validation.warnings.join('; ')}`,
          isError: true,
        });
      }

      // 2. Call the actual tool handler with sanitized parameters
      return await toolHandler(validation.sanitizedParams as T);
    } catch (error) {
      return createResult({
        error: `Security validation error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        isError: true,
      });
    }
  };
}

/**
 * Security validation wrapper
 * For tools that don't need user context
 */
export function withBasicSecurityValidation<T extends Record<string, unknown>>(
  toolHandler: (sanitizedArgs: T) => Promise<CallToolResult>
): (args: unknown) => Promise<CallToolResult> {
  return async (args: unknown): Promise<CallToolResult> => {
    try {
      // Validate and sanitize input parameters for security
      const validation = ContentSanitizer.validateInputParameters(
        args as Record<string, unknown>
      );

      // Check if validation failed due to structural/security issues
      if (!validation.isValid) {
        return createResult({
          error: `Security validation failed: ${validation.warnings.join('; ')}`,
          isError: true,
        });
      }

      // Call the actual tool handler with sanitized parameters
      return await toolHandler(validation.sanitizedParams as T);
    } catch (error) {
      return createResult({
        error: `Security validation error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        isError: true,
      });
    }
  };
}
