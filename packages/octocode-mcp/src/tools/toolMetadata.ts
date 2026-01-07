import { z } from 'zod';
import { fetchWithRetries } from '../utils/http/fetch.js';
import { TOOL_METADATA_ERRORS } from '../errorCodes.js';
import { logSessionError } from '../session.js';

import { CompleteMetadata, ToolNames } from '../types/metadata.js';
import { LOCAL_BASE_HINTS } from './hints/localBaseHints.js';
import { STATIC_TOOL_NAMES, isLocalTool } from './toolNames.js';

export type {
  CompleteMetadata,
  RawCompleteMetadata,
} from '../types/metadata.js';

type ToolNamesValue = ToolNames[keyof ToolNames];

type ToolNamesMap = Record<string, ToolNamesValue>;

export type ToolName = ToolNamesValue;

let METADATA_JSON: CompleteMetadata | null = null;
let initializationPromise: Promise<void> | null = null;

// Re-export STATIC_TOOL_NAMES for backward compatibility
export { STATIC_TOOL_NAMES };

// Zod schemas for validation
const PromptArgumentSchema = z.object({
  name: z.string(),
  description: z.string(),
  required: z.boolean().optional(),
});

const PromptMetadataSchema = z.object({
  name: z.string(),
  description: z.string(),
  content: z.string(),
  args: z.array(PromptArgumentSchema).optional(),
});

const ToolMetadataSchema = z.object({
  name: z.string(),
  description: z.string(),
  schema: z.record(z.string()),
  hints: z.object({
    hasResults: z.array(z.string()),
    empty: z.array(z.string()),
    dynamic: z.record(z.array(z.string()).optional()).optional(),
  }),
});

const BaseSchemaSchema = z.object({
  mainResearchGoal: z.string(),
  researchGoal: z.string(),
  reasoning: z.string(),
  bulkQueryTemplate: z.string(),
});

const BulkOperationsSchema = z.object({
  instructions: z
    .object({
      base: z.string().optional(),
      hasResults: z.string().optional(),
      empty: z.string().optional(),
      error: z.string().optional(),
    })
    .optional(),
});

const RawCompleteMetadataSchema = z.object({
  instructions: z.string(),
  prompts: z.record(PromptMetadataSchema),
  toolNames: z.record(z.string()),
  baseSchema: BaseSchemaSchema,
  tools: z.record(ToolMetadataSchema),
  baseHints: z.object({
    hasResults: z.array(z.string()),
    empty: z.array(z.string()),
  }),
  genericErrorHints: z.array(z.string()),
  bulkOperations: BulkOperationsSchema.optional(),
});

function getMeta(): CompleteMetadata {
  if (!METADATA_JSON) {
    logSessionError(
      'toolMetadata',
      TOOL_METADATA_ERRORS.INVALID_FORMAT.code
    ).catch(() => {});
    throw new Error(
      'Tool metadata not initialized. Call and await initializeToolMetadata() before using tool metadata.'
    );
  }
  return METADATA_JSON;
}

function deepFreeze<T>(obj: T): T {
  if (obj && typeof obj === 'object') {
    Object.freeze(obj);
    Object.getOwnPropertyNames(obj as object).forEach(prop => {
      const value = (obj as unknown as Record<string, unknown>)[prop];
      if (
        value !== null &&
        (typeof value === 'object' || typeof value === 'function') &&
        !Object.isFrozen(value)
      ) {
        deepFreeze(value);
      }
    });
  }
  return obj;
}

export async function initializeToolMetadata(): Promise<void> {
  if (METADATA_JSON) {
    return;
  }
  if (initializationPromise) {
    return initializationPromise;
  }

  initializationPromise = (async () => {
    const METADATA_URL = 'https://octocodeai.com/api/mcpContent';

    const responseData = await fetchWithRetries(METADATA_URL, {
      maxRetries: 3,
      includeVersion: true,
    });

    const parseResult = RawCompleteMetadataSchema.safeParse(responseData);

    if (!parseResult.success) {
      await logSessionError(
        'toolMetadata',
        TOOL_METADATA_ERRORS.INVALID_API_RESPONSE.code
      );
      throw new Error(TOOL_METADATA_ERRORS.INVALID_FORMAT.message);
    }

    const raw = parseResult.data;
    // Cast toolNames to match the interface, relying on runtime validation structure
    const toolNames = raw.toolNames as unknown as ToolNames;
    const baseSchema = raw.baseSchema;

    const complete: CompleteMetadata = {
      instructions: raw.instructions,
      prompts: raw.prompts,
      toolNames,
      baseSchema: {
        mainResearchGoal: baseSchema.mainResearchGoal,
        researchGoal: baseSchema.researchGoal,
        reasoning: baseSchema.reasoning,
        bulkQuery: (toolName: string) =>
          baseSchema.bulkQueryTemplate.replace('{toolName}', toolName),
      },
      tools: raw.tools,
      baseHints: raw.baseHints,
      genericErrorHints: raw.genericErrorHints,
      bulkOperations: raw.bulkOperations,
    };

    METADATA_JSON = deepFreeze(complete);
  })();
  await initializationPromise;
}

