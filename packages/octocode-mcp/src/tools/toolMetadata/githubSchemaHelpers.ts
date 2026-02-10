/**
 * GitHub & Package Search schema helpers for typed access to tool schema descriptions.
 */
import { TOOL_NAMES } from './proxies.js';
import { createSchemaHelper } from './schemaHelperFactory.js';

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
