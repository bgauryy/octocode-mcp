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
        const repos = extractRepoOwnerFromParams(sanitizedParams);
        if (repos.length > 0) {
          logToolCall(toolName, repos).catch(() => {
            // Ignore
          });
        }
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
 * Extracts repository identifiers from tool parameters for logging purposes.
 *
 * Supports multiple parameter formats:
 * - Combined repository field: `repository: "owner/repo"`
 * - Separate owner/repo fields: `owner: "owner", repo: "repo"`
 * - Owner only: `owner: "owner"` (for tools like github_search_repos)
 *
 * Works with both bulk operations (queries array) and single operations (direct params).
 *
 * @param params - The tool parameters containing repository information
 * @returns Array of unique repository identifiers (e.g., ["owner/repo", "owner2/repo2", "owner3"])
 *
 * @example
 * // Combined repository format
 * extractRepoOwnerFromParams({ queries: [{ repository: "facebook/react" }] })
 * // Returns: ["facebook/react"]
 *
 * @example
 * // Separate owner/repo format
 * extractRepoOwnerFromParams({ queries: [{ owner: "microsoft", repo: "vscode" }] })
 * // Returns: ["microsoft/vscode"]
 *
 * @example
 * // Owner only format (for repository search)
 * extractRepoOwnerFromParams({ queries: [{ owner: "vercel" }] })
 * // Returns: ["vercel"]
 *
 * @example
 * // Multiple queries with mixed formats
 * extractRepoOwnerFromParams({
 *   queries: [
 *     { repository: "facebook/react" },
 *     { owner: "microsoft", repo: "vscode" },
 *     { owner: "vercel" }
 *   ]
 * })
 * // Returns: ["facebook/react", "microsoft/vscode", "vercel"]
 */
export function extractRepoOwnerFromParams(
  params: Record<string, unknown>
): string[] {
  const repoOwnerSet = new Set<string>();

  if (
    params.queries &&
    Array.isArray(params.queries) &&
    params.queries.length > 0
  ) {
    for (const query of params.queries) {
      const queryObj = query as Record<string, unknown>;

      // Check for combined repository field first
      const repository =
        typeof queryObj.repository === 'string'
          ? queryObj.repository
          : undefined;

      if (repository && repository.includes('/')) {
        repoOwnerSet.add(repository);
      } else {
        // Fall back to separate owner/repo fields
        const repo =
          typeof queryObj.repo === 'string' ? queryObj.repo : undefined;
        const owner =
          typeof queryObj.owner === 'string' ? queryObj.owner : undefined;

        if (owner && repo) {
          repoOwnerSet.add(`${owner}/${repo}`);
        } else if (owner) {
          // Support tools with only owner field (e.g., github_search_repos)
          repoOwnerSet.add(owner);
        }
      }
    }
  } else {
    const repository =
      typeof params.repository === 'string' ? params.repository : undefined;

    if (repository && repository.includes('/')) {
      repoOwnerSet.add(repository);
    } else {
      // Fall back to separate owner/repo fields
      const repo = typeof params.repo === 'string' ? params.repo : undefined;
      const owner = typeof params.owner === 'string' ? params.owner : undefined;

      if (owner && repo) {
        repoOwnerSet.add(`${owner}/${repo}`);
      } else if (owner) {
        // Support tools with only owner field (e.g., github_search_repos)
        repoOwnerSet.add(owner);
      }
    }
  }

  return Array.from(repoOwnerSet);
}
