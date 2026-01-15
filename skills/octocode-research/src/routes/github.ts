import { Router, type Request, type Response, type NextFunction } from 'express';
import {
  githubSearchCode,
  githubGetFileContent,
  githubSearchRepositories,
  githubViewRepoStructure,
  githubSearchPullRequests,
} from '../index.js';
import { parseAndValidate } from '../middleware/queryParser.js';
import {
  githubSearchSchema,
  githubContentSchema,
  githubReposSchema,
  githubStructureSchema,
  githubPRsSchema,
} from '../validation/index.js';
import { ResearchResponse, QuickResult, detectLanguageFromPath } from '../utils/responseBuilder.js';
import { parseToolResponse } from '../utils/responseParser.js';
import { withGitHubResilience } from '../utils/resilience.js';
import {
  toGitHubSearchParams,
  toGitHubContentParams,
  toGitHubReposParams,
  toGitHubStructureParams,
  toGitHubPRsParams,
} from '../types/toolTypes.js';
import {
  safeString,
  safeNumber,
  safeArray,
  transformPagination,
} from '../utils/responseFactory.js';
import { isObject, hasProperty, hasNumberProperty, hasBooleanProperty } from '../types/guards.js';

export const githubRoutes = Router();

// GET /github/search - Search code on GitHub
githubRoutes.get(
  '/search',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const queries = parseAndValidate(
        req.query as Record<string, unknown>,
        githubSearchSchema
      );
      const rawResult = await withGitHubResilience(
        () => githubSearchCode(toGitHubSearchParams(queries)),
        'githubSearchCode'
      );
      const { data, isError, hints, research } = parseToolResponse(rawResult);

      // Transform to role-based response
      // GitHub API returns text_matches as string array (snippets), not line numbers
      const files = safeArray<Record<string, unknown>>(data, 'files');
      const response = ResearchResponse.searchResults({
        files: files.map((f) => {
          const textMatches = safeArray<string>(f, 'text_matches');
          const firstMatch = textMatches[0];
          return {
            path: safeString(f, 'path'),
            repo: hasProperty(f, 'repo') && typeof f.repo === 'string' ? f.repo : undefined,
            matches: textMatches.length,
            preview: typeof firstMatch === 'string' ? firstMatch.trim().slice(0, 200) : undefined,
          };
        }),
        totalMatches: isObject(data.pagination) ? safeNumber(data.pagination, 'totalMatches', 0) : 0,
        pagination: transformPagination(data.pagination),
        searchPattern: Array.isArray(queries[0]?.keywordsToSearch)
          ? queries[0].keywordsToSearch.join(' ')
          : undefined,
        mcpHints: hints, // Pass through MCP workflow hints
        research, // Pass through research context
      });

      res.status(isError ? 500 : 200).json(response);
    } catch (error) {
      next(error);
    }
  }
);

// GET /github/content - Read file from GitHub
githubRoutes.get(
  '/content',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const queries = parseAndValidate(
        req.query as Record<string, unknown>,
        githubContentSchema
      );
      const rawResult = await withGitHubResilience(
        () => githubGetFileContent(toGitHubContentParams(queries)),
        'githubGetFileContent'
      );
      const { data, isError, hints, research } = parseToolResponse(rawResult);

      // Transform to role-based response
      const response = ResearchResponse.fileContent({
        path: safeString(data, 'path', queries[0]?.path || 'unknown'),
        content: safeString(data, 'content'),
        lines:
          hasNumberProperty(data, 'startLine')
            ? {
                start: data.startLine,
                end: hasNumberProperty(data, 'endLine') ? data.endLine : data.startLine,
              }
            : undefined,
        language: detectLanguageFromPath(queries[0]?.path || ''),
        totalLines: hasNumberProperty(data, 'totalLines') ? data.totalLines : undefined,
        isPartial: hasBooleanProperty(data, 'isPartial') ? data.isPartial : undefined,
        mcpHints: hints,
        research,
      });

      res.status(isError ? 500 : 200).json(response);
    } catch (error) {
      next(error);
    }
  }
);

