// CLI discovery content, rendered once here so the native binary serves
// `schema`, `catalog` field lists and `<tool> --help` without Node. Every
// schema view is a core Zod schema emitted once as JSON: `query` is the row
// MCP lists, `full` the canonical row with unavailable addons omitted, and
// each `--select operation=X` that operation's row. `query` also lists the
// continuation fields the published row hides, one line each, and names the
// other accepted fields it hides (per operation, or the whole row's) with
// the `--select` or `--view full` call that shows their schemas.
import { buildCliInstructions } from '@octocodeai/octocode-core/mcp';
import {
  buildEnforcementContractIr,
  CLASIFY_SOURCE_TOOL_NAMES,
  DIRECT_TOOL_DEFINITIONS,
  getPublicToolCatalog,
  getDirectToolDefinitionsWithAddons,
  getPublicToolCatalogWithAddons,
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
  const fields = Object.entries(example).map(
    ([key, value]) => `    ${JSON.stringify(key)}: ${JSON.stringify(value)}`
  );
  return `{\n${fields.join(',\n')}\n  }`;
}

const shellQuote = (text: string): string =>
  `'${text.replaceAll("'", `'\\''`)}'`;

/** What follows clap's help for `<tool> --help`: required fields and one runnable example (workspace-relative, from the variant's Zod `examples` meta). */
export function toolHelpSection(
  name: string,
  availableTools?: readonly string[]
): string {
  const variants = getToolSchemaVariants(name);
  const lines = ['Input: one query object, or {"queries":[…]} to batch.'];
  if (variants.length === 1) {
    lines.push(
      '',
      `Required: ${variants[0]!.requires.join(', ') || 'none; every field is optional.'}`
    );
  } else if (variants.length > 1) {
    lines.push('', 'Required fields, by operation:');
    const forms = variants.map(variant => ({
      ...variant,
      label:
        typeof variant.example?.operation === 'string'
          ? variant.example.operation
          : variant.name,
    }));
    const width = Math.max(...forms.map(form => form.label.length));
    for (const form of forms)
      lines.push(
        `  ${form.label.padEnd(width)}  ${form.requires.join(', ')}`.trimEnd()
      );
  }
  const example = variants
    .map(variant => variant.example)
    .find(
      candidate =>
        candidate !== undefined &&
        (!availableTools ||
          exampleUsesAvailableTools(candidate, availableTools))
    );
  if (example)
    lines.push(
      '',
      'Example:',
      `  octocode ${name} ${shellQuote(exampleJson(example))}`
    );
  lines.push('', `All fields: octocode schema ${name}`);
  return lines.join('\n');
}

/** A clasify example's source names an exposed reader (a URL reads back through localFetch). */
function exampleUsesAvailableTools(
  example: Json,
  availableTools: readonly string[]
): boolean {
  const source = example.source as Json | undefined;
  if (!source) return true;
  const reader = typeof source.tool === 'string' ? source.tool : 'localFetch';
  return availableTools.includes(reader);
}

/** Every subset of clasify's source readers, as the key the CLI selects by. */
function sourceSubsets(): string[][] {
  return CLASIFY_SOURCE_TOOL_NAMES.reduce<string[][]>(
    (subsets, tool) => [
      ...subsets,
      ...subsets.map(subset => [...subset, tool]),
    ],
    [[]]
  );
}

/**
 * The `catalog` row's compact field list: the published fields of each row
 * form, required first (`*`) then optional (`?`), truncated with `…`. A tool
 * with several forms labels each by its variant name and leaves the
 * `operation` discriminator to the label: `match:rule[path*, rule*, …] | …`.
 */
export function compactFields(definition: Definition): string {
  const forms = publishedFormFields(definition.inputSchema);
  const list = (
    fields: readonly { name: string; required: boolean }[],
    max: number
  ): string => {
    const shown = fields
      .slice(0, max)
      .map(field => `${field.name}${field.required ? '*' : '?'}`);
    if (fields.length > max) shown.push('…');
    return `[${shown.join(', ')}]`;
  };
  if (forms.length === 1) return list(forms[0]!, CATALOG_FIELDS_SINGLE);
  const names = getToolSchemaVariants(definition.name).map(
    variant => variant.name
  );
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
const view = (
  definition: Definition,
  querySchema: Json,
  extra: Json = {}
): Json => ({
  name: definition.name,
  description: definition.description,
  querySchema,
  ...extra,
});

const fieldNames = (schema: Json): string[] =>
  Object.keys((schema.properties as Json | undefined) ?? {});

/**
 * Each tool's `operation_controls` rule from the enforcement contract:
 * field → the operations that take it. The runtime rejects the field on any
 * other operation, so no per-operation view lists it there.
 */
const OPERATION_CONTROLS: Record<
  string,
  Record<string, string[]>
> = Object.fromEntries(
  buildEnforcementContractIr().tools.flatMap(tool =>
    (tool.rules as readonly { opcode: string; args?: unknown }[])
      .filter(rule => rule.opcode === 'operation_controls')
      .map(rule => [
        tool.name,
        (rule.args as { fields: Record<string, string[]> }).fields,
      ])
  )
);

/**
 * One operation's published row: a variant shared by several operations is
 * narrowed to `operation`, without the fields the runtime rejects on it.
 */
function operationRow(tool: string, operation: string, schema: Json): Json {
  const controls = OPERATION_CONTROLS[tool] ?? {};
  const takes = (field: string): boolean =>
    controls[field]?.includes(operation) ?? true;
  const properties = Object.fromEntries(
    Object.entries((schema.properties as Json | undefined) ?? {})
      .filter(([field]) => takes(field))
      .map(([field, value]) => {
        if (field !== 'operation') return [field, value];
        const { default: _default, ...discriminator } = value as Json;
        return [field, { ...discriminator, enum: [operation] }];
      })
  );
  return {
    ...schema,
    properties,
    ...(Array.isArray(schema.required) && {
      required: (schema.required as string[]).filter(takes),
    }),
  };
}

/**
 * The accepted fields the `query` view's row leaves out beyond its
 * continuation fields and the request brief, by name only: per operation
 * with the `--select` call that shows them, or for a one-form tool with the
 * `--view full` call. Empty when the row shows every field.
 */
function hiddenFields(
  definition: Definition,
  row: Json,
  continuation: Json,
  canonical: Json
): Json {
  const { name, inputSchema } = definition;
  const shown = new Set([
    ...fieldNames(row),
    ...Object.keys(continuation),
    'mainGoal',
    'reasoning',
  ]);
  const hidden = (schema: Json): string[] =>
    fieldNames(schema).filter(field => !shown.has(field));
  const operations = Object.entries(operationSchemas(inputSchema));
  if (operations.length > 0) {
    const byOperation = Object.fromEntries(
      operations
        .map(
          ([operation, schema]) =>
            [
              operation,
              hidden(operationRow(name, operation, publishedJson(schema))),
            ] as const
        )
        .filter(([, fields]) => fields.length > 0)
    );
    return Object.keys(byOperation).length === 0
      ? {}
      : {
          operationFields: byOperation,
          select: `octocode schema ${name} --view query --select operation=<operation> shows that operation's fields`,
        };
  }
  const more = hidden(canonical);
  return more.length === 0
    ? {}
    : {
        moreFields: more,
        full: `octocode schema ${name} --view full shows every field`,
      };
}

