// CLI discovery content, rendered once here so the native binary serves
// `schema` and `<tool> --help` without Node. Everything is projected by the
// same core functions MCP uses; the binary only joins runtime availability:
// it lists enabled tools, appends a tool's clasify handoff when clasify is
// enabled, picks the clasify rendering for the enabled context tools, and
// stamps `availability`/`run` on per-tool views.
import { buildCliInstructions } from '@octocodeai/octocode-core/mcp';
import {
  CLASIFY_SCOUT_TOOL_NAMES,
  getPublicToolCatalogWithAddons,
  isBetaTool,
  projectSchemaSelection,
  schemaUsageForms,
  type SchemaJsonObject,
  type SchemaView,
} from '@octocodeai/octocode-core/schema';

type Json = SchemaJsonObject;
const VIEWS: readonly SchemaView[] = ['full', 'query', 'variants'];

/** Widest one-line help example; a longer one prints one field per line. */
const EXAMPLE_WIDTH = 100;
/** Catalog examples root absolute paths here; help shows them relative. */
const EXAMPLE_ROOT = '/ABS/repo/';

const isObject = (value: unknown): value is Json =>
  !!value && typeof value === 'object' && !Array.isArray(value);

function relativeExample(value: unknown): unknown {
  if (typeof value === 'string')
    return value.startsWith(EXAMPLE_ROOT) ? value.slice(EXAMPLE_ROOT.length) : value;
  if (Array.isArray(value)) return value.map(relativeExample);
  if (isObject(value))
    return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, relativeExample(child)]));
  return value;
}

function exampleJson(example: Json): string {
  const line = JSON.stringify(example);
  if (line.length <= EXAMPLE_WIDTH) return line;
  const fields = Object.entries(example).map(
    ([key, value]) => `    ${JSON.stringify(key)}: ${JSON.stringify(value)}`
  );
  return `{\n${fields.join(',\n')}\n  }`;
}

