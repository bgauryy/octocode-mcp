import { z } from 'zod/v4';
import type { CLICommand, ParsedArgs } from './types.js';
import { c, bold, dim } from '../utils/colors.js';
import {
  initialize as initializeMcp,
  initializeProviders,
  fetchMultipleGitHubFileContents,
  searchMultipleGitHubCode,
  searchMultipleGitHubPullRequests,
  searchMultipleGitHubRepos,
  exploreMultipleRepositoryStructures,
  executeFetchContent,
  executeFindFiles,
  executeRipgrepSearch,
  executeViewStructure,
  executeGotoDefinition,
  executeFindReferences,
  executeCallHierarchy,
  searchPackages,
  GitHubCodeSearchQuerySchema,
  GitHubViewRepoStructureQuerySchema,
  GitHubReposSearchSingleQuerySchema,
  GitHubPullRequestSearchQuerySchema,
  FileContentQuerySchema,
  RipgrepQuerySchema,
  FetchContentQuerySchema,
  FindFilesQuerySchema,
  ViewStructureQuerySchema,
  LSPGotoDefinitionQuerySchema,
  LSPFindReferencesQuerySchema,
  LSPCallHierarchyQuerySchema,
  PackageSearchQuerySchema,
} from '../../../octocode-mcp/src/public.js';

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
  category: 'GitHub' | 'Local' | 'LSP' | 'Package';
  description: string;
  schema: z.ZodType;
  execute: ToolExecutor;
}

interface JsonSchemaObject extends Record<string, unknown> {
  type?: string | string[];
  description?: string;
  enum?: unknown[];
  required?: string[];
  properties?: Record<string, unknown>;
  items?: unknown;
}

const AUTO_FILLED_FIELDS = new Set([
  'id',
  'mainResearchGoal',
  'researchGoal',
  'reasoning',
]);

const RESERVED_OPTION_KEYS = new Set([
  'tool',
  'input',
  'output',
  'o',
  'json',
  'help',
  'h',
  'version',
  'v',
  'list',
  'schema',
  'responseCharLength',
  'responseCharOffset',
]);

const TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    name: 'githubSearchCode',
    category: 'GitHub',
    description: 'Search code in GitHub repositories.',
    schema: GitHubCodeSearchQuerySchema,
    execute: searchMultipleGitHubCode,
  },
  {
    name: 'githubGetFileContent',
    category: 'GitHub',
    description: 'Read file content from a GitHub repository.',
    schema: FileContentQuerySchema,
    execute: fetchMultipleGitHubFileContents,
  },
  {
    name: 'githubViewRepoStructure',
    category: 'GitHub',
    description: 'View a GitHub repository tree.',
    schema: GitHubViewRepoStructureQuerySchema,
    execute: exploreMultipleRepositoryStructures,
  },
  {
    name: 'githubSearchRepositories',
    category: 'GitHub',
    description: 'Search GitHub repositories.',
    schema: GitHubReposSearchSingleQuerySchema,
    execute: searchMultipleGitHubRepos,
  },
  {
    name: 'githubSearchPullRequests',
    category: 'GitHub',
    description: 'Search pull requests.',
    schema: GitHubPullRequestSearchQuerySchema,
    execute: searchMultipleGitHubPullRequests,
  },
  {
    name: 'packageSearch',
    category: 'Package',
    description: 'Search npm or PyPI packages.',
    schema: PackageSearchQuerySchema,
    execute: searchPackages,
  },
  {
    name: 'localSearchCode',
    category: 'Local',
    description: 'Search local code with ripgrep.',
    schema: RipgrepQuerySchema,
    execute: executeRipgrepSearch,
  },
  {
    name: 'localGetFileContent',
    category: 'Local',
    description: 'Read local file content.',
    schema: FetchContentQuerySchema,
    execute: executeFetchContent,
  },
  {
    name: 'localFindFiles',
    category: 'Local',
    description: 'Find local files by name or metadata.',
    schema: FindFilesQuerySchema,
    execute: executeFindFiles,
  },
  {
    name: 'localViewStructure',
    category: 'Local',
    description: 'View a local directory tree.',
    schema: ViewStructureQuerySchema,
    execute: executeViewStructure,
  },
  {
    name: 'lspGotoDefinition',
    category: 'LSP',
    description: 'Jump to a symbol definition.',
    schema: LSPGotoDefinitionQuerySchema,
    execute: executeGotoDefinition,
  },
  {
    name: 'lspFindReferences',
    category: 'LSP',
    description: 'Find references to a symbol.',
    schema: LSPFindReferencesQuerySchema,
    execute: executeFindReferences,
  },
  {
    name: 'lspCallHierarchy',
    category: 'LSP',
    description: 'Inspect call hierarchy for a symbol.',
    schema: LSPCallHierarchyQuerySchema,
    execute: executeCallHierarchy,
  },
];

