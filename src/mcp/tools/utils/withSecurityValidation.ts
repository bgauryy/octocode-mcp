import { CallToolResult } from '@modelcontextprotocol/sdk/types';
import { createResult } from '../../responses';
import { ContentSanitizer } from '../../../security/contentSanitizer';
import { sanitizeErrorMessage } from '../../../security/utils';

/**
 * Security validation decorator for MCP tools
 * Reduces boilerplate by extracting the common 7-line security validation pattern
 */
export function withSecurityValidation<T extends Record<string, unknown>>(
  toolHandler: (sanitizedArgs: T) => Promise<CallToolResult>
): (args: unknown) => Promise<CallToolResult> {
  return async (args: unknown): Promise<CallToolResult> => {
    // Type-safe validation for Record<string, any> input
    if (!args || typeof args !== 'object' || Array.isArray(args)) {
      return createResult({
        error: sanitizeErrorMessage(
          'Invalid input: expected object parameters'
        ),
      });
    }

    // Validate input parameters for security
    const validation = ContentSanitizer.validateInputParameters(
      args as Record<string, unknown>
    );
    if (!validation.isValid) {
      return createResult({
        error: `Security validation failed: ${validation.warnings.map(sanitizeErrorMessage).join(', ')}`,
      });
    }

    // Type assertion is safer here after validation
    try {
      return await toolHandler(validation.sanitizedParams as T);
    } catch (error) {
      return createResult({
        error: `Tool execution failed: ${sanitizeErrorMessage(error)}`,
      });
    }
  };
}
