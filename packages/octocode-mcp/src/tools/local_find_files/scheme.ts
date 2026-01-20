/**
 * Zod schema for localFindFiles tool
 */

import { z } from 'zod';
import {
  BaseQuerySchemaLocal,
  createBulkQuerySchema,
} from '../../scheme/baseSchema.js';
import { LOCAL_FIND_FILES, TOOL_NAMES, DESCRIPTIONS } from '../toolMetadata.js';

/**
 * Tool description for localFindFiles
 */
export const LOCAL_FIND_FILES_DESCRIPTION =
  DESCRIPTIONS[TOOL_NAMES.LOCAL_FIND_FILES];

/**
 * Find files query schema
 */
export const FindFilesQuerySchema = BaseQuerySchemaLocal.extend({
  path: z.string().describe(LOCAL_FIND_FILES.scope.path),

  maxDepth: z
    .number()
    .min(1)
    .max(10)
    .optional()
    .describe(LOCAL_FIND_FILES.options.maxDepth),
  minDepth: z
    .number()
    .min(0)
    .max(10)
    .optional()
    .describe(LOCAL_FIND_FILES.options.minDepth),

  name: z.string().optional().describe(LOCAL_FIND_FILES.filters.name),
  iname: z.string().optional().describe(LOCAL_FIND_FILES.filters.iname),
  names: z
    .array(z.string())
    .optional()
    .describe(LOCAL_FIND_FILES.filters.names),
  pathPattern: z
    .string()
    .optional()
    .describe(LOCAL_FIND_FILES.filters.pathPattern),
  regex: z.string().optional().describe(LOCAL_FIND_FILES.filters.regex),
  regexType: z
    .enum(['posix-egrep', 'posix-extended', 'posix-basic'])
    .optional()
    .describe(LOCAL_FIND_FILES.filters.regexType),

  type: z
    .enum(['f', 'd', 'l', 'b', 'c', 'p', 's'])
    .optional()
    .describe(LOCAL_FIND_FILES.filters.type),

  empty: z.boolean().optional().describe(LOCAL_FIND_FILES.filters.empty),

  modifiedWithin: z
    .string()
    .optional()
    .describe(LOCAL_FIND_FILES.time.modifiedWithin),
  modifiedBefore: z
    .string()
    .optional()
    .describe(LOCAL_FIND_FILES.time.modifiedBefore),
  accessedWithin: z
    .string()
    .optional()
    .describe(LOCAL_FIND_FILES.time.accessedWithin),

  sizeGreater: z
    .string()
    .optional()
    .describe(LOCAL_FIND_FILES.size.sizeGreater),
  sizeLess: z.string().optional().describe(LOCAL_FIND_FILES.size.sizeLess),

  permissions: z
    .string()
    .optional()
    .describe(LOCAL_FIND_FILES.options.permissions),
  executable: z
    .boolean()
    .optional()
    .describe(LOCAL_FIND_FILES.filters.executable),
  readable: z.boolean().optional().describe(LOCAL_FIND_FILES.filters.readable),
  writable: z.boolean().optional().describe(LOCAL_FIND_FILES.filters.writable),

  excludeDir: z
    .array(z.string())
    .optional()
    .describe(LOCAL_FIND_FILES.filters.excludeDir),

  limit: z
    .number()
    .min(1)
    .max(10000)
    .optional()
    .describe(LOCAL_FIND_FILES.pagination.limit),
  details: z.boolean().default(true).describe(LOCAL_FIND_FILES.options.details),

  filesPerPage: z
    .number()
    .int()
    .min(1)
    .max(20)
    .optional()
    .default(20)
    .describe(LOCAL_FIND_FILES.pagination.filesPerPage),
  filePageNumber: z
    .number()
    .int()
    .min(1)
    .optional()
    .default(1)
    .describe(LOCAL_FIND_FILES.pagination.filePageNumber),

  charOffset: z
    .number()
    .min(0)
    .optional()
    .describe(LOCAL_FIND_FILES.pagination.charOffset),

  charLength: z
    .number()
    .min(1)
    .max(10000)
    .optional()
    .describe(LOCAL_FIND_FILES.pagination.charLength),

  showFileLastModified: z
    .boolean()
    .default(true)
    .describe(LOCAL_FIND_FILES.options.showFileLastModified),
});

/**
 * Bulk find files schema
 */
export const BulkFindFilesSchema = createBulkQuerySchema(
  TOOL_NAMES.LOCAL_FIND_FILES,
  FindFilesQuerySchema,
  { maxQueries: 5 }
);
