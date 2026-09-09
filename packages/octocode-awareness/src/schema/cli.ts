import { writeCommandPayload, writeCommandText } from '../command-output.js';
/* v8 ignore file -- exercised through built CLI and isolated-package subprocess tests */
import { z } from 'zod';
import { examples as coreExamples } from './examples.js';
import { integrationExamples } from './examples-integration.js';
import { awarenessEntityCatalog } from './entities.js';
import { commandIndex, type AwarenessCommandCatalogEntry } from './command-catalog.js';
import { adminExamples, adminSchemas } from './definitions-admin.js';
import { integrationSchemas } from './definitions-integration.js';
import { projectCommandInput } from './command-input.js';
import { historyExamples, historyRequestSchemas } from './definitions-history.js';

import { schemas, type SchemaName } from './registry.js';
export const examples = { ...coreExamples, ...integrationExamples, ...adminExamples, ...historyExamples };

const listableSchemas = [
  ...Object.keys(integrationSchemas),
  ...Object.keys(adminSchemas),
  ...Object.keys(historyRequestSchemas),
  "memory_record", "memory_recall",
  "attend", "query",
  "workspace_status", "export_harness", "session_capture",
  "plan", "task", "work", "lock_acquire", "lock_wait", "lock_prune", "lock_release", "verify", "verify_audit",
  "forget_memory", "memory_lifecycle", "refinement", "refine_query", "refine_delete",
  "agent_registry", "agent_signal", "signal_prune",
  "mine_weakness", "developer_review", "doc_staleness", "docs_catalog", "digest", "reflect", "awareness_config",
];


const CORE_NOUNS = new Set(["verify", "attend", "plan", "task", "work", "memory", "signal", "query", "history"]);
// Rare/expert/redundant commands stay fully available under `--all` and
// `<command> --help`, but are hidden from the default lobby catalog to keep the
// agent-facing surface small. Removing them here removes catalog verbosity, not
// capability.
const COMPACT_HIDE = new Set<string>([
  "reflect mine-weakness", "reflect export-harness", "reflect developer-review",
  "query developer-review", "docs staleness",
  "schema list", "schema json-schema", "schema example", "schema validate",
]);

function groupedCommandIndex() {
  const grouped: Record<"core" | "advanced", Record<string, string[]>> = { core: {}, advanced: {} };
  for (const row of commandIndex) {
    if (COMPACT_HIDE.has(row.command)) continue;
    const [noun, ...rest] = row.command.split(" ");
    const tier = CORE_NOUNS.has(noun!) ? "core" : "advanced";
    (grouped[tier][noun!] ??= []).push(rest.length > 0 ? rest.join(" ") : noun === "query" ? "<view>" : "<direct>");
  }
  return grouped;
}

function printJson(payload: unknown, compact = false): void {
  writeCommandPayload(payload, compact);
}

function usage() {
  return `Usage:
  npx @octocodeai/octocode-awareness schema commands [--compact] [--all] [--examples]
  npx @octocodeai/octocode-awareness schema command <noun> [action] [--compact]
  npx @octocodeai/octocode-awareness schema entities [--compact] [--all]
  npx @octocodeai/octocode-awareness schema list
  npx @octocodeai/octocode-awareness schema json-schema <schema-name>
  npx @octocodeai/octocode-awareness schema example <schema-name>
  npx @octocodeai/octocode-awareness schema validate <schema-name> <json-file|->`;
}

function toJsonSchema(schema: z.ZodType) {
  if (typeof z.toJSONSchema === "function") {
    return z.toJSONSchema(schema);
  }
  throw new Error("This script requires Zod v4 with z.toJSONSchema().");
}

export function cliCommandSchema(commandName: string): Record<string, unknown> | null {
  const row = commandIndex.find((candidate) => candidate.command === commandName);
  if (!row?.schema) return null;
  const schema = schemas[row.schema as SchemaName];
  if (!schema) return null;
  const output = projectCommandInput(commandName, schema);
  output["x-cli-command"] = commandName;
  output["x-cli-example"] = row.example;
  output["x-cli-note"] = "CLI flags use kebab-case; repeat array flags. The router injects the action.";
  output["x-awareness-effect"] = row.effect;
  output["x-awareness-pi-mode"] = row.piMode;
  output["x-awareness-injected"] = row.injected;
  if (row.approvalClass) output["x-awareness-approval-class"] = row.approvalClass;
  if (row.positionals) output["x-cli-positionals"] = row.positionals;
  if (row.stdinField) output["x-cli-stdin-field"] = row.stdinField;
  return output;
}

export interface AwarenessCommandDescriptor extends AwarenessCommandCatalogEntry {
  inputSchema: Readonly<Record<string, unknown>>;
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  }
  return value;
}

const descriptorCache = new Map<string, AwarenessCommandDescriptor>();
let descriptorList: readonly AwarenessCommandDescriptor[] | undefined;

/** Read one immutable command contract without invoking the CLI process. */
export function getAwarenessCommandDescriptor(commandName: string): AwarenessCommandDescriptor | undefined {
  const cached = descriptorCache.get(commandName);
  if (cached) return cached;
  const row = commandIndex.find((candidate) => candidate.command === commandName);
  if (!row) return undefined;
  const inputSchema = cliCommandSchema(commandName);
  if (!inputSchema) return undefined;
  const descriptor = deepFreeze({ ...row, inputSchema });
  descriptorCache.set(commandName, descriptor);
  return descriptor;
}

