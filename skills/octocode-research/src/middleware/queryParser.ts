import type { Response } from 'express';
import { z, type ZodSchema, ZodError } from 'zod';

/**
 * Custom error class for validation failures.
 * Carries HTTP status code for proper error responses.
 */
export class ValidationError extends Error {
  statusCode: number;
  code: string;
  details: z.ZodIssue[];

  constructor(message: string, details: z.ZodIssue[] = []) {
    super(message);
    this.name = 'ValidationError';
    this.statusCode = 400;
    this.code = 'VALIDATION_ERROR';
    this.details = details;
  }
}

/**
 * Parse and validate query parameters using a Zod schema.
 * Returns the validated data wrapped in an array (for tool compatibility).
 *
 * @param query - Express request query object
 * @param schema - Zod schema for validation
 * @returns Array containing the validated query object
 * @throws ValidationError if validation fails
 */
export function parseAndValidate<T>(
  query: Record<string, unknown>,
  schema: ZodSchema<T>
): T[] {
  // Check for JSON-encoded queries array (batch mode)
  if (query.queries && typeof query.queries === 'string') {
    try {
      const parsed = JSON.parse(query.queries);
      if (Array.isArray(parsed)) {
        // Validate each item in the array
        const validated = parsed.map((item, index) => {
          const result = schema.safeParse(item);
          if (!result.success) {
            throw new ValidationError(
              `Validation failed for query[${index}]: ${formatZodError(result.error)}`,
              result.error.issues
            );
          }
          return result.data;
        });
        return validated;
      }
    } catch (e) {
      if (e instanceof ValidationError) throw e;
      // Fall through to single query parsing if JSON parse fails
    }
  }

  // Parse flat query params (single query mode)
  const cleanedQuery: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(query)) {
    if (key !== 'queries') {
      cleanedQuery[key] = value;
    }
  }

  const result = schema.safeParse(cleanedQuery);
  if (!result.success) {
    throw new ValidationError(
      formatZodError(result.error),
      result.error.issues
    );
  }

  return [result.data];
}

/**
 * Format Zod error into a human-readable string.
 */
function formatZodError(error: ZodError): string {
  return error.issues
    .map((issue) => {
      const path = issue.path.join('.');
      return path ? `${path}: ${issue.message}` : issue.message;
    })
    .join('; ');
}

/**
 * Send standardized tool result response.
 */
export function sendToolResult(
  res: Response,
  result: {
    content?: Array<{ type: string; text?: string }>;
    isError?: boolean;
  }
): void {
  const textContent = result.content?.find(
    (c) => c.type === 'text' && 'text' in c
  );

  const isError = result.isError ?? false;

  res.status(isError ? 500 : 200).json({
    success: !isError,
    data: textContent?.text ?? null,
    raw: result,
  });
}

// Legacy function for backwards compatibility (deprecated)
export { parseAndValidate as parseQueryToArray };
