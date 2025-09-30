import { CallToolResult } from '@modelcontextprotocol/sdk/types';
import { createResult } from '../responses.js';
import { ContentSanitizer } from './contentSanitizer.js';
import { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types';
import { logToolCall } from '../session.js';
import { isLoggingEnabled } from '../serverConfig.js';

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
  toolName: string,
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
      const validation = ContentSanitizer.validateInputParameters(
        args as Record<string, unknown>
      );
      if (!validation.isValid) {
        return createResult({
          data: {
            error: `Security validation failed: ${validation.warnings.join('; ')}`,
          },
          isError: true,
        });
      }
      const sanitizedParams = validation.sanitizedParams as Record<
        string,
        unknown
      >;
      if (isLoggingEnabled()) {
        const { repo, owner } = extractRepoOwnerFromParams(sanitizedParams);
        const safeRepo = repo
          ? ContentSanitizer.sanitizeContent(repo).content
          : undefined;
        const safeOwner = owner
          ? ContentSanitizer.sanitizeContent(owner).content
          : undefined;

        logToolCall(toolName, safeRepo, safeOwner).catch(() => {
          // Silently ignore logging errors
        });
      }
      const userContext: UserContext = {
        userId: 'anonymous',
        userLogin: 'anonymous',
        isEnterpriseMode: false,
        sessionId,
      };
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

/**
 * Extract repo and owner information from tool parameters for logging
 */
function extractRepoOwnerFromParams(params: Record<string, unknown>): {
  repo?: string;
  owner?: string;
} {
  let repo: string | undefined;
  let owner: string | undefined;

  // Check if params has queries array (bulk operations)
  if (
    params.queries &&
    Array.isArray(params.queries) &&
    params.queries.length > 0
  ) {
    const firstQuery = params.queries[0] as Record<string, unknown>;
    if (firstQuery) {
      repo = typeof firstQuery.repo === 'string' ? firstQuery.repo : undefined;
      owner =
        typeof firstQuery.owner === 'string' ? firstQuery.owner : undefined;
    }
  } else {
    // Check direct params (single operations)
    repo = typeof params.repo === 'string' ? params.repo : undefined;
    owner = typeof params.owner === 'string' ? params.owner : undefined;
  }

  return { repo, owner };
}
