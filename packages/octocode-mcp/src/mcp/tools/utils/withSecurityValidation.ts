import { CallToolResult } from '@modelcontextprotocol/sdk/types';
import { createResult } from '../../../responses';
import { ContentSanitizer } from '../../../security/contentSanitizer';
import { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types';

export interface UserContext {
  userId: string;
  userLogin: string;
  organizationId?: string;

  sessionId?: string;
}

/**
 * Security validation decorator with input sanitization
 * Provides basic security validation and user context
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
          error: `Security validation failed: ${validation.warnings.join('; ')}`,
          isError: true,
        });
      }

      // 2. Provide basic session context
      const userContext: UserContext = {
        userId: 'anonymous',
        userLogin: 'anonymous',
        sessionId,
      };

      // 3. Call the actual tool handler with sanitized parameters and user context
      return await toolHandler(
        validation.sanitizedParams as T,
        authInfo,
        userContext
      );
    } catch (error) {
      return createResult({
        error: `Security validation error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        isError: true,
      });
    }
  };
}

/**
 * Legacy security validation without enterprise features
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
