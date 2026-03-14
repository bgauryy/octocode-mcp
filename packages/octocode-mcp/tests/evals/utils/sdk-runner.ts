/**
 * Real Eval Runner using Claude Agent SDK
 *
 * Runs prompts with different MCP providers to compare research quality:
 * - Octocode MCP
 * - Context7 MCP
 * - No external MCP provider
 *
 * Important: the "none" lane is not a universal "no tools" baseline.
 * On some clients, native built-in tools may still be available.
 */

import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type {
  EvalTestCase,
  ToolResponse,
  EvalResult,
} from '../scorers/types.js';
import { createDefaultScorers } from '../scorers/index.js';
import { runSingleEval } from './eval-runner.js';

export type EvalClient = 'claude' | 'codex' | 'cursor';
export type McpProvider = 'octocode' | 'context7' | 'none';

export interface SdkRunnerOptions {
  client?: EvalClient;
  model?: string;
  maxTurns?: number;
  timeout?: number;
  verbose?: boolean;
}

export interface ProviderResult {
  provider: McpProvider;
  response: string;
  toolsCalled: string[];
  toolResponses: ToolResponse[];
  latencyMs: number;
  evalResult: EvalResult;
}

export interface MultiProviderEvalResult {
  testCase: string;
  results: Record<McpProvider, ProviderResult>;
  rankings: McpProvider[];
  deltas: {
    octocodeVsBaseline: number;
    context7VsBaseline: number;
    octocodeVsContext7: number;
  };
}

interface ClaudeQueryStreamMessage {
  type: string;
  subtype?: string;
  result?: string;
  content?: Array<
    | { type: 'tool_use'; name: string }
    | { type: 'text'; text: string }
    | { type: string }
  >;
  message?: {
    content?: Array<
      | { type: 'tool_use'; name: string }
      | { type: 'text'; text: string }
      | { type: string }
    >;
  };
}

interface ClaudeMcpServerConfig {
  command: string;
  args: string[];
  env?: Record<string, string>;
}

interface ClaudeQueryInput {
  prompt: string;
  options: {
    model?: string;
    maxTurns?: number;
    cwd?: string;
    allowedTools?: string[];
    mcpServers: Record<string, ClaudeMcpServerConfig>;
    permissionMode: 'bypassPermissions';
    allowDangerouslySkipPermissions: boolean;
  };
}

type ClaudeQueryStream = AsyncIterable<ClaudeQueryStreamMessage> & {
  mcpServerStatus?: () => Promise<unknown>;
};

type ClaudeQueryFn = (input: ClaudeQueryInput) => ClaudeQueryStream;

let cachedClaudeQuery: ClaudeQueryFn | null = null;

const EVAL_WORKSPACE_ROOT = path.resolve(
  fileURLToPath(new URL('../../../', import.meta.url))
);

const DEFAULT_OPTIONS: SdkRunnerOptions = {
  client: 'claude',
  maxTurns: 10,
  timeout: 60000,
  verbose: false,
};

const DEFAULT_MODELS: Record<EvalClient, string | undefined> = {
  claude: 'claude-sonnet-4-5-20250929',
  codex: undefined,
  cursor: undefined,
};

async function loadClaudeQuery(): Promise<ClaudeQueryFn> {
  if (process.env.OCTOCODE_EVAL_USE_CLAUDE_CLI === 'true') {
    throw new Error('Claude SDK disabled via OCTOCODE_EVAL_USE_CLAUDE_CLI');
  }

  if (cachedClaudeQuery) {
    return cachedClaudeQuery;
  }

  const sdkModule = await import('@anthropic-ai/claude-agent-sdk');
  cachedClaudeQuery = sdkModule.query as ClaudeQueryFn;
  return cachedClaudeQuery;
}

const SYSTEM_PROMPTS: Record<McpProvider, string> = {
  octocode: `You are a code research assistant with access to Octocode MCP tools.
You MUST use the available Octocode tools to research and answer the user's question.
Available tools:
- githubSearchCode: Search for code patterns in GitHub repositories
- githubGetFileContent: Read file contents from GitHub
- githubViewRepoStructure: View repository directory structure
- githubSearchRepositories: Find relevant repositories
- githubSearchPullRequests: Find PRs that introduced features/changes
- packageSearch: Look up npm/pypi packages and their repositories
- localSearchCode: Search code inside the current workspace
- localViewStructure: Inspect directories in the current workspace
- localFindFiles: Find files in the current workspace
- localGetFileContent: Read files in the current workspace
- lspGotoDefinition: Jump to symbol definitions in the current workspace
- lspFindReferences: Find symbol references in the current workspace
- lspCallHierarchy: Trace callers and callees in the current workspace

IMPORTANT: Always use these tools to find accurate, up-to-date information. Do not rely solely on your training data.
When answering, cite the specific files and code you found.`,

  context7: `You are a code research assistant with access to Context7 documentation tools.
You MUST use the available Context7 tools to research and answer the user's question.
Available tools:
- resolve-library-id: Find the Context7 library ID for a package
- query-docs: Query documentation for a specific library

IMPORTANT: Always use these tools to find accurate, up-to-date documentation. Do not rely solely on your training data.
First resolve the library ID, then query the docs.`,

  none: `You are a code research assistant.
Do not use external MCP tools. If your client has built-in local workspace tools, you may use those.
Answer the user's question directly and cite the files or commands you used when possible.`,
};

const OCTOCODE_ALLOWED_TOOLS = [
  'mcp__octocode__githubSearchCode',
  'mcp__octocode__githubGetFileContent',
  'mcp__octocode__githubViewRepoStructure',
  'mcp__octocode__githubSearchRepositories',
  'mcp__octocode__githubSearchPullRequests',
  'mcp__octocode__packageSearch',
  'mcp__octocode__localSearchCode',
  'mcp__octocode__localViewStructure',
  'mcp__octocode__localFindFiles',
  'mcp__octocode__localGetFileContent',
  'mcp__octocode__lspGotoDefinition',
  'mcp__octocode__lspFindReferences',
  'mcp__octocode__lspCallHierarchy',
];

const CONTEXT7_ALLOWED_TOOLS = [
  'mcp__context7__resolve-library-id',
  'mcp__context7__query-docs',
];