/**
 * The fields MCP publishes beside `queries` (the request envelope), as
 * schemas: a row view shows one query, so these are listed next to it.
 */
function envelopeFields(inputSchema: Definition['inputSchema']): Json {
  const { queries: _queries, ...fields } = (publishedInputSchema(inputSchema)
    .properties ?? {}) as Json;
  return Object.keys(fields).length === 0 ? {} : { envelopeFields: fields };
}

/** A tool's `schema` views and `--select operation=X` views. */
function rendered(
  definition: Definition,
  querySchema: Json
): { views: Json; selections: Json } {
  const { name, inputSchema } = definition;
  const variants = getToolSchemaVariants(name);
  // Core's presentation catalog owns any availability-dependent row changes.
  const { $schema: _schema, ...canonical } = querySchema;
  const row = publishedInputSchema(inputSchema, 'row');
  // The row hides the fields a `next.*` page or `hints.*` lead fills; name them once here.
  const continuation = continuationFields(inputSchema);
  const envelope = envelopeFields(inputSchema);
  return {
    views: {
      query: view(definition, row, {
        ...envelope,
        continuationFields: continuation,
        ...hiddenFields(definition, row, continuation, canonical),
      }),
      full: view(definition, canonical, {
        ...envelope,
        usage: [`octocode ${name} '{"queries":[ … ]}'`],
      }),
      variants: { name, description: definition.description, variants },
    },
    selections: Object.fromEntries(
      Object.entries(operationSchemas(inputSchema)).map(
        ([operation, schema]) => [
          `operation=${operation}`,
          view(
            definition,
            operationRow(name, operation, publishedJson(schema))
          ),
        ]
      )
    ),
  };
}

