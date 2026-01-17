/**
 * Tool-specific schema helpers for typed access to tool schema descriptions.
 * These proxies provide IDE autocompletion for schema field descriptions.
 */
import { STATIC_TOOL_NAMES } from '../toolNames.js';
import { TOOL_NAMES } from './proxies.js';
import { getMetadataOrNull } from './state.js';

// ============================================================================
// Schema Helper Factory
// ============================================================================

/**
 * Creates a nested proxy for accessing tool schema descriptions.
 * Structure: TOOL.category.field -> description string
 */
function createSchemaHelper(toolName: string) {
  return new Proxy(
    {},
    {
      get(_target, _category: string) {
        return new Proxy(
          {},
          {
            get(_target2, field: string): string {
              const metadata = getMetadataOrNull();
              if (!metadata) return '';
              const schema = metadata.tools[toolName]?.schema ?? {};
              return schema[field] ?? '';
            },
          }
        );
      },
    }
  );
}

// ============================================================================
// GitHub Tool Schema Helpers
// ============================================================================

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

// ============================================================================
// Package Search Schema Helper
// ============================================================================

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

// ============================================================================
// Local Tool Schema Helpers
// ============================================================================

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

// ============================================================================
// LSP Tool Schema Helpers
// ============================================================================

export const LSP_GOTO_DEFINITION = createSchemaHelper(
  STATIC_TOOL_NAMES.LSP_GOTO_DEFINITION
) as {
  scope: {
    uri: string;
    symbolName: string;
    lineHint: string;
  };
  options: {
    orderHint: string;
    contextLines: string;
  };
};

export const LSP_FIND_REFERENCES = createSchemaHelper(
  STATIC_TOOL_NAMES.LSP_FIND_REFERENCES
) as {
  scope: {
    uri: string;
    symbolName: string;
    lineHint: string;
  };
  options: {
    orderHint: string;
    includeDeclaration: string;
    contextLines: string;
  };
  pagination: {
    referencesPerPage: string;
    page: string;
  };
};

export const LSP_CALL_HIERARCHY = createSchemaHelper(
  STATIC_TOOL_NAMES.LSP_CALL_HIERARCHY
) as {
  scope: {
    uri: string;
    symbolName: string;
    lineHint: string;
  };
  options: {
    orderHint: string;
    direction: string;
    depth: string;
    contextLines: string;
  };
  pagination: {
    callsPerPage: string;
    page: string;
  };
};
