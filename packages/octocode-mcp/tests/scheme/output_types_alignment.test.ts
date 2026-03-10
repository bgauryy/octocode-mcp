import { describe, expectTypeOf, it } from 'vitest';

import type {
  GitHubFetchContentData,
  GitHubFetchContentToolResult,
  GitHubDirectoryFileEntry,
  GitHubSearchCodeData,
  GitHubSearchCodeToolResult,
  GitHubCodeSearchFile,
  GitHubSearchPullRequestsData,
  GitHubSearchPullRequestsToolResult,
  GitHubPullRequestOutput,
  GitHubSearchRepositoriesData,
  GitHubSearchRepositoriesToolResult,
  GitHubRepositoryOutput,
  GitHubViewRepoStructureData,
  GitHubRepoStructureDirectoryEntry,
  LocalGetFileContentToolResult,
  LocalFindFilesToolResult,
  LocalFindFilesEntry,
  LocalSearchCodeToolResult,
  LocalSearchCodeFile,
  LocalSearchCodeMatch,
  LocalViewStructureToolResult,
  LocalViewStructureEntry,
  LspGotoDefinitionToolResult,
  LspCodeSnippet,
  LspFindReferencesToolResult,
  LspReferenceLocation,
  LspCallHierarchyToolResult,
  LspCallHierarchyItem,
  LspIncomingCall,
  LspOutgoingCall,
  PackageSearchData,
  PackageSearchPackage,
} from '../../src/scheme/outputTypes.js';
import type {
  ContentResultData,
  ContentResult,
  DirectoryFileEntry,
} from '../../src/tools/github_fetch_content/types.js';
import type { SearchResult } from '../../src/tools/github_search_code/types.js';
import type {
  PullRequestInfo,
  PullRequestSearchResultData,
  PullRequestSearchResult,
} from '../../src/tools/github_search_pull_requests/types.js';
import type {
  SimplifiedRepository,
  RepoSearchResult,
} from '../../src/tools/github_search_repos/types.js';
import type {
  DirectoryEntry,
  RepoStructureResultData,
} from '../../src/tools/github_view_repo_structure/types.js';
import type { FetchContentResult } from '../../src/tools/local_fetch_content/types.js';
import type {
  FindFilesResult,
  FoundFile,
} from '../../src/tools/local_find_files/types.js';
import type {
  SearchContentResult,
  RipgrepFileMatches,
  RipgrepMatch,
} from '../../src/tools/local_ripgrep/types.js';
import type { ViewStructureResult } from '../../src/tools/local_view_structure/types.js';
import type {
  GotoDefinitionResult,
  CodeSnippet,
} from '../../src/tools/lsp_goto_definition/types.js';
import type {
  FindReferencesResult,
  ReferenceLocation,
} from '../../src/tools/lsp_find_references/types.js';
import type {
  CallHierarchyResult,
  CallHierarchyItem,
  IncomingCall,
  OutgoingCall,
} from '../../src/tools/lsp_call_hierarchy/types.js';
import type {
  PackageSearchResult,
  PackageResultWithRepo,
} from '../../src/tools/package_search/types.js';