export async function loadToolContent(): Promise<CompleteMetadata> {
  if (!METADATA_JSON) {
    await initializeToolMetadata();
  }
  return getMeta();
}

export const TOOL_NAMES = new Proxy({} as CompleteMetadata['toolNames'], {
  get(_target, prop: string) {
    if (METADATA_JSON) {
      const value = (METADATA_JSON.toolNames as unknown as ToolNamesMap)[prop];
      // Fall back to STATIC_TOOL_NAMES if not in remote metadata (e.g., local tools)
      if (value !== undefined) {
        return value;
      }
    }
    return STATIC_TOOL_NAMES[prop as keyof typeof STATIC_TOOL_NAMES];
  },
  ownKeys() {
    return METADATA_JSON
      ? Object.keys(METADATA_JSON.toolNames)
      : Object.keys(STATIC_TOOL_NAMES);
  },
  getOwnPropertyDescriptor(_target, prop) {
    if (METADATA_JSON) {
      if (prop in METADATA_JSON.toolNames) {
        return {
          enumerable: true,
          configurable: true,
          value: (METADATA_JSON.toolNames as unknown as ToolNamesMap)[
            prop as string
          ],
        };
      }
      return undefined;
    }
    if (prop in STATIC_TOOL_NAMES) {
      return {
        enumerable: true,
        configurable: true,
        value: STATIC_TOOL_NAMES[prop as keyof typeof STATIC_TOOL_NAMES],
      };
    }
    return undefined;
  },
}) as CompleteMetadata['toolNames'];

export const BASE_SCHEMA = new Proxy({} as CompleteMetadata['baseSchema'], {
  get(_target, prop: string) {
    if (METADATA_JSON) {
      return (METADATA_JSON.baseSchema as Record<string, unknown>)[
        prop as string
      ] as CompleteMetadata['baseSchema'][keyof CompleteMetadata['baseSchema']];
    }
    if (prop === 'bulkQuery') {
      return (toolName: string) =>
        `Research queries for ${toolName} (1-3 queries per call for optimal resource management). Review schema before use for optimal results`;
    }
    return '';
  },
}) as CompleteMetadata['baseSchema'];

export const GENERIC_ERROR_HINTS: readonly string[] = new Proxy(
  [] as unknown as readonly string[],
  {
    get(_t, prop: string | symbol) {
      if (METADATA_JSON) {
        const target = METADATA_JSON.genericErrorHints as unknown as Record<
          string | symbol,
          unknown
        >;
        return target[prop];
      }
      const fallback: unknown[] = [];
      return (fallback as unknown as Record<string | symbol, unknown>)[prop];
    },
  }
) as readonly string[];

export function isToolInMetadata(toolName: string): boolean {
  if (!METADATA_JSON) {
    return false;
  }
  const tools = METADATA_JSON.tools ?? {};
  return Object.prototype.hasOwnProperty.call(tools, toolName);
}

export function getToolHintsSync(
  toolName: string,
  resultType: 'hasResults' | 'empty'
): readonly string[] {
  if (!METADATA_JSON || !METADATA_JSON.tools[toolName]) {
    return [];
  }

  // Use separated hints for local tools to avoid GitHub-specific context
  const baseHints = isLocalTool(toolName)
    ? (LOCAL_BASE_HINTS[resultType] ?? [])
    : (METADATA_JSON.baseHints[resultType] ?? []);

  const toolHints = METADATA_JSON.tools[toolName]?.hints[resultType] ?? [];
  return [...baseHints, ...toolHints];
}

export function getGenericErrorHintsSync(): readonly string[] {
  if (!METADATA_JSON) {
    return [];
  }
  return getMeta().genericErrorHints;
}

export function getDynamicHints(
  toolName: string,
  hintType: string
): readonly string[] {
  const tool = (getMeta().tools as Record<string, unknown>)[toolName] as
    | {
        hints?: {
          dynamic?: Record<string, string[] | undefined>;
        };
      }
    | undefined;
  return tool?.hints?.dynamic?.[hintType] ?? [];
}

