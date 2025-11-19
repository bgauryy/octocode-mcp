import content from './content.json';

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
  toolNames: {
    GITHUB_FETCH_CONTENT: 'githubGetFileContent';
    GITHUB_SEARCH_CODE: 'githubSearchCode';
    GITHUB_SEARCH_PULL_REQUESTS: 'githubSearchPullRequests';
    GITHUB_SEARCH_REPOSITORIES: 'githubSearchRepositories';
    GITHUB_VIEW_REPO_STRUCTURE: 'githubViewRepoStructure';
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

const METADATA_JSON: CompleteMetadata = {
  instructions: content.instructions,
  toolNames: content.toolNames as unknown as CompleteMetadata['toolNames'],
  baseSchema: {
    mainResearchGoal: content.baseSchema.mainResearchGoal,
    researchGoal: content.baseSchema.researchGoal,
    reasoning: content.baseSchema.reasoning,
    bulkQuery: (toolName: string) =>
      content.baseSchema.bulkQueryTemplate.replace('{toolName}', toolName),
  },
  tools: content.tools as unknown as Record<string, ToolMetadata>,
  baseHints: content.baseHints,
  genericErrorHints: content.genericErrorHints,
};

export const INSTRUCTIONS = METADATA_JSON.instructions;
export const TOOL_NAMES = METADATA_JSON.toolNames;
export type ToolName = (typeof TOOL_NAMES)[keyof typeof TOOL_NAMES];
export const BASE_SCHEMA = METADATA_JSON.baseSchema;
export const GENERIC_ERROR_HINTS: readonly string[] =
  METADATA_JSON.genericErrorHints;
export async function getCompleteMetadata(): Promise<CompleteMetadata> {
  return METADATA_JSON;
}
export async function getToolsMetadata(): Promise<
  Record<string, ToolMetadata>
> {
  return METADATA_JSON.tools;
}
export async function getToolMetadata(
  toolName: string
): Promise<ToolMetadata | undefined> {
  return METADATA_JSON.tools[toolName];
}
export async function getToolDescription(toolName: string): Promise<string> {
  return METADATA_JSON.tools[toolName]?.description ?? '';
}
export async function getToolSchema(
  toolName: string
): Promise<Record<string, string>> {
  return METADATA_JSON.tools[toolName]?.schema ?? {};
}

export async function getToolHints(
  toolName: string,
  resultType: 'hasResults' | 'empty'
): Promise<readonly string[]> {
  return METADATA_JSON.tools[toolName]?.hints[resultType] ?? [];
}

export function getToolHintsSync(
  toolName: string,
  resultType: 'hasResults' | 'empty'
): readonly string[] {
  if (!METADATA_JSON.tools[toolName]) {
    return [];
  }
  const baseHints = METADATA_JSON.baseHints[resultType] ?? [];
  const toolHints = METADATA_JSON.tools[toolName]?.hints[resultType] ?? [];
  return [...baseHints, ...toolHints];
}

export async function getGenericErrorHints(): Promise<readonly string[]> {
  return METADATA_JSON.genericErrorHints;
}

export function getGenericErrorHintsSync(): readonly string[] {
  return METADATA_JSON.genericErrorHints;
}

export async function getBaseHints(): Promise<{
  hasResults: readonly string[];
  empty: readonly string[];
}> {
  return METADATA_JSON.baseHints;
}

export function getDynamicHints(
  toolName: string,
  hintType: 'topicsHasResults' | 'topicsEmpty' | 'keywordsEmpty'
): readonly string[] {
  const tool = (content.tools as Record<string, unknown>)[toolName] as
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

export function getBulkOperationsInstructions(): {
  base: string;
  hasResults: string;
  empty: string;
  error: string;
} {
  return (
    (
      content as typeof content & {
        bulkOperations?: {
          instructions?: {
            base?: string;
            hasResults?: string;
            empty?: string;
            error?: string;
          };
        };
      }
    ).bulkOperations?.instructions ?? {
      base: 'Bulk response with {count} results: {counts}. Each result includes the original query, status, and data.',
      hasResults:
        'Review hasResultsStatusHints for guidance on results with data.',
      empty: 'Review emptyStatusHints for no-results scenarios.',
      error: 'Review errorStatusHints for error recovery strategies.',
    }
  );
}

export const DESCRIPTIONS = new Proxy({} as Record<string, string>, {
  get(_target, prop: string) {
    return METADATA_JSON.tools[prop]?.description ?? '';
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
      if (prop === 'base') {
        return METADATA_JSON.baseHints;
      }
      return METADATA_JSON.tools[prop]?.hints ?? { hasResults: [], empty: [] };
    },
    ownKeys() {
      return ['base', ...Object.keys(METADATA_JSON.tools)];
    },
    getOwnPropertyDescriptor(_target, prop) {
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
  const schema = METADATA_JSON.tools[toolName]?.schema ?? {};
  return new Proxy(
    {},
    {
      get(_target, _category: string) {
        return new Proxy(
          {},
          {
            get(_target2, field: string): string {
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
    withContent: string;
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
