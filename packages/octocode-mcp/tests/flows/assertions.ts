import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { expect } from 'vitest';
import type { z } from 'zod/v4';

type BulkResultStatus = 'hasResults' | 'empty' | 'error';

type BulkQueryResult = {
  id: string;
  status: BulkResultStatus;
  data: object;
};

type BulkToolOutput = {
  results: BulkQueryResult[];
};

type BulkOutputSchema = z.ZodType<BulkToolOutput>;

export function getSingleResult<TSchema extends BulkOutputSchema>(
  schema: TSchema,
  result: CallToolResult
): z.infer<TSchema>['results'][number] {
  expect(result.structuredContent).toBeDefined();

  const parsed = schema.parse(result.structuredContent);
  expect(parsed.results).toHaveLength(1);

  const [singleResult] = parsed.results;
  expect(singleResult).toBeDefined();

  return singleResult!;
}

export function expectHasResults<TSchema extends BulkOutputSchema>(
  schema: TSchema,
  result: CallToolResult
): Extract<z.infer<TSchema>['results'][number], { status: 'hasResults' }> {
  const parsed = getSingleResult(schema, result);

  if (parsed.status !== 'hasResults') {
    throw new Error(
      `Expected hasResults but received:\n${JSON.stringify(parsed, null, 2)}`
    );
  }

  return parsed as Extract<
    z.infer<TSchema>['results'][number],
    { status: 'hasResults' }
  >;
}

export function expectHasResultsData<TSchema extends z.ZodType<object>>(
  outputSchema: BulkOutputSchema,
  dataSchema: TSchema,
  result: CallToolResult
): z.infer<TSchema> {
  const parsed = getSingleResult(outputSchema, result);
  if (parsed.status !== 'hasResults') {
    throw new Error(
      `Expected hasResults but received:\n${JSON.stringify(parsed, null, 2)}`
    );
  }

  return dataSchema.parse(parsed.data);
}
