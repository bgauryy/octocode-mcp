/**
 * Zod schemas for session storage validation.
 *
 * These schemas mirror the TypeScript interfaces in types.ts and provide
 * runtime validation for data parsed from the session JSON file.
 */

import { z } from 'zod';

/**
 * Schema for session statistics
 */
export const SessionStatsSchema = z.object({
  toolCalls: z.number(),
  promptCalls: z.number(),
  errors: z.number(),
  rateLimits: z.number(),
});

/**
 * Schema for persisted session data
 */
export const PersistedSessionSchema = z.object({
  version: z.literal(1),
  sessionId: z.string(),
  createdAt: z.string(),
  lastActiveAt: z.string(),
  stats: SessionStatsSchema,
});
