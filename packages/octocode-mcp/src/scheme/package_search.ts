import { z } from 'zod';
import { BaseQuerySchema, createBulkQuerySchema } from './baseSchema.js';
import { PACKAGE_SEARCH, TOOL_NAMES } from '../tools/toolMetadata.js';

// NPM Package Query Schema
const NpmPackageQuerySchema = BaseQuerySchema.extend({
  name: z.string().min(1).describe(PACKAGE_SEARCH.search.name),
  searchLimit: z
    .number()
    .int()
    .min(1)
    .max(10)
    .optional()
    .default(1)
    .describe(PACKAGE_SEARCH.options.searchLimit),
  npmFetchMetadata: z
    .boolean()
    .optional()
    .default(false)
    .describe(PACKAGE_SEARCH.options.npmFetchMetadata),
});

// Python Package Query Schema
const PythonPackageQuerySchema = BaseQuerySchema.extend({
  name: z.string().min(1).describe(PACKAGE_SEARCH.search.name),
  searchLimit: z
    .number()
    .int()
    .min(1)
    .max(10)
    .optional()
    .default(1)
    .describe(PACKAGE_SEARCH.options.searchLimit),
});

// Combined Package Search Query Schema (union of NPM and Python)
export const PackageSearchQuerySchema = z.discriminatedUnion('ecosystem', [
  NpmPackageQuerySchema.extend({
    ecosystem: z.literal('npm').describe(PACKAGE_SEARCH.search.ecosystem),
  }),
  PythonPackageQuerySchema.extend({
    ecosystem: z.literal('python').describe(PACKAGE_SEARCH.search.ecosystem),
  }),
]);

// Bulk Package Search Schema
export const PackageSearchBulkQuerySchema = createBulkQuerySchema(
  TOOL_NAMES.PACKAGE_SEARCH,
  PackageSearchQuerySchema
);

// Export types
export type NpmPackageQuery = z.infer<typeof NpmPackageQuerySchema>;
export type PythonPackageQuery = z.infer<typeof PythonPackageQuerySchema>;
export type PackageSearchQuery = z.infer<typeof PackageSearchQuerySchema>;
export type PackageSearchBulkParams = z.infer<
  typeof PackageSearchBulkQuerySchema
>;