export const DESCRIPTIONS = new Proxy({} as Record<string, string>, {
  get(_target, prop: string) {
    return METADATA_JSON?.tools[prop]?.description ?? '';
  },
});

export const TOOL_HINTS = new Proxy(
  {} as Record<
    string,
    { hasResults: readonly string[]; empty: readonly string[] }
  > & { base: { hasResults: readonly string[]; empty: readonly string[] } },
  {
    get(
      _target,
      prop: string
    ): { hasResults: readonly string[]; empty: readonly string[] } {
      if (!METADATA_JSON) {
        if (prop === 'base') {
          return { hasResults: [], empty: [] };
        }
        return { hasResults: [], empty: [] };
      }
      if (prop === 'base') {
        return METADATA_JSON.baseHints;
      }
      return METADATA_JSON.tools[prop]?.hints ?? { hasResults: [], empty: [] };
    },
    ownKeys() {
      return ['base', ...Object.keys(METADATA_JSON?.tools ?? {})];
    },
    getOwnPropertyDescriptor(_target, prop) {
      if (!METADATA_JSON) {
        if (prop === 'base') {
          return {
            enumerable: true,
            configurable: true,
            value: { hasResults: [], empty: [] },
          };
        }
        return undefined;
      }
      if (prop === 'base' || METADATA_JSON.tools[prop as string]) {
        const value =
          prop === 'base'
            ? METADATA_JSON.baseHints
            : (METADATA_JSON.tools[prop as string]?.hints ?? {
                hasResults: [],
                empty: [],
              });
        return {
          enumerable: true,
          configurable: true,
          value,
        };
      }
      return undefined;
    },
  }
);

function createSchemaHelper(toolName: string) {
  return new Proxy(
    {},
    {
      get(_target, _category: string) {
        return new Proxy(
          {},
          {
            get(_target2, field: string): string {
              if (!METADATA_JSON) return '';
              const schema = METADATA_JSON.tools[toolName]?.schema ?? {};
              return schema[field] ?? '';
            },
          }
        );
      },
    }
  );
}

export const GITHUB_FETCH_CONTENT = createSchemaHelper(
  TOOL_NAMES.GITHUB_FETCH_CONTENT
) as {
  scope: {
    owner: string;
    repo: string;
    branch: string;
    path: string;
  };
  processing: {
    sanitize: string;
  };
  range: {
    startLine: string;
    endLine: string;
    fullContent: string;
    matchString: string;
    matchStringContextLines: string;
  };
  pagination: {
    charOffset: string;
    charLength: string;
  };
  validation: {
    parameterConflict: string;
  };
};

export const GITHUB_SEARCH_CODE = createSchemaHelper(
  TOOL_NAMES.GITHUB_SEARCH_CODE
) as {
  search: {
    keywordsToSearch: string;
  };
  scope: {
    owner: string;
    repo: string;
  };
  filters: {
    extension: string;
    filename: string;
    path: string;
    match: string;
  };
  resultLimit: {
    limit: string;
  };
  pagination: {
    page: string;
  };
  processing: {
    sanitize: string;
  };
};

export const GITHUB_SEARCH_REPOS = createSchemaHelper(
  TOOL_NAMES.GITHUB_SEARCH_REPOSITORIES
) as {
  search: {
    keywordsToSearch: string;
    topicsToSearch: string;
  };
  scope: {
    owner: string;
    repo: string;
  };
  filters: {
    stars: string;
    size: string;
    created: string;
    updated: string;
    match: string;
  };
  sorting: {
    sort: string;
  };
  resultLimit: {
    limit: string;
  };
  pagination: {
    page: string;
  };
};

export const GITHUB_SEARCH_PULL_REQUESTS = createSchemaHelper(
  TOOL_NAMES.GITHUB_SEARCH_PULL_REQUESTS
) as {
  search: {
    query: string;
  };
  scope: {
    prNumber: string;
    owner: string;
    repo: string;
  };
  filters: {
    match: string;
    created: string;
    updated: string;
    state: string;
    assignee: string;
    author: string;
    commenter: string;
    involves: string;
    mentions: string;
    'review-requested': string;
    'reviewed-by': string;
    label: string;
    'no-label': string;
    'no-milestone': string;
    'no-project': string;
    'no-assignee': string;
    head: string;
    base: string;
    closed: string;
    'merged-at': string;
    comments: string;
    reactions: string;
    interactions: string;
    merged: string;
    draft: string;
  };
  sorting: {
    sort: string;
    order: string;
  };
  resultLimit: {
    limit: string;
  };
  pagination: {
    page: string;
  };
  outputShaping: {
    withComments: string;
    withCommits: string;
    type: string;
    partialContentMetadata: string;
  };
};