/** Read the complete immutable command contract catalog. */
export function listAwarenessCommandDescriptors(): readonly AwarenessCommandDescriptor[] {
  return descriptorList ??= Object.freeze(commandIndex.map((row) => {
    const descriptor = getAwarenessCommandDescriptor(row.command);
    if (!descriptor) throw new Error(`Awareness command is missing a schema: ${row.command}`);
    return descriptor;
  }));
}

function parseJson(input: string): unknown {
  try {
    return JSON.parse(input);
  } catch (error) {
    throw new Error(`Invalid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function formatZodError(error: z.ZodError) {
  return error.issues.map((issue) => ({
    path: issue.path.join(".") || "<root>",
    code: issue.code,
    message: issue.message,
  }));
}

function printJsonError(payload: Record<string, unknown>, code = 2, compact = false): number {
  writeCommandPayload({ ok: false, ...payload }, compact);
  return code;
}

/** Structured discovery/validation API; only the CLI adapter supplies file/stdin I/O. */
export async function runSchemaCommand(command: string | undefined, params: Record<string, unknown>, io: { readInput?: (input: string) => Promise<string> } = {}): Promise<number> {
  const compact = params.compact === true;
  const includeExamples = params.examples === true;
  const includeAll = params.all === true;
  const schemaName = String(params.schema_name ?? params.noun ?? '');
  const file = params.input ?? params.subcommand;

  if (!command || command === "--help" || command === "-h") {
    writeCommandText(`${usage()}\n`);
    return 0;
  }

  if (command === "commands") {
    const commands = includeAll
      ? commandIndex.map((row) => includeExamples
        ? row
        : ({ command: row.command, schema: row.schema, effect: row.effect, piMode: row.piMode, injected: row.injected, ...(row.approvalClass ? { approvalClass: row.approvalClass } : {}), ...(row.positionals ? { positionals: row.positionals } : {}), ...(row.stdinField ? { stdinField: row.stdinField } : {}) }))
      : groupedCommandIndex();
    printJson({
      ok: true,
      hint: includeAll
        ? "Flat command detail. Use `<command> --help` or `schema command <noun> [action]` for one exact contract."
        : "Attend once; communicate when useful. Other features are on demand. Pass --all for the complete catalog.",
      commands,
    }, compact);
    return 0;
  }

  if (command === "command") {
    const requestedCommandName = [schemaName, file].filter(Boolean).join(" ");
    const commandName = requestedCommandName;
    const commandSchema = cliCommandSchema(commandName);
    if (!commandSchema) {
      return printJsonError({
        error_code: "UNKNOWN_CLI_COMMAND",
        error: `Unknown or schema-less CLI command: ${requestedCommandName || "<missing>"}`,
        hint: "Use `schema commands --all --compact` to list command names.",
      }, 1, compact);
    }
    printJson(commandSchema, compact);
    return 0;
  }

  if (command === "list") {
    printJson(listableSchemas, compact);
    return 0;
  }

  if (command === "entities") {
    const catalog = awarenessEntityCatalog();
    if (includeAll) {
      printJson({ ok: true, kind: "awareness.entities", ...catalog }, compact);
    } else {
      const families = new Map<string, string[]>();
      for (const entity of catalog.entities) {
        const names = families.get(entity.family) ?? [];
        names.push(entity.name);
        families.set(entity.family, names);
      }
      printJson({
        ok: true,
        kind: "awareness.entities",
        storage: catalog.storage,
        families: [...families.entries()].map(([family, entities]) => ({ family, entities })),
        hint: "Pass --all for owner and relation kind per entity.",
      }, compact);
    }
    return 0;
  }

  const knownSchemaName = listableSchemas.includes(schemaName as SchemaName)
    ? schemaName as SchemaName
    : undefined;
  const schema = knownSchemaName ? schemas[knownSchemaName] : undefined;
  if (!schema) {
    return printJsonError({
      error_code: "UNKNOWN_SCHEMA",
      error: `Unknown schema: ${schemaName || "<missing>"}`,
      hint: "Use one of the schemas returned by `schema list`.",
      ...(compact ? {} : { known_schemas: listableSchemas }),
    }, 1, compact);
  }

  if (command === "json-schema") {
    printJson(toJsonSchema(schema), compact);
    return 0;
  }

  if (command === "example") {
    printJson(examples[knownSchemaName!], compact);
    return 0;
  }

  if (command === "validate") {
    if (file === undefined) {
      return printJsonError({
        error_code: "MISSING_INPUT",
        error: "Missing <json-file|->.",
        hint: "Use `schema validate <schema-name> <json-file|->`.",
      }, 1, compact);
    }
    const raw = io.readInput ? await io.readInput(String(file)) : file;
    let parsed;
    try {
      parsed = typeof raw === 'string' ? parseJson(raw) : raw;
    } catch (error) {
      return printJsonError({
        error_code: "INVALID_JSON",
        schema: schemaName,
        error: error instanceof Error ? error.message : String(error),
        hint: "Pass valid JSON matching the selected schema.",
      }, 1, compact);
    }
    const result = schema.safeParse(parsed);
    if (!result.success) {
      return printJsonError({
        schema: schemaName,
        issues: formatZodError(result.error),
      }, 1, compact);
    }
    printJson({ ok: true, schema: schemaName, data: result.data }, compact);
    return 0;
  }

  return printJsonError({
    error_code: "UNKNOWN_COMMAND",
    error: `Unknown command: ${command}`,
    hint: usage(),
  }, 1, compact);
}
