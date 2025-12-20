import { z } from 'zod';
import { BaseQuerySchema, createBulkQuerySchema } from './baseSchema.js';
import { PACKAGE_SEARCH, TOOL_NAMES } from '../tools/toolMetadata.js';

// Shared fields for all package queries
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

// NPM Package Query Schema - flat definition to avoid deep inheritance
const NpmPackageQuerySchema = BaseQuerySchema.extend({
  ...PackageBaseFields,
  ecosystem: z.literal('npm').describe(PACKAGE_SEARCH.search.ecosystem),
  npmFetchMetadata: z
    .boolean()
    .optional()
    .default(false)
    .describe(PACKAGE_SEARCH.options.npmFetchMetadata),
});

// Python Package Query Schema - flat definition to avoid deep inheritance
const PythonPackageQuerySchema = BaseQuerySchema.extend({
  ...PackageBaseFields,
  ecosystem: z.literal('python').describe(PACKAGE_SEARCH.search.ecosystem),
  pythonFetchMetadata: z
    .boolean()
    .optional()
    .default(false)
    .describe(PACKAGE_SEARCH.options.pythonFetchMetadata),
});

// Combined Package Search Query Schema (union of NPM and Python)
// Using pre-built schemas instead of .extend() inside discriminatedUnion
export const PackageSearchQuerySchema = z.discriminatedUnion('ecosystem', [
  NpmPackageQuerySchema,
  PythonPackageQuerySchema,
]);

// Export types - explicit type definitions to avoid deep inference
export type NpmPackageQuery = z.infer<typeof NpmPackageQuerySchema>;
export type PythonPackageQuery = z.infer<typeof PythonPackageQuerySchema>;
export type PackageSearchQuery = NpmPackageQuery | PythonPackageQuery;
export type PackageSearchBulkParams = {
  queries: PackageSearchQuery[];
};

// Bulk Package Search Schema
export const PackageSearchBulkQuerySchema = createBulkQuerySchema(
  TOOL_NAMES.PACKAGE_SEARCH,
  PackageSearchQuerySchema
);
