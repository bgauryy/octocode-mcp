/**
 * Zod schemas for configuration file validation.
 *
 * Provides structural validation for parsed config files before they reach
 * the detailed field-level validator. Uses .passthrough() to allow unknown
 * keys (the existing validator handles unknown key warnings).
 */

import { z } from 'zod';

/**
 * Permissive schema for OctocodeConfig structure.
 * Validates top-level shape and version type. Section-level objects are
 * kept as z.record(z.unknown()) since the manual validator handles
 * detailed field validation.
 */
export const OctocodeConfigSchema = z
  .object({
    $schema: z.string().optional(),
    version: z.number().int().optional(),
    github: z.record(z.unknown()).optional(),
    gitlab: z.record(z.unknown()).optional(),
    local: z.record(z.unknown()).optional(),
    tools: z.record(z.unknown()).optional(),
    network: z.record(z.unknown()).optional(),
    telemetry: z.record(z.unknown()).optional(),
    lsp: z.record(z.unknown()).optional(),
  })
  .passthrough();
