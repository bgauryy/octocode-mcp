/**
 * Shared schema-building helpers used by tool registration functions.
 * Pure JSON Schema output — no TypeBox or Zod needed at the call site.
 */

/**
 * Build a plain JSON Schema string-enum with description.
 * Prefer z.enum([...]).describe('...') in new Zod-based schemas;
 * this helper remains for cases that compose raw JSON Schema objects.
 */
export function stringEnumSchema(
  values: readonly string[],
  description: string,
): Record<string, unknown> {
  return { type: 'string', enum: [...values], description };
}