describe('Output type alignment', () => {
  it('derives GitHub tool output aliases from the output schemas', () => {
    expectTypeOf<ContentResultData>().toEqualTypeOf<GitHubFetchContentData>();
    expectTypeOf<ContentResult>().toEqualTypeOf<GitHubFetchContentToolResult>();
    expectTypeOf<DirectoryFileEntry>().toEqualTypeOf<GitHubDirectoryFileEntry>();
    expectTypeOf<ContentResult['content']>().toEqualTypeOf<
      string | undefined
    >();
    expectTypeOf<ContentResult['status']>().toEqualTypeOf<
      'hasResults' | 'empty' | 'error'
    >();

    expectTypeOf<SearchResult>().toEqualTypeOf<GitHubSearchCodeData>();
    expectTypeOf<SearchResult['files']>().toEqualTypeOf<
      GitHubCodeSearchFile[] | undefined
    >();
    expectTypeOf<GitHubSearchCodeToolResult['files']>().toEqualTypeOf<
      GitHubCodeSearchFile[] | undefined
    >();

    expectTypeOf<PullRequestInfo>().toEqualTypeOf<GitHubPullRequestOutput>();
    expectTypeOf<PullRequestSearchResultData>().toEqualTypeOf<GitHubSearchPullRequestsData>();
    expectTypeOf<PullRequestSearchResult>().toEqualTypeOf<GitHubSearchPullRequestsToolResult>();
    expectTypeOf<PullRequestSearchResult['pull_requests']>().toEqualTypeOf<
      GitHubPullRequestOutput[] | undefined
    >();

    expectTypeOf<SimplifiedRepository>().toEqualTypeOf<GitHubRepositoryOutput>();
    expectTypeOf<RepoSearchResult>().toEqualTypeOf<GitHubSearchRepositoriesData>();
    expectTypeOf<
      GitHubSearchRepositoriesToolResult['repositories']
    >().toEqualTypeOf<GitHubRepositoryOutput[] | undefined>();

    expectTypeOf<DirectoryEntry>().toEqualTypeOf<GitHubRepoStructureDirectoryEntry>();
    expectTypeOf<RepoStructureResultData>().toEqualTypeOf<GitHubViewRepoStructureData>();
    expectTypeOf<GitHubViewRepoStructureData['structure']>().toEqualTypeOf<
      Record<string, GitHubRepoStructureDirectoryEntry> | undefined
    >();
  });

  it('derives local tool output aliases from the output schemas', () => {
    expectTypeOf<FetchContentResult>().toEqualTypeOf<LocalGetFileContentToolResult>();

    expectTypeOf<FoundFile>().toEqualTypeOf<LocalFindFilesEntry>();
    expectTypeOf<FindFilesResult>().toEqualTypeOf<LocalFindFilesToolResult>();
    expectTypeOf<FindFilesResult['files']>().toEqualTypeOf<
      LocalFindFilesEntry[] | undefined
    >();

    expectTypeOf<RipgrepMatch>().toEqualTypeOf<LocalSearchCodeMatch>();
    expectTypeOf<RipgrepFileMatches>().toEqualTypeOf<LocalSearchCodeFile>();
    expectTypeOf<SearchContentResult>().toEqualTypeOf<LocalSearchCodeToolResult>();
    expectTypeOf<SearchContentResult['files']>().toEqualTypeOf<
      LocalSearchCodeFile[] | undefined
    >();
    expectTypeOf<RipgrepFileMatches['matches']>().toEqualTypeOf<
      LocalSearchCodeMatch[]
    >();

    expectTypeOf<ViewStructureResult['entries']>().toEqualTypeOf<
      LocalViewStructureEntry[] | undefined
    >();
    expectTypeOf<ViewStructureResult>().toEqualTypeOf<LocalViewStructureToolResult>();
  });

  it('derives LSP and package output aliases from the output schemas', () => {
    expectTypeOf<CodeSnippet>().toEqualTypeOf<LspCodeSnippet>();
    expectTypeOf<GotoDefinitionResult>().toEqualTypeOf<LspGotoDefinitionToolResult>();
    expectTypeOf<GotoDefinitionResult['locations']>().toEqualTypeOf<
      LspCodeSnippet[] | undefined
    >();

    expectTypeOf<ReferenceLocation>().toEqualTypeOf<LspReferenceLocation>();
    expectTypeOf<FindReferencesResult>().toEqualTypeOf<LspFindReferencesToolResult>();
    expectTypeOf<FindReferencesResult['locations']>().toEqualTypeOf<
      LspReferenceLocation[] | undefined
    >();

    expectTypeOf<CallHierarchyItem>().toEqualTypeOf<LspCallHierarchyItem>();
    expectTypeOf<IncomingCall>().toEqualTypeOf<LspIncomingCall>();
    expectTypeOf<OutgoingCall>().toEqualTypeOf<LspOutgoingCall>();
    expectTypeOf<CallHierarchyResult>().toEqualTypeOf<LspCallHierarchyToolResult>();
    expectTypeOf<CallHierarchyResult['incomingCalls']>().toEqualTypeOf<
      LspIncomingCall[] | undefined
    >();

    expectTypeOf<PackageResultWithRepo>().toEqualTypeOf<PackageSearchPackage>();
    expectTypeOf<PackageSearchResult>().toEqualTypeOf<PackageSearchData>();
    expectTypeOf<PackageSearchResult['packages']>().toEqualTypeOf<
      PackageSearchPackage[]
    >();
  });
});