function buildOctocodeServerEnv(): Record<string, string> {
  const env: Record<string, string> = {
    ENABLE_LOCAL: 'true',
  };

  const passthroughEnvKeys = [
    'OCTOCODE_TOKEN',
    'GH_TOKEN',
    'GITHUB_TOKEN',
    'ENABLE_CLONE',
  ];

  for (const key of passthroughEnvKeys) {
    const value = process.env[key];
    if (value) {
      env[key] = value;
    }
  }

  return env;
}

function getProviderConfig(provider: McpProvider): {
  servers: Record<string, ClaudeMcpServerConfig>;
  allowedTools: string[];
  systemPrompt: string;
} {
  switch (provider) {
    case 'octocode':
      return {
        servers: {
          octocode: {
            command: 'npx',
            args: ['-y', 'octocode-mcp@latest'],
            env: buildOctocodeServerEnv(),
          },
        },
        allowedTools: OCTOCODE_ALLOWED_TOOLS,
        systemPrompt: SYSTEM_PROMPTS.octocode,
      };
    case 'context7':
      return {
        servers: {
          context7: {
            command: 'npx',
            args: ['-y', '@upstash/context7-mcp@latest'],
          },
        },
        allowedTools: CONTEXT7_ALLOWED_TOOLS,
        systemPrompt: SYSTEM_PROMPTS.context7,
      };
    case 'none':
    default:
      return {
        servers: {},
        allowedTools: [],
        systemPrompt: SYSTEM_PROMPTS.none,
      };
  }
}

function resolveModelForClient(options: SdkRunnerOptions): string | undefined {
  return options.model ?? DEFAULT_MODELS[options.client ?? 'claude'];
}

function buildClientPrompt(
  prompt: string,
  provider: McpProvider,
  client: EvalClient,
  systemPrompt: string
): string {
  if (client === 'claude') {
    return `${systemPrompt}\n\n---\n\nUser Question: ${prompt}`;
  }

  const providerDirective =
    provider === 'octocode'
      ? [
          'Before answering, make at least one Octocode MCP tool call that is relevant to the question.',
          'Use ONLY Octocode MCP tools for research.',
          'Do NOT use built-in shell commands, grep, command_execution, list_mcp_resources, list_mcp_resource_templates, or other non-Octocode tools.',
          'If Octocode MCP is unavailable, say that explicitly instead of silently falling back to built-in tools.',
        ].join('\n')
      : provider === 'context7'
        ? [
            'Before answering, make at least one Context7 MCP tool call that is relevant to the question.',
            'Use ONLY Context7 MCP tools for research.',
            'Do NOT use built-in workspace or shell tools for research.',
            'If Context7 is unavailable, say that explicitly instead of silently falling back to other tools.',
          ].join('\n')
        : 'Do not use external MCP tools. If your client has built-in local workspace tools, you may use them.';

  return [systemPrompt, providerDirective, '', `User Question: ${prompt}`].join(
    '\n\n'
  );
}

function normalizeToolName(name: string): string {
  return name
    .replace(/^mcp__octocode__/, '')
    .replace(/^mcp__context7__/, '')
    .replace(/^octocode-local-/, '')
    .replace(/^octocode-/, '')
    .replace(/^context7-/, '')
    .replace(/ToolCall$/, '');
}

function hasProviderToolUse(
  provider: McpProvider,
  toolsCalled: string[]
): boolean {
  const expectedPrefixes =
    provider === 'octocode'
      ? [
          'githubSearchCode',
          'githubGetFileContent',
          'githubViewRepoStructure',
          'githubSearchRepositories',
          'githubSearchPullRequests',
          'packageSearch',
          'localSearchCode',
          'localViewStructure',
          'localFindFiles',
          'localGetFileContent',
          'lspGotoDefinition',
          'lspFindReferences',
          'lspCallHierarchy',
        ]
      : ['resolve-library-id', 'query-docs', 'resolveLibraryId', 'queryDocs'];

  return toolsCalled.some(tool =>
    expectedPrefixes.some(prefix => normalizeToolName(tool) === prefix)
  );
}

function parseJsonPrefix(value: string): Record<string, unknown> | null {
  const trimmed = value.trim();
  if (!trimmed.startsWith('{')) {
    return null;
  }

  let depth = 0;
  let inString = false;
  let isEscaped = false;

  for (let index = 0; index < trimmed.length; index += 1) {
    const char = trimmed[index];

    if (isEscaped) {
      isEscaped = false;
      continue;
    }

    if (char === '\\') {
      isEscaped = true;
      continue;
    }

    if (char === '"') {
      inString = !inString;
      continue;
    }

    if (inString) {
      continue;
    }

    if (char === '{') {
      depth += 1;
      continue;
    }

    if (char === '}') {
      depth -= 1;
      if (depth === 0) {
        try {
          return JSON.parse(trimmed.slice(0, index + 1)) as Record<
            string,
            unknown
          >;
        } catch {
          return null;
        }
      }
    }
  }

  return null;
}

function countDataResults(data: Record<string, unknown>): number {
  const collections = [
    'files',
    'repositories',
    'packages',
    'locations',
  ] as const;

  for (const key of collections) {
    const value = data[key];
    if (Array.isArray(value)) {
      return value.length;
    }
  }

  const pagination = data.pagination as
    | { totalMatches?: number; totalFiles?: number }
    | undefined;

  return pagination?.totalMatches ?? pagination?.totalFiles ?? 0;
}

function mapStructuredResults(
  results: Array<{
    status?: string;
    data?: Record<string, unknown>;
    error?: string;
    errorCode?: string;
  }>,
  content?: string
): ToolResponse[] {
  return results.map(result => {
    const data = result.data ?? {};
    const status =
      result.status === 'hasResults' ||
      result.status === 'empty' ||
      result.status === 'error'
        ? result.status
        : 'empty';

    return {
      status,
      resultCount: countDataResults(data),
      content: content ?? JSON.stringify(data),
      error: result.error,
      errorCode: result.errorCode,
      ...data,
    };
  });
}

