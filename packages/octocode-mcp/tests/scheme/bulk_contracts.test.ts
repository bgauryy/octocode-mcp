import { describe, expect, it } from 'vitest';
import { BulkCloneRepoSchema } from '../../src/tools/github_clone_repo/scheme.js';
import {
  FileContentBulkQuerySchema,
} from '../../src/tools/github_fetch_content/scheme.js';
import {
  GitHubCodeSearchBulkQuerySchema,
} from '../../src/tools/github_search_code/scheme.js';
import {
  GitHubPullRequestSearchBulkQuerySchema,
} from '../../src/tools/github_search_pull_requests/scheme.js';
import {
  GitHubReposSearchQuerySchema,
} from '../../src/tools/github_search_repos/scheme.js';
import {
  GitHubViewRepoStructureBulkQuerySchema,
} from '../../src/tools/github_view_repo_structure/scheme.js';
import { BulkFetchContentSchema } from '../../src/tools/local_fetch_content/scheme.js';
import { BulkFindFilesSchema } from '../../src/tools/local_find_files/scheme.js';
import { BulkRipgrepQuerySchema } from '../../src/tools/local_ripgrep/scheme.js';
import { BulkViewStructureSchema } from '../../src/tools/local_view_structure/scheme.js';
import { BulkLSPCallHierarchySchema } from '../../src/tools/lsp_call_hierarchy/scheme.js';
import { BulkLSPFindReferencesSchema } from '../../src/tools/lsp_find_references/scheme.js';
import { BulkLSPGotoDefinitionSchema } from '../../src/tools/lsp_goto_definition/scheme.js';
import { PackageSearchBulkQuerySchema } from '../../src/tools/package_search/scheme.js';
import {
  BulkToolOutputSchema,
  GitHubCloneRepoOutputSchema,
  GitHubFetchContentOutputSchema,
  GitHubSearchCodeOutputSchema,
  GitHubSearchPullRequestsOutputSchema,
  GitHubSearchRepositoriesOutputSchema,
  GitHubViewRepoStructureOutputSchema,
  LocalFindFilesOutputSchema,
  LocalGetFileContentOutputSchema,
  LocalSearchCodeOutputSchema,
  LocalViewStructureOutputSchema,
  LspCallHierarchyOutputSchema,
  LspFindReferencesOutputSchema,
  LspGotoDefinitionOutputSchema,
  PackageSearchOutputSchema,
} from '../../src/scheme/outputSchemas.js';

