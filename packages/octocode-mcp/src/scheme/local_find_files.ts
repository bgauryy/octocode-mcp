/**
 * Zod schema for localFindFiles tool
 */

import { z } from 'zod';
import {
  BaseQuerySchemaLocal,
  createBulkQuerySchemaLocal,
  COMMON_PAGINATION_DESCRIPTIONS,
} from './baseSchema.js';
import { TOOL_NAMES } from '../utils/constants.js';

/**
 * Tool description for MCP registration
 */
export const LOCAL_FIND_FILES_DESCRIPTION = `Purpose: Locate files by name, time, size, permissions.

Use when: You need paths or recency; not content search.
Workflow: Filter by metadata → fetch_content or ripgrep.
Pagination: Sorted by modified time; filesPerPage + filePageNumber.
Tips: modifiedWithin "7d"; sizeGreater "10M"; perms like "755".

Examples:
- name: "*.test.ts", modifiedWithin: "7d"
- iname: "readme", type: "f"
- type: "d", pathPattern: "src/**"
- path: "node_modules", name: "package.json", maxDepth: 2 (find packages in node_modules)
`;

/**
 * Find files query schema
 */
export const FindFilesQuerySchema = BaseQuerySchemaLocal.extend({
  path: z.string().describe('Starting directory (required).'),

  maxDepth: z
    .number()
    .min(1)
    .max(10)
    .optional()
    .describe('Max depth (1–10, default 5).'),
  minDepth: z.number().min(0).max(10).optional().describe('Min depth (0–10).'),

  name: z.string().optional().describe('Name pattern (*.js, *config*).'),
  iname: z.string().optional().describe('Case-insensitive name pattern.'),
  names: z
    .array(z.string())
    .optional()
    .describe('Multiple patterns (OR logic), e.g., ["*.ts","*.js"].'),
  pathPattern: z.string().optional().describe('Path pattern.'),
  regex: z.string().optional().describe('Regex pattern.'),
  regexType: z
    .enum(['posix-egrep', 'posix-extended', 'posix-basic'])
    .optional()
    .describe('Regex type (default: posix-egrep).'),

  type: z
    .enum(['f', 'd', 'l', 'b', 'c', 'p', 's'])
    .optional()
    .describe('Type: f=file, d=dir, l=symlink.'),

  empty: z.boolean().optional().describe('Empty files/dirs only.'),

  modifiedWithin: z
    .string()
    .optional()
    .describe('Modified within (7d, 2h, 30m).'),
  modifiedBefore: z
    .string()
    .optional()
    .describe('Modified before (e.g., 30d).'),
  accessedWithin: z.string().optional().describe('Accessed within (e.g., 1d).'),

  sizeGreater: z.string().optional().describe('Size > (10M, 100k, 1G).'),
  sizeLess: z.string().optional().describe('Size < (1M, 500k).'),

  permissions: z
    .string()
    .optional()
    .describe('Permission pattern (e.g., 755, 644).'),
  executable: z.boolean().optional().describe('Executable only.'),
  readable: z.boolean().optional().describe('Readable only.'),
  writable: z.boolean().optional().describe('Writable only.'),

  excludeDir: z
    .array(z.string())
    .optional()
    .describe('Exclude dirs (["node_modules",".git"]).'),

  limit: z
    .number()
    .min(1)
    .max(10000)
    .optional()
    .describe('Max results (1–10000, default 1000).'),
  details: z
    .boolean()
    .default(false)
    .describe('Include size/perms (default false).'),

  filesPerPage: z
    .number()
    .int()
    .min(1)
    .max(20)
    .optional()
    .default(20)
    .describe(COMMON_PAGINATION_DESCRIPTIONS.filesPerPage),
  filePageNumber: z
    .number()
    .int()
    .min(1)
    .optional()
    .default(1)
    .describe(COMMON_PAGINATION_DESCRIPTIONS.filePageNumber),

  charOffset: z
    .number()
    .min(0)
    .optional()
    .describe(COMMON_PAGINATION_DESCRIPTIONS.charOffset),

  charLength: z
    .number()
    .min(1)
    .max(10000)
    .optional()
    .describe(COMMON_PAGINATION_DESCRIPTIONS.charLength),

  showFileLastModified: z
    .boolean()
    .default(false)
    .describe('Show file last modified timestamps in results (default false).'),
});

/**
 * Bulk find files schema
 */
export const BulkFindFilesSchema = createBulkQuerySchemaLocal(
  TOOL_NAMES.LOCAL_FIND_FILES,
  FindFilesQuerySchema
);

export type FindFilesQuery = z.infer<typeof FindFilesQuerySchema>;
export type BulkFindFilesQuery = z.infer<typeof BulkFindFilesSchema>;
