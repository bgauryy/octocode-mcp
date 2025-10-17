/**
 * Zod schema for local_view_structure tool
 */

import { z } from 'zod';
import { BaseQuerySchema, createBulkQuerySchema } from './baseSchema.js';
import { TOOL_NAMES } from '../constants.js';

/**
 * Tool description for MCP registration
 */
export const LOCAL_VIEW_STRUCTURE_DESCRIPTION = `Explore directory structure using ls (unix directory listing).

Why: Understand codebase organization, find entry points, identify file types, spot patterns.

SEMANTIC: Map user concepts to directory patterns → bulk parallel = instant structural understanding.
Example: "main code?" → queries=[{path:"src"}, {path:"lib"}, {path:"app"}]

Examples:
• Semantic: "architecture" → queries=[{path:"src",depth:2}, {path:"config"}, {path:"docs"}]
• Bulk explore: queries=[{path:"src"}, {path:"tests"}, {path:"config"}]
• Recent: sortBy="time", details=true, reverse=false
• Large files: sortBy="size", reverse=true, humanReadable=true
• By type: extensions=["ts","tsx"], filesOnly=true, summary=true

Best Practices:
- Map concepts to multiple dirs: "frontend" → src/, components/, pages/, app/
- Bulk queries explore related locations in parallel
- details=true + humanReadable=true for metadata
- Start depth=1-2, use summary=true for stats`;

/**
 * View structure query schema
 */
export const ViewStructureQuerySchema = BaseQuerySchema.extend({
  path: z.string().describe('Directory path (required)'),

  // Display options
  details: z.boolean().default(false).describe('Show detailed info (-l)'),
  hidden: z.boolean().default(false).describe('Show hidden files (-a)'),
  humanReadable: z
    .boolean()
    .default(true)
    .describe('Human-readable sizes (-h): KB, MB, GB'),
  sortBy: z
    .enum(['name', 'size', 'time', 'extension'])
    .optional()
    .describe('Sort order (name, size, time, extension)'),
  reverse: z.boolean().optional().describe('Reverse sort order (-r)'),

  // Filtering (post-processed after ls)
  pattern: z
    .string()
    .optional()
    .describe('Filter by name pattern - post-processed (e.g., "*.js")'),
  directoriesOnly: z.boolean().optional().describe('Show only directories'),
  filesOnly: z.boolean().optional().describe('Show only files'),
  extension: z
    .string()
    .optional()
    .describe('Filter by extension - post-processed (e.g., "js", "ts")'),
  extensions: z
    .array(z.string())
    .optional()
    .describe(
      'Multiple extensions - post-processed (e.g., ["js", "ts", "tsx"])'
    ),

  // Tree view
  depth: z
    .number()
    .min(1)
    .max(5)
    .optional()
    .describe('Max depth for recursive (1-5)'),
  recursive: z.boolean().optional().describe('Recursive listing (-R)'),
  treeView: z.boolean().optional().describe('Tree-like visualization'),

  // Output control
  limit: z
    .number()
    .min(1)
    .max(10000)
    .optional()
    .describe('Max entries to return: 1-10000, default 1000'),
  summary: z
    .boolean()
    .default(true)
    .describe('Include summary stats (total files, dirs, size)'),
});

/**
 * Bulk view structure schema
 */
export const BulkViewStructureSchema = createBulkQuerySchema(
  TOOL_NAMES.LOCAL_VIEW_STRUCTURE,
  ViewStructureQuerySchema
);

export type ViewStructureQuery = z.infer<typeof ViewStructureQuerySchema>;
export type BulkViewStructureQuery = z.infer<typeof BulkViewStructureSchema>;
