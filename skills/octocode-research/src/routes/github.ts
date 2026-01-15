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
import { ResearchResponse, QuickResult } from '../utils/responseBuilder.js';
import { parseToolResponse } from '../utils/responseParser.js';
import { withGitHubResilience } from '../utils/resilience.js';

export const githubRoutes = Router();

// Type for structured content (flexible)
type StructuredData = Record<string, unknown>;

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
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        () => githubSearchCode({ queries } as any),
        'githubSearchCode'
      );
      const { data, isError, hints, research } = parseToolResponse(rawResult);

      // Transform to role-based response
      // GitHub API returns text_matches as string array (snippets), not line numbers
      const files = Array.isArray(data.files) ? data.files : [];
      const response = ResearchResponse.searchResults({
        files: files.map((f: StructuredData) => {
          const textMatches = Array.isArray(f.text_matches) ? f.text_matches : [];
          const firstMatch = textMatches[0];
          return {
            path: String(f.path || ''),
            repo: typeof f.repo === 'string' ? f.repo : undefined,
            matches: textMatches.length,
            preview: typeof firstMatch === 'string' ? firstMatch.trim().slice(0, 200) : undefined,
          };
        }),
        totalMatches: typeof (data.pagination as StructuredData)?.totalMatches === 'number'
          ? (data.pagination as StructuredData).totalMatches as number
          : 0,
        // Map MCP pagination fields (currentPage/totalPages) to skill format (page/total)
        pagination: data.pagination ? {
          page: (data.pagination as StructuredData).currentPage as number || 1,
          total: (data.pagination as StructuredData).totalPages as number || 1,
          hasMore: (data.pagination as StructuredData).hasMore === true,
        } : undefined,
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
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        () => githubGetFileContent({ queries } as any),
        'githubGetFileContent'
      );
      const { data, isError, hints, research } = parseToolResponse(rawResult);

      // Transform to role-based response
      const response = ResearchResponse.fileContent({
        path: String(data.path || queries[0]?.path || 'unknown'),
        content: String(data.content || ''),
        lines:
          typeof data.startLine === 'number'
            ? {
                start: data.startLine as number,
                end: typeof data.endLine === 'number' ? data.endLine : (data.startLine as number),
              }
            : undefined,
        language: detectLanguageFromPath(queries[0]?.path || ''),
        totalLines: typeof data.totalLines === 'number' ? data.totalLines : undefined,
        isPartial: typeof data.isPartial === 'boolean' ? data.isPartial : undefined,
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
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        () => githubSearchRepositories({ queries } as any),
        'githubSearchRepositories'
      );
      const { data, isError, hints: mcpHints } = parseToolResponse(rawResult);

      const repos = Array.isArray(data.repositories) ? data.repositories : [];
      const summary =
        repos.length > 0
          ? `Found ${repos.length} repositories:\n` +
            repos
              .slice(0, 10)
              .map((r: StructuredData) =>
                `- ${r.owner}/${r.repo}${typeof r.stars === 'number' ? ` ⭐${r.stars}` : ''}\n  ${r.description || 'No description'}`
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
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        () => githubViewRepoStructure({ queries } as any),
        'githubViewRepoStructure'
      );
      const { data, isError, hints, research } = parseToolResponse(rawResult);

      const structure = (data.structure || {}) as StructuredData;
      const rootEntry = (structure['.'] || { files: [], folders: [] }) as {
        files: string[];
        folders: string[];
      };
      const summary = (data.summary || {}) as StructuredData;

      const response = ResearchResponse.repoStructure({
        path: queries[0]?.path || '/',
        structure: {
          files: Array.isArray(rootEntry.files) ? rootEntry.files : [],
          folders: Array.isArray(rootEntry.folders) ? rootEntry.folders : [],
        },
        depth: typeof queries[0]?.depth === 'number' ? queries[0].depth : undefined,
        totalFiles: typeof summary.totalFiles === 'number' ? summary.totalFiles : undefined,
        totalFolders: typeof summary.totalFolders === 'number' ? summary.totalFolders : undefined,
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
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        () => githubSearchPullRequests({ queries } as any),
        'githubSearchPullRequests'
      );
      const { data, isError, hints, research } = parseToolResponse(rawResult);

      const prs = Array.isArray(data.pull_requests) ? data.pull_requests : [];

      const response = ResearchResponse.pullRequests({
        prs: prs.map((pr: StructuredData) => ({
          number: typeof pr.number === 'number' ? pr.number : 0,
          title: String(pr.title || ''),
          state: String(pr.state || ''),
          author: typeof pr.author === 'string' ? pr.author : undefined,
          url: typeof pr.url === 'string' ? pr.url : undefined,
        })),
        repo:
          queries[0]?.owner && queries[0]?.repo
            ? `${queries[0].owner}/${queries[0].repo}`
            : undefined,
        // Map MCP pagination fields (currentPage/totalPages) to skill format (page/total)
        pagination: data.pagination ? {
          page: (data.pagination as StructuredData).currentPage as number || 1,
          total: (data.pagination as StructuredData).totalPages as number || 1,
          hasMore: (data.pagination as StructuredData).hasMore === true,
        } : undefined,
        mcpHints: hints,
        research,
      });

      res.status(isError ? 500 : 200).json(response);
    } catch (error) {
      next(error);
    }
  }
);

// Helper: Detect language from file path
function detectLanguageFromPath(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase() || '';
  const langMap: Record<string, string> = {
    ts: 'typescript',
    tsx: 'typescript',
    js: 'javascript',
    jsx: 'javascript',
    py: 'python',
    go: 'go',
    rs: 'rust',
    java: 'java',
    md: 'markdown',
    json: 'json',
    yaml: 'yaml',
    yml: 'yaml',
  };
  return langMap[ext] || '';
}
