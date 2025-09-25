import { z } from 'zod';

// Simplified schema without $ref patterns that break some MCP clients
export const GitHubCodeSearchSimpleSchema = z.object({
  queries: z
    .array(
      z.object({
        id: z.string().optional().describe('query id'),
        reasoning: z
          .string()
          .optional()
          .describe(
            'Explanation or reasoning behind the query for the research'
          ),
        verbose: z
          .boolean()
          .default(false)
          .optional()
          .describe('add debug info'),
        queryTerms: z
          .array(z.string())
          .min(1)
          .max(5)
          .describe('Github search queries (AND logic in file)'),
        owner: z
          .union([z.string(), z.array(z.string())])
          .optional()
          .describe('Repo owner/org'),
        repo: z
          .union([z.string(), z.array(z.string())])
          .optional()
          .describe('Repo name'),
        language: z.string().optional().describe('file language'),
        extension: z.string().optional().describe('file extension'),
        filename: z.string().optional().describe('File name'),
        path: z.string().optional().describe('Path'),
        stars: z
          .union([z.number().int().min(0), z.string()])
          .optional()
          .describe('Stars'),
        match: z
          .union([
            z.literal('file'),
            z.literal('path'),
            z.array(z.union([z.literal('file'), z.literal('path')])),
          ])
          .optional()
          .describe('Scope'),
        limit: z.number().int().min(1).max(20).optional().describe('Max'),
        minify: z.boolean().default(true).describe('minify content'),
        sanitize: z.boolean().default(true).describe('sanitize content'),
      })
    )
    .min(1)
    .max(10)
    .describe('Code search queries'),
  verbose: z.boolean().default(false).optional().describe('add debug info'),
});

export type GitHubCodeSearchSimpleInput = z.infer<
  typeof GitHubCodeSearchSimpleSchema
>;
