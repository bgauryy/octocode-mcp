// Intentionally duplicates helpers from tool-command.ts (isRecord, normalizeKey,
// buildToolPayload, printToolResult, etc.) to keep this module free of heavy
// imports (MCP init, provider setup, colors). The esbuild code-splitting is
// extremely sensitive to shared-chunk creation — benchmarks showed that even
// extracting tiny pure-function modules can regress startup by 2-4x. Keep this
// file self-contained; update both copies when the payload contract changes.

import { z } from 'zod/v4';
import type { ParsedArgs } from './types.js';
import {
  type FetchContentQuery,
  FetchContentQuerySchema,
  type FindFilesQuery,
  FindFilesQuerySchema,
  type RipgrepSearchQuery,
  RipgrepQuerySchema,
  type ViewStructureQuery,
  ViewStructureQuerySchema,
  executeFetchContent,
  executeFindFiles,
  executeRipgrepSearch,
  executeViewStructure,
} from 'octocode-mcp/public';

type ToolResult = {
  content?: Array<{ type?: string; text?: string }>;
  structuredContent?: unknown;
  isError?: boolean;
};

type ToolExecutor = (input: {
  queries: Array<Record<string, unknown>>;
  responseCharLength?: number;
  responseCharOffset?: number;
}) => Promise<ToolResult>;

interface ToolDefinition {
  name: string;
  schema: z.ZodType;
  execute: ToolExecutor;
}

const TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    name: 'localSearchCode',
    schema: RipgrepQuerySchema,
    execute: executeRipgrepSearch as ToolExecutor,
  },
  {
    name: 'localGetFileContent',
    schema: FetchContentQuerySchema,
    execute: executeFetchContent as ToolExecutor,
  },
  {
    name: 'localFindFiles',
    schema: FindFilesQuerySchema,
    execute: executeFindFiles as ToolExecutor,
  },
  {
    name: 'localViewStructure',
    schema: ViewStructureQuerySchema,
    execute: executeViewStructure as ToolExecutor,
  },
];

export const LOCAL_TOOL_NAMES = new Set(
  TOOL_DEFINITIONS.map(tool => tool.name)
);

const TOOL_RUNTIME_OPTION_KEYS = new Set([
  'tool',
  'output',
  'o',
  'json',
  'help',
  'h',
  'version',
  'v',
  'list',
  'schema',
  'tools-context',
]);

function findToolDefinition(name: string): ToolDefinition | undefined {
  return TOOL_DEFINITIONS.find(tool => tool.name === name);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeKey(key: string): string {
  return key.replace(/[-_]+([a-zA-Z0-9])/g, (_, char: string) =>
    char.toUpperCase()
  );
}

function buildDefaultGoal(toolName: string): string {
  return `Execute ${toolName} via octocode-cli`;
}

function applyDefaultQueryFields(
  toolName: string,
  index: number,
  query: Record<string, unknown>
): Record<string, unknown> {
  const nextQuery = { ...query };

  if (typeof nextQuery.id !== 'string' || nextQuery.id.trim().length === 0) {
    nextQuery.id = `${toolName}-${index + 1}`;
  }

  if (
    typeof nextQuery.researchGoal !== 'string' ||
    nextQuery.researchGoal.trim().length === 0
  ) {
    nextQuery.researchGoal = buildDefaultGoal(toolName);
  }

  if (
    typeof nextQuery.reasoning !== 'string' ||
    nextQuery.reasoning.trim().length === 0
  ) {
    nextQuery.reasoning = 'Executed via octocode-cli tool command';
  }

  return nextQuery;
}

function normalizeQueryObject(query: unknown): Record<string, unknown> {
  if (!isRecord(query)) {
    throw new Error('Tool input must be a JSON object or an array of objects.');
  }

  const normalized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(query)) {
    normalized[normalizeKey(key)] = value;
  }

  return normalized;
}

function formatToolExampleCommand(toolName: string): string {
  return `octocode-cli --tool ${toolName} '{"path":".","pattern":"needle"}'`;
}

function getUnexpectedToolOptionKeys(args: ParsedArgs): string[] {
  return Object.keys(args.options).filter(
    key => key !== 'input' && !TOOL_RUNTIME_OPTION_KEYS.has(key)
  );
}

