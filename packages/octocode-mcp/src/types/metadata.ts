export interface ToolMetadata {
  name: string;
  description: string;
  schema: Record<string, string>;
  hints: {
    hasResults: readonly string[];
    empty: readonly string[];
    dynamic?: Record<string, string[] | undefined>;
  };
}

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

export interface ToolNames {
  GITHUB_FETCH_CONTENT: 'githubGetFileContent';
  GITHUB_SEARCH_CODE: 'githubSearchCode';
  GITHUB_SEARCH_PULL_REQUESTS: 'githubSearchPullRequests';
  GITHUB_SEARCH_REPOSITORIES: 'githubSearchRepositories';
  GITHUB_VIEW_REPO_STRUCTURE: 'githubViewRepoStructure';
  PACKAGE_SEARCH: 'packageSearch';
}

export interface BaseSchema {
  mainResearchGoal: string;
  researchGoal: string;
  reasoning: string;
  bulkQueryTemplate: string;
}

export interface CompleteMetadata {
  instructions: string;
  prompts: Record<string, PromptMetadata>;
  toolNames: ToolNames;
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
  bulkOperations?: {
    instructions?: {
      base?: string;
      hasResults?: string;
      empty?: string;
      error?: string;
    };
  };
}

export interface RawCompleteMetadata {
  instructions: string;
  prompts: Record<string, PromptMetadata>;
  toolNames: ToolNames;
  baseSchema: BaseSchema;
  tools: Record<string, ToolMetadata>;
  baseHints: {
    hasResults: readonly string[];
    empty: readonly string[];
  };
  genericErrorHints: readonly string[];
  bulkOperations?: {
    instructions?: {
      base?: string;
      hasResults?: string;
      empty?: string;
      error?: string;
    };
  };
}
