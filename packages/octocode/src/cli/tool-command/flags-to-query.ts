// Schema-driven flag input for `tools <name>`: turns ordinary CLI flags into
// the exact single-query JSON the MCP tool schema expects, so humans never
// hand-write JSON. The flag surface is DERIVED from each tool's canonical
// schema (the same one MCP serves) — new fields become flags automatically and
// nothing here can drift from validation, which still runs through
// prepareDirectToolInput* like every other input path.
import { DirectToolInputError } from '@octocodeai/octocode-tools-core/schema';
import {
  getToolFlagTable,
  toCamelCase,
  toKebabCase,
  type FieldSpec,
  type ToolFlagTable,
} from './flag-table.js';

export { getToolFlagTable, type ToolFlagTable } from './flag-table.js';

/**
 * Flags owned by the CLI runtime, never treated as tool fields. `--format` is
 * deliberately absent: its only runtime meaning (`--format tool`) is handled
 * and returned from before flag parsing, so here it can serve tools that have
 * a real `format` field (lspSearch).
 */
export const TOOL_RUNTIME_FLAGS = new Set([
  'queries',
  'json',
  'yaml',
  'text',
  'help',
  'version',
  'scheme',
  'brief',
  'compact',
  'pretty',
  'full',
  'no-color',
]);

/** Runtime flags that consume a value. */
const TOOL_RUNTIME_VALUE_FLAGS = new Set(['queries']);

function convertScalar(
  spec: Pick<FieldSpec, 'kind' | 'name'>,
  value: string,
  flag: string
): unknown {
  if (spec.kind === 'number') {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
      throw new DirectToolInputError(
        `--${flag} expects a number, got "${value}".`
      );
    }
    return parsed;
  }
  if (spec.kind === 'boolean') {
    if (value === 'true') return true;
    if (value === 'false') return false;
    throw new DirectToolInputError(
      `--${flag} is a boolean; use --${flag} or --${flag}=false.`
    );
  }
  return value;
}

interface FlagTarget {
  spec: FieldSpec;
  /** Set for object sub-fields: --size-greater → parent "size", child "greater". */
  parent?: FieldSpec;
}

function resolveFlag(
  table: ToolFlagTable,
  flag: string
): FlagTarget | undefined {
  const camel = toCamelCase(flag);
  const direct = table.fields.get(camel) ?? table.fields.get(flag);
  if (direct) return { spec: direct };
  // Object sub-fields: longest matching "<parent>-<child>" wins.
  for (const [name, spec] of table.fields) {
    if (spec.kind !== 'object' || !spec.children) continue;
    const prefix = `${toKebabCase(name)}-`;
    if (!flag.startsWith(prefix)) continue;
    const childCamel = toCamelCase(flag.slice(prefix.length));
    const child = spec.children.get(childCamel);
    if (child) return { spec: child, parent: spec };
  }
  return undefined;
}

function allFlagNames(table: ToolFlagTable): string[] {
  const names: string[] = [];
  for (const [name, spec] of table.fields) {
    if (spec.kind === 'object' && spec.children) {
      for (const childName of spec.children.keys()) {
        names.push(`${toKebabCase(name)}-${toKebabCase(childName)}`);
      }
    } else {
      names.push(toKebabCase(name));
    }
  }
  return names.sort();
}

function editDistance(a: string, b: string): number {
  const dist = Array.from({ length: a.length + 1 }, (_, i) =>
    Array.from({ length: b.length + 1 }, (_, j) =>
      i === 0 ? j : j === 0 ? i : 0
    )
  );
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dist[i][j] = Math.min(
        dist[i - 1][j] + 1,
        dist[i][j - 1] + 1,
        dist[i - 1][j - 1] + cost
      );
    }
  }
  return dist[a.length][b.length];
}

function unknownFlagError(
  toolName: string,
  flag: string,
  table: ToolFlagTable
): DirectToolInputError {
  const names = allFlagNames(table);
  let best: string | undefined;
  let bestScore = Infinity;
  for (const name of names) {
    const score = editDistance(flag, name);
    if (score < bestScore) {
      bestScore = score;
      best = name;
    }
  }
  const details = [
    ...(best !== undefined && bestScore <= 3
      ? [`Did you mean --${best}?`]
      : []),
    `Run tools ${toolName} --scheme --brief to see valid fields.`,
  ];
  return new DirectToolInputError(
    `Unknown ${toolName} flag: --${flag}.`,
    details
  );
}

function assign(
  query: Record<string, unknown>,
  target: FlagTarget,
  rawValue: string | undefined,
  flag: string
): void {
  const { spec, parent } = target;
  const container = parent
    ? ((query[parent.name] ??= {}) as Record<string, unknown>)
    : query;

  if (spec.kind === 'array') {
    if (rawValue === undefined) {
      throw new DirectToolInputError(
        `--${flag} expects a value (repeat the flag for multiple).`
      );
    }
    const itemSpec = {
      kind: spec.itemKind ?? 'string',
      name: spec.name,
    } as const;
    const existing = container[spec.name];
    const list = Array.isArray(existing) ? existing : [];
    list.push(convertScalar(itemSpec, rawValue, flag));
    container[spec.name] = list;
    return;
  }
  if (spec.kind === 'boolean' && rawValue === undefined) {
    container[spec.name] = true;
    return;
  }
  if (rawValue === undefined) {
    throw new DirectToolInputError(`--${flag} expects a value.`);
  }
  container[spec.name] = convertScalar(spec, rawValue, flag);
}