function buildToolPayload(
  toolName: string,
  args: ParsedArgs
): {
  queries: Array<Record<string, unknown>>;
  responseCharLength?: number;
  responseCharOffset?: number;
} | null {
  if (args.options.input !== undefined) {
    throw new Error(
      `Legacy --input is not supported. Use ${formatToolExampleCommand(toolName)}.`
    );
  }

  const unexpectedOptionKeys = getUnexpectedToolOptionKeys(args);
  if (unexpectedOptionKeys.length > 0) {
    const formattedKeys = unexpectedOptionKeys
      .map(key => `--${key}`)
      .join(', ');

    throw new Error(
      `Pass one JSON object string after the tool name. Unsupported tool flags: ${formattedKeys}. Use ${formatToolExampleCommand(toolName)}.`
    );
  }

  if (args.args.length > 2) {
    throw new Error(
      `Pass tool input as one quoted JSON string. Use ${formatToolExampleCommand(toolName)}.`
    );
  }

  const inputText = args.args[1];
  if (typeof inputText !== 'string') {
    return null;
  }

  let rawPayload: unknown;

  try {
    rawPayload = JSON.parse(inputText) as unknown;
  } catch {
    throw new Error(
      `Tool input must be valid JSON. Use ${formatToolExampleCommand(toolName)}.`
    );
  }

  let queriesInput: unknown[] = [];
  let responseCharLength: number | undefined;
  let responseCharOffset: number | undefined;

  if (Array.isArray(rawPayload)) {
    queriesInput = rawPayload;
  } else if (isRecord(rawPayload) && Array.isArray(rawPayload.queries)) {
    queriesInput = rawPayload.queries;
    if (typeof rawPayload.responseCharLength === 'number') {
      responseCharLength = rawPayload.responseCharLength;
    }
    if (typeof rawPayload.responseCharOffset === 'number') {
      responseCharOffset = rawPayload.responseCharOffset;
    }
  } else if (isRecord(rawPayload)) {
    queriesInput = [rawPayload];
  } else {
    throw new Error(
      'Tool input must be a JSON object, an array of query objects, or { "queries": [...] }.'
    );
  }

  if (queriesInput.length === 0) {
    throw new Error('At least one query is required.');
  }

  return {
    queries: queriesInput.map((query, index) =>
      applyDefaultQueryFields(toolName, index, normalizeQueryObject(query))
    ),
    responseCharLength,
    responseCharOffset,
  };
}

function getOutputMode(args: ParsedArgs): 'text' | 'json' {
  if (args.options.json === true) {
    return 'json';
  }

  const output = args.options.output ?? args.options.o;
  if (typeof output === 'string' && output.toLowerCase() === 'json') {
    return 'json';
  }

  return 'text';
}

function printToolResult(
  result: ToolResult,
  outputMode: 'text' | 'json'
): void {
  if (outputMode === 'json') {
    const payload =
      result.structuredContent !== undefined
        ? result.structuredContent
        : result;
    console.log(JSON.stringify(payload));
    return;
  }

  const textBlocks = Array.isArray(result.content)
    ? result.content
        .map(block => (typeof block.text === 'string' ? block.text : ''))
        .filter(block => block.length > 0)
    : [];

  if (textBlocks.length > 0) {
    console.log(textBlocks.join('\n\n'));
    return;
  }

  if (result.structuredContent !== undefined) {
    console.log(JSON.stringify(result.structuredContent, null, 2));
    return;
  }

  console.log(JSON.stringify(result, null, 2));
}

function printToolError(message: string, details: string[] = []): void {
  console.log();
  console.log(`  ✗ ${message}`);
  for (const detail of details) {
    console.log(`  - ${detail}`);
  }
  console.log();
}

function formatValidationIssues(error: z.ZodError): string[] {
  return error.issues.map(issue => {
    const path = issue.path.length > 0 ? issue.path.join('.') : 'input';
    return `${path}: ${issue.message}`;
  });
}

export async function executeLocalToolCommand(
  args: ParsedArgs
): Promise<boolean> {
  const maybeToolName = args.args[0];
  const toolName =
    typeof maybeToolName === 'string'
      ? maybeToolName
      : typeof args.options.tool === 'string'
        ? args.options.tool
        : undefined;

  if (!toolName) {
    return false;
  }

  const tool = findToolDefinition(toolName);
  if (!tool) {
    return false;
  }

  let payload;
  try {
    payload = buildToolPayload(tool.name, args);
  } catch (error) {
    printToolError(
      error instanceof Error ? error.message : 'Failed to parse tool input.'
    );
    return false;
  }

  if (!payload) {
    return false;
  }

  const validationResults = payload.queries.map(query =>
    tool.schema.safeParse(query)
  );
  const validationFailure = validationResults.find(result => !result.success);
  if (validationFailure && !validationFailure.success) {
    printToolError('Tool input does not match the expected schema.', [
      ...formatValidationIssues(validationFailure.error),
    ]);
    return false;
  }

  const queries = validationResults
    .filter(
      (
        result
      ): result is z.ZodSafeParseSuccess<
        | RipgrepSearchQuery
        | FetchContentQuery
        | FindFilesQuery
        | ViewStructureQuery
      > => result.success
    )
    .map(result => result.data as Record<string, unknown>);

  try {
    const result = await tool.execute({
      queries,
      responseCharLength: payload.responseCharLength,
      responseCharOffset: payload.responseCharOffset,
    });
    printToolResult(result, getOutputMode(args));
    return !result.isError;
  } catch (error) {
    printToolError(
      error instanceof Error ? error.message : 'Tool execution failed.'
    );
    return false;
  }
}