function parseToolResponsesFromCliEvent(
  event: Record<string, unknown>
): ToolResponse[] {
  const toolUseResult = event.tool_use_result as
    | {
        content?: string;
        structuredContent?: {
          results?: Array<{
            status?: string;
            data?: Record<string, unknown>;
            error?: string;
            errorCode?: string;
          }>;
        };
      }
    | undefined;

  const results = toolUseResult?.structuredContent?.results;
  if (!Array.isArray(results)) {
    return [];
  }

  return mapStructuredResults(
    results,
    typeof toolUseResult?.content === 'string'
      ? toolUseResult.content
      : undefined
  );
}

function parseCodexStructuredToolResponses(
  result: Record<string, unknown> | undefined
): ToolResponse[] {
  const structuredContent = result?.structured_content as
    | {
        results?: Array<{
          status?: string;
          data?: Record<string, unknown>;
          error?: string;
          errorCode?: string;
        }>;
      }
    | undefined;

  if (Array.isArray(structuredContent?.results)) {
    return mapStructuredResults(structuredContent.results);
  }

  return [];
}

function resolveWorkspacePath(filePath: string): string {
  if (path.isAbsolute(filePath)) {
    return filePath;
  }

  return path.resolve(EVAL_WORKSPACE_ROOT, filePath.replace(/^\.\//, ''));
}

function parseRgStyleOutput(output: string): ToolResponse[] {
  const fileMatches = new Map<string, Array<{ line: number; value: string }>>();

  for (const rawLine of output.split('\n')) {
    const line = rawLine.trimEnd();
    if (!line) {
      continue;
    }

    const match = line.match(/^(.*?):(\d+):(.*)$/);
    if (!match) {
      continue;
    }

    const filePath = match[1] ?? '';
    const lineNumber = match[2] ?? '0';
    const content = match[3] ?? '';
    const resolvedPath = resolveWorkspacePath(filePath);
    const existing = fileMatches.get(resolvedPath) ?? [];
    existing.push({
      line: Number.parseInt(lineNumber, 10),
      value: content.trim(),
    });
    fileMatches.set(resolvedPath, existing);
  }

  if (fileMatches.size === 0) {
    return [];
  }

  return [
    {
      status: 'hasResults',
      content: output,
      resultCount: fileMatches.size,
      files: Array.from(fileMatches.entries()).map(([filePath, matches]) => ({
        path: filePath,
        matches,
      })),
    },
  ];
}

function parseCursorMcpToolResponses(
  result: Record<string, unknown> | undefined
): ToolResponse[] {
  const success = result?.success as
    | {
        content?: Array<{
          text?: { text?: string };
        }>;
      }
    | undefined;

  const content = success?.content;
  if (!Array.isArray(content)) {
    return [];
  }

  for (const block of content) {
    const textValue = block.text?.text;
    if (!textValue) {
      continue;
    }

    const parsed = parseJsonPrefix(textValue);
    const results = parsed?.results as
      | Array<{
          status?: string;
          data?: Record<string, unknown>;
          error?: string;
          errorCode?: string;
        }>
      | undefined;

    if (Array.isArray(results)) {
      return mapStructuredResults(results, textValue);
    }
  }

  return [];
}

function parseCursorGrepToolResponses(
  result: Record<string, unknown> | undefined
): ToolResponse[] {
  const success = result?.success as
    | {
        workspaceResults?: Record<
          string,
          {
            content?: {
              matches?: Array<{
                file?: string;
                matches?: Array<{
                  lineNumber?: number;
                  content?: string;
                }>;
              }>;
              totalMatchedLines?: number;
            };
          }
        >;
      }
    | undefined;

  const workspaceResults = success?.workspaceResults;
  if (!workspaceResults) {
    return [];
  }

  const files: Array<{
    path: string;
    matches: Array<{ line: number; value: string }>;
  }> = [];
  let resultCount = 0;

  for (const [workspacePath, workspaceResult] of Object.entries(
    workspaceResults
  )) {
    const matches = workspaceResult.content?.matches ?? [];
    for (const match of matches) {
      const filePath =
        typeof match.file === 'string'
          ? path.resolve(workspacePath, match.file.replace(/^\.\//, ''))
          : workspacePath;
      const fileMatches = (match.matches ?? [])
        .filter(
          (entry): entry is { lineNumber: number; content?: string } =>
            typeof entry.lineNumber === 'number'
        )
        .map(entry => ({
          line: entry.lineNumber,
          value: entry.content ?? '',
        }));
      resultCount += fileMatches.length;
      files.push({
        path: filePath,
        matches: fileMatches,
      });
    }
  }

  if (files.length === 0) {
    return [];
  }

  return [
    {
      status: 'hasResults',
      content: JSON.stringify(success),
      resultCount,
      files,
    },
  ];
}

function resolveClaudeCliModel(model?: string): string | undefined {
  if (!model) {
    return undefined;
  }

  if (model.startsWith('claude-sonnet')) {
    return 'sonnet';
  }

  if (model.startsWith('claude-opus')) {
    return 'opus';
  }

  return model;
}

async function runWithClaudeCli(
  prompt: string,
  provider: McpProvider,
  config: {
    servers: Record<string, ClaudeMcpServerConfig>;
    allowedTools: string[];
    systemPrompt: string;
  },
  options: SdkRunnerOptions
): Promise<{
  response: string;
  toolsCalled: string[];
  toolResponses: ToolResponse[];
}> {
  const cliModel = resolveClaudeCliModel(resolveModelForClient(options));
  const args = [
    '-p',
    '--verbose',
    '--output-format',
    'stream-json',
    '--permission-mode',
    'bypassPermissions',
    '--tools',
    '',
  ];

  if (cliModel) {
    args.push('--model', cliModel);
  }

  if (provider !== 'none') {
    if (Object.keys(config.servers).length > 0) {
      args.push(
        '--system-prompt',
        config.systemPrompt,
        '--strict-mcp-config',
        '--mcp-config',
        JSON.stringify({ mcpServers: config.servers }),
        '--add-dir',
        EVAL_WORKSPACE_ROOT
      );
    }

    if (config.allowedTools.length > 0) {
      args.push('--allowedTools', config.allowedTools.join(','));
    }
  }

  args.push('--', prompt);

  return await new Promise((resolve, reject) => {
    const child = spawn('claude', args, {
      cwd: EVAL_WORKSPACE_ROOT,
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    const toolsCalled: string[] = [];
    const toolResponses: ToolResponse[] = [];
    let response = '';
    let stdoutBuffer = '';
    let stderrBuffer = '';

    const timeoutMs = options.timeout ?? DEFAULT_OPTIONS.timeout ?? 60000;
    const timeoutId = setTimeout(() => {
      child.kill('SIGTERM');
    }, timeoutMs);

    const flushStdoutLines = (chunk: string, flushAll: boolean = false) => {
      stdoutBuffer += chunk;
      const lines = stdoutBuffer.split('\n');

      if (!flushAll) {
        stdoutBuffer = lines.pop() ?? '';
      } else {
        stdoutBuffer = '';
      }

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) {
          continue;
        }

        try {
          const event = JSON.parse(trimmed) as Record<string, unknown>;
          const eventType = event.type;

          if (eventType === 'assistant') {
            const message = event.message as
              | {
                  content?: Array<
                    | { type: 'tool_use'; name: string }
                    | { type: 'text'; text: string }
                    | { type: string }
                  >;
                }
              | undefined;
            const content = message?.content;
            if (Array.isArray(content)) {
              for (const block of content) {
                if (block.type === 'tool_use' && 'name' in block) {
                  toolsCalled.push(normalizeToolName(block.name));
                }
                if (block.type === 'text' && 'text' in block) {
                  response += block.text;
                }
              }
            }
          }

          if (eventType === 'user') {
            toolResponses.push(...parseToolResponsesFromCliEvent(event));
          }

          if (
            eventType === 'result' &&
            event.subtype === 'success' &&
            typeof event.result === 'string'
          ) {
            response = event.result;
          }
        } catch {
          // Ignore non-JSON lines from the CLI.
        }
      }
    };

    child.stdout.on('data', chunk => {
      flushStdoutLines(chunk.toString());
    });

    child.stderr.on('data', chunk => {
      stderrBuffer += chunk.toString();
    });

    child.on('error', error => {
      clearTimeout(timeoutId);
      reject(error);
    });

    child.on('close', code => {
      clearTimeout(timeoutId);
      if (stdoutBuffer.trim()) {
        flushStdoutLines('', true);
      }

      if (code !== 0) {
        const message =
          stderrBuffer.trim() || `Claude CLI exited with code ${code}`;
        reject(new Error(message));
        return;
      }

      resolve({ response, toolsCalled, toolResponses });
    });
  });
}

function buildCodexOctocodeConfigArgs(): string[] {
  const args = [
    '-c',
    'mcp_servers.octocode.command="npx"',
    '-c',
    'mcp_servers.octocode.args=["-y","octocode-mcp@latest"]',
  ];

  for (const [key, value] of Object.entries(buildOctocodeServerEnv())) {
    args.push('-c', `mcp_servers.octocode.env.${key}=${JSON.stringify(value)}`);
  }

  return args;
}

async function runWithCodexCli(
  prompt: string,
  provider: McpProvider,
  options: SdkRunnerOptions
): Promise<{
  response: string;
  toolsCalled: string[];
  toolResponses: ToolResponse[];
}> {
  if (provider === 'context7') {
    throw new Error('client=codex does not support provider=context7');
  }

  const args = [
    'exec',
    '--json',
    '-C',
    EVAL_WORKSPACE_ROOT,
    '--dangerously-bypass-approvals-and-sandbox',
  ];
  const model = resolveModelForClient(options);

  if (model) {
    args.push('--model', model);
  }

  if (provider === 'octocode') {
    args.push(...buildCodexOctocodeConfigArgs());
  }

  args.push(prompt);

  return await new Promise((resolve, reject) => {
    const child = spawn('codex', args, {
      cwd: EVAL_WORKSPACE_ROOT,
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    const toolsCalled: string[] = [];
    const toolResponses: ToolResponse[] = [];
    const observedToolCallIds = new Set<string>();
    let response = '';
    let stdoutBuffer = '';
    let stderrBuffer = '';

    const timeoutMs = options.timeout ?? DEFAULT_OPTIONS.timeout ?? 60000;
    const timeoutId = setTimeout(() => {
      child.kill('SIGTERM');
    }, timeoutMs);

    const flushStdoutLines = (chunk: string, flushAll: boolean = false) => {
      stdoutBuffer += chunk;
      const lines = stdoutBuffer.split('\n');

      if (!flushAll) {
        stdoutBuffer = lines.pop() ?? '';
      } else {
        stdoutBuffer = '';
      }

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('{')) {
          continue;
        }

        try {
          const event = JSON.parse(trimmed) as Record<string, unknown>;
          const eventType = typeof event.type === 'string' ? event.type : '';
          if (eventType !== 'item.started' && eventType !== 'item.completed') {
            continue;
          }

          const item = event.item as Record<string, unknown> | undefined;
          const itemType =
            typeof item?.type === 'string' ? item.type : undefined;
          const itemId = typeof item?.id === 'string' ? item.id : undefined;

          if (itemType === 'mcp_tool_call') {
            if (
              itemId &&
              !observedToolCallIds.has(itemId) &&
              typeof item?.tool === 'string'
            ) {
              observedToolCallIds.add(itemId);
              toolsCalled.push(normalizeToolName(item.tool));
            }

            if (eventType === 'item.completed') {
              toolResponses.push(
                ...parseCodexStructuredToolResponses(
                  item?.result as Record<string, unknown> | undefined
                )
              );
            }
            continue;
          }

          if (
            eventType === 'item.completed' &&
            itemType === 'agent_message' &&
            typeof item?.text === 'string'
          ) {
            response = item.text;
            continue;
          }

          if (
            eventType === 'item.completed' &&
            itemType === 'command_execution' &&
            typeof item?.aggregated_output === 'string'
          ) {
            toolsCalled.push('command_execution');
            const parsedResponses = parseRgStyleOutput(item.aggregated_output);
            toolResponses.push(
              ...(parsedResponses.length > 0
                ? parsedResponses
                : [
                    {
                      status: 'hasResults' as const,
                      content: item.aggregated_output,
                      resultCount: 1,
                    },
                  ])
            );
          }
        } catch {
          // Ignore non-JSON and non-event lines from the CLI.
        }
      }
    };

    child.stdout.on('data', chunk => {
      flushStdoutLines(chunk.toString());
    });

    child.stderr.on('data', chunk => {
      stderrBuffer += chunk.toString();
    });

    child.on('error', error => {
      clearTimeout(timeoutId);
      reject(error);
    });

    child.on('close', code => {
      clearTimeout(timeoutId);
      if (stdoutBuffer.trim()) {
        flushStdoutLines('', true);
      }

      if (code !== 0) {
        const message =
          stderrBuffer.trim() || `Codex CLI exited with code ${code}`;
        reject(new Error(message));
        return;
      }

      resolve({ response, toolsCalled, toolResponses });
    });
  });
}

function getCursorToolCallName(
  toolCall: Record<string, unknown>
): string | undefined {
  const [entryName, payload] = Object.entries(toolCall)[0] ?? [];
  if (!entryName || !payload || typeof payload !== 'object') {
    return undefined;
  }

  if ('args' in payload && payload.args && typeof payload.args === 'object') {
    const args = payload.args as Record<string, unknown>;
    if (typeof args.toolName === 'string') {
      return normalizeToolName(args.toolName);
    }
    if (typeof args.name === 'string') {
      return normalizeToolName(args.name);
    }
  }

  return normalizeToolName(entryName);
}

function parseCursorToolResponses(
  toolCall: Record<string, unknown>
): ToolResponse[] {
  if ('mcpToolCall' in toolCall && toolCall.mcpToolCall) {
    const mcpToolCall = toolCall.mcpToolCall as Record<string, unknown>;
    const result = mcpToolCall.result as Record<string, unknown> | undefined;
    if (result?.rejected) {
      return [];
    }
    return parseCursorMcpToolResponses(result);
  }

  if ('grepToolCall' in toolCall && toolCall.grepToolCall) {
    const grepToolCall = toolCall.grepToolCall as Record<string, unknown>;
    return parseCursorGrepToolResponses(
      grepToolCall.result as Record<string, unknown> | undefined
    );
  }

  return [];
}

async function runWithCursorCli(
  prompt: string,
  provider: McpProvider,
  options: SdkRunnerOptions
): Promise<{
  response: string;
  toolsCalled: string[];
  toolResponses: ToolResponse[];
}> {
  if (provider === 'context7') {
    throw new Error('client=cursor does not support provider=context7');
  }

  const args = [
    'agent',
    '--print',
    '--output-format',
    'stream-json',
    '--trust',
    '--workspace',
    EVAL_WORKSPACE_ROOT,
  ];
  const model = resolveModelForClient(options);

  if (model) {
    args.push('--model', model);
  }

  if (provider === 'octocode') {
    args.push('--approve-mcps', '--yolo', '--sandbox', 'disabled');
  }

  args.push(prompt);

  return await new Promise((resolve, reject) => {
    const child = spawn('cursor', args, {
      cwd: EVAL_WORKSPACE_ROOT,
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    const toolsCalled: string[] = [];
    const toolResponses: ToolResponse[] = [];
    const observedToolCallIds = new Set<string>();
    let response = '';
    let stdoutBuffer = '';
    let stderrBuffer = '';

    const timeoutMs = options.timeout ?? DEFAULT_OPTIONS.timeout ?? 60000;
    const timeoutId = setTimeout(() => {
      child.kill('SIGTERM');
    }, timeoutMs);

    const flushStdoutLines = (chunk: string, flushAll: boolean = false) => {
      stdoutBuffer += chunk;
      const lines = stdoutBuffer.split('\n');

      if (!flushAll) {
        stdoutBuffer = lines.pop() ?? '';
      } else {
        stdoutBuffer = '';
      }

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('{')) {
          continue;
        }

        try {
          const event = JSON.parse(trimmed) as Record<string, unknown>;

          if (event.type === 'assistant') {
            const message = event.message as
              | {
                  content?: Array<{ type?: string; text?: string }>;
                }
              | undefined;
            const textContent = message?.content
              ?.filter(block => block.type === 'text' && block.text)
              .map(block => block.text?.trim())
              .filter(Boolean)
              .join('\n');

            if (textContent) {
              response = textContent;
            }
          }

          if (
            event.type === 'tool_call' &&
            event.tool_call &&
            typeof event.tool_call === 'object'
          ) {
            const toolCall = event.tool_call as Record<string, unknown>;
            const name = getCursorToolCallName(toolCall);
            const callId =
              typeof event.call_id === 'string' ? event.call_id : undefined;

            if (name && callId && !observedToolCallIds.has(callId)) {
              observedToolCallIds.add(callId);
              toolsCalled.push(name);
            }

            if (event.subtype === 'completed') {
              toolResponses.push(...parseCursorToolResponses(toolCall));
            }
          }

          if (
            event.type === 'result' &&
            event.subtype === 'success' &&
            typeof event.result === 'string'
          ) {
            response = event.result;
          }
        } catch {
          // Ignore non-JSON and progress lines from Cursor.
        }
      }
    };

    child.stdout.on('data', chunk => {
      flushStdoutLines(chunk.toString());
    });

    child.stderr.on('data', chunk => {
      stderrBuffer += chunk.toString();
    });

    child.on('error', error => {
      clearTimeout(timeoutId);
      reject(error);
    });

    child.on('close', code => {
      clearTimeout(timeoutId);
      if (stdoutBuffer.trim()) {
        flushStdoutLines('', true);
      }

      if (code !== 0) {
        const message =
          stderrBuffer.trim() || `Cursor CLI exited with code ${code}`;
        reject(new Error(message));
        return;
      }

      resolve({ response, toolsCalled, toolResponses });
    });
  });
}

/**
 * Run a single prompt with a specific MCP provider
 */
export async function runWithProvider(
  prompt: string,
  provider: McpProvider,
  options: SdkRunnerOptions = {}
): Promise<{
  response: string;
  toolsCalled: string[];
  toolResponses: ToolResponse[];
}> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const config = getProviderConfig(provider);
  const client = opts.client ?? DEFAULT_OPTIONS.client ?? 'claude';
  const fullPrompt = buildClientPrompt(
    prompt,
    provider,
    client,
    config.systemPrompt
  );
  const toolsCalled: string[] = [];
  const toolResponses: ToolResponse[] = [];
  let response = '';

  try {
    if (opts.client === 'codex') {
      const result = await runWithCodexCli(fullPrompt, provider, opts);
      if (
        provider !== 'none' &&
        !hasProviderToolUse(provider, result.toolsCalled)
      ) {
        result.toolResponses.push({
          status: 'error',
          error: `${provider} provider was requested but no ${provider} tool call was observed`,
          content: result.response,
          resultCount: 0,
        });
      }

      return result;
    }

    if (opts.client === 'cursor') {
      const result = await runWithCursorCli(fullPrompt, provider, opts);
      if (
        provider !== 'none' &&
        !hasProviderToolUse(provider, result.toolsCalled)
      ) {
        result.toolResponses.push({
          status: 'error',
          error: `${provider} provider was requested but no ${provider} tool call was observed`,
          content: result.response,
          resultCount: 0,
        });
      }

      return result;
    }

    let usedCliFallback = false;
    let query: ClaudeQueryFn | null = null;

    try {
      query = await loadClaudeQuery();
    } catch {
      usedCliFallback = true;
    }

    if (usedCliFallback || !query) {
      const result = await runWithClaudeCli(fullPrompt, provider, config, opts);
      if (
        provider !== 'none' &&
        !hasProviderToolUse(provider, result.toolsCalled)
      ) {
        result.toolResponses.push({
          status: 'error',
          error: `${provider} provider was requested but no ${provider} tool call was observed`,
          content: result.response,
          resultCount: 0,
        });
      }
      return result;
    }

    const q = query({
      prompt: fullPrompt,
      options: {
        model: resolveModelForClient(opts),
        maxTurns: provider === 'none' ? 1 : opts.maxTurns,
        cwd: EVAL_WORKSPACE_ROOT,
        allowedTools: config.allowedTools,
        mcpServers: config.servers,
        // Bypass permissions for automated eval
        permissionMode: 'bypassPermissions',
        allowDangerouslySkipPermissions: true,
      },
    });

    if (opts.verbose && provider !== 'none') {
      if (typeof q.mcpServerStatus === 'function') {
        await q.mcpServerStatus();
      }
    }

    for await (const message of q) {
      // Extract tool calls
      if (message.type === 'assistant') {
        const content = message.content ?? message.message?.content;
        if (Array.isArray(content)) {
          for (const block of content) {
            if (block.type === 'tool_use' && 'name' in block) {
              toolsCalled.push(normalizeToolName(block.name));
            }
            if (block.type === 'text' && 'text' in block) {
              response += block.text;
            }
          }
        }
      }

      // Final result
      if (message.type === 'result' && message.subtype === 'success') {
        response = message.result || response;
      }
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    toolResponses.push({
      status: 'error',
      error: errorMessage,
      content: errorMessage,
      resultCount: 0,
    });
  }

  if (provider !== 'none' && !hasProviderToolUse(provider, toolsCalled)) {
    toolResponses.push({
      status: 'error',
      error: `${provider} provider was requested but no ${provider} tool call was observed`,
      content: response,
      resultCount: 0,
    });
  }

  return { response, toolsCalled, toolResponses };
}

// Legacy exports for backwards compatibility
export async function runWithOctocode(
  prompt: string,
  options: SdkRunnerOptions = {}
) {
  return runWithProvider(prompt, 'octocode', options);
}

export async function runWithContext7(
  prompt: string,
  options: SdkRunnerOptions = {}
) {
  return runWithProvider(prompt, 'context7', options);
}

export async function runWithoutOctocode(
  prompt: string,
  options: SdkRunnerOptions = {}
): Promise<{ response: string }> {
  const result = await runWithProvider(prompt, 'none', options);
  return { response: result.response };
}

/**
 * Run eval with a single provider and score it
 */
async function runAndScoreProvider(
  testCase: EvalTestCase,
  provider: McpProvider,
  options: SdkRunnerOptions
): Promise<ProviderResult> {
  const scorers = createDefaultScorers();
  const startTime = Date.now();

  const result = await runWithProvider(testCase.prompt, provider, options);

  const endTime = Date.now();

  const responses: ToolResponse[] =
    result.toolResponses.length > 0
      ? result.toolResponses
      : [
          {
            status: result.toolsCalled.length > 0 ? 'hasResults' : 'empty',
            content: result.response,
            resultCount: result.toolsCalled.length > 0 ? 1 : 0,
          },
        ];

  const evalResult = await runSingleEval(
    testCase,
    responses,
    result.toolsCalled,
    scorers,
    startTime,
    endTime,
    provider,
    result.response
  );

  return {
    provider,
    response: result.response,
    toolsCalled: result.toolsCalled,
    toolResponses: result.toolResponses,
    latencyMs: endTime - startTime,
    evalResult,
  };
}

/**
 * Run a full multi-provider comparison eval for a test case
 */
export async function runMultiProviderEval(
  testCase: EvalTestCase,
  providers: McpProvider[] = ['octocode', 'context7', 'none'],
  options: SdkRunnerOptions = {}
): Promise<MultiProviderEvalResult> {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  const results: Record<McpProvider, ProviderResult> = {} as Record<
    McpProvider,
    ProviderResult
  >;

  for (const provider of providers) {
    results[provider] = await runAndScoreProvider(testCase, provider, opts);
  }

  // Rank providers by score
  const rankings = providers
    .filter(p => results[p])
    .sort(
      (a, b) => results[b].evalResult.overall - results[a].evalResult.overall
    );

  // Calculate deltas
  const octocodeScore = results.octocode?.evalResult.overall ?? 0;
  const context7Score = results.context7?.evalResult.overall ?? 0;
  const baselineScore = results.none?.evalResult.overall ?? 0;

  return {
    testCase: testCase.name,
    results,
    rankings,
    deltas: {
      octocodeVsBaseline: octocodeScore - baselineScore,
      context7VsBaseline: context7Score - baselineScore,
      octocodeVsContext7: octocodeScore - context7Score,
    },
  };
}

/**
 * Run batch multi-provider evals
 */
export async function runBatchMultiProviderEval(
  testCases: EvalTestCase[],
  providers: McpProvider[] = ['octocode', 'context7', 'none'],
  options: SdkRunnerOptions = {}
): Promise<{
  results: MultiProviderEvalResult[];
  summary: {
    total: number;
    byProvider: Record<McpProvider, { avgScore: number; avgLatency: number }>;
    octocodeWins: number;
    context7Wins: number;
    ties: number;
    avgDeltas: {
      octocodeVsBaseline: number;
      context7VsBaseline: number;
      octocodeVsContext7: number;
    };
  };
}> {
  const results: MultiProviderEvalResult[] = [];

  for (const testCase of testCases) {
    try {
      const result = await runMultiProviderEval(testCase, providers, options);
      results.push(result);
    } catch {
      // Test case failed - continue with others
    }
  }

  // Calculate summary stats
  const byProvider: Record<
    McpProvider,
    { avgScore: number; avgLatency: number }
  > = {} as Record<McpProvider, { avgScore: number; avgLatency: number }>;

  for (const provider of providers) {
    const providerResults = results
      .filter(r => r.results[provider])
      .map(r => r.results[provider]);

    byProvider[provider] = {
      avgScore:
        providerResults.reduce((sum, r) => sum + r.evalResult.overall, 0) /
          providerResults.length || 0,
      avgLatency:
        providerResults.reduce((sum, r) => sum + r.latencyMs, 0) /
          providerResults.length || 0,
    };
  }

  // Count wins (Octocode vs Context7)
  let octocodeWins = 0;
  let context7Wins = 0;
  let ties = 0;

  for (const result of results) {
    const octocodeScore = result.results.octocode?.evalResult.overall ?? 0;
    const context7Score = result.results.context7?.evalResult.overall ?? 0;

    if (Math.abs(octocodeScore - context7Score) < 0.01) {
      ties++;
    } else if (octocodeScore > context7Score) {
      octocodeWins++;
    } else {
      context7Wins++;
    }
  }

  // Average deltas
  const avgDeltas = {
    octocodeVsBaseline:
      results.reduce((sum, r) => sum + r.deltas.octocodeVsBaseline, 0) /
        results.length || 0,
    context7VsBaseline:
      results.reduce((sum, r) => sum + r.deltas.context7VsBaseline, 0) /
        results.length || 0,
    octocodeVsContext7:
      results.reduce((sum, r) => sum + r.deltas.octocodeVsContext7, 0) /
        results.length || 0,
  };

  return {
    results,
    summary: {
      total: results.length,
      byProvider,
      octocodeWins,
      context7Wins,
      ties,
      avgDeltas,
    },
  };
}

/**
 * Format multi-provider comparison results for console output
 */
export function formatMultiProviderResults(
  results: MultiProviderEvalResult[],
  client: EvalClient,
  summary: {
    total: number;
    byProvider: Record<McpProvider, { avgScore: number; avgLatency: number }>;
    octocodeWins: number;
    context7Wins: number;
    ties: number;
    avgDeltas: {
      octocodeVsBaseline: number;
      context7VsBaseline: number;
      octocodeVsContext7: number;
    };
  }
): string {
  const lines: string[] = [];

  lines.push('');
  lines.push(
    '══════════════════════════════════════════════════════════════════════════════'
  );
  lines.push(
    '               OCTOCODE vs CONTEXT7 vs NO-OCTOCODE-MCP                       '
  );
  lines.push(
    '══════════════════════════════════════════════════════════════════════════════'
  );
  lines.push('');
  lines.push(
    'Test Case                            Octocode  Context7   No MCP    Winner'
  );
  lines.push(
    '─────────────────────────────────────────────────────────────────────────────'
  );

  for (const result of results) {
    const name = result.testCase.slice(0, 35).padEnd(35);
    const octocode = result.results.octocode
      ? `${(result.results.octocode.evalResult.overall * 100).toFixed(0)}%`.padStart(
          6
        )
      : '  N/A ';
    const octocodeTools = result.results.octocode?.toolsCalled.length ?? 0;
    const context7 = result.results.context7
      ? `${(result.results.context7.evalResult.overall * 100).toFixed(0)}%`.padStart(
          6
        )
      : '  N/A ';
    const context7Tools = result.results.context7?.toolsCalled.length ?? 0;
    const noMcp = result.results.none
      ? `${(result.results.none.evalResult.overall * 100).toFixed(0)}%`.padStart(
          6
        )
      : '  N/A ';
    const noMcpTools = result.results.none?.toolsCalled.length ?? 0;

    const winner = result.rankings[0] ?? 'none';
    const winnerIcon =
      winner === 'octocode' ? '🔵' : winner === 'context7' ? '🟢' : '⚪';

    lines.push(
      `${name}  ${octocode}    ${context7}    ${noMcp}    ${winnerIcon} ${winner}  [tools o:${octocodeTools} c:${context7Tools} n:${noMcpTools}]`
    );
  }

  lines.push('');
  lines.push(
    '══════════════════════════════════════════════════════════════════════════════'
  );
  lines.push(
    '                              SUMMARY                                        '
  );
  lines.push(
    '─────────────────────────────────────────────────────────────────────────────'
  );

  // Provider averages
  lines.push('');
  lines.push('Average Scores:');
  if (summary.byProvider.octocode) {
    lines.push(
      `  🔵 Octocode:  ${(summary.byProvider.octocode.avgScore * 100).toFixed(1)}%  (avg ${Math.round(summary.byProvider.octocode.avgLatency)}ms)`
    );
  }
  if (summary.byProvider.context7) {
    lines.push(
      `  🟢 Context7:  ${(summary.byProvider.context7.avgScore * 100).toFixed(1)}%  (avg ${Math.round(summary.byProvider.context7.avgLatency)}ms)`
    );
  }
  if (summary.byProvider.none) {
    lines.push(
      `  ⚪ No Octocode MCP:  ${(summary.byProvider.none.avgScore * 100).toFixed(1)}%  (avg ${Math.round(summary.byProvider.none.avgLatency)}ms)`
    );
  }

  lines.push('');
  lines.push('Head-to-Head (Octocode vs Context7):');
  lines.push(
    `  Octocode wins: ${summary.octocodeWins}  |  Context7 wins: ${summary.context7Wins}  |  Ties: ${summary.ties}`
  );

  lines.push('');
  lines.push('Improvement Over No-Octocode-MCP Lane:');
  lines.push(
    `  Octocode: ${summary.avgDeltas.octocodeVsBaseline >= 0 ? '+' : ''}${(summary.avgDeltas.octocodeVsBaseline * 100).toFixed(1)}%`
  );
  lines.push(
    `  Context7: ${summary.avgDeltas.context7VsBaseline >= 0 ? '+' : ''}${(summary.avgDeltas.context7VsBaseline * 100).toFixed(1)}%`
  );

  lines.push('');
  lines.push(
    client === 'claude'
      ? 'Note: in the no-MCP lane, Claude built-in tools are disabled.'
      : 'Note: in the no-MCP lane, native client tools may still be available.'
  );
  lines.push('');
  lines.push(
    '══════════════════════════════════════════════════════════════════════════════'
  );

  return lines.join('\n');
}

// Legacy types and functions for backwards compatibility
export interface SdkEvalResult {
  testCase: string;
  withOctocode: EvalResult;
  withoutOctocode: EvalResult;
  delta: number;
  improved: boolean;
  toolsUsed: string[];
  withoutToolsUsed: number;
  rawResponses: {
    with: string;
    without: string;
  };
}

export async function runComparisonEval(
  testCase: EvalTestCase,
  options: SdkRunnerOptions = {}
): Promise<SdkEvalResult> {
  const result = await runMultiProviderEval(
    testCase,
    ['octocode', 'none'],
    options
  );

  return {
    testCase: testCase.name,
    withOctocode: result.results.octocode.evalResult,
    withoutOctocode: result.results.none.evalResult,
    delta: result.deltas.octocodeVsBaseline,
    improved: result.deltas.octocodeVsBaseline > 0,
    toolsUsed: result.results.octocode.toolsCalled,
    withoutToolsUsed: result.results.none?.toolsCalled.length ?? 0,
    rawResponses: {
      with: result.results.octocode.response,
      without: result.results.none.response,
    },
  };
}

export async function runBatchComparisonEval(
  testCases: EvalTestCase[],
  options: SdkRunnerOptions = {}
): Promise<{
  results: SdkEvalResult[];
  summary: {
    total: number;
    improved: number;
    degraded: number;
    avgDelta: number;
    avgWithScore: number;
    avgWithoutScore: number;
  };
}> {
  const batchResult = await runBatchMultiProviderEval(
    testCases,
    ['octocode', 'none'],
    options
  );

  const results: SdkEvalResult[] = batchResult.results.map(r => ({
    testCase: r.testCase,
    withOctocode: r.results.octocode.evalResult,
    withoutOctocode: r.results.none.evalResult,
    delta: r.deltas.octocodeVsBaseline,
    improved: r.deltas.octocodeVsBaseline > 0,
    toolsUsed: r.results.octocode.toolsCalled,
    withoutToolsUsed: r.results.none?.toolsCalled.length ?? 0,
    rawResponses: {
      with: r.results.octocode.response,
      without: r.results.none.response,
    },
  }));

  const improved = results.filter(r => r.improved).length;
  const degraded = results.filter(r => !r.improved && r.delta < 0).length;

  return {
    results,
    summary: {
      total: results.length,
      improved,
      degraded,
      avgDelta: batchResult.summary.avgDeltas.octocodeVsBaseline,
      avgWithScore: batchResult.summary.byProvider.octocode?.avgScore ?? 0,
      avgWithoutScore: batchResult.summary.byProvider.none?.avgScore ?? 0,
    },
  };
}

export function formatComparisonResults(
  results: SdkEvalResult[],
  client: EvalClient,
  summary: {
    total: number;
    improved: number;
    degraded: number;
    avgDelta: number;
    avgWithScore: number;
    avgWithoutScore: number;
  }
): string {
  const lines: string[] = [];

  lines.push('');
  lines.push('═══════════════════════════════════════════════════════════════');
  lines.push(
    '              OCTOCODE vs NO-OCTOCODE-MCP COMPARISON            '
  );
  lines.push('═══════════════════════════════════════════════════════════════');
  lines.push('');

  for (const result of results) {
    const icon = result.improved ? '↑' : result.delta < 0 ? '↓' : '=';
    const withScore = (result.withOctocode.overall * 100).toFixed(1);
    const noMcpScore = (result.withoutOctocode.overall * 100).toFixed(1);
    const delta = (result.delta * 100).toFixed(1);
    const deltaStr = result.delta >= 0 ? `+${delta}` : delta;
    const name = result.testCase.slice(0, 35).padEnd(35);
    const tools = result.toolsUsed.length;
    const withoutTools = result.withoutToolsUsed;
    const laneWarning =
      client !== 'claude' && withoutTools > 0
        ? ' ⚠ baseline lane used client tools'
        : '';

    lines.push(
      `${icon} ${name} ${withScore.padStart(5)}% vs ${noMcpScore.padStart(5)}%  (${deltaStr.padStart(6)}%)  [with:${tools} no:${withoutTools}]${laneWarning}`
    );
  }

  lines.push('');
  lines.push('───────────────────────────────────────────────────────────────');
  lines.push(
    `Total: ${summary.total} | Improved: ${summary.improved} | Degraded: ${summary.degraded}`
  );
  lines.push(
    `Avg With Octocode: ${(summary.avgWithScore * 100).toFixed(1)}% | No Octocode MCP: ${(summary.avgWithoutScore * 100).toFixed(1)}%`
  );
  lines.push(
    `Average Delta: ${summary.avgDelta >= 0 ? '+' : ''}${(summary.avgDelta * 100).toFixed(1)}%`
  );
  lines.push(
    client === 'claude'
      ? 'Note: the no-MCP lane disables Claude built-in tools.'
      : 'Note: the no-MCP lane still allows native client tools; it is not a true no-tools baseline.'
  );
  lines.push('═══════════════════════════════════════════════════════════════');

  return lines.join('\n');
}