let toolRuntimeInitPromise: Promise<void> | null = null;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isJsonSchemaObject(value: unknown): value is JsonSchemaObject {
  return isRecord(value);
}

function findToolDefinition(name: string): ToolDefinition | undefined {
  return TOOL_DEFINITIONS.find(tool => tool.name === name);
}

function normalizeKey(key: string): string {
  return key.replace(/[-_]+([a-zA-Z0-9])/g, (_, char: string) =>
    char.toUpperCase()
  );
}

function parseCliValue(value: string | boolean): unknown {
  if (typeof value === 'boolean') {
    return value;
  }

  const trimmed = value.trim();

  if (trimmed.length === 0) {
    return trimmed;
  }

  if (
    (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
    (trimmed.startsWith('[') && trimmed.endsWith(']'))
  ) {
    try {
      return JSON.parse(trimmed) as unknown;
    } catch {
      return trimmed;
    }
  }

  if (/^(true|false)$/i.test(trimmed)) {
    return trimmed.toLowerCase() === 'true';
  }

  if (/^null$/i.test(trimmed)) {
    return null;
  }

  if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
    return Number(trimmed);
  }

  if (trimmed.includes(',')) {
    return trimmed.split(',').map(part => parseCliValue(part));
  }

  return trimmed;
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
    typeof nextQuery.mainResearchGoal !== 'string' ||
    nextQuery.mainResearchGoal.trim().length === 0
  ) {
    nextQuery.mainResearchGoal = buildDefaultGoal(toolName);
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

function getInputText(args: ParsedArgs): string | undefined {
  const inputOption = args.options.input;
  if (typeof inputOption === 'string') {
    return inputOption;
  }

  const secondArg = args.args[1];
  return typeof secondArg === 'string' ? secondArg : undefined;
}

function buildQueryFromOptions(args: ParsedArgs): Record<string, unknown> {
  const query: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(args.options)) {
    if (RESERVED_OPTION_KEYS.has(key)) {
      continue;
    }

    query[normalizeKey(key)] = parseCliValue(value);
  }

  return query;
}

