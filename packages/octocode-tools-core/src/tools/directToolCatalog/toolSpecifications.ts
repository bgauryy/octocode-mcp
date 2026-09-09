/**
 * Engine-free source of truth for public direct-tool names and schemas.
 * Runtime execution metadata is attached separately by `toolConfig.ts`.
 */
import type { z } from 'zod';
import { PUBLIC_TOOL_DESCRIPTIONS } from '../../toolContract/descriptions.js';
import { LSP_SEARCH_TOOL_NAME } from '../toolNames.js';
import {
  GITHUB_SEARCH_TOOL_NAME,
  GITHUB_SEARCH_HISTORY_TOOL_NAME,
  GITHUB_GET_HISTORY_ITEM_TOOL_NAME,
  AST_SEARCH_TOOL_NAME,
  LOCAL_SEARCH_TOOL_NAME,
  STATIC_TOOL_NAMES,
} from '../toolNames.js';
import {
  BulkCloneRepoLocalSchema,
  CloneRepoQueryLocalSchema,
} from '../github_clone_repo/scheme.js';
import {
  BulkLspSearchSchema,
  LspSearchQuerySchema,
} from '../lsp/semantic_content/scheme.js';
import {
  FileContentBulkQueryLocalSchema,
  FileContentQueryLocalSchema,
} from '../github_fetch_content/scheme.js';
import {
  GitHubSearchBulkQuerySchema,
  GitHubSearchQuerySchema,
} from '../github_search/scheme.js';
import {
  AstSearchBulkQuerySchema,
  AstSearchQuerySchema,
} from '../ast_search/scheme.js';
import {
  LocalFetchContentBulkQuerySchema,
  LocalFetchContentQuerySchema,
} from '../local_fetch_content/scheme.js';
import {
  LocalSearchBulkQuerySchema,
  LocalSearchQuerySchema,
} from '../local_search/scheme.js';
import {
  NpmSearchBulkQueryLocalSchema,
  NpmSearchQueryLocalSchema,
} from '../package_search/scheme.js';
import {
  GitHubGetHistoryItemBulkQueryLocalSchema,
  GitHubGetHistoryItemQueryLocalSchema,
  GitHubSearchHistoryBulkQueryLocalSchema,
  GitHubSearchHistoryQueryLocalSchema,
} from '../github_search_pull_requests/historySchemes.js';

export interface DirectToolSpecification {
  name: string;
  title: string;
  description: string;
  schema: z.ZodType;
  inputSchema: z.ZodType;
}

export const DIRECT_TOOL_SPECIFICATIONS: readonly DirectToolSpecification[] = [
  {
    name: GITHUB_SEARCH_TOOL_NAME,
    title: 'GitHub Search',
    description: PUBLIC_TOOL_DESCRIPTIONS.ghSearch,
    schema: GitHubSearchQuerySchema,
    inputSchema: GitHubSearchBulkQuerySchema,
  },
  {
    name: STATIC_TOOL_NAMES.GITHUB_FETCH_CONTENT,
    title: 'GitHub File Content Fetch',
    description: PUBLIC_TOOL_DESCRIPTIONS.ghGetFileContent,
    schema: FileContentQueryLocalSchema,
    inputSchema: FileContentBulkQueryLocalSchema,
  },
  {
    name: GITHUB_SEARCH_HISTORY_TOOL_NAME,
    title: 'GitHub History Search',
    description: PUBLIC_TOOL_DESCRIPTIONS.ghSearchHistory,
    schema: GitHubSearchHistoryQueryLocalSchema,
    inputSchema: GitHubSearchHistoryBulkQueryLocalSchema,
  },
  {
    name: GITHUB_GET_HISTORY_ITEM_TOOL_NAME,
    title: 'GitHub History Item',
    description: PUBLIC_TOOL_DESCRIPTIONS.ghGetHistoryItem,
    schema: GitHubGetHistoryItemQueryLocalSchema,
    inputSchema: GitHubGetHistoryItemBulkQueryLocalSchema,
  },
  {
    name: STATIC_TOOL_NAMES.PACKAGE_SEARCH,
    title: 'Package Search',
    description: PUBLIC_TOOL_DESCRIPTIONS.npmSearch,
    schema: NpmSearchQueryLocalSchema,
    inputSchema: NpmSearchBulkQueryLocalSchema,
  },
  {
    name: STATIC_TOOL_NAMES.GITHUB_CLONE_REPO,
    title: 'Clone / Fetch GitHub Repository Locally',
    description: PUBLIC_TOOL_DESCRIPTIONS.ghCloneRepo,
    schema: CloneRepoQueryLocalSchema,
    inputSchema: BulkCloneRepoLocalSchema,
  },
  {
    name: LOCAL_SEARCH_TOOL_NAME,
    title: 'Local Search',
    description: PUBLIC_TOOL_DESCRIPTIONS.localSearch,
    schema: LocalSearchQuerySchema,
    inputSchema: LocalSearchBulkQuerySchema,
  },
  {
    name: AST_SEARCH_TOOL_NAME,
    title: 'AST Search',
    description: PUBLIC_TOOL_DESCRIPTIONS.astSearch,
    schema: AstSearchQuerySchema,
    inputSchema: AstSearchBulkQuerySchema,
  },
  {
    name: STATIC_TOOL_NAMES.LOCAL_FETCH_CONTENT,
    title: 'Local Fetch Content',
    description: PUBLIC_TOOL_DESCRIPTIONS.localGetFileContent,
    schema: LocalFetchContentQuerySchema,
    inputSchema: LocalFetchContentBulkQuerySchema,
  },
  {
    name: LSP_SEARCH_TOOL_NAME,
    title: 'LSP Search',
    description: PUBLIC_TOOL_DESCRIPTIONS.lspSearch,
    schema: LspSearchQuerySchema,
    inputSchema: BulkLspSearchSchema,
  },
];
