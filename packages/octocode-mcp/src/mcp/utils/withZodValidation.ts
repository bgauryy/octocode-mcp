import { CallToolResult } from '@modelcontextprotocol/sdk/types';
import { z } from 'zod';
import { createResult } from '../responses';
import { ContentSanitizer } from '../../security/contentSanitizer';

/**
 * Enhanced validation decorator that uses Zod schemas
 * Provides both schema validation AND security sanitization
 */
export function withZodValidation<T extends z.ZodTypeAny>(
  schema: T,
  toolHandler: (validatedArgs: z.infer<T>) => Promise<CallToolResult>
): (args: unknown) => Promise<CallToolResult> {
  return async (args: unknown): Promise<CallToolResult> => {
    try {
      // 1. First validate with Zod schema
      const parseResult = schema.safeParse(args);

      if (!parseResult.success) {
        const errors = parseResult.error.errors
          .map(e => `${e.path.join('.')}: ${e.message}`)
          .join('; ');

        return createResult({
          error: `Schema validation failed: ${errors}`,
          isError: true,
        });
      }

      // 2. Then apply security sanitization to validated data
      const validation = ContentSanitizer.validateInputParameters(
        parseResult.data as Record<string, unknown>
      );

      if (!validation.isValid) {
        return createResult({
          error: `Security validation failed: ${validation.warnings.join('; ')}`,
          isError: true,
        });
      }

      // 3. Call handler with validated AND sanitized parameters
      // Type safety is guaranteed by Zod validation
      return await toolHandler(validation.sanitizedParams as z.infer<T>);
    } catch (error) {
      return createResult({
        error: `Validation error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        isError: true,
      });
    }
  };
}

/**
 * Example usage:
 *
 * server.registerTool(
 *   'tool-name',
 *   { inputSchema: MyZodSchema.shape },
 *   withZodValidation(
 *     MyZodSchema,
 *     async (args) => {
 *       // args is fully typed and validated
 *     }
 *   )
 * )
 */
