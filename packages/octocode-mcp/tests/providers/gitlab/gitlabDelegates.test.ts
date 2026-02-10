import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  parseGitLabProjectId,
  transformFileContentResult,
  getFileContent,
} from '../../../src/providers/gitlab/gitlabContent.js';
import {
  parseGitLabProjectId as parseGitLabProjectIdStructure,
  getRepoStructure,
} from '../../../src/providers/gitlab/gitlabStructure.js';
import {
  parseGitLabProjectId as parseGitLabProjectIdSearch,
  transformCodeSearchResult,
  transformRepoSearchResult,
  mapSortField,
  searchCode,
  searchRepos,
} from '../../../src/providers/gitlab/gitlabSearch.js';
import {
  parseGitLabProjectId as parseGitLabProjectIdPR,
  mapMRState,
  transformPullRequestResult,
  searchPullRequests,
} from '../../../src/providers/gitlab/gitlabPullRequests.js';
import type {
  FileContentQuery,
  RepoStructureQuery,
  CodeSearchQuery,
  RepoSearchQuery,
  PullRequestQuery,
} from '../../../src/providers/types.js';

// Mock GitLab API functions
vi.mock('../../../src/gitlab/fileContent.js', () => ({
  fetchGitLabFileContentAPI: vi.fn(),
  getGitLabDefaultBranch: vi.fn(),
}));

vi.mock('../../../src/gitlab/repoStructure.js', () => ({
  viewGitLabRepositoryStructureAPI: vi.fn(),
}));

vi.mock('../../../src/gitlab/codeSearch.js', () => ({
  searchGitLabCodeAPI: vi.fn(),
}));

vi.mock('../../../src/gitlab/projectsSearch.js', () => ({
  searchGitLabProjectsAPI: vi.fn(),
}));

vi.mock('../../../src/gitlab/mergeRequests.js', () => ({
  searchGitLabMergeRequestsAPI: vi.fn(),
  getGitLabMRNotes: vi.fn(),
}));

import {
  fetchGitLabFileContentAPI,
  getGitLabDefaultBranch,
} from '../../../src/gitlab/fileContent.js';
import { viewGitLabRepositoryStructureAPI } from '../../../src/gitlab/repoStructure.js';
import { searchGitLabCodeAPI } from '../../../src/gitlab/codeSearch.js';
import { searchGitLabProjectsAPI } from '../../../src/gitlab/projectsSearch.js';
import {
  searchGitLabMergeRequestsAPI,
  getGitLabMRNotes,
} from '../../../src/gitlab/mergeRequests.js';

const mockFetchGitLabFileContentAPI = vi.mocked(fetchGitLabFileContentAPI);
const mockGetGitLabDefaultBranch = vi.mocked(getGitLabDefaultBranch);
const mockViewGitLabRepositoryStructureAPI = vi.mocked(
  viewGitLabRepositoryStructureAPI
);
const mockSearchGitLabCodeAPI = vi.mocked(searchGitLabCodeAPI);
const mockSearchGitLabProjectsAPI = vi.mocked(searchGitLabProjectsAPI);
const mockSearchGitLabMergeRequestsAPI = vi.mocked(
  searchGitLabMergeRequestsAPI
);
const mockGetGitLabMRNotes = vi.mocked(getGitLabMRNotes);

