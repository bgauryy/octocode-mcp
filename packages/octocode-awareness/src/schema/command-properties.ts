/** Fields available at the request root, including discriminated command variants.
 * This is for binding/coercion only; validation keeps the complete union schema.
 */
export function commandSchemaProperties(schema: Readonly<Record<string, unknown>>): Record<string, Record<string, unknown>> {
  const properties = { ...schema.properties as Record<string, Record<string, unknown>> | undefined };
  for (const kind of ['oneOf', 'anyOf', 'allOf']) {
    const branches = schema[kind];
    if (Array.isArray(branches)) {
      for (const branch of branches) Object.assign(properties, commandSchemaProperties(branch));
    }
  }
  return properties;
}
