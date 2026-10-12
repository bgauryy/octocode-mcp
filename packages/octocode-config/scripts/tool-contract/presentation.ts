// CLI discovery content, rendered once here so the native binary serves
// `schema`, `catalog` field lists and `<tool> --help` without Node. Every
// schema view is a core Zod schema emitted once as JSON: `query` is the row
// MCP lists, `full` the canonical row the enforcement contract carries, and
// each `--select operation=X` that operation's row. `query` also lists the
// continuation fields the published row hides, one line each, and names the
// other accepted fields it hides (per operation, or the whole row's) with
// the `--select` or `--view full` call that shows their schemas.
import { buildCliInstructions } from '@octocodeai/octocode-core/mcp';
import {
  CLASIFY_SCOUT_TOOL_NAMES,
  DIRECT_TOOL_DEFINITIONS,
  getPublicToolCatalog,
  continuationFields,
  getToolSchemaVariants,
  operationSchemas,
  publishedFormFields,
  publishedInputSchema,
  publishedJson,
} from '@octocodeai/octocode-core/schema';

type Json = Record<string, unknown>;
type Definition = (typeof DIRECT_TOOL_DEFINITIONS)[number];

/** Widest one-line help example; a longer one prints one field per line. */
const EXAMPLE_WIDTH = 100;
/** Fields a `catalog` row lists: more for a tool with one row form. */
const CATALOG_FIELDS_SINGLE = 8;
const CATALOG_FIELDS_PER_FORM = 6;

function exampleJson(example: Json): string {
  const line = JSON.stringify(example);
  if (line.length <= EXAMPLE_WIDTH) return line;
  const fields = Object.entries(example).map(([key, value]) => `    ${JSON.stringify(key)}: ${JSON.stringify(value)}`);
  return `{\n${fields.join(',\n')}\n  }`;
}

const shellQuote = (text: string): string => `'${text.replaceAll("'", `'\\''`)}'`;

/** What follows clap's help for `<tool> --help`: required fields and one runnable example (workspace-relative, from the variant's Zod `examples` meta). */
export function toolHelpSection(name: string): string {
  const variants = getToolSchemaVariants(name);
  const lines = ['Input: one query object, or {"queries":[…]} to batch.'];
  if (variants.length === 1) {
    lines.push('', `Required: ${variants[0]!.requires.join(', ') || 'none; every field is optional.'}`);
  } else if (variants.length > 1) {
    lines.push('', 'Required fields, by operation:');
    const width = Math.max(...variants.map(variant => variant.name.length));
    for (const variant of variants) lines.push(`  ${variant.name.padEnd(width)}  ${variant.requires.join(', ')}`.trimEnd());
  }
  const example = variants.map(variant => variant.example).find(candidate => candidate !== undefined);
  if (example)
    lines.push('', 'Example:', `  octocode ${name} ${shellQuote(exampleJson(example))}`);
  lines.push('', `All fields: octocode schema ${name}`);
  return lines.join('\n');
}

/**
 * The `catalog` row's compact field list: the published fields of each row
 * form, required first (`*`) then optional (`?`), truncated with `…`. A tool
 * with several forms labels each by its variant name and leaves the
 * `operation` discriminator to the label: `match:rule[path*, rule*, …] | …`.
 */
export function compactFields(definition: Definition): string {
  const forms = publishedFormFields(definition.inputSchema);
  const list = (fields: readonly { name: string; required: boolean }[], max: number): string => {
    const shown = fields.slice(0, max).map(field => `${field.name}${field.required ? '*' : '?'}`);
    if (fields.length > max) shown.push('…');
    return `[${shown.join(', ')}]`;
  };
  if (forms.length === 1) return list(forms[0]!, CATALOG_FIELDS_SINGLE);
  const names = getToolSchemaVariants(definition.name).map(variant => variant.name);
  return forms
    .map(
      (fields, index) =>
        `${names[index]}${list(
          fields.filter(field => field.name !== 'operation'),
          CATALOG_FIELDS_PER_FORM
        )}`
    )
    .join(' | ');
}

/** One `schema` view: the tool's description beside one emitted row schema. */
const view = (definition: Definition, querySchema: Json, extra: Json = {}): Json => ({
  name: definition.name,
  description: definition.description,
  querySchema,
  ...extra,
});

const fieldNames = (schema: Json): string[] => Object.keys((schema.properties as Json | undefined) ?? {});

/**
 * The accepted fields the `query` view's row leaves out beyond its
 * continuation fields and the request brief, by name only: per operation
 * with the `--select` call that shows them, or for a one-form tool with the
 * `--view full` call. Empty when the row shows every field.
 */
function hiddenFields(definition: Definition, row: Json, continuation: Json, canonical: Json): Json {
  const { name, inputSchema } = definition;
  const shown = new Set([...fieldNames(row), ...Object.keys(continuation), 'mainGoal', 'reasoning']);
  const hidden = (schema: Json): string[] => fieldNames(schema).filter(field => !shown.has(field));
  const operations = Object.entries(operationSchemas(inputSchema));
  if (operations.length > 0) {
    const byOperation = Object.fromEntries(
      operations
        .map(([operation, schema]) => [operation, hidden(publishedJson(schema))] as const)
        .filter(([, fields]) => fields.length > 0)
    );
    return Object.keys(byOperation).length === 0
      ? {}
      : {
          operationFields: byOperation,
          select: `octocode schema ${name} --select operation=<operation> shows that operation's fields`,
        };
  }
  const more = hidden(canonical);
  return more.length === 0
    ? {}
    : { moreFields: more, full: `octocode schema ${name} --view full shows every field` };
}

/** A tool's `schema` views and `--select operation=X` views. */
function rendered(definition: Definition): { views: Json; selections: Json } {
  const { name, inputSchema } = definition;
  const variants = getToolSchemaVariants(name);
  // The canonical row is the enforcement contract's `querySchema`, emitted once.
  const { $schema: _schema, ...canonical } = getPublicToolCatalog().tools.find(tool => tool.name === name)!
    .querySchema as Json;
  const row = publishedInputSchema(inputSchema, 'row');
  // The row hides the fields a `next.*` page or `hints.*` lead fills; name them once here.
  const continuation = continuationFields(inputSchema);
  return {
    views: {
      query: view(definition, row, {
        continuationFields: continuation,
        ...hiddenFields(definition, row, continuation, canonical),
      }),
      full: view(definition, canonical, { usage: [`octocode ${name} '{"queries":[ … ]}'`] }),
      variants: { name, description: definition.description, variants },
    },
    selections: Object.fromEntries(
      Object.entries(operationSchemas(inputSchema)).map(([operation, schema]) => [
        `operation=${operation}`,
        view(definition, publishedJson(schema)),
      ])
    ),
  };
}

/** The `cli-presentation.json` the native binary embeds beside the enforcement contract. */
export function buildCliPresentation(): Json {
  return {
    fingerprint: getPublicToolCatalog().fingerprint,
    instructions: buildCliInstructions(),
    clasifyContextTools: [...CLASIFY_SCOUT_TOOL_NAMES],
    tools: DIRECT_TOOL_DEFINITIONS.map(definition => ({
      name: definition.name,
      shortDescription: definition.shortDescription,
      variantNames: Object.keys(operationSchemas(definition.inputSchema)),
      fields: compactFields(definition),
      help: toolHelpSection(definition.name),
      ...rendered(definition),
    })),
  };
}
