import { CallToolResult } from '@modelcontextprotocol/sdk/types';
import { createResult } from '../../responses';
import { ContentSanitizer } from '../../../security/contentSanitizer';

/**
 * Security validation decorator for MCP tools
 * Reduces boilerplate by extracting the common 7-line security validation pattern
 */
export function withSecurityValidation<T>(
  toolHandler: (sanitizedArgs: T) => Promise<CallToolResult>
): any {
  return async (args: unknown): Promise<any> => {
    // Validate input parameters for security
    const validation = ContentSanitizer.validateInputParameters(
      args as Record<string, any>
    );
    if (!validation.isValid) {
      return createResult({
        error: `Security validation failed: ${validation.warnings.join(', ')}`,
      });
    }

    // Call the actual tool handler with sanitized parameters
    return toolHandler(validation.sanitizedParams as T);
  };
}