/** The `cli-presentation.json` the native binary embeds beside the enforcement contract. */
export function buildCliPresentation(): Json {
  const availableTools = DIRECT_TOOL_DEFINITIONS.map(tool => tool.name);
  const definitions = getDirectToolDefinitionsWithAddons({ availableTools });
  const rankedDefinitions = getDirectToolDefinitionsWithAddons({
    availableTools,
    selection: true,
  });
  const catalog = getPublicToolCatalogWithAddons({ availableTools });
  const rankedCatalog = getPublicToolCatalogWithAddons({
    availableTools,
    selection: true,
  });
  return {
    fingerprint: getPublicToolCatalog().fingerprint,
    instructions: {
      ordinary: buildCliInstructions(),
      selection: buildCliInstructions({ selection: true }),
      clasify: buildCliInstructions({ availableTools: ['clasify'] }),
      both: buildCliInstructions({
        availableTools: ['clasify'],
        selection: true,
      }),
    },
    clasifySourceTools: [...CLASIFY_SOURCE_TOOL_NAMES],
    tools: definitions.map(definition => {
      const { name } = definition;
      const querySchema = catalog.tools.find(tool => tool.name === name)!
        .querySchema as Json;
      const rankedSchema = rankedCatalog.tools.find(tool => tool.name === name)!
        .querySchema as Json;
      const rankedDefinition = rankedDefinitions.find(
        tool => tool.name === name
      )!;
      return {
        name,
        shortDescription: definition.shortDescription,
        variantNames: Object.keys(operationSchemas(definition.inputSchema)),
        fields: compactFields(definition),
        help: toolHelpSection(name, name === 'clasify' ? [] : undefined),
        ...rendered(definition, querySchema),
        // clasify's views for each exposed set of source readers, keyed by
        // the exposed readers in CLASIFY_SOURCE_TOOL_NAMES order.
        ...(name === 'clasify' && {
          sourceViews: Object.fromEntries(
            sourceSubsets().map(subset => [
              subset.join(','),
              rendered(
                getDirectToolDefinitionsWithAddons({
                  availableTools: subset,
                }).find(tool => tool.name === name)!,
                getPublicToolCatalogWithAddons({
                  availableTools: subset,
                }).tools.find(tool => tool.name === name)!.querySchema as Json
              ),
            ])
          ),
        }),
        // Emit only changed views; Rust selects them using native runtime truth.
        ...(JSON.stringify(querySchema) !== JSON.stringify(rankedSchema) && {
          selection: {
            fields: compactFields(rankedDefinition),
            ...rendered(rankedDefinition, rankedSchema),
          },
        }),
      };
    }),
  };
}
