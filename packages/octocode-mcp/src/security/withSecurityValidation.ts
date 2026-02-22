import { CallToolResult } from '@modelcontextprotocol/sdk/types';
import { createResult } from '../responses.js';
import { ContentSanitizer } from './contentSanitizer.js';
import { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types';
import { logToolCall, logSessionError } from '../session.js';
import { isLoggingEnabled as isSessionEnabled } from '../serverConfig.js';
import { TOOL_ERRORS } from '../errorCodes.js';
import { isLocalTool } from '../tools/toolNames.js';

/**
 * Default timeout for tool execution (1 minute).
 * Per MCP spec: "Implementations SHOULD establish timeouts for all sent requests."
 *
 * Timeout interaction: This is the OUTER timeout — it applies to the entire tool
 * invocation. Bulk tools also use a per-query timeout (OCTOCODE_BULK_QUERY_TIMEOUT_MS
 * in bulk.ts). For multi-query operations, the outer timeout dominates: e.g. 3 queries
 * at 55s each would exceed 60s total, so the outer timeout fires before all complete.
 * Configure OCTOCODE_BULK_QUERY_TIMEOUT_MS to balance per-query limits vs total budget.
 */
const TOOL_TIMEOUT_MS = 60_000;

/**
 * Wraps a promise with a timeout that respects an optional AbortSignal.
 * Returns an error result instead of throwing on timeout.
 */
function withToolTimeout(
  toolName: string,
  promise: Promise<CallToolResult>,
  signal?: AbortSignal
): Promise<CallToolResult> {
  if (signal?.aborted) {
    return Promise.resolve(
      createResult({
        data: { error: `Tool '${toolName}' was cancelled before execution.` },
        isError: true,
      })
    );
  }

  return new Promise<CallToolResult>(resolve => {
    const timer = setTimeout(() => {
      resolve(
        createResult({
          data: {
            error: `Tool '${toolName}' timed out after ${TOOL_TIMEOUT_MS / 1000}s. Try reducing query complexity or scope.`,
          },
          isError: true,
        })
      );
    }, TOOL_TIMEOUT_MS);

    const onAbort = () => {
      clearTimeout(timer);
      resolve(
        createResult({
          data: { error: `Tool '${toolName}' was cancelled by the client.` },
          isError: true,
        })
      );
    };

    signal?.addEventListener('abort', onAbort, { once: true });

    promise
      .then(result => {
        clearTimeout(timer);
        signal?.removeEventListener('abort', onAbort);
        resolve(result);
      })
      .catch(error => {
        clearTimeout(timer);
        signal?.removeEventListener('abort', onAbort);
        resolve(
          createResult({
            data: {
              error: `Tool '${toolName}' failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
            },
            isError: true,
          })
        );
      });
  });
}

/**
 * Security wrapper for GitHub/remote tools that require authentication.
 *
 * Use this wrapper for tools that:
 * - Need `authInfo` (GitHub/GitLab token) or `sessionId` passed to the handler
 * - Should log queries to session telemetry via `handleBulk`
 * - Access remote APIs (GitHub, GitLab, NPM, PyPI)
 *
 * Provides: input sanitization, 60s timeout, auth passthrough, session logging.
 *
 * Current tools: all github_* tools, package_search, github_clone_repo.
 *
 * @see withBasicSecurityValidation for local/LSP tools that don't need auth
 */
export function withSecurityValidation<T extends Record<string, unknown>>(
  toolName: string,
  toolHandler: (
    sanitizedArgs: T,
    authInfo?: AuthInfo,
    sessionId?: string
  ) => Promise<CallToolResult>
): (
  args: unknown,
  extra: { authInfo?: AuthInfo; sessionId?: string; signal?: AbortSignal }
) => Promise<CallToolResult> {
  return async (
    args: unknown,
    {
      authInfo,
      sessionId,
      signal,
    }: { authInfo?: AuthInfo; sessionId?: string; signal?: AbortSignal } = {}
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
      if (isSessionEnabled()) {
        handleBulk(toolName, sanitizedParams);
      }
      return await withToolTimeout(
        toolName,
        toolHandler(validation.sanitizedParams as T, authInfo, sessionId),
        signal
      );
    } catch (error) {
      // Log security validation errors for monitoring
      logSessionError(
        toolName,
        TOOL_ERRORS.SECURITY_VALIDATION_FAILED.code
      ).catch(() => {});

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
 * Lightweight security wrapper for local filesystem and LSP tools.
 *
 * Use this wrapper for tools that:
 * - Operate on local files only (no remote API access)
 * - Don't need `authInfo` or `sessionId`
 * - Don't need session telemetry logging
 *
 * Provides: input sanitization, 60s timeout.
 * Does NOT provide: auth passthrough, session logging.
 *
 * Current tools: all local_* tools, all lsp_* tools.
 *
 * @see withSecurityValidation for GitHub/remote tools that need auth + logging
 */
export function withBasicSecurityValidation<T extends object>(
  toolHandler: (sanitizedArgs: T) => Promise<CallToolResult>,
  toolName?: string
): (
  args: unknown,
  extra?: { signal?: AbortSignal }
) => Promise<CallToolResult> {
  return async (
    args: unknown,
    extra?: { signal?: AbortSignal }
  ): Promise<CallToolResult> => {
    const signal = extra?.signal;
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

      // Log local/LSP tool usage for telemetry (same as GitHub tools)
      if (
        toolName &&
        isLocalTool(toolName) &&
        isSessionEnabled() &&
        validation.sanitizedParams &&
        typeof validation.sanitizedParams === 'object'
      ) {
        handleBulk(
          toolName,
          validation.sanitizedParams as Record<string, unknown>
        );
      }

      return await withToolTimeout(
        toolName || 'tool',
        toolHandler(validation.sanitizedParams as T),
        signal
      );
    } catch (error) {
      // Log security validation errors for monitoring
      logSessionError(
        toolName || 'basic_security_validation',
        TOOL_ERRORS.SECURITY_VALIDATION_FAILED.code
      ).catch(() => {});

      return createResult({
        data: {
          error: `Security validation error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        },
        isError: true,
      });
    }
  };
}

function handleBulk(toolName: string, params: Record<string, unknown>): void {
  const queries = getQueriesArray(params);

  if (queries) {
    for (const query of queries) {
      handleQuery(toolName, query as Record<string, unknown>);
    }
  } else {
    logSingleOperation(toolName, params);
  }
}

/**
 * Logs a single query with its specific repos and research fields.
 * For local tools (no owner/repo), still logs tool usage for telemetry.
 */
function handleQuery(toolName: string, query: Record<string, unknown>): void {
  const repos = extractRepoOwnerFromQuery(query);
  if (repos.length === 0 && !isLocalTool(toolName)) {
    return;
  }

  const researchFields = extractResearchFieldsFromQuery(query);
  logToolCall(
    toolName,
    repos,
    researchFields.mainResearchGoal,
    researchFields.researchGoal,
    researchFields.reasoning
  ).catch(() => {});
}

/**
 * Logs a single operation with aggregated repos and research fields.
 * For local tools (no owner/repo), still logs tool usage for telemetry.
 */
function logSingleOperation(
  toolName: string,
  params: Record<string, unknown>
): void {
  const repos = extractRepoOwnerFromParams(params);
  if (repos.length === 0 && !isLocalTool(toolName)) {
    return;
  }

  const researchFields = extractResearchFields(params);
  logToolCall(
    toolName,
    repos,
    researchFields.mainResearchGoal,
    researchFields.researchGoal,
    researchFields.reasoning
  ).catch(() => {});
}

/**
 * Extracts the queries array from parameters if it exists and is valid.
 * Returns undefined for single operations.
 */
function getQueriesArray(
  params: Record<string, unknown>
): Array<Record<string, unknown>> | undefined {
  const queries = params.queries;
  if (queries && Array.isArray(queries) && queries.length > 0) {
    return queries as Array<Record<string, unknown>>;
  }
  return undefined;
}

/** Research fields extracted from a query */
interface ResearchFields {
  mainResearchGoal?: string;
  researchGoal?: string;
  reasoning?: string;
}

/**
 * Extracts research fields from a single query object.
 */
function extractResearchFieldsFromQuery(
  query: Record<string, unknown>
): ResearchFields {
  const fields: ResearchFields = {};
  if (typeof query.mainResearchGoal === 'string' && query.mainResearchGoal) {
    fields.mainResearchGoal = query.mainResearchGoal;
  }
  if (typeof query.researchGoal === 'string' && query.researchGoal) {
    fields.researchGoal = query.researchGoal;
  }
  if (typeof query.reasoning === 'string' && query.reasoning) {
    fields.reasoning = query.reasoning;
  }
  return fields;
}

/**
 * Extracts and aggregates research fields from params (single or bulk).
 */
export function extractResearchFields(
  params: Record<string, unknown>
): ResearchFields {
  const queries = getQueriesArray(params);

  if (!queries) {
    return extractResearchFieldsFromQuery(params);
  }

  // Aggregate fields from all queries
  const mainGoals = new Set<string>();
  const goals = new Set<string>();
  const reasonings = new Set<string>();

  for (const query of queries) {
    const fields = extractResearchFieldsFromQuery(query);
    if (fields.mainResearchGoal) mainGoals.add(fields.mainResearchGoal);
    if (fields.researchGoal) goals.add(fields.researchGoal);
    if (fields.reasoning) reasonings.add(fields.reasoning);
  }

  return {
    ...(mainGoals.size > 0 && {
      mainResearchGoal: Array.from(mainGoals).join('; '),
    }),
    ...(goals.size > 0 && { researchGoal: Array.from(goals).join('; ') }),
    ...(reasonings.size > 0 && {
      reasoning: Array.from(reasonings).join('; '),
    }),
  };
}

/**
 * Extracts repository identifier from a single query object.
 *
 * Supports formats: `repository: "owner/repo"`, `owner + repo`, or `owner` only.
 */
function extractRepoOwnerFromQuery(query: Record<string, unknown>): string[] {
  const repository =
    typeof query.repository === 'string' ? query.repository : undefined;

  if (repository && repository.includes('/')) {
    return [repository];
  }

  const repo = typeof query.repo === 'string' ? query.repo : undefined;
  const owner = typeof query.owner === 'string' ? query.owner : undefined;

  if (owner && repo) {
    return [`${owner}/${repo}`];
  }
  if (owner) {
    return [owner];
  }
  return [];
}

/**
 * Extracts unique repository identifiers from params (single or bulk).
 */
export function extractRepoOwnerFromParams(
  params: Record<string, unknown>
): string[] {
  const queries = getQueriesArray(params);

  if (!queries) {
    return extractRepoOwnerFromQuery(params);
  }

  // Aggregate and dedupe repos from all queries
  const repoSet = new Set<string>();
  for (const query of queries) {
    for (const repo of extractRepoOwnerFromQuery(query)) {
      repoSet.add(repo);
    }
  }
  return Array.from(repoSet);
}