function getWrapperNumber(
  options: ParsedArgs['options'],
  key: 'responseCharLength' | 'responseCharOffset'
): number | undefined {
  const value = options[key];
  if (typeof value !== 'string') {
    return undefined;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function buildToolPayload(
  toolName: string,
  args: ParsedArgs
): {
  queries: Array<Record<string, unknown>>;
  responseCharLength?: number;
  responseCharOffset?: number;
} | null {
  const inputText = getInputText(args);
  let rawPayload: unknown;

  if (inputText) {
    try {
      rawPayload = JSON.parse(inputText) as unknown;
    } catch {
      throw new Error(
        'Tool input must be valid JSON. Use --input=\'{"path":".","pattern":"needle"}\'.'
      );
    }
  } else {
    const query = buildQueryFromOptions(args);
    if (Object.keys(query).length === 0) {
      return null;
    }

    rawPayload = {
      queries: [query],
      responseCharLength: getWrapperNumber(args.options, 'responseCharLength'),
      responseCharOffset: getWrapperNumber(args.options, 'responseCharOffset'),
    };
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

function getDisplayFields(tool: ToolDefinition): Array<{
  name: string;
  required: boolean;
  type: string;
  description?: string;
}> {
  const jsonSchema = z.toJSONSchema(tool.schema);
  if (!isJsonSchemaObject(jsonSchema)) {
    return [];
  }

  const requiredFields = new Set(
    Array.isArray(jsonSchema.required)
      ? jsonSchema.required.filter(name => !AUTO_FILLED_FIELDS.has(name))
      : []
  );

  const properties = isRecord(jsonSchema.properties) ? jsonSchema.properties : {};

  return Object.entries(properties)
    .filter(([name]) => !AUTO_FILLED_FIELDS.has(name))
    .map(([name, value]) => {
      const schema = isJsonSchemaObject(value) ? value : {};
      return {
        name,
        required: requiredFields.has(name),
        type: describeSchemaType(schema),
        description:
          typeof schema.description === 'string' ? schema.description : undefined,
      };
    });
}

function describeSchemaType(schema: JsonSchemaObject): string {
  if (Array.isArray(schema.enum) && schema.enum.length > 0) {
    return `enum(${schema.enum.map(String).join(', ')})`;
  }

  if (schema.type === 'array') {
    const items = isJsonSchemaObject(schema.items) ? schema.items : undefined;
    return `array<${items ? describeSchemaType(items) : 'value'}>`;
  }

  if (Array.isArray(schema.type)) {
    return schema.type.join(' | ');
  }

  if (typeof schema.type === 'string') {
    return schema.type;
  }

  return 'value';
}

function buildExampleQuery(tool: ToolDefinition): Record<string, unknown> {
  const fields = getDisplayFields(tool);
  const requiredFields = fields.filter(field => field.required);
  const sourceFields = requiredFields.length > 0 ? requiredFields : fields.slice(0, 4);
  const example: Record<string, unknown> = {};

  for (const field of sourceFields) {
    example[field.name] = buildExampleValue(field.name, field.type);
  }

  return example;
}

function buildExampleValue(name: string, type: string): unknown {
  if (type.startsWith('array<')) {
    return [name];
  }

  if (type === 'integer' || type === 'number') {
    return 1;
  }

  if (type === 'boolean') {
    return true;
  }

  if (type.startsWith('enum(')) {
    const match = /^enum\(([^,)]+)/.exec(type);
    return match?.[1] ?? name;
  }

  switch (name) {
    case 'path':
      return '.';
    case 'owner':
      return 'bgauryy';
    case 'repo':
      return 'octocode-mcp';
    case 'keywordsToSearch':
      return ['toolName'];
    case 'ecosystem':
      return 'npm';
    case 'name':
      return 'react';
    default:
      return name;
  }
}

export function showAvailableTools(): void {
  console.log();
  console.log(`  ${c('magenta', bold('Octocode Tools'))}`);

  const categories: Array<ToolDefinition['category']> = [
    'GitHub',
    'Local',
    'LSP',
    'Package',
  ];

  for (const category of categories) {
    const tools = TOOL_DEFINITIONS.filter(tool => tool.category === category);
    if (tools.length === 0) {
      continue;
    }

    console.log();
    console.log(`  ${bold(category)}`);
    for (const tool of tools) {
      console.log(`    ${c('cyan', tool.name)} ${dim('-')} ${tool.description}`);
    }
  }

  console.log();
  console.log(
    `  ${dim('Tip:')} ${c('yellow', 'octocode --tool localSearchCode --path . --pattern runCLI')}`
  );
  console.log();
}

export function showToolHelp(toolName: string): boolean {
  const tool = findToolDefinition(toolName);
  if (!tool) {
    return false;
  }

  const fields = getDisplayFields(tool);
  const requiredFields = fields.filter(field => field.required);
  const optionalFields = fields.filter(field => !field.required);

  console.log();
  console.log(`  ${c('magenta', bold(tool.name))}`);
  console.log(`  ${tool.description}`);
  console.log();

  if (requiredFields.length > 0) {
    console.log(
      `  ${bold('Required')}: ${requiredFields
        .map(field => `${field.name} (${field.type})`)
        .join(', ')}`
    );
  } else {
    console.log(`  ${bold('Required')}: none`);
  }

  if (optionalFields.length > 0) {
    console.log(
      `  ${bold('Optional')}: ${optionalFields
        .slice(0, 10)
        .map(field => `${field.name} (${field.type})`)
        .join(', ')}`
    );
  }

  console.log(
    `  ${dim('Auto-filled')}: id, researchGoal, reasoning${
      tool.category === 'GitHub' || tool.category === 'Package'
        ? ', mainResearchGoal'
        : ''
    }`
  );
  console.log();

  const exampleQuery = buildExampleQuery(tool);
  console.log(`  ${bold('Example')}`);
  console.log(
    `    ${c('yellow', `octocode --tool ${tool.name} --input '${JSON.stringify(exampleQuery)}'`)}`
  );
  console.log();

  return true;
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

function printToolResult(result: ToolResult, outputMode: 'text' | 'json'): void {
  if (outputMode === 'json') {
    console.log(JSON.stringify(result, null, 2));
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
  console.log(`  ${c('red', '✗')} ${message}`);
  for (const detail of details) {
    console.log(`  ${dim('-')} ${detail}`);
  }
  console.log();
}

function formatValidationIssues(error: z.ZodError): string[] {
  return error.issues.map(issue => {
    const path = issue.path.length > 0 ? issue.path.join('.') : 'input';
    return `${path}: ${issue.message}`;
  });
}

async function ensureToolRuntimeReady(): Promise<void> {
  if (!toolRuntimeInitPromise) {
    toolRuntimeInitPromise = (async () => {
      await initializeMcp();
      await initializeProviders();
    })();
  }

  await toolRuntimeInitPromise;
}

export async function executeToolCommand(args: ParsedArgs): Promise<boolean> {
  const maybeToolName = args.args[0];
  const toolName =
    typeof maybeToolName === 'string'
      ? maybeToolName
      : typeof args.options.tool === 'string'
        ? args.options.tool
        : undefined;

  if (!toolName || toolName === 'list' || args.options.list === true) {
    showAvailableTools();
    return true;
  }

  const tool = findToolDefinition(toolName);
  if (!tool) {
    printToolError(`Unknown tool: ${toolName}`, [
      `Available tools: ${TOOL_DEFINITIONS.map(item => item.name).join(', ')}`,
    ]);
    return false;
  }

  if (args.options.schema === true) {
    showToolHelp(tool.name);
    return true;
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
    showToolHelp(tool.name);
    return true;
  }

  const validationResults = payload.queries.map(query => tool.schema.safeParse(query));
  const validationFailure = validationResults.find(result => !result.success);
  if (validationFailure && !validationFailure.success) {
    printToolError('Tool input does not match the expected schema.', [
      ...formatValidationIssues(validationFailure.error),
    ]);
    return false;
  }

  const queries = validationResults
    .filter((result): result is z.ZodSafeParseSuccess<Record<string, unknown>> => result.success)
    .map(result => result.data);

  try {
    await ensureToolRuntimeReady();
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

export const toolCommand: CLICommand = {
  name: 'tool',
  description: 'Run an Octocode tool directly from the terminal',
  usage: 'octocode tool <toolName> [--input <json>] [tool-specific options]',
  options: [
    {
      name: 'tool',
      description:
        'Tool name. You can also pass it as the first positional argument.',
      hasValue: true,
    },
    {
      name: 'input',
      description:
        'JSON object, JSON array of queries, or {"queries":[...]} payload.',
      hasValue: true,
    },
    {
      name: 'output',
      short: 'o',
      description: 'Output format: text (default) or json.',
      hasValue: true,
      default: 'text',
    },
    {
      name: 'list',
      description: 'List available tools.',
    },
    {
      name: 'schema',
      description: 'Show the selected tool schema summary instead of running it.',
    },
    {
      name: 'responseCharLength',
      description: 'Optional top-level bulk response character budget.',
      hasValue: true,
    },
    {
      name: 'responseCharOffset',
      description: 'Optional top-level bulk response pagination offset.',
      hasValue: true,
    },
  ],
  handler: async (args: ParsedArgs) => {
    const success = await executeToolCommand(args);
    if (!success) {
      process.exitCode = 1;
    }
  },
};
