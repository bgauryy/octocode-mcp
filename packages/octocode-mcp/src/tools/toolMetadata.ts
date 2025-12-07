import { fetchWithRetries } from '../utils/fetchWithRetries.js';
import { TOOL_METADATA_ERRORS } from '../errorCodes.js';
import { logSessionError } from '../session.js';

// --- Core Metadata Types ---

export interface PromptArgument {
  name: string;
  description: string;
  required?: boolean;
}

export interface PromptMetadata {
  name: string;
  description: string;
  content: string;
  args?: PromptArgument[];
}

export interface ToolMetadata {
  name: string;
  description: string;
  schema: Record<string, string>;
  hints: {
    hasResults: readonly string[];
    empty: readonly string[];
  };
}

export interface CompleteMetadata {
  instructions: string;
  prompts: Record<string, PromptMetadata>;
  toolNames: {
    GITHUB_FETCH_CONTENT: 'githubGetFileContent';
    GITHUB_SEARCH_CODE: 'githubSearchCode';
    GITHUB_SEARCH_PULL_REQUESTS: 'githubSearchPullRequests';
    GITHUB_SEARCH_REPOSITORIES: 'githubSearchRepositories';
    GITHUB_VIEW_REPO_STRUCTURE: 'githubViewRepoStructure';
    PACKAGE_SEARCH: 'packageSearch';
  };
  baseSchema: {
    mainResearchGoal: string;
    researchGoal: string;
    reasoning: string;
    bulkQuery: (toolName: string) => string;
  };
  tools: Record<string, ToolMetadata>;
  baseHints: {
    hasResults: readonly string[];
    empty: readonly string[];
  };
  genericErrorHints: readonly string[];
}

// --- Helper Types ---

type ToolNamesValue =
  CompleteMetadata['toolNames'][keyof CompleteMetadata['toolNames']];

type ToolNamesMap = Record<string, ToolNamesValue>;

export type ToolName = ToolNamesValue;

// --- Internal Data Types ---

type RawBaseSchema = {
  mainResearchGoal: string;
  researchGoal: string;
  reasoning: string;
  bulkQueryTemplate: string;
};

type RawCompleteMetadata = {
  instructions: string;
  prompts: CompleteMetadata['prompts'];
  toolNames: CompleteMetadata['toolNames'];
  baseSchema: RawBaseSchema;
  tools: Record<string, ToolMetadata>;
  baseHints: CompleteMetadata['baseHints'];
  genericErrorHints: readonly string[];
};

// --- State ---

let METADATA_JSON: CompleteMetadata | null = null;
let initializationPromise: Promise<void> | null = null;

// --- Constants ---

const STATIC_TOOL_NAMES: ToolNamesMap = {
  GITHUB_FETCH_CONTENT: 'githubGetFileContent',
  GITHUB_SEARCH_CODE: 'githubSearchCode',
  GITHUB_SEARCH_PULL_REQUESTS: 'githubSearchPullRequests',
  GITHUB_SEARCH_REPOSITORIES: 'githubSearchRepositories',
  GITHUB_VIEW_REPO_STRUCTURE: 'githubViewRepoStructure',
  PACKAGE_SEARCH: 'packageSearch',
};

// --- Helper Functions ---

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
    // eslint-disable-next-line @typescript-eslint/ban-types
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

// --- Initialization ---

export async function initializeToolMetadata(): Promise<void> {
  if (METADATA_JSON) {
    return;
  }
  if (initializationPromise) {
    return initializationPromise;
  }

  initializationPromise = (async () => {
    const METADATA_URL = 'https://octocodeai.com/api/mcpContent';

    const data = (await fetchWithRetries(METADATA_URL, {
      maxRetries: 3,
      includeVersion: true,
    })) as unknown;

    if (
      typeof data !== 'object' ||
      data === null ||
      typeof (data as Record<string, unknown>).instructions !== 'string' ||
      typeof (data as Record<string, unknown>).toolNames !== 'object' ||
      typeof (data as Record<string, unknown>).tools !== 'object' ||
      typeof (data as Record<string, unknown>).baseSchema !== 'object' ||
      typeof (data as Record<string, unknown>).baseHints !== 'object' ||
      !Array.isArray(
        (data as Record<string, unknown>).genericErrorHints as unknown[]
      ) ||
      typeof (data as Record<string, unknown>).prompts !== 'object'
    ) {
      await logSessionError(
        'toolMetadata',
        TOOL_METADATA_ERRORS.INVALID_API_RESPONSE.code
      );
      throw new Error(TOOL_METADATA_ERRORS.INVALID_FORMAT.message);
    }

    const raw = data as RawCompleteMetadata;
    const toolNames = raw.toolNames;
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

// --- Accessors ---

export const TOOL_NAMES = new Proxy({} as CompleteMetadata['toolNames'], {
  get(_target, prop: string) {
    if (METADATA_JSON) {
      return (METADATA_JSON.toolNames as ToolNamesMap)[prop as string];
    }
    return STATIC_TOOL_NAMES[prop as string as keyof typeof STATIC_TOOL_NAMES];
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
          value: (METADATA_JSON.toolNames as ToolNamesMap)[prop as string],
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

export function isToolAvailableSync(toolName: string): boolean {
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
  const baseHints = METADATA_JSON.baseHints[resultType] ?? [];
  const toolHints = METADATA_JSON.tools[toolName]?.hints[resultType] ?? [];
  return [...baseHints, ...toolHints];
}

export function getGenericErrorHintsSync(): readonly string[] {
  return getMeta().genericErrorHints;
}

export function getDynamicHints(
  toolName: string,
  hintType: 'topicsHasResults' | 'topicsEmpty' | 'keywordsEmpty'
): readonly string[] {
  const tool = (getMeta().tools as Record<string, unknown>)[toolName] as
    | {
        hints?: {
          dynamic?: {
            topicsHasResults?: string[];
            topicsEmpty?: string[];
            keywordsEmpty?: string[];
          };
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
    minified: string;
    sanitize: string;
    addTimestamp: string;
  };
  range: {
    startLine: string;
    endLine: string;
    fullContent: string;
    matchString: string;
    matchStringContextLines: string;
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
    stars: string;
    filename: string;
    path: string;
    match: string;
  };
  resultLimit: {
    limit: string;
  };
  processing: {
    minify: string;
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
