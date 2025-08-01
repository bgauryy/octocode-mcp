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
    // Validate and sanitize input parameters for security
    const validation = ContentSanitizer.validateInputParameters(
      args as Record<string, any>
    );

    // Note: validation.isValid is now always true after sanitization
    // validation.hasSecrets indicates if secrets were detected and sanitized
    if (!validation.isValid) {
      // This should rarely happen now, but kept for defensive programming
      return createResult({
        error: `Security validation failed: ${validation.warnings.join(', ')}`,
      });
    }

    // Log security warnings if secrets were detected and sanitized
    if (validation.hasSecrets && validation.warnings.length > 0) {
      // Debug logging for security events (only in development)
      if (process.env.NODE_ENV !== 'production') {
        // eslint-disable-next-line no-console
        console.warn(
          'Security: Secrets detected and sanitized:',
          validation.warnings.join(', ')
        );
      }
    }

    // Call the actual tool handler with sanitized parameters
    return toolHandler(validation.sanitizedParams as T);
  };
}
