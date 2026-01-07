/**
 * Zod schema for localViewStructure tool
 */

import { z } from 'zod';
import { BaseQuerySchemaLocal, createBulkQuerySchema } from './baseSchema.js';
import {
  LOCAL_VIEW_STRUCTURE,
  TOOL_NAMES,
  DESCRIPTIONS,
} from '../tools/toolMetadata.js';

/**
 * Tool description for localViewStructure
 */
export const LOCAL_VIEW_STRUCTURE_DESCRIPTION =
  DESCRIPTIONS[TOOL_NAMES.LOCAL_VIEW_STRUCTURE] ||
  `## View directory structure and list files
<when>
- Understand codebase layout before searching
- Browse directory tree to find file locations
- Discover project structure (src/, tests/, config/)
</when>
<workflow>
- Start with depth=1 at root to see top-level layout
- Drill into specific directories with depth=2
- Use localSearchCode or localFindFiles for specific files
</workflow>
<defaults>
- depth: 1 (current directory only)
- entriesPerPage: 20
- sortBy: time (most recent first)
</defaults>
<common_patterns>
# Root overview
path="", depth=1

# Drill into src
path="src", depth=2

# Filter by extension
path="src", extension="ts"

# Show hidden files
path=".", hidden=true
</common_patterns>`;

/**
 * View structure query schema
 */
const ViewStructureQuerySchema = BaseQuerySchemaLocal.extend({
  path: z.string().describe(LOCAL_VIEW_STRUCTURE.scope.path),

  details: z
    .boolean()
    .default(false)
    .describe(LOCAL_VIEW_STRUCTURE.options.details),
  hidden: z
    .boolean()
    .default(false)
    .describe(LOCAL_VIEW_STRUCTURE.filters.hidden),
  humanReadable: z
    .boolean()
    .default(true)
    .describe(LOCAL_VIEW_STRUCTURE.options.humanReadable),
  sortBy: z
    .enum(['name', 'size', 'time', 'extension'])
    .optional()
    .default('time')
    .describe(LOCAL_VIEW_STRUCTURE.sorting.sortBy),
  reverse: z
    .boolean()
    .optional()
    .describe(LOCAL_VIEW_STRUCTURE.sorting.reverse),

  entriesPerPage: z
    .number()
    .int()
    .min(1)
    .max(20)
    .optional()
    .default(20)
    .describe(LOCAL_VIEW_STRUCTURE.pagination.entriesPerPage),
  entryPageNumber: z
    .number()
    .int()
    .min(1)
    .optional()
    .default(1)
    .describe(LOCAL_VIEW_STRUCTURE.pagination.entryPageNumber),

  pattern: z.string().optional().describe(LOCAL_VIEW_STRUCTURE.filters.pattern),
  directoriesOnly: z
    .boolean()
    .optional()
    .describe(LOCAL_VIEW_STRUCTURE.filters.directoriesOnly),
  filesOnly: z
    .boolean()
    .optional()
    .describe(LOCAL_VIEW_STRUCTURE.filters.filesOnly),
  extension: z
    .string()
    .optional()
    .describe(LOCAL_VIEW_STRUCTURE.filters.extension),
  extensions: z
    .array(z.string())
    .optional()
    .describe(LOCAL_VIEW_STRUCTURE.filters.extensions),

  depth: z
    .number()
    .min(1)
    .max(5)
    .optional()
    .describe(LOCAL_VIEW_STRUCTURE.options.depth),
  recursive: z
    .boolean()
    .optional()
    .describe(LOCAL_VIEW_STRUCTURE.options.recursive),

  limit: z
    .number()
    .min(1)
    .max(10000)
    .optional()
    .describe(LOCAL_VIEW_STRUCTURE.pagination.limit),
  summary: z
    .boolean()
    .default(true)
    .describe(LOCAL_VIEW_STRUCTURE.options.summary),

  charOffset: z
    .number()
    .min(0)
    .optional()
    .describe(LOCAL_VIEW_STRUCTURE.pagination.charOffset),

  charLength: z
    .number()
    .min(1)
    .max(10000)
    .optional()
    .describe(LOCAL_VIEW_STRUCTURE.pagination.charLength),

  showFileLastModified: z
    .boolean()
    .default(false)
    .describe(LOCAL_VIEW_STRUCTURE.options.showFileLastModified),
});

/**
 * Bulk view structure schema
 */
export const BulkViewStructureSchema = createBulkQuerySchema(
  TOOL_NAMES.LOCAL_VIEW_STRUCTURE,
  ViewStructureQuerySchema,
  { maxQueries: 5 }
);

type ViewStructureQuery = z.infer<typeof ViewStructureQuerySchema>;
type BulkViewStructureQuery = z.infer<typeof BulkViewStructureSchema>;
