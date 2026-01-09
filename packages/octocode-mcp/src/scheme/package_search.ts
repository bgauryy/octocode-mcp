import { z } from 'zod';
import { BaseQuerySchema, createBulkQuerySchema } from './baseSchema.js';
import { PACKAGE_SEARCH, TOOL_NAMES } from '../tools/toolMetadata.js';

const PackageBaseFields = {
  name: z.string().min(1).describe(PACKAGE_SEARCH.search.name),
  searchLimit: z
    .number()
    .int()
    .min(1)
    .max(10)
    .optional()
    .default(1)
    .describe(PACKAGE_SEARCH.options.searchLimit),
};

const NpmPackageQuerySchema = BaseQuerySchema.extend({
  ...PackageBaseFields,
  ecosystem: z.literal('npm').describe(PACKAGE_SEARCH.search.ecosystem),
  npmFetchMetadata: z
    .boolean()
    .optional()
    .default(false)
    .describe(PACKAGE_SEARCH.options.npmFetchMetadata),
});

const PythonPackageQuerySchema = BaseQuerySchema.extend({
  ...PackageBaseFields,
  ecosystem: z.literal('python').describe(PACKAGE_SEARCH.search.ecosystem),
  pythonFetchMetadata: z
    .boolean()
    .optional()
    .default(false)
    .describe(PACKAGE_SEARCH.options.pythonFetchMetadata),
});

export const PackageSearchQuerySchema = z.discriminatedUnion('ecosystem', [
  NpmPackageQuerySchema,
  PythonPackageQuerySchema,
]);

type NpmPackageQuery = z.infer<typeof NpmPackageQuerySchema>;
type PythonPackageQuery = z.infer<typeof PythonPackageQuerySchema>;
export type PackageSearchQuery = NpmPackageQuery | PythonPackageQuery;
type _PackageSearchBulkParams = {
  queries: PackageSearchQuery[];
};

export const PackageSearchBulkQuerySchema = createBulkQuerySchema(
  TOOL_NAMES.PACKAGE_SEARCH,
  PackageSearchQuerySchema
);
