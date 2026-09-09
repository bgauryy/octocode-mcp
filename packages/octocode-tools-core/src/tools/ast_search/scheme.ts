import { z } from 'zod';
import { createRelaxedBulkQuerySchema } from '../../scheme/fields.js';
import { AstSearchQuerySchema } from '../../toolContract/input/resources/tools/astSearch.js';

export { AstSearchQuerySchema };
export type AstSearchQuery = z.infer<typeof AstSearchQuerySchema>;
export const AstSearchBulkQuerySchema = createRelaxedBulkQuerySchema(
  AstSearchQuerySchema,
  { maxQueries: 5 }
);