export const GITHUB_VIEW_REPO_STRUCTURE = createSchemaHelper(
  TOOL_NAMES.GITHUB_VIEW_REPO_STRUCTURE
) as {
  scope: {
    owner: string;
    repo: string;
    branch: string;
    path: string;
  };
  range: {
    depth: string;
  };
  pagination: {
    entriesPerPage: string;
    entryPageNumber: string;
  };
};

export const PACKAGE_SEARCH = createSchemaHelper(TOOL_NAMES.PACKAGE_SEARCH) as {
  search: {
    ecosystem: string;
    name: string;
  };
  options: {
    searchLimit: string;
    npmFetchMetadata: string;
    pythonFetchMetadata: string;
  };
};

export const LOCAL_RIPGREP = createSchemaHelper(TOOL_NAMES.LOCAL_RIPGREP) as {
  search: {
    pattern: string;
    path: string;
    mode: string;
  };
  filters: {
    type: string;
    include: string;
    exclude: string;
    excludeDir: string;
    binaryFiles: string;
    noIgnore: string;
    hidden: string;
    followSymlinks: string;
  };
  options: {
    smartCase: string;
    caseInsensitive: string;
    caseSensitive: string;
    fixedString: string;
    perlRegex: string;
    wholeWord: string;
    invertMatch: string;
    multiline: string;
    multilineDotall: string;
  };
  output: {
    filesOnly: string;
    filesWithoutMatch: string;
    count: string;
    countMatches: string;
    jsonOutput: string;
    vimgrepFormat: string;
    includeStats: string;
    includeDistribution: string;
  };
  context: {
    contextLines: string;
    beforeContext: string;
    afterContext: string;
    matchContentLength: string;
    lineNumbers: string;
    column: string;
  };
  pagination: {
    filesPerPage: string;
    filePageNumber: string;
    matchesPerPage: string;
    maxFiles: string;
    maxMatchesPerFile: string;
  };
  advanced: {
    threads: string;
    mmap: string;
    noUnicode: string;
    encoding: string;
    sort: string;
    sortReverse: string;
    noMessages: string;
    lineRegexp: string;
    passthru: string;
    debug: string;
    showFileLastModified: string;
  };
};

export const LOCAL_FETCH_CONTENT = createSchemaHelper(
  TOOL_NAMES.LOCAL_FETCH_CONTENT
) as {
  scope: {
    path: string;
  };
  range: {
    startLine: string;
    endLine: string;
  };
  options: {
    fullContent: string;
    matchString: string;
    matchStringContextLines: string;
    matchStringIsRegex: string;
    matchStringCaseSensitive: string;
    minified: string;
  };
  pagination: {
    charOffset: string;
    charLength: string;
  };
};

export const LOCAL_FIND_FILES = createSchemaHelper(
  TOOL_NAMES.LOCAL_FIND_FILES
) as {
  scope: {
    path: string;
  };
  filters: {
    name: string;
    iname: string;
    names: string;
    pathPattern: string;
    regex: string;
    regexType: string;
    type: string;
    empty: string;
    executable: string;
    readable: string;
    writable: string;
    excludeDir: string;
  };
  time: {
    modifiedWithin: string;
    modifiedBefore: string;
    accessedWithin: string;
  };
  size: {
    sizeGreater: string;
    sizeLess: string;
  };
  pagination: {
    limit: string;
    filesPerPage: string;
    filePageNumber: string;
    charOffset: string;
    charLength: string;
  };
  options: {
    maxDepth: string;
    minDepth: string;
    details: string;
    permissions: string;
    showFileLastModified: string;
  };
};

export const LOCAL_VIEW_STRUCTURE = createSchemaHelper(
  TOOL_NAMES.LOCAL_VIEW_STRUCTURE
) as {
  scope: {
    path: string;
  };
  filters: {
    pattern: string;
    directoriesOnly: string;
    filesOnly: string;
    extension: string;
    extensions: string;
    hidden: string;
  };
  options: {
    depth: string;
    recursive: string;
    details: string;
    humanReadable: string;
    summary: string;
    showFileLastModified: string;
  };
  sorting: {
    sortBy: string;
    reverse: string;
  };
  pagination: {
    limit: string;
    entriesPerPage: string;
    entryPageNumber: string;
    charOffset: string;
    charLength: string;
  };
};
