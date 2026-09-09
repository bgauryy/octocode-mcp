import { z } from 'zod';
import { ViewStructureQuerySchema as CoreViewStructureQuerySchema } from '../../toolContract/input/resources/tools/localTreeOperation.js';
import {
  LOCAL_MAX_DEPTH,
  LOCAL_MAX_FILES_PER_PAGE,
  LOCAL_MAX_LIMIT,
} from '../../config.js';
import {
  clampedInt,
  createRelaxedBulkQuerySchema,
  relaxedPageNumberField,
} from '../../scheme/fields.js';
import {
  createQueryShapeSchema,
  describeQuerySchema,
} from '../../scheme/coreSchemas.js';
const queryOverrides = {
  excludeDir: z.array(z.string()).optional(),
  // Description flows from the shared core contract resource; only the
  // bounds are tightened here.
  maxDepth: clampedInt(0, LOCAL_MAX_DEPTH).optional(),
  limit: clampedInt(1, LOCAL_MAX_LIMIT).optional(),
  page: relaxedPageNumberField.default(1),
  itemsPerPage: clampedInt(1, LOCAL_MAX_FILES_PER_PAGE).optional(),
} as const;

const ViewStructureQueryShape = createQueryShapeSchema(
  CoreViewStructureQuerySchema,
  queryOverrides
);

export const LocalViewStructureQuerySchema = describeQuerySchema(
  CoreViewStructureQuerySchema,
  queryOverrides
);
export type ViewStructureQuery = z.infer<typeof LocalViewStructureQuerySchema>;

export const LocalViewStructureBulkQuerySchema = createRelaxedBulkQuerySchema(
  ViewStructureQueryShape,
  { maxQueries: 5 }
);
