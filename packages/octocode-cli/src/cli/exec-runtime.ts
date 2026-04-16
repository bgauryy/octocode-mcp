import vm from 'node:vm';
import { z } from 'zod/v4';
import {
  TOOL_DEFINITIONS,
  applyDefaultQueryFields,
  normalizeQueryObject,
  ensureToolRuntimeReady,
  type ToolDefinition,
  type ToolResult,
} from './tool-command.js';

export type OctToolFn = (input?: unknown) => Promise<ToolResult>;

export interface OctNamespace {
  searchCode: OctToolFn;
  getFile: OctToolFn;
  viewStructure: OctToolFn;
  searchRepos: OctToolFn;
  searchPullRequests: OctToolFn;
  packageSearch: OctToolFn;
  localSearchCode: OctToolFn;
  localGetFile: OctToolFn;
  localFindFiles: OctToolFn;
  localViewStructure: OctToolFn;
  lspGotoDefinition: OctToolFn;
  lspFindReferences: OctToolFn;
  lspCallHierarchy: OctToolFn;
  tool: (name: string, input?: unknown) => Promise<ToolResult>;
  tools: () => string[];
}

const OCT_NAMESPACE_MAP: Record<string, string> = {
  githubSearchCode: 'searchCode',
  githubGetFileContent: 'getFile',
  githubViewRepoStructure: 'viewStructure',
  githubSearchRepositories: 'searchRepos',
  githubSearchPullRequests: 'searchPullRequests',
  packageSearch: 'packageSearch',
  localSearchCode: 'localSearchCode',
  localGetFileContent: 'localGetFile',
  localFindFiles: 'localFindFiles',
  localViewStructure: 'localViewStructure',
  lspGotoDefinition: 'lspGotoDefinition',
  lspFindReferences: 'lspFindReferences',
  lspCallHierarchy: 'lspCallHierarchy',
};

function findDefinition(toolName: string): ToolDefinition {
  const def = TOOL_DEFINITIONS.find(t => t.name === toolName);
  if (!def) {
    throw new Error(`Unknown Octocode tool: ${toolName}`);
  }
  return def;
}

interface NormalizedPayload {
  queries: Array<Record<string, unknown>>;
  responseCharLength?: number;
  responseCharOffset?: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeInput(toolName: string, input: unknown): NormalizedPayload {
  let rawQueries: unknown[] = [];
  let responseCharLength: number | undefined;
  let responseCharOffset: number | undefined;

  if (input === undefined) {
    throw new Error(`oct.${toolName} requires an input object.`);
  }

  if (Array.isArray(input)) {
    rawQueries = input;
  } else if (isRecord(input) && Array.isArray(input.queries)) {
    rawQueries = input.queries;
    if (typeof input.responseCharLength === 'number') {
      responseCharLength = input.responseCharLength;
    }
    if (typeof input.responseCharOffset === 'number') {
      responseCharOffset = input.responseCharOffset;
    }
  } else if (isRecord(input)) {
    rawQueries = [input];
  } else {
    throw new Error(
      `oct.${toolName}: input must be an object, array of objects, or { queries: [...] }.`
    );
  }

  if (rawQueries.length === 0) {
    throw new Error(`oct.${toolName}: at least one query is required.`);
  }

  const queries = rawQueries.map((query, index) =>
    applyDefaultQueryFields(toolName, index, normalizeQueryObject(query))
  );

  return { queries, responseCharLength, responseCharOffset };
}

function formatZodIssues(error: z.ZodError): string {
  return error.issues
    .map(issue => {
      const path = issue.path.length > 0 ? issue.path.join('.') : 'input';
      return `${path}: ${issue.message}`;
    })
    .join('; ');
}

async function runTool(toolName: string, input: unknown): Promise<ToolResult> {
  const def = findDefinition(toolName);
  const payload = normalizeInput(toolName, input);

  const parsed = payload.queries.map(q => def.schema.safeParse(q));
  const failure = parsed.find(r => !r.success);
  if (failure && !failure.success) {
    throw new Error(
      `oct.${toolName}: input validation failed — ${formatZodIssues(failure.error)}`
    );
  }

  const validated = parsed
    .filter(
      (r): r is z.ZodSafeParseSuccess<Record<string, unknown>> => r.success
    )
    .map(r => r.data);

  await ensureToolRuntimeReady();

  return def.execute({
    queries: validated,
    responseCharLength: payload.responseCharLength,
    responseCharOffset: payload.responseCharOffset,
  });
}

export function createOctNamespace(): OctNamespace {
  const ns: Record<string, unknown> = {
    tool: (name: string, input?: unknown) => runTool(name, input),
    tools: () => TOOL_DEFINITIONS.map(t => t.name),
  };

  for (const def of TOOL_DEFINITIONS) {
    const alias = OCT_NAMESPACE_MAP[def.name];
    if (!alias) continue;
    ns[alias] = (input?: unknown) => runTool(def.name, input);
  }

  return ns as unknown as OctNamespace;
}

export interface RunScriptOptions {
  timeoutMs?: number;
  filename?: string;
  onLog?: (line: string) => void;
}

export interface RunScriptResult {
  returnValue: unknown;
  logs: string[];
}

const DEFAULT_TIMEOUT_MS = 60_000;

function formatLogArg(arg: unknown): string {
  if (typeof arg === 'string') return arg;
  if (arg instanceof Error) return arg.stack ?? arg.message;
  try {
    return JSON.stringify(arg);
  } catch {
    return String(arg);
  }
}

function buildSandboxedConsole(
  logs: string[],
  onLog?: (line: string) => void
): Console {
  const record =
    (level: string) =>
    (...args: unknown[]) => {
      const line = args.map(formatLogArg).join(' ');
      const tagged = level === 'log' ? line : `[${level}] ${line}`;
      logs.push(tagged);
      onLog?.(tagged);
    };

  return {
    log: record('log'),
    info: record('info'),
    warn: record('warn'),
    error: record('error'),
    debug: record('debug'),
    trace: record('trace'),
  } as unknown as Console;
}

export async function runOctocodeScript(
  code: string,
  options: RunScriptOptions = {}
): Promise<RunScriptResult> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const filename = options.filename ?? 'octocode-exec.js';
  const logs: string[] = [];

  const oct = createOctNamespace();
  const sandboxConsole = buildSandboxedConsole(logs, options.onLog);

  const context = vm.createContext({
    oct,
    console: sandboxConsole,
    JSON,
    Math,
    Date,
    Promise,
    Array,
    Object,
    Map,
    Set,
    WeakMap,
    WeakSet,
    Symbol,
    Number,
    String,
    Boolean,
    RegExp,
    Error,
    TypeError,
    RangeError,
    URL,
    URLSearchParams,
    Buffer,
    AbortController,
    AbortSignal,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    queueMicrotask,
    atob,
    btoa,
    encodeURIComponent,
    decodeURIComponent,
    encodeURI,
    decodeURI,
    parseInt,
    parseFloat,
    isNaN,
    isFinite,
  });

  const wrapped = `(async () => {\n${code}\n})()`;

  let script: vm.Script;
  try {
    script = new vm.Script(wrapped, { filename });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Syntax error in script: ${message}`);
  }

  const promise = script.runInContext(context) as Promise<unknown>;

  let timer: NodeJS.Timeout | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error(`Script exceeded timeout of ${timeoutMs}ms`));
    }, timeoutMs);
  });

  try {
    const returnValue = await Promise.race([promise, timeoutPromise]);
    return { returnValue, logs };
  } finally {
    if (timer) clearTimeout(timer);
  }
}
