import type { z } from 'zod';

import {
  BulkToolDataSchema,
  BulkToolOutputSchema,
  EmptyDataSchema,
  ErrorDataSchema,
  GitHubCloneRepoDataSchema,
  GitHubCloneRepoOutputSchema,
  GitHubFetchContentDataSchema,
  GitHubFetchContentOutputSchema,
  GitHubSearchCodeDataSchema,
  GitHubSearchCodeOutputSchema,
  GitHubSearchPullRequestsDataSchema,
  GitHubSearchPullRequestsOutputSchema,
  GitHubSearchRepositoriesDataSchema,
  GitHubSearchRepositoriesOutputSchema,
  GitHubViewRepoStructureDataSchema,
  GitHubViewRepoStructureOutputSchema,
  PackageSearchDataSchema,
  PackageSearchOutputSchema,
  LocalSearchCodeDataSchema,
  LocalSearchCodeOutputSchema,
  LocalGetFileContentDataSchema,
  LocalGetFileContentOutputSchema,
  LocalFindFilesDataSchema,
  LocalFindFilesOutputSchema,
  LocalViewStructureDataSchema,
  LocalViewStructureOutputSchema,
  LspGotoDefinitionDataSchema,
  LspGotoDefinitionOutputSchema,
  LspFindReferencesDataSchema,
  LspFindReferencesOutputSchema,
  LspCallHierarchyDataSchema,
  LspCallHierarchyOutputSchema,
} from './outputSchemas.js';

type OutputStatus = 'hasResults' | 'empty' | 'error';

export type ErrorOutputData = z.infer<typeof ErrorDataSchema>;
export type EmptyOutputData = z.infer<typeof EmptyDataSchema>;

export type QueryResult<TData extends object> =
  | {
      id: string;
      status: 'hasResults';
      data: TData;
    }
  | {
      id: string;
      status: 'empty';
      data: EmptyOutputData;
    }
  | {
      id: string;
      status: 'error';
      data: ErrorOutputData;
    };

export type BulkOutput<TData extends object> = {
  results: Array<QueryResult<TData>>;
};

export type ToolResult<TData extends object> = {
  status: OutputStatus;
} & Partial<TData & ErrorOutputData & EmptyOutputData>;

type ItemOf<TArray> = TArray extends Array<infer TItem> ? TItem : never;
type ValueOfRecord<TRecord> =
  TRecord extends Record<string, infer TValue> ? TValue : never;

export type BulkOutputFromSchema<TSchema extends z.ZodTypeAny> = BulkOutput<
  z.infer<TSchema>
>;

export type QueryResultFromOutputSchema<TSchema extends z.ZodTypeAny> =
  QueryResult<z.infer<TSchema>>;

export type SuccessQueryResultFromOutputSchema<TSchema extends z.ZodTypeAny> = {
  id: string;
  status: 'hasResults';
  data: z.infer<TSchema>;
};

export type EmptyQueryResultFromOutputSchema = {
  id: string;
  status: 'empty';
  data: EmptyOutputData;
};

export type ErrorQueryResultFromOutputSchema = {
  id: string;
  status: 'error';
  data: ErrorOutputData;
};

export type SuccessDataFromOutputSchema<TSchema extends z.ZodTypeAny> =
  z.infer<TSchema>;

export type EmptyDataFromOutputSchema = EmptyOutputData;

export type ErrorDataFromOutputSchema = ErrorOutputData;

export type ToolResultFromOutputSchema<TSchema extends z.ZodTypeAny> =
  ToolResult<z.infer<TSchema>>;

export type ToolSuccessResultFromOutputSchema<TSchema extends z.ZodTypeAny> = {
  status: 'hasResults';
} & z.infer<TSchema>;

export type ToolEmptyResultFromOutputSchema = {
  status: 'empty';
} & EmptyOutputData;

export type ToolErrorResultFromOutputSchema = {
  status: 'error';
} & ErrorOutputData;

export type GenericBulkToolData = z.infer<typeof BulkToolDataSchema>;
export type GenericBulkToolOutput = z.infer<typeof BulkToolOutputSchema>;
export type GenericBulkToolQueryResult = QueryResult<GenericBulkToolData>;
export type GenericBulkToolResult = ToolResult<GenericBulkToolData>;

export type GitHubCloneRepoData = z.infer<typeof GitHubCloneRepoDataSchema>;
export type GitHubCloneRepoBulkOutput = z.infer<
  typeof GitHubCloneRepoOutputSchema
