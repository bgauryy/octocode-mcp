import { CallToolResult } from '@modelcontextprotocol/sdk/types';
import { createResult } from '../../responses';
import { ContentSanitizer } from '../../../security/contentSanitizer';
import { logger } from '../../../utils/logger';

/**
 * Security validation decorator for MCP tools
 * Reduces boilerplate by extracting the common 7-line security validation pattern
 */
export function withSecurityValidation<T extends Record<string, any>>(
  toolHandler: (sanitizedArgs: T) => Promise<CallToolResult>
): (args: unknown) => Promise<CallToolResult> {
  return async (args: unknown): Promise<CallToolResult> => {
    try {
      // Validate and sanitize input parameters for security
      const validation = ContentSanitizer.validateInputParameters(
        args as Record<string, any>
      );

      // Check if validation failed due to structural/security issues
      if (!validation.isValid) {
        logger.error(
          `Security validation failed: ${validation.warnings.join('; ')}`
        );

        return createResult({
          error: `Security validation failed: ${validation.warnings.join('; ')}`,
          isError: true,
        });
      }

      // Log security warnings if secrets were detected and sanitized
      if (validation.hasSecrets) {
        logger.warn('Security: Sensitive data detected and sanitized', {
          warnings: validation.warnings.filter(w =>
            w.includes('Sensitive data')
          ),
          count: validation.warnings.filter(w => w.includes('Sensitive data'))
            .length,
        });
      }

      // Log other validation warnings (size limits, etc.)
      const otherWarnings = validation.warnings.filter(
        w => !w.includes('Sensitive data')
      );
      if (otherWarnings.length > 0) {
        logger.warn('Parameter validation warnings', {
          warnings: otherWarnings,
        });
      }

      // Call the actual tool handler with sanitized parameters
      return await toolHandler(validation.sanitizedParams as T);
    } catch (error) {
      logger.error(
        'Security validation wrapper error',
        error instanceof Error ? error : undefined
      );

      return createResult({
        error: `Security validation error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        isError: true,
      });
    }
  };
}