const shellQuote = (text: string): string => `'${text.replaceAll("'", `'\\''`)}'`;

/** Each usage form's selectors (`field=value`) and `<field>`s, deduplicated. */
function requiredForms(forms: readonly string[]): string[][] {
  const seen = new Set<string>();
  const result: string[][] = [];
  for (const form of forms) {
    const fields = [...form.matchAll(/(\w+=\S+)|<([^>]+)>/g)].map(match => match[1] ?? match[2]!);
    const key = fields.join(',');
    if (fields.length === 0 || seen.has(key)) continue;
    seen.add(key);
    result.push(fields);
  }
  return result;
}

/** What follows clap's help for `<tool> --help`: required fields and one runnable example. */
export function toolHelpSection(tool: Json, usageForms: readonly string[]): string {
  const name = String(tool.name);
  const variants = (Array.isArray(tool.variants) ? tool.variants : []).filter(isObject);
  const lines = ['Input: one query object, or {"queries":[…]} to batch.'];
  if (variants.length === 1) {
    const requires = variants[0]!.requires;
    lines.push('', `Required: ${(Array.isArray(requires) ? requires : []).join(', ')}`);
  } else if (variants.length > 1) {
    lines.push('', 'Required fields, by variant:');
    const width = Math.max(...variants.map(v => String(v.name).length));
    const requires = variants.map(v => (Array.isArray(v.requires) ? v.requires : []).join(', '));
    const requiresWidth = Math.max(...requires.map(r => r.length));
    variants.forEach((variant, index) => {
      const when = typeof variant.when === 'string' ? variant.when : '';
      lines.push(`  ${String(variant.name).padEnd(width)}  ${requires[index]!.padEnd(requiresWidth)}  ${when}`.trimEnd());
    });
  } else {
    const forms = requiredForms(usageForms);
    if (forms.length === 0) {
      lines.push('', 'Required: none; every field is optional.');
    } else if (forms.length === 1) {
      lines.push('', `Required: ${forms[0]!.join(', ')}`);
    } else {
      lines.push('', 'Required (one form):');
      for (const fields of forms) lines.push(`  ${fields.join(', ')}`);
    }
  }
  const example =
    variants.find(variant => isObject(variant.example))?.example ??
    (Array.isArray(tool.examples) ? tool.examples.find(isObject) : undefined);
  if (isObject(example)) {
    lines.push('', 'Example:', `  octocode ${name} ${shellQuote(exampleJson(relativeExample(example) as Json))}`);
  }
  lines.push('', `All fields: octocode schema ${name} --view query`);
  return lines.join('\n');
}

/** The full view's usage: the CLI invocation, then one form per query branch. */
function usageLines(tool: Json): string[] {
  const name = String(tool.name);
  const forms = schemaUsageForms(tool.querySchema);
  return [`octocode ${name} '{"queries":[ … ]}'`, ...(forms.length > 0 ? forms : [`see: octocode schema ${name} --view query`])];
}

/** Resolve a property through local `$ref`s, as `--select` does. */
function property(root: Json, branch: unknown, name: string): Json | undefined {
  if (!isObject(branch) || !isObject(branch.properties)) return undefined;
  let resolved = branch.properties[name];
  const seen = new Set<string>();
  while (isObject(resolved) && typeof resolved.$ref === 'string') {
    const reference = resolved.$ref;
    if (!reference.startsWith('#/') || seen.has(reference)) return undefined;
    seen.add(reference);
    let target: unknown = root;
    for (const token of reference.slice(2).split('/')) {
      target = isObject(target) ? target[token.replaceAll('~1', '/').replaceAll('~0', '~')] : undefined;
    }
    if (!isObject(target)) return undefined;
    const { $ref: _ref, ...rest } = resolved;
    resolved = { ...target, ...rest };
  }
  return isObject(resolved) ? resolved : undefined;
}

/** `--select` keys in the binary's canonical form: a string value bare, anything else as JSON. */
export const selectionKey = (field: string, value: unknown): string =>
  `${field}=${typeof value === 'string' ? value : JSON.stringify(value)}`;

/** Every `--select FIELD=VALUE` the query view accepts, rendered. */
function selections(tool: Json): Record<string, Json> {
  const schema = (projectSchemaSelection(tool, 'query', undefined) as Json).querySchema;
  const candidates = new Set<string>();
  const variantNames = (Array.isArray(tool.variants) ? tool.variants : [])
    .filter(isObject)
    .map(variant => String(variant.name));
  for (const name of variantNames) candidates.add(selectionKey('variant', name));
  if (isObject(schema)) {
    for (const union of ['oneOf', 'anyOf']) {
      const branches = schema[union];
      if (!Array.isArray(branches)) continue;
      for (const branch of branches) {
        if (!isObject(branch) || !isObject(branch.properties)) continue;
        for (const field of Object.keys(branch.properties)) {
          const resolved = property(schema, branch, field);
          const values = resolved?.const !== undefined ? [resolved.const] : Array.isArray(resolved?.enum) ? resolved.enum : [];
          for (const value of values) candidates.add(selectionKey(field, value));
          // Catalog labels like `match(pattern)` select a const plus a required field.
          if (values.length > 0) for (const name of variantNames) candidates.add(selectionKey(field, name));
          const required = Array.isArray(branch.required) ? branch.required.map(String) : [];
          if (typeof resolved?.const === 'string')
            for (const requirement of required) candidates.add(selectionKey(field, `${resolved.const}(${requirement})`));
        }
      }
    }
  }
  const rendered: Record<string, Json> = {};
  for (const key of [...candidates].sort()) {
    try {
      rendered[key] = projectSchemaSelection(tool, 'query', key) as Json;
    } catch {
      // Not a selector of any top-level branch; the binary reports it like core.
    }
  }
  return rendered;
}

/** A tool's `schema` views and `--select` views. */
function rendered(tool: Json): { views: Json; selections: Record<string, Json> } {
  return {
    views: Object.fromEntries(VIEWS.map(view => [view, projectSchemaSelection(tool, view, undefined, { usage: usageLines(tool) })])),
    selections: selections(tool),
  };
}

/**
 * clasify's resource schema narrows to the enabled context tools. Render the
 * two sets a CLI runs with: the default (beta tools off) and beta on.
 */
function clasifyRenderings(allNames: readonly string[]): Json[] {
  const sets = [allNames.filter(name => !isBetaTool(name)), [...allNames]];
  return sets.map(availableTools => {
    const tool = (getPublicToolCatalogWithAddons({ availableTools }).tools as readonly Json[]).find(
      candidate => candidate.name === 'clasify'
    )!;
    return {
      contextTools: CLASIFY_SCOUT_TOOL_NAMES.filter(name => availableTools.includes(name)),
      ...rendered(tool),
    };
  });
}

/** The `cli-presentation.json` the native binary embeds beside the enforcement contract. */
export function buildCliPresentation(): Json {
  const base = getPublicToolCatalogWithAddons();
  const allNames = base.tools.map(tool => String(tool.name));
  const withAll = getPublicToolCatalogWithAddons({ availableTools: allNames });
  const tools = (base.tools as readonly Json[]).map((tool, index) => {
    const name = String(tool.name);
    const description = String(tool.description);
    const full = String(withAll.tools[index]!.description);
    if (full !== description && !full.startsWith(`${description} `)) {
      throw new Error(`${name}: the clasify addon no longer appends to the description`);
    }
    const handoff = full === description ? undefined : full.slice(description.length + 1);
    return {
      name,
      shortDescription: String(tool.shortDescription),
      ...(handoff && { handoff }),
      variantNames: (Array.isArray(tool.variants) ? tool.variants : []).filter(isObject).map(v => String(v.name)),
      help: toolHelpSection(tool, schemaUsageForms(tool.querySchema)),
      ...(name === 'clasify' ? { renderings: clasifyRenderings(allNames) } : rendered(tool)),
    };
  });
  return {
    fingerprint: base.fingerprint,
    instructions: buildCliInstructions(),
    clasifyContextTools: [...CLASIFY_SCOUT_TOOL_NAMES],
    tools,
  };
}