>;
export type GitHubCloneRepoQueryResult = QueryResult<GitHubCloneRepoData>;
export type GitHubCloneRepoToolResult = ToolResult<GitHubCloneRepoData>;

export type GitHubFetchContentData = z.infer<
  typeof GitHubFetchContentDataSchema
>;
export type GitHubFetchContentBulkOutput = z.infer<
  typeof GitHubFetchContentOutputSchema
>;
export type GitHubFetchContentQueryResult = QueryResult<GitHubFetchContentData>;
export type GitHubFetchContentToolResult = ToolResult<GitHubFetchContentData>;
export type GitHubDirectoryFileEntry = ItemOf<
  NonNullable<GitHubFetchContentData['files']>
>;
export type GitHubFetchContentPagination = NonNullable<
  GitHubFetchContentData['pagination']
>;

export type GitHubSearchCodeData = z.infer<typeof GitHubSearchCodeDataSchema>;
export type GitHubSearchCodeBulkOutput = z.infer<
  typeof GitHubSearchCodeOutputSchema
>;
export type GitHubSearchCodeQueryResult = QueryResult<GitHubSearchCodeData>;
export type GitHubSearchCodeToolResult = ToolResult<GitHubSearchCodeData>;
export type GitHubCodeSearchFile = ItemOf<
  NonNullable<GitHubSearchCodeData['files']>
>;
export type GitHubCodeSearchRepositoryContext = NonNullable<
  GitHubSearchCodeData['repositoryContext']
>;
export type GitHubSearchCodePagination = NonNullable<
  GitHubSearchCodeData['pagination']
>;

export type GitHubSearchPullRequestsData = z.infer<
  typeof GitHubSearchPullRequestsDataSchema
>;
export type GitHubSearchPullRequestsBulkOutput = z.infer<
  typeof GitHubSearchPullRequestsOutputSchema
>;
export type GitHubSearchPullRequestsQueryResult =
  QueryResult<GitHubSearchPullRequestsData>;
export type GitHubSearchPullRequestsToolResult =
  ToolResult<GitHubSearchPullRequestsData>;
export type GitHubPullRequestOutput = ItemOf<
  NonNullable<GitHubSearchPullRequestsData['pull_requests']>
>;
export type GitHubPullRequestComment = ItemOf<
  NonNullable<GitHubPullRequestOutput['comments']>
>;
export type GitHubPullRequestFileChange = ItemOf<
  NonNullable<GitHubPullRequestOutput['fileChanges']>
>;
export type GitHubSearchPullRequestsPagination = NonNullable<
  GitHubSearchPullRequestsData['pagination']
>;
export type GitHubSearchPullRequestsOutputPagination = NonNullable<
  GitHubSearchPullRequestsData['outputPagination']
>;

export type GitHubSearchRepositoriesData = z.infer<
  typeof GitHubSearchRepositoriesDataSchema
>;
export type GitHubSearchRepositoriesBulkOutput = z.infer<
  typeof GitHubSearchRepositoriesOutputSchema
>;
export type GitHubSearchRepositoriesQueryResult =
  QueryResult<GitHubSearchRepositoriesData>;
export type GitHubSearchRepositoriesToolResult =
  ToolResult<GitHubSearchRepositoriesData>;
export type GitHubRepositoryOutput = ItemOf<
  GitHubSearchRepositoriesData['repositories']
>;
export type GitHubSearchRepositoriesPagination = NonNullable<
  GitHubSearchRepositoriesData['pagination']
>;

export type GitHubViewRepoStructureData = z.infer<
  typeof GitHubViewRepoStructureDataSchema
>;
export type GitHubViewRepoStructureBulkOutput = z.infer<
  typeof GitHubViewRepoStructureOutputSchema
>;
export type GitHubViewRepoStructureQueryResult =
  QueryResult<GitHubViewRepoStructureData>;
export type GitHubViewRepoStructureToolResult =
  ToolResult<GitHubViewRepoStructureData>;
export type GitHubRepoStructureDirectoryEntry = ValueOfRecord<
  NonNullable<GitHubViewRepoStructureData['structure']>
>;
export type GitHubRepoStructureSummary = NonNullable<
  GitHubViewRepoStructureData['summary']
>;
export type GitHubRepoStructurePagination = NonNullable<
  GitHubViewRepoStructureData['pagination']
>;
export type GitHubBranchFallback = NonNullable<
  GitHubViewRepoStructureData['branchFallback']
