import type { z } from 'zod/v4';

import {
  EmptyDataSchema,
  ErrorDataSchema,
  GitHubCloneRepoDataSchema,
  GitHubFetchContentDataSchema,
  GitHubSearchCodeDataSchema,
  GitHubSearchPullRequestsDataSchema,
  GitHubSearchRepositoriesDataSchema,
  GitHubViewRepoStructureDataSchema,
  PackageSearchDataSchema,
  LocalSearchCodeDataSchema,
  LocalGetFileContentDataSchema,
  LocalFindFilesDataSchema,
  LocalViewStructureDataSchema,
  LspGotoDefinitionDataSchema,
  LspFindReferencesDataSchema,
  LspCallHierarchyDataSchema,
} from './outputSchemas.js';

type OutputStatus = 'hasResults' | 'empty' | 'error';

type ErrorOutputData = z.infer<typeof ErrorDataSchema>;
type EmptyOutputData = z.infer<typeof EmptyDataSchema>;

type ToolResult<TData extends object> = {
  status: OutputStatus;
} & Partial<TData & ErrorOutputData & EmptyOutputData>;

type ItemOf<TArray> = TArray extends Array<infer TItem> ? TItem : never;
type ValueOfRecord<TRecord> =
  TRecord extends Record<string, infer TValue> ? TValue : never;

export type GitHubCloneRepoData = z.infer<typeof GitHubCloneRepoDataSchema>;
export type GitHubCloneRepoToolResult = ToolResult<GitHubCloneRepoData>;

export type GitHubFetchContentData = z.infer<
  typeof GitHubFetchContentDataSchema
>;
export type GitHubFetchContentToolResult = ToolResult<GitHubFetchContentData>;
export type GitHubDirectoryFileEntry = ItemOf<
  NonNullable<GitHubFetchContentData['files']>
>;

export type GitHubSearchCodeData = z.infer<typeof GitHubSearchCodeDataSchema>;
export type GitHubSearchCodeToolResult = ToolResult<GitHubSearchCodeData>;
export type GitHubCodeSearchFile = ItemOf<
  NonNullable<GitHubSearchCodeData['files']>
>;

export type GitHubSearchPullRequestsData = z.infer<
  typeof GitHubSearchPullRequestsDataSchema
>;
export type GitHubSearchPullRequestsToolResult =
  ToolResult<GitHubSearchPullRequestsData>;
export type GitHubPullRequestOutput = ItemOf<
  NonNullable<GitHubSearchPullRequestsData['pull_requests']>
>;
export type GitHubSearchPullRequestsPagination = NonNullable<
  GitHubSearchPullRequestsData['pagination']
>;

export type GitHubSearchRepositoriesData = z.infer<
  typeof GitHubSearchRepositoriesDataSchema
>;
export type GitHubSearchRepositoriesToolResult =
  ToolResult<GitHubSearchRepositoriesData>;
export type GitHubRepositoryOutput = ItemOf<
  GitHubSearchRepositoriesData['repositories']
>;

export type GitHubViewRepoStructureData = z.infer<
  typeof GitHubViewRepoStructureDataSchema
>;
export type GitHubViewRepoStructureToolResult =
  ToolResult<GitHubViewRepoStructureData>;
export type GitHubRepoStructureDirectoryEntry = ValueOfRecord<
  NonNullable<GitHubViewRepoStructureData['structure']>
>;

export type PackageSearchData = z.infer<typeof PackageSearchDataSchema>;
export type PackageSearchPackage = ItemOf<PackageSearchData['packages']>;

type LocalSearchCodeData = z.infer<typeof LocalSearchCodeDataSchema>;
export type LocalSearchCodeToolResult = ToolResult<LocalSearchCodeData>;
export type LocalSearchCodeFile = ItemOf<
  NonNullable<LocalSearchCodeData['files']>
>;
export type LocalSearchCodeMatch = ItemOf<
  NonNullable<LocalSearchCodeFile['matches']>
>;
export type LocalSearchCodePagination = NonNullable<
  LocalSearchCodeData['pagination']
>;
export type LocalSearchCodeMatchPagination = NonNullable<
  LocalSearchCodeFile['pagination']
>;

type LocalGetFileContentData = z.infer<typeof LocalGetFileContentDataSchema>;
export type LocalGetFileContentToolResult = ToolResult<LocalGetFileContentData>;
export type LocalGetFileContentPagination = NonNullable<
  LocalGetFileContentData['pagination']
>;
export type LocalGetFileContentMatchRange = ItemOf<
  NonNullable<LocalGetFileContentData['matchRanges']>
>;

type LocalFindFilesData = z.infer<typeof LocalFindFilesDataSchema>;
export type LocalFindFilesToolResult = ToolResult<LocalFindFilesData>;
export type LocalFindFilesEntry = ItemOf<
  NonNullable<LocalFindFilesData['files']>
>;
export type LocalFindFilesPagination = NonNullable<
  LocalFindFilesData['pagination']
>;

type LocalViewStructureData = z.infer<typeof LocalViewStructureDataSchema>;
export type LocalViewStructureToolResult = ToolResult<LocalViewStructureData>;
export type LocalViewStructureEntry = ItemOf<
  NonNullable<LocalViewStructureData['entries']>
>;
export type LocalViewStructurePagination = NonNullable<
  LocalViewStructureData['pagination']
>;

type LspGotoDefinitionData = z.infer<typeof LspGotoDefinitionDataSchema>;
export type LspGotoDefinitionToolResult = ToolResult<LspGotoDefinitionData>;
export type LspExactPosition = NonNullable<
  LspGotoDefinitionData['resolvedPosition']
>;
export type LspCodeSnippet = ItemOf<
  NonNullable<LspGotoDefinitionData['locations']>
>;
export type LspRange = LspCodeSnippet['range'];
export type LspSymbolKind = NonNullable<LspCodeSnippet['symbolKind']>;

type LspFindReferencesData = z.infer<typeof LspFindReferencesDataSchema>;
export type LspFindReferencesToolResult = ToolResult<LspFindReferencesData>;
export type LspReferenceLocation = ItemOf<
  NonNullable<LspFindReferencesData['locations']>
>;
export type LspFindReferencesPagination = NonNullable<
  LspFindReferencesData['pagination']
>;

type LspCallHierarchyData = z.infer<typeof LspCallHierarchyDataSchema>;
export type LspCallHierarchyToolResult = ToolResult<LspCallHierarchyData>;
export type LspCallHierarchyItem = NonNullable<LspCallHierarchyData['item']>;
export type LspIncomingCall = ItemOf<
  NonNullable<LspCallHierarchyData['incomingCalls']>
>;
export type LspOutgoingCall = ItemOf<
  NonNullable<LspCallHierarchyData['outgoingCalls']>
>;
export type LspCallHierarchyPagination = NonNullable<
  LspCallHierarchyData['pagination']
>;