describe('Bulk Tool Contracts', () => {
  describe('Input schemas require query ids', () => {
    const bulkInputSchemas = [
      {
        name: 'githubCloneRepo',
        schema: BulkCloneRepoSchema,
        payload: {
          queries: [
            {
              id: 'clone_repo',
              mainResearchGoal: 'Clone a repository for local analysis',
              researchGoal: 'Get a local checkout of the target repository',
              reasoning: 'Local tools need a repo path',
              owner: 'facebook',
              repo: 'react',
            },
          ],
        },
      },
      {
        name: 'githubGetFileContent',
        schema: FileContentBulkQuerySchema,
        payload: {
          queries: [
            {
              id: 'fetch_readme',
              mainResearchGoal: 'Read repository content',
              researchGoal: 'Inspect the README file',
              reasoning: 'Need repository docs before deeper search',
              owner: 'facebook',
              repo: 'react',
              path: 'README.md',
            },
          ],
        },
      },
      {
        name: 'githubSearchCode',
        schema: GitHubCodeSearchBulkQuerySchema,
        payload: {
          queries: [
            {
              id: 'search_hooks',
              mainResearchGoal: 'Find code patterns',
              researchGoal: 'Locate hook definitions',
              reasoning: 'Need representative implementation sites',
              keywordsToSearch: ['useEffect'],
            },
          ],
        },
      },
      {
        name: 'githubSearchPullRequests',
        schema: GitHubPullRequestSearchBulkQuerySchema,
        payload: {
          queries: [
            {
              id: 'router_prs',
              mainResearchGoal: 'Find pull requests',
              researchGoal: 'Inspect routing-related changes',
              reasoning: 'Need recent history around router work',
              query: 'router',
            },
          ],
        },
      },
      {
        name: 'githubSearchRepositories',
        schema: GitHubReposSearchQuerySchema,
        payload: {
          queries: [
            {
              id: 'cli_repos',
              mainResearchGoal: 'Find repositories',
              researchGoal: 'Locate CLI-focused repositories',
              reasoning: 'Need candidates for comparison',
              keywordsToSearch: ['cli'],
            },
          ],
        },
      },
      {
        name: 'githubViewRepoStructure',
        schema: GitHubViewRepoStructureBulkQuerySchema,
        payload: {
          queries: [
            {
              id: 'repo_tree',
              mainResearchGoal: 'Inspect repository layout',
              researchGoal: 'View the root structure',
              reasoning: 'Need the project layout before code reads',
              owner: 'facebook',
              repo: 'react',
            },
          ],
        },
      },
      {
        name: 'packageSearch',
        schema: PackageSearchBulkQuerySchema,
        payload: {
          queries: [
            {
              id: 'react_pkg',
              mainResearchGoal: 'Resolve a package',
              researchGoal: 'Find the package repository',
              reasoning: 'Need source location for further analysis',
              ecosystem: 'npm',
              name: 'react',
            },
          ],
        },
      },
      {
        name: 'localSearchCode',
        schema: BulkRipgrepQuerySchema,
        payload: {
          queries: [
            {
              id: 'local_exports',
              researchGoal: 'Find export statements',
              reasoning: 'Need entry points in the local repo',
              pattern: 'export',
              path: '/tmp',
            },
          ],
        },
      },
      {
        name: 'localGetFileContent',
        schema: BulkFetchContentSchema,
        payload: {
          queries: [
            {
              id: 'local_file',
              researchGoal: 'Read a local file',
              reasoning: 'Need file contents for inspection',
              path: '/tmp/file.ts',
            },
          ],
        },
      },
      {
        name: 'localFindFiles',
        schema: BulkFindFilesSchema,
        payload: {
          queries: [
            {
              id: 'config_files',
              researchGoal: 'Find configuration files',
              reasoning: 'Need likely config entry points',
              path: '/tmp',
            },
          ],
        },
      },
      {
        name: 'localViewStructure',
        schema: BulkViewStructureSchema,
        payload: {
          queries: [
            {
              id: 'local_tree',
              researchGoal: 'Inspect local structure',
              reasoning: 'Need the directory layout',
              path: '/tmp',
            },
          ],
        },
      },
      {
        name: 'lspGotoDefinition',
        schema: BulkLSPGotoDefinitionSchema,
        payload: {
          queries: [
            {
              id: 'goto_definition',
              researchGoal: 'Resolve a symbol definition',
              reasoning: 'Need the symbol implementation',
              uri: '/tmp/file.ts',
              symbolName: 'foo',
              lineHint: 1,
            },
          ],
        },
      },
      {
        name: 'lspFindReferences',
        schema: BulkLSPFindReferencesSchema,
        payload: {
          queries: [
            {
              id: 'find_references',
              researchGoal: 'Find symbol references',
              reasoning: 'Need all symbol usages',
              uri: '/tmp/file.ts',
              symbolName: 'foo',
              lineHint: 1,
            },
          ],
        },
      },
      {
        name: 'lspCallHierarchy',
        schema: BulkLSPCallHierarchySchema,
        payload: {
          queries: [
            {
              id: 'call_hierarchy',
              researchGoal: 'Trace call relationships',
              reasoning: 'Need caller and callee information',
              uri: '/tmp/file.ts',
              symbolName: 'foo',
              lineHint: 1,
              direction: 'incoming',
            },
          ],
        },
      },
    ] as const;

    it.each(bulkInputSchemas)('$name should reject a query without id', ({ schema, payload }) => {
      expect(schema.safeParse(payload).success).toBe(true);

      const missingIdPayload = JSON.parse(JSON.stringify(payload));
      delete missingIdPayload.queries[0].id;

      const result = schema.safeParse(missingIdPayload);
      expect(result.success).toBe(false);
    });
  });

  describe('Output schemas expose only the results envelope', () => {
    const bulkOutputSchemas = [
      { name: 'bulk', schema: BulkToolOutputSchema },
      { name: 'githubCloneRepo', schema: GitHubCloneRepoOutputSchema },
      { name: 'githubGetFileContent', schema: GitHubFetchContentOutputSchema },
      { name: 'githubSearchCode', schema: GitHubSearchCodeOutputSchema },
      {
        name: 'githubSearchPullRequests',
        schema: GitHubSearchPullRequestsOutputSchema,
      },
      {
        name: 'githubSearchRepositories',
        schema: GitHubSearchRepositoriesOutputSchema,
      },
      {
        name: 'githubViewRepoStructure',
        schema: GitHubViewRepoStructureOutputSchema,
      },
      { name: 'packageSearch', schema: PackageSearchOutputSchema },
      { name: 'localSearchCode', schema: LocalSearchCodeOutputSchema },
      { name: 'localGetFileContent', schema: LocalGetFileContentOutputSchema },
      { name: 'localFindFiles', schema: LocalFindFilesOutputSchema },
      { name: 'localViewStructure', schema: LocalViewStructureOutputSchema },
      { name: 'lspGotoDefinition', schema: LspGotoDefinitionOutputSchema },
      { name: 'lspFindReferences', schema: LspFindReferencesOutputSchema },
      { name: 'lspCallHierarchy', schema: LspCallHierarchyOutputSchema },
    ] as const;

    it.each(bulkOutputSchemas)(
      '$name should reject top-level instructions and accept results-only payloads',
      ({ schema }) => {
        const validPayload = {
          results: [{ id: 'q1', status: 'empty' as const, data: {} }],
        };

        expect(schema.safeParse(validPayload).success).toBe(true);
        expect(
          schema.safeParse({
            instructions: 'redundant',
            ...validPayload,
          }).success
        ).toBe(false);
      }
    );
  });
});
