/**
 * Zod validation schemas for tool metadata API responses.
 * Used to validate metadata fetched from the remote API.
 */
import { z } from 'zod';

// ============================================================================
// Prompt Schemas
// ============================================================================

export const PromptArgumentSchema = z.object({
  name: z.string(),
  description: z.string(),
  required: z.boolean().optional(),
});

export const PromptMetadataSchema = z.object({
  name: z.string(),
  description: z.string(),
  content: z.string(),
  args: z.array(PromptArgumentSchema).optional(),
});

// ============================================================================
// Tool Schemas
// ============================================================================

export const ToolMetadataSchema = z.object({
  name: z.string(),
  description: z.string(),
  schema: z.record(z.string()),
  outputSchema: z.record(z.unknown()).optional(),
  hints: z.object({
    hasResults: z.array(z.string()),
    empty: z.array(z.string()),
    dynamic: z.record(z.array(z.string()).optional()).optional(),
  }),
});

// ============================================================================
// Base Schema
// ============================================================================

export const BaseSchemaSchema = z.object({
  mainResearchGoal: z.string(),
  researchGoal: z.string(),
  reasoning: z.string(),
  bulkQueryTemplate: z.string(),
});

// ============================================================================
// Bulk Operations Schema
// ============================================================================

export const BulkOperationsSchema = z.object({
  instructions: z
    .object({
      base: z.string().optional(),
      hasResults: z.string().optional(),
      empty: z.string().optional(),
      error: z.string().optional(),
    })
    .optional(),
});

// ============================================================================
// Complete Metadata Schema (Raw API Response)
// ============================================================================

export const RawCompleteMetadataSchema = z.object({
  instructions: z.string(),
  prompts: z.record(PromptMetadataSchema),
  toolNames: z.record(z.string()),
  baseSchema: BaseSchemaSchema,
  tools: z.record(ToolMetadataSchema),
  baseHints: z.object({
    hasResults: z.array(z.string()),
    empty: z.array(z.string()),
  }),
  genericErrorHints: z.array(z.string()),
  bulkOperations: BulkOperationsSchema.optional(),
});

// ============================================================================
// Inferred Types
// ============================================================================

export type RawCompleteMetadataSchemaType = z.infer<
  typeof RawCompleteMetadataSchema
>;
