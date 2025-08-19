import { CallToolResult } from '@modelcontextprotocol/sdk/types';
import { createResult } from '../../responses';
import { ContentSanitizer } from '../../../security/contentSanitizer';
import { getUserContext } from '../../../utils/github/userInfo';
import { RateLimiter } from '../../../security/rateLimiter';
import { OrganizationManager } from '../../../security/organizationManager';
import {
  isEnterpriseMode,
  isSSOEnforcementEnabled,
} from '../../../utils/enterpriseUtils';
import { getTokenSource } from './tokenManager';

export interface UserContext {
  userId: string;
  userLogin: string;
  organizationId?: string;
  isEnterpriseMode: boolean;
}

/**
 * Enhanced security validation decorator with enterprise features
 * Provides both input sanitization and enterprise access controls
 */
export function withSecurityValidation<T extends Record<string, unknown>>(
  toolHandler: (
    sanitizedArgs: T,
    userContext?: UserContext
  ) => Promise<CallToolResult>
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

      // 2. Load user context ONLY in enterprise mode to avoid overhead otherwise
      let userContext: UserContext | undefined;

      if (isEnterpriseMode()) {
        try {
          const context = await getUserContext();
          if (context.user) {
            userContext = {
              userId: context.user.id.toString(),
              userLogin: context.user.login,
              organizationId: context.organizationId,
              isEnterpriseMode: true,
            };

            // 3. Enterprise rate limiting (if configured)
            try {
              const rateLimitResult = await RateLimiter.checkLimit(
                userContext.userId,
                'api',
                { increment: true }
              );

              if (!rateLimitResult.allowed) {
                return createResult({
                  error: `Rate limit exceeded. Try again in ${Math.ceil((rateLimitResult.resetTime?.getTime() || Date.now()) - Date.now()) / 1000} seconds.`,
                  isError: true,
                  hints: ['Rate limiting is active in enterprise mode'],
                });
              }
            } catch (rateLimitError) {
              // Rate limiter not initialized - continue without rate limiting
            }

            // 4. Organization validation (if configured)
            if (userContext.organizationId) {
              try {
                const orgValidation =
                  await OrganizationManager.validateOrganizationAccess(
                    userContext.organizationId,
                    userContext.userLogin
                  );

                if (!orgValidation.valid) {
                  return createResult({
                    error: `Organization access denied: ${orgValidation.errors.join('; ')}`,
                    isError: true,
                    hints: ['Enterprise organization validation failed'],
                  });
                }
              } catch (orgError) {
                // Organization manager not initialized - continue without org validation
              }
            }

            // 5. SSO enforcement (if enabled)
            if (isSSOEnforcementEnabled()) {
              const source = getTokenSource();
              if (source === 'cli') {
                return createResult({
                  error:
                    'SSO enforcement active: CLI tokens are not permitted. Use OAuth, GitHub App, or environment tokens.',
                  isError: true,
                  hints: [
                    'Authenticate via OAuth or configure GITHUB_TOKEN/GH_TOKEN',
                    'In enterprise, CLI token resolution is disabled',
                  ],
                });
              }
            }
          }
        } catch (contextError) {
          // If we can't get user context, continue with basic validation only
          // This maintains backward compatibility for non-enterprise usage
        }
      }

      // 5. Call the actual tool handler with sanitized parameters and user context
      return await toolHandler(validation.sanitizedParams as T, userContext);
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