describe('GitLab Provider Delegates', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ==========================================================================
  // GITLAB CONTENT TESTS
  // ==========================================================================
  describe('gitlabContent', () => {
    describe('parseGitLabProjectId', () => {
      it('should throw error when projectId is undefined', () => {
        expect(() => parseGitLabProjectId(undefined)).toThrow(
          'Project ID is required'
        );
      });

      it('should throw error when projectId is empty string', () => {
        expect(() => parseGitLabProjectId('')).toThrow(
          'Project ID is required'
        );
      });

      it('should return number for numeric string', () => {
        const result = parseGitLabProjectId('12345');
        expect(result).toBe(12345);
        expect(typeof result).toBe('number');
      });

      it('should return URL-encoded string for non-numeric path', () => {
        const result = parseGitLabProjectId('group/project');
        expect(result).toBe('group%2Fproject');
        expect(typeof result).toBe('string');
      });

      it('should handle path with special characters', () => {
        const result = parseGitLabProjectId('group/subgroup/project');
        expect(result).toBe('group%2Fsubgroup%2Fproject');
      });

      it('should not encode numeric strings that are not exact match', () => {
        const result = parseGitLabProjectId('123abc');
        expect(result).toBe('123abc');
        expect(typeof result).toBe('string');
      });
    });

    describe('transformFileContentResult', () => {
      it('should transform result with missing file_path field', () => {
        const query: FileContentQuery = {
          projectId: '123',
          path: 'fallback/path.ts',
        };
        const data = {
          content: 'test content',
          size: 12,
        };
        const result = transformFileContentResult(data as any, query);
        expect(result.path).toBe('fallback/path.ts');
      });

      it('should transform result with base64 encoding', () => {
        const query: FileContentQuery = {
          projectId: '123',
          path: 'test.ts',
        };
        const data = {
          file_path: 'test.ts',
          content: 'base64content',
          encoding: 'base64',
          size: 10,
        };
        const result = transformFileContentResult(data as any, query);
        expect(result.encoding).toBe('base64');
      });

      it('should default to utf-8 encoding', () => {
        const query: FileContentQuery = {
          projectId: '123',
          path: 'test.ts',
        };
        const data = {
          file_path: 'test.ts',
          content: 'text content',
          encoding: 'text',
          size: 12,
        };
        const result = transformFileContentResult(data as any, query);
        expect(result.encoding).toBe('utf-8');
      });

      it('should set isPartial when startLine is provided', () => {
        const query: FileContentQuery = {
          projectId: '123',
          path: 'test.ts',
          startLine: 10,
        };
        const data = {
          file_path: 'test.ts',
          content: 'content',
          size: 7,
        };
        const result = transformFileContentResult(data as any, query);
        expect(result.isPartial).toBe(true);
      });

      it('should set isPartial when endLine is provided', () => {
        const query: FileContentQuery = {
          projectId: '123',
          path: 'test.ts',
          endLine: 20,
        };
        const data = {
          file_path: 'test.ts',
          content: 'content',
          size: 7,
        };
        const result = transformFileContentResult(data as any, query);
        expect(result.isPartial).toBe(true);
      });
    });

    describe('getFileContent', () => {
      it('should fetch default branch when ref is not provided', async () => {
        mockGetGitLabDefaultBranch.mockResolvedValue('main');
        mockFetchGitLabFileContentAPI.mockResolvedValue({
          data: {
            file_path: 'test.ts',
            content: 'content',
            size: 7,
            ref: 'main',
          } as any,
        } as any);

        const query: FileContentQuery = {
          projectId: '123',
          path: 'test.ts',
        };
        await getFileContent(query);

        expect(mockGetGitLabDefaultBranch).toHaveBeenCalledWith(123);
        expect(mockFetchGitLabFileContentAPI).toHaveBeenCalledWith(
          expect.objectContaining({ ref: 'main' })
        );
      });

      it('should use provided ref when available', async () => {
        mockFetchGitLabFileContentAPI.mockResolvedValue({
          data: {
            file_path: 'test.ts',
            content: 'content',
            size: 7,
            ref: 'develop',
          } as any,
        } as any);

        const query: FileContentQuery = {
          projectId: '123',
          path: 'test.ts',
          ref: 'develop',
        };
        await getFileContent(query);

        expect(mockGetGitLabDefaultBranch).not.toHaveBeenCalled();
        expect(mockFetchGitLabFileContentAPI).toHaveBeenCalledWith(
          expect.objectContaining({ ref: 'develop' })
        );
      });

      it('should return error when API returns error', async () => {
        mockGetGitLabDefaultBranch.mockResolvedValue('main');
        mockFetchGitLabFileContentAPI.mockResolvedValue({
          error: 'File not found',
          status: 404,
          hints: ['Check the path'],
        } as any);

        const query: FileContentQuery = {
          projectId: '123',
          path: 'nonexistent.ts',
        };
        const result = await getFileContent(query);

        expect(result.error).toBe('File not found');
        expect(result.status).toBe(404);
        expect(result.hints).toEqual(['Check the path']);
      });

      it('should handle error with object toString', async () => {
        mockGetGitLabDefaultBranch.mockResolvedValue('main');
        const errorObj = {
          toString: () => 'Object error',
        };
        mockFetchGitLabFileContentAPI.mockResolvedValue({
          error: errorObj as any,
          status: 500,
        } as any);

        const query: FileContentQuery = {
          projectId: '123',
          path: 'test.ts',
        };
        const result = await getFileContent(query);

        expect(result.error).toBe('Object error');
        expect(result.status).toBe(500);
      });

      it('should return 500 error when API returns no data', async () => {
        mockGetGitLabDefaultBranch.mockResolvedValue('main');
        mockFetchGitLabFileContentAPI.mockResolvedValue({
          status: 200,
        } as any);

        const query: FileContentQuery = {
          projectId: '123',
          path: 'test.ts',
        };
        const result = await getFileContent(query);

        expect(result.error).toBe('No data returned from GitLab API');
        expect(result.status).toBe(500);
      });

      it('should return 500 error when data is null', async () => {
        mockGetGitLabDefaultBranch.mockResolvedValue('main');
        mockFetchGitLabFileContentAPI.mockResolvedValue({
          data: null,
          status: 200,
        } as any);

        const query: FileContentQuery = {
          projectId: '123',
          path: 'test.ts',
        };
        const result = await getFileContent(query);

        expect(result.error).toBe('No data returned from GitLab API');
        expect(result.status).toBe(500);
      });

      it('should return success when API returns data', async () => {
        mockGetGitLabDefaultBranch.mockResolvedValue('main');
        mockFetchGitLabFileContentAPI.mockResolvedValue({
          data: {
            file_path: 'test.ts',
            content: 'export const test = 1;',
            size: 20,
            ref: 'main',
          } as any,
        } as any);

        const query: FileContentQuery = {
          projectId: '123',
          path: 'test.ts',
        };
        const result = await getFileContent(query);

        expect(result.status).toBe(200);
        expect(result.data).toBeDefined();
        expect(result.data?.path).toBe('test.ts');
      });
    });
  });

  // ==========================================================================
  // GITLAB STRUCTURE TESTS
  // ==========================================================================
  describe('gitlabStructure', () => {
    describe('parseGitLabProjectId', () => {
      it('should throw error when projectId is undefined', () => {
        expect(() => parseGitLabProjectIdStructure(undefined)).toThrow(
          'Project ID is required'
        );
      });

      it('should return number for numeric string', () => {
        const result = parseGitLabProjectIdStructure('12345');
        expect(result).toBe(12345);
      });

      it('should return URL-encoded string for path', () => {
        const result = parseGitLabProjectIdStructure('group/project');
        expect(result).toBe('group%2Fproject');
      });
    });

    describe('getRepoStructure', () => {
      it('should return error when API returns error', async () => {
        mockViewGitLabRepositoryStructureAPI.mockResolvedValue({
          error: 'Repository not found',
          status: 404,
          hints: ['Check project ID'],
        } as any);

        const query: RepoStructureQuery = {
          projectId: '999999',
        };
        const result = await getRepoStructure(query);

        expect(result.error).toBe('Repository not found');
        expect(result.status).toBe(404);
        expect(result.hints).toEqual(['Check project ID']);
      });

      it('should handle error with object toString', async () => {
        const errorObj = {
          toString: () => 'Object error',
        };
        mockViewGitLabRepositoryStructureAPI.mockResolvedValue({
          error: errorObj as any,
          status: 500,
        } as any);

        const query: RepoStructureQuery = {
          projectId: '123',
        };
        const result = await getRepoStructure(query);

        // gitlabStructure passes the error through as-is (it's the raw error object)
        expect(result.error).toBe(errorObj);
        expect(result.status).toBe(500);
      });

      it('should return 500 error when API returns no data', async () => {
        mockViewGitLabRepositoryStructureAPI.mockResolvedValue({
          status: 200,
        } as any);

        const query: RepoStructureQuery = {
          projectId: '123',
        };
        const result = await getRepoStructure(query);

        expect(result.error).toBe('No data returned from GitLab API');
        expect(result.status).toBe(500);
      });

      it('should return 500 error when data is null', async () => {
        mockViewGitLabRepositoryStructureAPI.mockResolvedValue({
          data: null,
          status: 200,
        } as any);

        const query: RepoStructureQuery = {
          projectId: '123',
        };
        const result = await getRepoStructure(query);

        expect(result.error).toBe('No data returned from GitLab API');
        expect(result.status).toBe(500);
      });

      it('should return success when API returns data', async () => {
        mockViewGitLabRepositoryStructureAPI.mockResolvedValue({
          data: {
            projectPath: 'group/project',
            branch: 'main',
            path: '/',
            structure: {},
            summary: {
              totalFiles: 0,
              totalFolders: 0,
              truncated: false,
            } as any,
            pagination: {
              currentPage: 1,
              totalPages: 1,
              hasMore: false,
            } as any,
          } as any,
        } as any);

        const query: RepoStructureQuery = {
          projectId: '123',
        };
        const result = await getRepoStructure(query);

        expect(result.status).toBe(200);
        expect(result.data).toBeDefined();
      });
    });
  });

  // ==========================================================================
  // GITLAB SEARCH TESTS
  // ==========================================================================
  describe('gitlabSearch', () => {
    describe('parseGitLabProjectId', () => {
      it('should throw error when projectId is undefined', () => {
        expect(() => parseGitLabProjectIdSearch(undefined)).toThrow(
          'Project ID is required'
        );
      });
    });

    describe('transformCodeSearchResult', () => {
      it('should transform result with empty items array', () => {
        const items: any[] = [];
        const query: CodeSearchQuery = {
          keywords: ['test'],
          projectId: '123',
        };
        const result = transformCodeSearchResult(items, query);
        expect(result.items).toEqual([]);
        expect(result.totalCount).toBe(0);
      });

      it('should handle missing pagination fields', () => {
        const items: any[] = [
          {
            path: 'test.ts',
            data: 'test content',
            project_id: 123,
          },
        ];
        const query: CodeSearchQuery = {
          keywords: ['test'],
          projectId: '123',
          page: 2,
          limit: 20,
        };
        const result = transformCodeSearchResult(items, query);
        expect(result.pagination).toEqual({
          currentPage: 2,
          totalPages: 1,
          hasMore: false,
        });
      });

      it('should set hasMore when items length equals limit', () => {
        const items: any[] = Array(20).fill({
          path: 'test.ts',
          data: 'test',
          project_id: 123,
        });
        const query: CodeSearchQuery = {
          keywords: ['test'],
          projectId: '123',
          limit: 20,
        };
        const result = transformCodeSearchResult(items, query);
        expect(result.pagination.hasMore).toBe(true);
      });
    });

    describe('transformRepoSearchResult', () => {
      it('should transform result with empty projects array', () => {
        const projects: any[] = [];
        const pagination = undefined;
        const result = transformRepoSearchResult(projects, pagination);
        expect(result.repositories).toEqual([]);
        expect(result.totalCount).toBe(0);
      });

      it('should handle missing pagination fields', () => {
        const projects: any[] = [
          {
            id: 123,
            name: 'test',
            path_with_namespace: 'group/test',
            web_url: 'https://gitlab.com/group/test',
            http_url_to_repo: 'https://gitlab.com/group/test.git',
            default_branch: 'main',
            star_count: 0,
            forks_count: 0,
            visibility: 'public',
            created_at: '2024-01-01T00:00:00Z',
            updated_at: '2024-01-01T00:00:00Z',
            last_activity_at: '2024-01-01T00:00:00Z',
          },
        ];
        const result = transformRepoSearchResult(projects, undefined);
        expect(result.pagination).toEqual({
          currentPage: 1,
          totalPages: 1,
          hasMore: false,
          totalMatches: undefined,
        });
      });

      it('should use topics or tag_list', () => {
        const projects: any[] = [
          {
            id: 123,
            name: 'test',
            path_with_namespace: 'group/test',
            web_url: 'https://gitlab.com/group/test',
            http_url_to_repo: 'https://gitlab.com/group/test.git',
            default_branch: 'main',
            star_count: 0,
            forks_count: 0,
            visibility: 'public',
            tag_list: ['tag1', 'tag2'],
            created_at: '2024-01-01T00:00:00Z',
            updated_at: '2024-01-01T00:00:00Z',
            last_activity_at: '2024-01-01T00:00:00Z',
          },
        ];
        const result = transformRepoSearchResult(projects, undefined);
        expect(result.repositories[0]?.topics).toEqual(['tag1', 'tag2']);
      });
    });

    describe('mapSortField', () => {
      it('should map stars to star_count', () => {
        expect(mapSortField('stars')).toBe('star_count');
      });

      it('should map updated to updated_at', () => {
        expect(mapSortField('updated')).toBe('updated_at');
      });

      it('should map created to created_at', () => {
        expect(mapSortField('created')).toBe('created_at');
      });

      it('should return undefined for unknown sort field', () => {
        expect(mapSortField('unknown')).toBeUndefined();
      });

      it('should return undefined when sort is undefined', () => {
        expect(mapSortField(undefined)).toBeUndefined();
      });
    });

    describe('searchCode', () => {
      it('should return error when API returns error', async () => {
        mockSearchGitLabCodeAPI.mockResolvedValue({
          error: 'Search failed',
          status: 422,
          hints: ['Try different keywords'],
        } as any);

        const query: CodeSearchQuery = {
          keywords: ['test'],
          projectId: '123',
        };
        const result = await searchCode(query);

        expect(result.error).toBe('Search failed');
        expect(result.status).toBe(422);
        expect(result.hints).toEqual(['Try different keywords']);
      });

      it('should return 500 error when API returns no data', async () => {
        mockSearchGitLabCodeAPI.mockResolvedValue({
          status: 200,
        } as any);

        const query: CodeSearchQuery = {
          keywords: ['test'],
          projectId: '123',
        };
        const result = await searchCode(query);

        expect(result.error).toBe('No data returned from GitLab API');
        expect(result.status).toBe(500);
      });

      it('should return 500 error when data is null', async () => {
        mockSearchGitLabCodeAPI.mockResolvedValue({
          data: null,
          status: 200,
        } as any);

        const query: CodeSearchQuery = {
          keywords: ['test'],
          projectId: '123',
        };
        const result = await searchCode(query);

        expect(result.error).toBe('No data returned from GitLab API');
        expect(result.status).toBe(500);
      });

      it('should return success when API returns data', async () => {
        mockSearchGitLabCodeAPI.mockResolvedValue({
          data: {
            items: [
              {
                path: 'test.ts',
                data: 'test content',
                project_id: 123,
              } as any,
            ],
          },
        } as any);

        const query: CodeSearchQuery = {
          keywords: ['test'],
          projectId: '123',
        };
        const result = await searchCode(query);

        expect(result.status).toBe(200);
        expect(result.data).toBeDefined();
      });
    });

    describe('searchRepos', () => {
      it('should return error when API returns error', async () => {
        mockSearchGitLabProjectsAPI.mockResolvedValue({
          error: 'Search failed',
          status: 422,
          hints: ['Try different keywords'],
        } as any);

        const query: RepoSearchQuery = {
          keywords: ['test'],
        };
        const result = await searchRepos(query);

        expect(result.error).toBe('Search failed');
        expect(result.status).toBe(422);
        expect(result.hints).toEqual(['Try different keywords']);
      });

      it('should return 500 error when API returns no data', async () => {
        mockSearchGitLabProjectsAPI.mockResolvedValue({
          status: 200,
        } as any);

        const query: RepoSearchQuery = {
          keywords: ['test'],
        };
        const result = await searchRepos(query);

        expect(result.error).toBe('No data returned from GitLab API');
        expect(result.status).toBe(500);
      });

      it('should return 500 error when data is null', async () => {
        mockSearchGitLabProjectsAPI.mockResolvedValue({
          data: null,
          status: 200,
        } as any);

        const query: RepoSearchQuery = {
          keywords: ['test'],
        };
        const result = await searchRepos(query);

        expect(result.error).toBe('No data returned from GitLab API');
        expect(result.status).toBe(500);
      });

      it('should return success when API returns data', async () => {
        mockSearchGitLabProjectsAPI.mockResolvedValue({
          data: {
            projects: [
              {
                id: 123,
                name: 'test',
                path_with_namespace: 'group/test',
                web_url: 'https://gitlab.com/group/test',
                http_url_to_repo: 'https://gitlab.com/group/test.git',
                default_branch: 'main',
                star_count: 0,
                forks_count: 0,
                visibility: 'public',
                created_at: '2024-01-01T00:00:00Z',
                updated_at: '2024-01-01T00:00:00Z',
                last_activity_at: '2024-01-01T00:00:00Z',
              } as any,
            ],
            pagination: {
              currentPage: 1,
              totalPages: 1,
              hasMore: false,
            } as any,
          },
        } as any);

        const query: RepoSearchQuery = {
          keywords: ['test'],
        };
        const result = await searchRepos(query);

        expect(result.status).toBe(200);
        expect(result.data).toBeDefined();
      });
    });
  });

  // ==========================================================================
  // GITLAB PULL REQUESTS TESTS
  // ==========================================================================
  describe('gitlabPullRequests', () => {
    describe('parseGitLabProjectId', () => {
      it('should throw error when projectId is undefined', () => {
        expect(() => parseGitLabProjectIdPR(undefined)).toThrow(
          'Project ID is required'
        );
      });
    });

    describe('mapMRState', () => {
      it('should map open to opened', () => {
        expect(mapMRState('open')).toBe('opened');
      });

      it('should map closed to closed', () => {
        expect(mapMRState('closed')).toBe('closed');
      });

      it('should map merged to merged', () => {
        expect(mapMRState('merged')).toBe('merged');
      });

      it('should map all to all', () => {
        expect(mapMRState('all')).toBe('all');
      });

      it('should return undefined for unknown state', () => {
        expect(mapMRState('unknown')).toBeUndefined();
      });

      it('should return undefined when state is undefined', () => {
        expect(mapMRState(undefined)).toBeUndefined();
      });
    });

    describe('transformPullRequestResult', () => {
      it('should transform result with empty mergeRequests array', () => {
        const mergeRequests: any[] = [];
        const pagination = undefined;
        const query: PullRequestQuery = {
          projectId: '123',
        };
        const result = transformPullRequestResult(
          mergeRequests,
          pagination,
          query
        );
        expect(result.items).toEqual([]);
        expect(result.totalCount).toBe(0);
      });

      it('should handle missing pagination fields', () => {
        const mergeRequests: any[] = [
          {
            iid: 1,
            title: 'Test MR',
            web_url: 'https://gitlab.com/group/project/-/merge_requests/1',
            state: 'opened',
            source_branch: 'feature',
            target_branch: 'main',
            created_at: '2024-01-01T10:00:00Z',
            updated_at: '2024-01-01T10:00:00Z',
          },
        ];
        const query: PullRequestQuery = {
          projectId: '123',
        };
        const result = transformPullRequestResult(
          mergeRequests,
          undefined,
          query
        );
        expect(result.pagination).toEqual({
          currentPage: 1,
          totalPages: 1,
          hasMore: false,
          totalMatches: undefined,
        });
      });

      it('should map merged state correctly', () => {
        const mergeRequests: any[] = [
          {
            iid: 1,
            title: 'Merged MR',
            web_url: 'https://gitlab.com/group/project/-/merge_requests/1',
            state: 'merged',
            source_branch: 'feature',
            target_branch: 'main',
            created_at: '2024-01-01T10:00:00Z',
            updated_at: '2024-01-01T10:00:00Z',
          },
        ];
        const query: PullRequestQuery = {
          projectId: '123',
        };
        const result = transformPullRequestResult(
          mergeRequests,
          undefined,
          query
        );
        expect(result.items[0]?.state).toBe('merged');
      });

      it('should map closed state correctly', () => {
        const mergeRequests: any[] = [
          {
            iid: 1,
            title: 'Closed MR',
            web_url: 'https://gitlab.com/group/project/-/merge_requests/1',
            state: 'closed',
            source_branch: 'feature',
            target_branch: 'main',
            created_at: '2024-01-01T10:00:00Z',
            updated_at: '2024-01-01T10:00:00Z',
          },
        ];
        const query: PullRequestQuery = {
          projectId: '123',
        };
        const result = transformPullRequestResult(
          mergeRequests,
          undefined,
          query
        );
        expect(result.items[0]?.state).toBe('closed');
      });

      it('should handle draft and work_in_progress flags', () => {
        const mergeRequests: any[] = [
          {
            iid: 1,
            title: 'Draft MR',
            web_url: 'https://gitlab.com/group/project/-/merge_requests/1',
            state: 'opened',
            draft: true,
            source_branch: 'feature',
            target_branch: 'main',
            created_at: '2024-01-01T10:00:00Z',
            updated_at: '2024-01-01T10:00:00Z',
          },
        ];
        const query: PullRequestQuery = {
          projectId: '123',
        };
        const result = transformPullRequestResult(
          mergeRequests,
          undefined,
          query
        );
        expect(result.items[0]?.draft).toBe(true);
      });

      it('should handle missing author username', () => {
        const mergeRequests: any[] = [
          {
            iid: 1,
            title: 'MR',
            web_url: 'https://gitlab.com/group/project/-/merge_requests/1',
            state: 'opened',
            source_branch: 'feature',
            target_branch: 'main',
            created_at: '2024-01-01T10:00:00Z',
            updated_at: '2024-01-01T10:00:00Z',
          },
        ];
        const query: PullRequestQuery = {
          projectId: '123',
        };
        const result = transformPullRequestResult(
          mergeRequests,
          undefined,
          query
        );
        expect(result.items[0]?.author).toBe('');
      });

      it('should handle missing assignees', () => {
        const mergeRequests: any[] = [
          {
            iid: 1,
            title: 'MR',
            web_url: 'https://gitlab.com/group/project/-/merge_requests/1',
            state: 'opened',
            source_branch: 'feature',
            target_branch: 'main',
            created_at: '2024-01-01T10:00:00Z',
            updated_at: '2024-01-01T10:00:00Z',
          },
        ];
        const query: PullRequestQuery = {
          projectId: '123',
        };
        const result = transformPullRequestResult(
          mergeRequests,
          undefined,
          query
        );
        expect(result.items[0]?.assignees).toEqual([]);
      });

      it('should handle missing labels', () => {
        const mergeRequests: any[] = [
          {
            iid: 1,
            title: 'MR',
            web_url: 'https://gitlab.com/group/project/-/merge_requests/1',
            state: 'opened',
            source_branch: 'feature',
            target_branch: 'main',
            created_at: '2024-01-01T10:00:00Z',
            updated_at: '2024-01-01T10:00:00Z',
          },
        ];
        const query: PullRequestQuery = {
          projectId: '123',
        };
        const result = transformPullRequestResult(
          mergeRequests,
          undefined,
          query
        );
        expect(result.items[0]?.labels).toEqual([]);
      });

      it('should handle missing diff_refs', () => {
        const mergeRequests: any[] = [
          {
            iid: 1,
            title: 'MR',
            web_url: 'https://gitlab.com/group/project/-/merge_requests/1',
            state: 'opened',
            source_branch: 'feature',
            target_branch: 'main',
            created_at: '2024-01-01T10:00:00Z',
            updated_at: '2024-01-01T10:00:00Z',
          },
        ];
        const query: PullRequestQuery = {
          projectId: '123',
        };
        const result = transformPullRequestResult(
          mergeRequests,
          undefined,
          query
        );
        expect(result.items[0]?.sourceSha).toBeUndefined();
        expect(result.items[0]?.targetSha).toBeUndefined();
      });

      it('should handle missing notes', () => {
        const mergeRequests: any[] = [
          {
            iid: 1,
            title: 'MR',
            web_url: 'https://gitlab.com/group/project/-/merge_requests/1',
            state: 'opened',
            source_branch: 'feature',
            target_branch: 'main',
            created_at: '2024-01-01T10:00:00Z',
            updated_at: '2024-01-01T10:00:00Z',
          },
        ];
        const query: PullRequestQuery = {
          projectId: '123',
        };
        const result = transformPullRequestResult(
          mergeRequests,
          undefined,
          query
        );
        expect(result.items[0]?.comments).toBeUndefined();
      });
    });

    describe('searchPullRequests', () => {
      it('should return error when API returns error', async () => {
        mockSearchGitLabMergeRequestsAPI.mockResolvedValue({
          error: 'MR search failed',
          status: 422,
          hints: ['Check parameters'],
        } as any);

        const query: PullRequestQuery = {
          projectId: '123',
        };
        const result = await searchPullRequests(query);

        expect(result.error).toBe('MR search failed');
        expect(result.status).toBe(422);
        expect(result.hints).toEqual(['Check parameters']);
      });

      it('should return 500 error when API returns no data', async () => {
        mockSearchGitLabMergeRequestsAPI.mockResolvedValue({
          status: 200,
        } as any);

        const query: PullRequestQuery = {
          projectId: '123',
        };
        const result = await searchPullRequests(query);

        expect(result.error).toBe('No data returned from GitLab API');
        expect(result.status).toBe(500);
      });

      it('should return 500 error when data is null', async () => {
        mockSearchGitLabMergeRequestsAPI.mockResolvedValue({
          data: null,
          status: 200,
        } as any);

        const query: PullRequestQuery = {
          projectId: '123',
        };
        const result = await searchPullRequests(query);

        expect(result.error).toBe('No data returned from GitLab API');
        expect(result.status).toBe(500);
      });

      it('should fetch comments when withComments is true', async () => {
        mockSearchGitLabMergeRequestsAPI.mockResolvedValue({
          data: {
            mergeRequests: [
              {
                iid: 1,
                title: 'Test MR',
                web_url: 'https://gitlab.com/group/project/-/merge_requests/1',
                state: 'opened',
                source_branch: 'feature',
                target_branch: 'main',
                created_at: '2024-01-01T10:00:00Z',
                updated_at: '2024-01-01T10:00:00Z',
              } as any,
            ],
            pagination: {
              currentPage: 1,
              totalPages: 1,
              hasMore: false,
            } as any,
          },
        } as any);

        mockGetGitLabMRNotes.mockResolvedValue({
          data: [
            {
              id: 'note-1' as any,
              author: { username: 'reviewer' } as any,
              body: 'LGTM',
              created_at: '2024-01-02T10:00:00Z',
              updated_at: '2024-01-02T10:00:00Z',
            } as any,
          ],
        } as any);

        const query: PullRequestQuery = {
          projectId: '123',
          withComments: true,
        };
        const result = await searchPullRequests(query);

        expect(result.status).toBe(200);
        expect(result.data).toBeDefined();
        expect(mockGetGitLabMRNotes).toHaveBeenCalledWith(123, 1);
        expect(result.data?.items[0]?.comments).toHaveLength(1);
      });

      it('should handle error fetching notes gracefully', async () => {
        mockSearchGitLabMergeRequestsAPI.mockResolvedValue({
          data: {
            mergeRequests: [
              {
                iid: 1,
                title: 'Test MR',
                web_url: 'https://gitlab.com/group/project/-/merge_requests/1',
                state: 'opened',
                source_branch: 'feature',
                target_branch: 'main',
                created_at: '2024-01-01T10:00:00Z',
                updated_at: '2024-01-01T10:00:00Z',
              } as any,
            ],
            pagination: {
              currentPage: 1,
              totalPages: 1,
              hasMore: false,
            } as any,
          },
        } as any);

        mockGetGitLabMRNotes.mockRejectedValue(new Error('Notes fetch failed'));

        const query: PullRequestQuery = {
          projectId: '123',
          withComments: true,
        };
        const result = await searchPullRequests(query);

        expect(result.status).toBe(200);
        expect(result.data).toBeDefined();
        // Should still return MR even if notes fetch fails
        expect(result.data?.items[0]?.comments).toBeUndefined();
      });

      it('should not fetch comments when withComments is false', async () => {
        mockSearchGitLabMergeRequestsAPI.mockResolvedValue({
          data: {
            mergeRequests: [
              {
                iid: 1,
                title: 'Test MR',
                web_url: 'https://gitlab.com/group/project/-/merge_requests/1',
                state: 'opened',
                source_branch: 'feature',
                target_branch: 'main',
                created_at: '2024-01-01T10:00:00Z',
                updated_at: '2024-01-01T10:00:00Z',
              } as any,
            ],
            pagination: {
              currentPage: 1,
              totalPages: 1,
              hasMore: false,
            } as any,
          },
        } as any);

        const query: PullRequestQuery = {
          projectId: '123',
          withComments: false,
        };
        await searchPullRequests(query);

        expect(mockGetGitLabMRNotes).not.toHaveBeenCalled();
      });

      it('should not fetch comments when projectId is undefined', async () => {
        mockSearchGitLabMergeRequestsAPI.mockResolvedValue({
          data: {
            mergeRequests: [
              {
                iid: 1,
                title: 'Test MR',
                web_url: 'https://gitlab.com/group/project/-/merge_requests/1',
                state: 'opened',
                source_branch: 'feature',
                target_branch: 'main',
                created_at: '2024-01-01T10:00:00Z',
                updated_at: '2024-01-01T10:00:00Z',
              } as any,
            ],
            pagination: {
              currentPage: 1,
              totalPages: 1,
              hasMore: false,
            } as any,
          },
        } as any);

        const query: PullRequestQuery = {
          withComments: true,
        };
        await searchPullRequests(query);

        expect(mockGetGitLabMRNotes).not.toHaveBeenCalled();
      });

      it('should not fetch comments when mergeRequests array is empty', async () => {
        mockSearchGitLabMergeRequestsAPI.mockResolvedValue({
          data: {
            mergeRequests: [],
            pagination: {
              currentPage: 1,
              totalPages: 1,
              hasMore: false,
            } as any,
          },
        } as any);

        const query: PullRequestQuery = {
          projectId: '123',
          withComments: true,
        };
        await searchPullRequests(query);

        expect(mockGetGitLabMRNotes).not.toHaveBeenCalled();
      });

      it('should return success when API returns data', async () => {
        mockSearchGitLabMergeRequestsAPI.mockResolvedValue({
          data: {
            mergeRequests: [
              {
                iid: 1,
                title: 'Test MR',
                web_url: 'https://gitlab.com/group/project/-/merge_requests/1',
                state: 'opened',
                source_branch: 'feature',
                target_branch: 'main',
                created_at: '2024-01-01T10:00:00Z',
                updated_at: '2024-01-01T10:00:00Z',
              } as any,
            ],
            pagination: {
              currentPage: 1,
              totalPages: 1,
              hasMore: false,
            } as any,
          },
        } as any);

        const query: PullRequestQuery = {
          projectId: '123',
        };
        const result = await searchPullRequests(query);

        expect(result.status).toBe(200);
        expect(result.data).toBeDefined();
        expect(result.data?.items).toHaveLength(1);
      });
    });
  });
});
