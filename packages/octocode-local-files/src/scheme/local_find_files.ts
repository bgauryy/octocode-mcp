/**
 * Zod schema for local_find_files tool
 */

import { z } from 'zod';
import { BaseQuerySchema, createBulkQuerySchema } from './baseSchema.js';
import { TOOL_NAMES } from '../constants.js';

/**
 * Find files query schema
 */
export const FindFilesQuerySchema = BaseQuerySchema.extend({
  path: z.string().describe('Starting directory (required)'),

  // Depth control
  maxDepth: z
    .number()
    .min(1)
    .max(10)
    .optional()
    .describe('Max directory depth: 1-10, default 5'),
  minDepth: z
    .number()
    .min(0)
    .max(10)
    .optional()
    .describe('Min directory depth: 0-10'),

  // Name filters
  name: z.string().optional().describe('File name pattern (e.g., "*.js")'),
  iname: z.string().optional().describe('Case-insensitive name pattern'),
  names: z
    .array(z.string())
    .optional()
    .describe('Multiple name patterns (OR logic: ["*.ts", "*.js"])'),
  pathPattern: z.string().optional().describe('Path pattern matching'),
  regex: z.string().optional().describe('Regex pattern for file paths'),
  regexType: z
    .enum(['posix-egrep', 'posix-extended', 'posix-basic'])
    .optional()
    .describe('Regex type (default: posix-egrep for \\.(ts|js)$ syntax)'),

  // Type filters
  type: z
    .enum(['f', 'd', 'l', 'b', 'c', 'p', 's'])
    .optional()
    .describe('File type (f=file, d=directory, l=symlink)'),

  // Special filters
  empty: z.boolean().optional().describe('Find empty files or directories'),

  // Time filters
  modifiedWithin: z
    .string()
    .optional()
    .describe('Modified within (e.g., "7d", "2h", "30m")'),
  modifiedBefore: z
    .string()
    .optional()
    .describe('Modified before (e.g., "30d")'),
  accessedWithin: z
    .string()
    .optional()
    .describe('Accessed within (e.g., "1d")'),

  // Size filters
  sizeGreater: z
    .string()
    .optional()
    .describe('Size greater than (e.g., "10M", "100k", "1G")'),
  sizeLess: z
    .string()
    .optional()
    .describe('Size less than (e.g., "1M", "500k")'),

  // Permission filters
  permissions: z
    .string()
    .optional()
    .describe('Permission pattern (e.g., "755", "644")'),
  executable: z.boolean().optional().describe('Executable files only'),
  readable: z.boolean().optional().describe('Readable files only'),
  writable: z.boolean().optional().describe('Writable files only'),

  // Content filters
  containsPattern: z
    .string()
    .optional()
    .describe('Files containing grep pattern (combines find + grep)'),

  // Exclusions
  excludeDir: z
    .array(z.string())
    .optional()
    .describe('Directories to exclude (e.g., ["node_modules", ".git"])'),

  // Output
  limit: z
    .number()
    .min(1)
    .max(10000)
    .optional()
    .describe('Max files to return: 1-10000, default 1000'),
  details: z
    .boolean()
    .default(false)
    .describe('Include file details (size, perms): default false'),
});

/**
 * Bulk find files schema
 */
export const BulkFindFilesSchema = createBulkQuerySchema(
  TOOL_NAMES.LOCAL_FIND_FILES,
  FindFilesQuerySchema
);

export type FindFilesQuery = z.infer<typeof FindFilesQuerySchema>;
export type BulkFindFilesQuery = z.infer<typeof BulkFindFilesSchema>;
