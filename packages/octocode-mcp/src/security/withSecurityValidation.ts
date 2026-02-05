import { CallToolResult } from '@modelcontextprotocol/sdk/types';
import { createResult } from '../responses.js';
import { ContentSanitizer } from './contentSanitizer.js';
import { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types';
import { logToolCall, logSessionError } from '../session.js';
import { isLoggingEnabled as isSessionEnabled } from '../serverConfig.js';
import { TOOL_ERRORS } from '../errorCodes.js';

export function withSecurityValidation<T extends Record<string, unknown>>(
  toolName: string,
  toolHandler: (
    sanitizedArgs: T,
    authInfo?: AuthInfo,
    sessionId?: string
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
      if (isSessionEnabled()) {
        handleBulk(toolName, sanitizedParams);
      }
      return await toolHandler(
        validation.sanitizedParams as T,
        authInfo,
        sessionId
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
      // Log security validation errors for monitoring (no tool name in basic validation)
      logSessionError(
        'basic_security_validation',
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
 */
function handleQuery(toolName: string, query: Record<string, unknown>): void {
  const repos = extractRepoOwnerFromQuery(query);
  if (repos.length === 0) {
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
 */
function logSingleOperation(
  toolName: string,
  params: Record<string, unknown>
): void {
  const repos = extractRepoOwnerFromParams(params);
  if (repos.length === 0) {
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
