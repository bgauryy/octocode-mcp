type TypeBoxBuilder = (typeof import('typebox'))['Type'];

/**
 * Build a TypeBox string-enum schema for tool registration.
 */
export function stringEnumSchema(
  Type: TypeBoxBuilder,
  values: readonly string[],
  description: string,
): Record<string, unknown> {
  return Type.Unsafe({ type: 'string', enum: [...values], description });
}
