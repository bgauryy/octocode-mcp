/**
 * Route handler factory for reducing boilerplate in route files.
 *
 * Abstracts the common pattern:
 * 1. Parse and validate query params
 * 2. Execute tool with resilience wrapper
 * 3. Parse tool response
 * 4. Transform data to response format
 * 5. Send response with appropriate status
 *
 * @module utils/routeFactory
 */

import type { Request, Response, NextFunction, RequestHandler } from 'express';
import type { ZodSchema, ZodType, ZodTypeDef } from 'zod';
import { parseAndValidate } from '../middleware/queryParser.js';
import { parseToolResponse, type ParsedResponse } from './responseParser.js';

/**
 * Resilience wrapper type - matches the signature of withLocalResilience, withGitHubResilience, etc.
 */
type ResilienceWrapper = <T>(
  fn: () => Promise<T>,
  toolName: string
) => Promise<T>;

/**
 * Tool function type - the MCP tool function to call
 */
type ToolFunction<TParams> = (params: TParams) => Promise<unknown>;

/**
 * Transformer function type - converts parsed tool response to final response
 */
type ResponseTransformer<TQuery, TResponse> = (
  parsed: ParsedResponse,
  queries: TQuery[]
) => TResponse;

/**
 * Route configuration options
 */
export interface RouteConfig<TQuery, TParams, TResponse> {
  /** Zod schema for query validation - accepts schemas with transforms */
  schema: ZodType<TQuery, ZodTypeDef, unknown>;

  /** Convert validated queries to tool params */
  toParams: (queries: TQuery[]) => TParams;

  /** The MCP tool function to execute */
  toolFn: ToolFunction<TParams>;

  /** Tool name for logging/resilience */
  toolName: string;

  /** Resilience wrapper (withLocalResilience, withGitHubResilience, etc.) */
  resilience: ResilienceWrapper;

  /** Transform parsed response to final format */
  transform: ResponseTransformer<TQuery, TResponse>;
}

/**
 * Create a route handler with standard error handling, validation, and resilience.
 *
 * @example
 * ```typescript
 * localRoutes.get('/search', createRouteHandler({
 *   schema: localSearchSchema,
 *   toParams: toLocalSearchParams,
 *   toolFn: localSearchCode,
 *   toolName: 'localSearchCode',
 *   resilience: withLocalResilience,
 *   transform: (parsed, queries) => {
 *     // Custom transformation logic
 *     return ResearchResponse.searchResults({ ... });
 *   },
 * }));
 * ```
 */
export function createRouteHandler<TQuery, TParams, TResponse>(
  config: RouteConfig<TQuery, TParams, TResponse>
): RequestHandler {
  const { schema, toParams, toolFn, toolName, resilience, transform } = config;

  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      // 1. Parse and validate query params
      const queries = parseAndValidate(
        req.query as Record<string, unknown>,
        schema as ZodSchema<TQuery>
      ) as TQuery[];

      // 2. Execute tool with resilience wrapper
      const rawResult = await resilience(
        () => toolFn(toParams(queries)),
        toolName
      );

      // 3. Parse tool response
      const parsed = parseToolResponse(rawResult as { content: Array<{ type: string; text: string }> });

      // 4. Transform to final response format
      const response = transform(parsed, queries);

      // 5. Send response with appropriate status
      res.status(parsed.isError ? 500 : 200).json(response);
    } catch (error) {
      next(error);
    }
  };
}