/**
 * True when the tail carries schema-flag input (a positional variant selector
 * or any non-runtime flag) — i.e. the user chose flags over --queries.
 */
export function hasToolFlagInput(tail: readonly string[]): boolean {
  for (let i = 0; i < tail.length; i++) {
    const token = tail[i];
    if (token === '--') continue;
    if (token.startsWith('--')) {
      const key = token.slice(2).split('=')[0];
      if (TOOL_RUNTIME_FLAGS.has(key)) {
        if (token.includes('=') === false && TOOL_RUNTIME_VALUE_FLAGS.has(key))
          i++;
        continue;
      }
      return true;
    }
    return true; // bare positional after the tool name
  }
  return false;
}

/**
 * The argv slice after `tools <name>`. Prefers the raw argv (order and
 * repeats preserved); reconstructs from parsed options when raw is absent.
 */
export function extractToolArgvTail(
  raw: readonly string[] | undefined,
  toolName: string,
  parsed: { args: string[]; options: Record<string, string | boolean> }
): string[] {
  if (raw) {
    const start = raw.indexOf(toolName);
    if (start !== -1) return raw.slice(start + 1);
  }
  const tail: string[] = parsed.args.slice(parsed.args.indexOf(toolName) + 1);
  for (const [key, value] of Object.entries(parsed.options)) {
    if (TOOL_RUNTIME_FLAGS.has(key)) continue;
    tail.push(value === true ? `--${key}` : `--${key}=${String(value)}`);
  }
  return tail;
}

/** Parse a schema-flag tail into the tool's single-query payload. */
export function buildQueryFromFlags(
  toolName: string,
  tail: readonly string[]
): Record<string, unknown> {
  const table = getToolFlagTable(toolName);
  if (table.fields.size === 0) {
    throw new DirectToolInputError(
      `Tool '${toolName}' does not expose a flag schema; use --queries '<json>'.`
    );
  }
  const query: Record<string, unknown> = {};

  for (let i = 0; i < tail.length; i++) {
    const token = tail[i];
    if (token === '--') continue;

    if (token.startsWith('--')) {
      const eq = token.indexOf('=');
      const flag = eq === -1 ? token.slice(2) : token.slice(2, eq);
      let value = eq === -1 ? undefined : token.slice(eq + 1);

      if (TOOL_RUNTIME_FLAGS.has(flag)) {
        if (flag === 'queries') {
          throw new DirectToolInputError(
            'Use either field flags or --queries, not both.'
          );
        }
        if (value === undefined && TOOL_RUNTIME_VALUE_FLAGS.has(flag)) i++;
        continue;
      }

      const target = resolveFlag(table, flag);
      if (!target) throw unknownFlagError(toolName, flag, table);

      const consumesNext =
        value === undefined &&
        target.spec.kind !== 'boolean' &&
        i + 1 < tail.length;
      if (consumesNext) {
        value = tail[i + 1];
        i++;
      }
      assign(query, target, value, flag);
      continue;
    }

    // Positional JSON is a common muscle-memory slip from the --queries form.
    if (token.startsWith('{') || token.startsWith('[')) {
      throw new DirectToolInputError(
        `Positional JSON is not accepted. Pass it with --queries '<json>' or use field flags.`
      );
    }

    // Bare positional → variant selector (operation / treeKind / analysis …).
    const discriminator = table.discriminators.get(token);
    if (!discriminator) {
      const known = [...new Set([...table.discriminators.keys()])].sort();
      throw new DirectToolInputError(
        `Unknown ${toolName} selector: "${token}".`,
        known.length > 0
          ? [`Valid selectors: ${known.join(', ')}.`]
          : [`Run tools ${toolName} --scheme --brief to see valid fields.`]
      );
    }
    query[discriminator.field] = discriminator.value;
  }

  return query;
}

/** One-line flag example for help output, derived from the schema. */
export function formatToolFlagExample(toolName: string): string {
  const table = getToolFlagTable(toolName);
  const firstSelector = [...table.discriminators.values()].find(
    entry => entry.field === 'operation'
  );
  const required: string[] = [];
  for (const [name, spec] of table.fields) {
    if (spec.kind === 'object' || name === 'operation') continue;
    if (['path', 'searchText', 'owner', 'repo', 'packageName'].includes(name)) {
      required.push(
        `--${toKebabCase(name)} <${spec.kind === 'number' ? 'n' : 'value'}>`
      );
    }
    if (required.length >= 2) break;
  }
  const parts = [
    `tools ${toolName}`,
    ...(firstSelector ? [firstSelector.value] : []),
    ...(required.length > 0 ? required : ['--<field> <value>']),
  ];
  return parts.join(' ');
}
