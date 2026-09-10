// Derives each tool's CLI flag surface from its canonical JSON schema — the
// exact schema MCP serves — so flags never drift from validation. Consumed by
// flags-to-query.ts, which parses argv against this table.
import { formatDirectToolSchemaText } from '@octocodeai/octocode-core/schema';

export type FieldKind = 'string' | 'number' | 'boolean' | 'array' | 'object';

export interface FieldSpec {
  /** Canonical camelCase field name from the schema. */
  name: string;
  kind: FieldKind;
  /** For arrays: the item kind (string/number/boolean). */
  itemKind?: Exclude<FieldKind, 'array' | 'object'>;
  /** For objects: sub-field specs keyed by camelCase name. */
  children?: Map<string, FieldSpec>;
  /** True when built from a schema carrying an explicit type. */
  typed?: boolean;
}

export interface ToolFlagTable {
  /** camelCase field name → spec (union across all schema variants). */
  fields: Map<string, FieldSpec>;
  /**
   * Discriminator const value → the field it selects (e.g. "tree" →
   * operation). Lets `tools astSearch tree` pick the variant positionally.
   */
  discriminators: Map<string, { field: string; value: string }>;
}

type JsonSchema = Record<string, unknown>;

function asRecord(value: unknown): JsonSchema | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as JsonSchema)
    : undefined;
}

function schemaKind(schema: JsonSchema): FieldKind {
  const type = schema.type;
  if (type === 'integer' || type === 'number') return 'number';
  if (type === 'boolean') return 'boolean';
  if (type === 'array') return 'array';
  if (type === 'object') return 'object';
  // enum / const / anyOf-of-strings / untyped: treat as string passthrough —
  // canonical validation still enforces the real constraint.
  return 'string';
}

/**
 * Variants that forbid a field serialize it as a negated schema ({"not":{}}).
 * Those carry no shape information and must never win the cross-variant merge.
 */
function isNegatedSchema(schema: JsonSchema): boolean {
  return 'not' in schema && schema.type === undefined;
}

function buildFieldSpec(name: string, schema: JsonSchema): FieldSpec {
  const kind = schemaKind(schema);
  const typed = schema.type !== undefined;
  if (kind === 'array') {
    const items = asRecord(schema.items) ?? {};
    const itemKind = schemaKind(items);
    return {
      name,
      kind,
      itemKind:
        itemKind === 'array' || itemKind === 'object' ? 'string' : itemKind,
      typed,
    };
  }
  if (kind === 'object') {
    const children = new Map<string, FieldSpec>();
    const properties = asRecord(schema.properties) ?? {};
    for (const [childName, childSchema] of Object.entries(properties)) {
      const child = asRecord(childSchema);
      if (child && !isNegatedSchema(child)) {
        children.set(childName, buildFieldSpec(childName, child));
      }
    }
    return { name, kind, children, typed };
  }
  return { name, kind, typed };
}

function variantSchemas(items: JsonSchema): JsonSchema[] {
  for (const key of ['oneOf', 'anyOf'] as const) {
    const list = items[key];
    if (Array.isArray(list) && list.length > 0) {
      return list.flatMap(entry => {
        const record = asRecord(entry);
        return record ? [record] : [];
      });
    }
  }
  return [items];
}

/** Derive the flag surface for one tool from its canonical JSON schema. */
export function getToolFlagTable(toolName: string): ToolFlagTable {
  const schema = asRecord(JSON.parse(formatDirectToolSchemaText(toolName)));
  const items = asRecord(
    asRecord(asRecord(schema?.properties)?.queries)?.items
  );
  const fields = new Map<string, FieldSpec>();
  const discriminators = new Map<string, { field: string; value: string }>();
  if (!items) return { fields, discriminators };

  for (const variant of variantSchemas(items)) {
    const properties = asRecord(variant.properties) ?? {};
    for (const [name, rawFieldSchema] of Object.entries(properties)) {
      const fieldSchema = asRecord(rawFieldSchema);
      if (!fieldSchema || isNegatedSchema(fieldSchema)) continue;
      const existing = fields.get(name);
      if (!existing) {
        fields.set(name, buildFieldSpec(name, fieldSchema));
      } else if (!existing.typed && fieldSchema.type !== undefined) {
        // A later variant carries the real shape; the earlier one was untyped.
        fields.set(name, buildFieldSpec(name, fieldSchema));
      } else if (existing.kind === 'object') {
        // Merge object sub-fields that only exist on other variants.
        const extra = buildFieldSpec(name, fieldSchema);
        for (const [childName, child] of extra.children ?? []) {
          if (!existing.children?.has(childName)) {
            existing.children?.set(childName, child);
          }
        }
      }
      const constValue = fieldSchema.const;
      if (typeof constValue === 'string') {
        const known = discriminators.get(constValue);
        if (!known) {
          discriminators.set(constValue, { field: name, value: constValue });
        } else if (known.field !== name) {
          // The same literal selects different fields across variants —
          // ambiguous as a positional, so require the explicit flag.
          discriminators.delete(constValue);
        }
      }
    }
  }
  return { fields, discriminators };
}

export function toKebabCase(name: string): string {
  return name.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
}

export function toCamelCase(flag: string): string {
  return flag.replace(/-([a-z0-9])/g, (_, ch: string) => ch.toUpperCase());
}
