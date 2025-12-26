/**
 * Zod schema for localViewStructure tool
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
export const LOCAL_VIEW_STRUCTURE_DESCRIPTION = `Purpose: Overview directory contents, sizes, and structure.

Use when: New codebase or unknown locations.
Avoid when: Content/pattern search (use ripgrep/fetch_content).
Workflow: depth=1–2 → filter (pattern/extensions) → drill deeper or switch tools.
Pagination: entriesPerPage + entryPageNumber (sorted by modified time).
Tips: hidden=true for dotfiles; exclude node_modules for brevity.

Examples:
- depth: 1, entriesPerPage: 20
- pattern: "*.ts", filesOnly: true
- extensions: ["ts","tsx"], hidden: true
- path: "node_modules/express", depth: 1 (explore inside node_modules)
`;

/**
 * View structure query schema
 */
export const ViewStructureQuerySchema = BaseQuerySchemaLocal.extend({
  path: z
    .string()
    .describe(
      'Absolute directory path (required). Relative paths are not allowed.'
    ),

  details: z
    .boolean()
    .default(false)
    .describe('Show details (perms, size, dates).'),
  hidden: z.boolean().default(false).describe('Show hidden files.'),
  humanReadable: z
    .boolean()
    .default(true)
    .describe('Human-readable sizes (KB, MB, GB)'),
  sortBy: z
    .enum(['name', 'size', 'time', 'extension'])
    .optional()
    .default('time')
    .describe('Sort by name/size/time/extension (default: time).'),
  reverse: z.boolean().optional().describe('Reverse sort.'),

  entriesPerPage: z
    .number()
    .int()
    .min(1)
    .max(20)
    .optional()
    .default(20)
    .describe(COMMON_PAGINATION_DESCRIPTIONS.entriesPerPage),
  entryPageNumber: z
    .number()
    .int()
    .min(1)
    .optional()
    .default(1)
    .describe(COMMON_PAGINATION_DESCRIPTIONS.entryPageNumber),

  pattern: z
    .string()
    .optional()
    .describe('Name filter: globs (*.js, @*, test*) or substring (user).'),
  directoriesOnly: z.boolean().optional().describe('Directories only.'),
  filesOnly: z.boolean().optional().describe('Files only.'),
  extension: z.string().optional().describe('Extension filter (js, ts).'),
  extensions: z
    .array(z.string())
    .optional()
    .describe('Multiple extensions (["js", "ts", "tsx"]).'),

  depth: z.number().min(1).max(5).optional().describe('Recursive depth (1–5).'),
  recursive: z.boolean().optional().describe('Recursive listing.'),

  limit: z
    .number()
    .min(1)
    .max(10000)
    .optional()
    .describe('Max entries (1–10000).'),
  summary: z
    .boolean()
    .default(true)
    .describe('Include summary (files, dirs, size).'),

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
 * Bulk view structure schema
 */
export const BulkViewStructureSchema = createBulkQuerySchemaLocal(
  TOOL_NAMES.LOCAL_VIEW_STRUCTURE,
  ViewStructureQuerySchema
);

export type ViewStructureQuery = z.infer<typeof ViewStructureQuerySchema>;
export type BulkViewStructureQuery = z.infer<typeof BulkViewStructureSchema>;
