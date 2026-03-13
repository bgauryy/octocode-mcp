/**
 * Bridge between Zod schemas (octocode-mcp) and CLI commands.
 * Derives CLIOption[] and handler mapping from Zod schemas,
 * eliminating duplication between MCP tool definitions and CLI commands.
 */

import type { z } from 'zod/v4';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { CLICommand, CLIOption, ParsedArgs } from './types.js';
import { ensureInitialized } from './commands/init.js';
import { outputResult, outputError } from './commands/output.js';
import { withContext } from './commands/query.js';

/** MCP-context fields to skip when generating CLI options */
const CONTEXT_KEYS = new Set([
  'id',
  'mainResearchGoal',
  'researchGoal',
  'reasoning',
]);

/**
 * Zod v4 internal definition shape for wrapper types (optional, default, nullable).
 * These fields are present on _zod.def for wrapper types that wrap an inner type.
 */
interface ZodInternalDef {
  type: string;
  innerType?: z.ZodType;
  defaultValue?: unknown;
}

/** Convert camelCase to kebab-case */
function toKebab(str: string): string {
  return str.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
}

/** Convert kebab-case option name to a readable description */
function humanize(name: string): string {
  const words = name.split('-');
  words[0] = words[0].charAt(0).toUpperCase() + words[0].slice(1);
  return words.join(' ');
}

/** Get the internal Zod v4 def, typed for wrapper traversal */
function zodDef(type: z.ZodType): ZodInternalDef {
  return type._zod.def as ZodInternalDef;
}

/** Unwrap Zod optional/default wrappers to find the base type and default value */
function unwrapZodType(field: z.ZodType): {
  type: string;
  defaultVal: unknown;
} {
  let def = zodDef(field);
  let defaultVal: unknown;

  while (def.innerType) {
    if (def.type === 'default') {
      defaultVal = def.defaultValue;
    }
    def = zodDef(def.innerType);
  }

  return { type: def.type, defaultVal };
}

/**
 * Convert a Zod object schema to CLIOption[].
 * Skips MCP-context fields and converts camelCase keys to kebab-case.
 */
export function zodToCliOptions(
  schema: z.ZodObject,
  extraOptions?: CLIOption[]
): CLIOption[] {
  const options: CLIOption[] = [];
  const shape = schema.shape as Record<string, z.ZodType>;

  for (const [key, field] of Object.entries(shape)) {
    if (CONTEXT_KEYS.has(key)) continue;

    const { type, defaultVal } = unwrapZodType(field);
    const name = toKebab(key);
    const description = field.description || humanize(name);
    const hasValue = type !== 'boolean';

    const opt: CLIOption = { name, description, hasValue };
    if (defaultVal !== undefined) {
      opt.default = String(defaultVal);
    }

    options.push(opt);
  }

  if (extraOptions) {
    options.push(...extraOptions);
  }

  return options;
}

/**
 * Convert parsed CLI args to a query object matching the Zod schema.
 * Handles type coercion based on schema types.
 */
export function cliArgsToQuery(
  args: ParsedArgs,
  schema: z.ZodObject
): Record<string, unknown> {
  const query: Record<string, unknown> = {};
  const shape = schema.shape as Record<string, z.ZodType>;

  for (const [key, field] of Object.entries(shape)) {
    if (CONTEXT_KEYS.has(key)) continue;

    const cliName = toKebab(key);
    const rawValue = args.options[cliName];
    if (rawValue === undefined) continue;

    const { type } = unwrapZodType(field);

    switch (type) {
      case 'number':
      case 'int':
        if (typeof rawValue === 'string') {
          query[key] = parseInt(rawValue, 10);
        }
        break;
      case 'boolean':
        query[key] = Boolean(rawValue);
        break;
      case 'array':
        if (typeof rawValue === 'string') {
          query[key] = rawValue.split(',').map(s => s.trim());
        }
        break;
      default:
        // string, enum, union — passthrough
        query[key] = rawValue;
        break;
    }
  }

  return query;
}

/** Validate required CLI options are present */
function checkRequired(
  args: ParsedArgs,
  requiredOptions: string[],
  commandName: string
): boolean {
  for (const name of requiredOptions) {
    const value = args.options[name];
    if (!value || typeof value !== 'string') {
      process.stderr.write(`Error: --${name} is required\n`);
      process.stderr.write(
        `Usage: octocode ${commandName} --${name} <value>\n`
      );
      process.exitCode = 1;
      return false;
    }
  }
  return true;
}

export interface ToolCommandConfig {
  name: string;
  description: string;
  usage?: string;
  category?: string;
  schema: z.ZodObject;
  execute: (input: {
    queries: Record<string, unknown>[];
  }) => Promise<CallToolResult>;
  requiredOptions?: string[];
  extraOptions?: CLIOption[];
}

/**
 * Factory to create a CLICommand from a Zod schema and execution function.
 */
export function createToolCommand(config: ToolCommandConfig): CLICommand {
  const {
    name,
    description,
    usage,
    category,
    schema,
    execute,
    requiredOptions = [],
    extraOptions,
  } = config;

  return {
    name,
    description,
    usage,
    category,
    options: zodToCliOptions(schema, extraOptions),
    handler: async (args: ParsedArgs) => {
      if (!checkRequired(args, requiredOptions, name)) return;
      try {
        await ensureInitialized();
        const query = cliArgsToQuery(args, schema);
        const result = await execute({
          queries: [withContext(query)],
        });
        outputResult(result, Boolean(args.options['pretty']));
      } catch (error) {
        outputError(error);
      }
    },
  };
}
