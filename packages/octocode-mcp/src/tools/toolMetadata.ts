/**
 * Centralized Tool Metadata
 *
 * Single source of truth for ALL tool-related content:
 * - Tool names and IDs
 * - Tool descriptions
 * - Schema parameter descriptions
 * - Hints for hasResults and empty states
 * - Generic error hints
 * - Base schema descriptions
 */

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

/**
 * Complete JSON structure containing ALL metadata
 * This is the single source of truth for everything
 */
const METADATA_JSON: CompleteMetadata = {
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

/**
 * Export tool names from the JSON
 */
export const TOOL_NAMES = METADATA_JSON.toolNames;
export type ToolName = (typeof TOOL_NAMES)[keyof typeof TOOL_NAMES];

/**
 * Export base schema from the JSON
 */
export const BASE_SCHEMA = METADATA_JSON.baseSchema;

/**
 * Export generic error hints from the JSON
 */
export const GENERIC_ERROR_HINTS: readonly string[] =
  METADATA_JSON.genericErrorHints;

/**
 * Get complete metadata
 * @returns Complete metadata structure
 */
export async function getCompleteMetadata(): Promise<CompleteMetadata> {
  return METADATA_JSON;
}

/**
 * Get all tool metadata
 * @returns Tool metadata only
 */
export async function getToolsMetadata(): Promise<
  Record<string, ToolMetadata>
> {
  return METADATA_JSON.tools;
}

/**
 * Get metadata for a specific tool
 * @param toolName - The name of the tool
 * @returns Tool metadata or undefined if not found
 */
export async function getToolMetadata(
  toolName: string
): Promise<ToolMetadata | undefined> {
  return METADATA_JSON.tools[toolName];
}

/**
 * Get tool description
 * @param toolName - The name of the tool
 * @returns Tool description or empty string if not found
 */
export async function getToolDescription(toolName: string): Promise<string> {
  return METADATA_JSON.tools[toolName]?.description ?? '';
}

/**
 * Get tool schema descriptions
 * @param toolName - The name of the tool
 * @returns Schema descriptions or empty object if not found
 */
export async function getToolSchema(
  toolName: string
): Promise<Record<string, string>> {
  return METADATA_JSON.tools[toolName]?.schema ?? {};
}

/**
 * Get tool hints (async version)
 * @param toolName - The name of the tool
 * @param resultType - The result type ('hasResults' or 'empty')
 * @returns Tool hints or empty array if not found
 */
export async function getToolHints(
  toolName: string,
  resultType: 'hasResults' | 'empty'
): Promise<readonly string[]> {
  return METADATA_JSON.tools[toolName]?.hints[resultType] ?? [];
}

/**
 * Get tool hints synchronously
 * Returns combined base + tool-specific hints
 * @param toolName - The name of the tool
 * @param resultType - The result type ('hasResults' or 'empty')
 * @returns Tool hints or empty array if not found
 */
export function getToolHintsSync(
  toolName: string,
  resultType: 'hasResults' | 'empty'
): readonly string[] {
  // Return empty array if tool doesn't exist
  if (!METADATA_JSON.tools[toolName]) {
    return [];
  }
  const baseHints = METADATA_JSON.baseHints[resultType] ?? [];
  const toolHints = METADATA_JSON.tools[toolName]?.hints[resultType] ?? [];
  return [...baseHints, ...toolHints];
}

/**
 * Get generic error hints
 * @returns Generic error hints
 */
export async function getGenericErrorHints(): Promise<readonly string[]> {
  return METADATA_JSON.genericErrorHints;
}

/**
 * Get generic error hints synchronously
 * @returns Generic error hints
 */
export function getGenericErrorHintsSync(): readonly string[] {
  return METADATA_JSON.genericErrorHints;
}

/**
 * Get base hints that are common to all tools
 * @returns Base hints
 */
export async function getBaseHints(): Promise<{
  hasResults: readonly string[];
  empty: readonly string[];
}> {
  return METADATA_JSON.baseHints;
}

/**
 * Legacy exports for backward compatibility
 */
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

/**
 * Helper exports for schema definitions
 * These provide convenient access to schema descriptions in a nested structure
 */

// Helper function to extract nested schema structure from flat schema
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
