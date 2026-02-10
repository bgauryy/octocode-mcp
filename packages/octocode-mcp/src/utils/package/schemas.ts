/**
 * Zod schemas for npm CLI output validation.
 *
 * Validates parsed JSON from npm view/search/deprecation commands
 * before type-asserting to internal interfaces.
 */

import { z } from 'zod';

// ============================================================================
// NPM VIEW RESULT
// ============================================================================

/**
 * Schema for `npm view <pkg> --json` output.
 * Permissive: requires name+version, rest is optional.
 */
export const NpmViewResultSchema = z
  .object({
    name: z.string(),
    version: z.string(),
    repository: z
      .union([
        z.string(),
        z.object({ url: z.string().optional(), type: z.string().optional() }),
      ])
      .optional(),
    main: z.string().optional(),
    types: z.string().optional(),
    typings: z.string().optional(),
    description: z.string().optional(),
    keywords: z.array(z.string()).optional(),
    license: z
      .union([z.string(), z.object({ type: z.string().optional() })])
      .optional(),
    homepage: z.string().optional(),
    author: z
      .union([
        z.string(),
        z.object({
          name: z.string().optional(),
          email: z.string().optional(),
          url: z.string().optional(),
        }),
      ])
      .optional(),
    maintainers: z
      .array(
        z.object({ name: z.string().optional(), email: z.string().optional() })
      )
      .optional(),
    engines: z.record(z.string()).optional(),
    dependencies: z.record(z.string()).optional(),
    devDependencies: z.record(z.string()).optional(),
    peerDependencies: z.record(z.string()).optional(),
    time: z.record(z.string().optional()).optional(),
  })
  .passthrough();

// ============================================================================
// NPM SEARCH RESULT
// ============================================================================

/**
 * Schema for `npm search <query> --json` output (array element).
 */
export const NpmCliSearchResultSchema = z.object({
  name: z.string(),
  version: z.string(),
  links: z
    .object({
      npm: z.string().optional(),
      homepage: z.string().optional(),
      repository: z.string().optional(),
    })
    .optional(),
});

/**
 * Schema for the full npm search output (array of results).
 */
export const NpmSearchOutputSchema = z.array(NpmCliSearchResultSchema);

// ============================================================================
// NPM DEPRECATION
// ============================================================================

/**
 * Schema for `npm view <pkg> deprecated --json` output.
 * Can be a string message or other JSON value.
 */
export const NpmDeprecationOutputSchema = z.union([
  z.string(),
  z.boolean(),
  z.number(),
  z.null(),
  z.record(z.unknown()),
]);
