import { CallToolResult } from '@modelcontextprotocol/sdk/types';
import { createResult } from '../responses.js';
import { ContentSanitizer } from './contentSanitizer.js';
import { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types';

export interface UserContext {
  userId: string;
  userLogin: string;
  organizationId?: string;
  isEnterpriseMode: boolean;
  sessionId?: string;
}

/**
 * Security validation decorator
 * Provides input sanitization and basic access controls
 */
export function withSecurityValidation<T extends Record<string, unknown>>(
  toolHandler: (
    sanitizedArgs: T,
    authInfo?: AuthInfo,
    userContext?: UserContext
  ) => Promise<CallToolResult>
): (
  args: unknown,
  { authInfo, sessionId }: { authInfo?: AuthInfo; sessionId?: string }
) => Promise<CallToolResult> {
  return async (
    args: unknown,
    { authInfo, sessionId }: { authInfo?: AuthInfo; sessionId?: string }
  ): Promise<CallToolResult> => {
    try {
      // 1. Validate and sanitize input parameters for security
      const validation = ContentSanitizer.validateInputParameters(
        args as Record<string, unknown>
      );

      // Check if validation failed due to structural/security issues
      if (!validation.isValid) {
        return createResult({
          data: {
            error: `Security validation failed: ${validation.warnings.join('; ')}`,
          },
          isError: true,
        });
      }

      // 2. Provide basic session context for simplified implementation
      const userContext: UserContext = {
        userId: 'anonymous',
        userLogin: 'anonymous',
        isEnterpriseMode: false,
        sessionId,
      };

      // 5. Call the actual tool handler with sanitized parameters and user context
      return await toolHandler(
        validation.sanitizedParams as T,
        authInfo,
        userContext
      );
    } catch (error) {
      return createResult({
        data: {
          error: `Security validation error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        },
        isError: true,
      });
    }
  };
}

/**
 * Basic security validation
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
          data: {
            error: `Security validation failed: ${validation.warnings.join('; ')}`,
          },
          isError: true,
        });
      }

      // Call the actual tool handler with sanitized parameters
      return await toolHandler(validation.sanitizedParams as T);
    } catch (error) {
      return createResult({
        data: {
          error: `Security validation error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        },
        isError: true,
      });
    }
  };
}