>;

export type PackageSearchData = z.infer<typeof PackageSearchDataSchema>;
export type PackageSearchBulkOutput = z.infer<typeof PackageSearchOutputSchema>;
export type PackageSearchQueryResult = QueryResult<PackageSearchData>;
export type PackageSearchToolResult = ToolResult<PackageSearchData>;
export type PackageSearchPackage = ItemOf<PackageSearchData['packages']>;

export type LocalSearchCodeData = z.infer<typeof LocalSearchCodeDataSchema>;
export type LocalSearchCodeBulkOutput = z.infer<
  typeof LocalSearchCodeOutputSchema
>;
export type LocalSearchCodeQueryResult = QueryResult<LocalSearchCodeData>;
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

export type LocalGetFileContentData = z.infer<
  typeof LocalGetFileContentDataSchema
>;
export type LocalGetFileContentBulkOutput = z.infer<
  typeof LocalGetFileContentOutputSchema
>;
export type LocalGetFileContentQueryResult =
  QueryResult<LocalGetFileContentData>;
export type LocalGetFileContentToolResult = ToolResult<LocalGetFileContentData>;
export type LocalGetFileContentPagination = NonNullable<
  LocalGetFileContentData['pagination']
>;
export type LocalGetFileContentMatchRange = ItemOf<
  NonNullable<LocalGetFileContentData['matchRanges']>
>;

export type LocalFindFilesData = z.infer<typeof LocalFindFilesDataSchema>;
export type LocalFindFilesBulkOutput = z.infer<
  typeof LocalFindFilesOutputSchema
>;
export type LocalFindFilesQueryResult = QueryResult<LocalFindFilesData>;
export type LocalFindFilesToolResult = ToolResult<LocalFindFilesData>;
export type LocalFindFilesEntry = ItemOf<
  NonNullable<LocalFindFilesData['files']>
>;
export type LocalFindFilesPagination = NonNullable<
  LocalFindFilesData['pagination']
>;
export type LocalFindFilesCharPagination = NonNullable<
  LocalFindFilesData['charPagination']
>;

export type LocalViewStructureData = z.infer<
  typeof LocalViewStructureDataSchema
>;
export type LocalViewStructureBulkOutput = z.infer<
  typeof LocalViewStructureOutputSchema
>;
export type LocalViewStructureQueryResult = QueryResult<LocalViewStructureData>;
export type LocalViewStructureToolResult = ToolResult<LocalViewStructureData>;
export type LocalViewStructureEntry = ItemOf<
  NonNullable<LocalViewStructureData['entries']>
>;
export type LocalViewStructurePagination = NonNullable<
  LocalViewStructureData['pagination']
>;

export type LspGotoDefinitionData = z.infer<typeof LspGotoDefinitionDataSchema>;
export type LspGotoDefinitionBulkOutput = z.infer<
  typeof LspGotoDefinitionOutputSchema
>;
export type LspGotoDefinitionQueryResult = QueryResult<LspGotoDefinitionData>;
export type LspGotoDefinitionToolResult = ToolResult<LspGotoDefinitionData>;
export type LspExactPosition = NonNullable<
  LspGotoDefinitionData['resolvedPosition']
>;
export type LspCodeSnippet = ItemOf<
  NonNullable<LspGotoDefinitionData['locations']>
>;
export type LspRange = LspCodeSnippet['range'];
export type LspSymbolKind = NonNullable<LspCodeSnippet['symbolKind']>;
export type LspOutputPagination = NonNullable<
  LspGotoDefinitionData['outputPagination']
>;

export type LspFindReferencesData = z.infer<typeof LspFindReferencesDataSchema>;
export type LspFindReferencesBulkOutput = z.infer<
  typeof LspFindReferencesOutputSchema
>;
export type LspFindReferencesQueryResult = QueryResult<LspFindReferencesData>;
export type LspFindReferencesToolResult = ToolResult<LspFindReferencesData>;
export type LspReferenceLocation = ItemOf<
  NonNullable<LspFindReferencesData['locations']>
>;
export type LspFindReferencesPagination = NonNullable<
  LspFindReferencesData['pagination']
>;

export type LspCallHierarchyData = z.infer<typeof LspCallHierarchyDataSchema>;
export type LspCallHierarchyBulkOutput = z.infer<
  typeof LspCallHierarchyOutputSchema
>;
export type LspCallHierarchyQueryResult = QueryResult<LspCallHierarchyData>;
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