// GET /github/repos - Search repositories
githubRoutes.get(
  '/repos',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const queries = parseAndValidate(
        req.query as Record<string, unknown>,
        githubReposSchema
      );
      const rawResult = await withGitHubResilience(
        () => githubSearchRepositories(toGitHubReposParams(queries)),
        'githubSearchRepositories'
      );
      const { data, isError, hints: mcpHints } = parseToolResponse(rawResult);

      const repos = safeArray<Record<string, unknown>>(data, 'repositories');
      const summary =
        repos.length > 0
          ? `Found ${repos.length} repositories:\n` +
            repos
              .slice(0, 10)
              .map((r) =>
                `- ${safeString(r, 'owner')}/${safeString(r, 'repo')}${hasNumberProperty(r, 'stars') ? ` ⭐${r.stars}` : ''}\n  ${safeString(r, 'description', 'No description')}`
              )
              .join('\n')
          : 'No repositories found';

      // Build hints - start with MCP hints, add contextual info
      const hints: string[] = [...mcpHints];
      const response =
        repos.length === 0
          ? QuickResult.empty(summary, hints.length > 0 ? hints : [
              'Try different search terms',
              'Use topicsToSearch for topic-based search',
            ])
          : QuickResult.success(summary, data, hints.length > 0 ? hints : [
              'Use githubViewRepoStructure to explore repo',
              'Use githubSearchCode to search within repo',
            ]);

      res.status(isError ? 500 : 200).json(response);
    } catch (error) {
      next(error);
    }
  }
);

// GET /github/structure - View repository structure
githubRoutes.get(
  '/structure',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const queries = parseAndValidate(
        req.query as Record<string, unknown>,
        githubStructureSchema
      );
      const rawResult = await withGitHubResilience(
        () => githubViewRepoStructure(toGitHubStructureParams(queries)),
        'githubViewRepoStructure'
      );
      const { data, isError, hints, research } = parseToolResponse(rawResult);

      const structure = isObject(data.structure) ? data.structure : {};
      const rootEntry = isObject(structure['.']) ? structure['.'] as { files?: string[]; folders?: string[] } : { files: [], folders: [] };
      const summary = isObject(data.summary) ? data.summary : {};

      const response = ResearchResponse.repoStructure({
        path: queries[0]?.path || '/',
        structure: {
          files: Array.isArray(rootEntry.files) ? rootEntry.files : [],
          folders: Array.isArray(rootEntry.folders) ? rootEntry.folders : [],
        },
        depth: hasNumberProperty(queries[0], 'depth') ? queries[0].depth : undefined,
        totalFiles: hasNumberProperty(summary, 'totalFiles') ? summary.totalFiles : undefined,
        totalFolders: hasNumberProperty(summary, 'totalFolders') ? summary.totalFolders : undefined,
        owner: queries[0]?.owner,
        repo: queries[0]?.repo,
        mcpHints: hints,
        research,
      });

      res.status(isError ? 500 : 200).json(response);
    } catch (error) {
      next(error);
    }
  }
);

// GET /github/prs - Search pull requests
githubRoutes.get(
  '/prs',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const queries = parseAndValidate(
        req.query as Record<string, unknown>,
        githubPRsSchema
      );
      const rawResult = await withGitHubResilience(
        () => githubSearchPullRequests(toGitHubPRsParams(queries)),
        'githubSearchPullRequests'
      );
      const { data, isError, hints, research } = parseToolResponse(rawResult);

      const prs = safeArray<Record<string, unknown>>(data, 'pull_requests');

      const response = ResearchResponse.pullRequests({
        prs: prs.map((pr) => ({
          number: safeNumber(pr, 'number', 0),
          title: safeString(pr, 'title'),
          state: safeString(pr, 'state'),
          author: hasProperty(pr, 'author') && typeof pr.author === 'string' ? pr.author : undefined,
          url: hasProperty(pr, 'url') && typeof pr.url === 'string' ? pr.url : undefined,
        })),
        repo:
          queries[0]?.owner && queries[0]?.repo
            ? `${queries[0].owner}/${queries[0].repo}`
            : undefined,
        pagination: transformPagination(data.pagination),
        mcpHints: hints,
        research,
      });

      res.status(isError ? 500 : 200).json(response);
    } catch (error) {
      next(error);
    }
  }
);
