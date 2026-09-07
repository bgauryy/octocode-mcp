import { z } from 'zod';

export const AttendRevisionInputSchema = z.string().min(1).max(256)
  .describe('Opaque revision from the previous attend with identical scope. Invalid or foreign revisions return full state.');
export const AttendRevisionTokenSchema = z.string().regex(/^a1\.[a-f0-9]{64}\.[a-f0-9]{64}$/);
