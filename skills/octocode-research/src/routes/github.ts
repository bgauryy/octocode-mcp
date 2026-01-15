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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rawResult = await githubSearchCode({ queries } as any);
      const data = (rawResult.structuredContent || {}) as StructuredData;

      // Transform to role-based response
      const files = Array.isArray(data.files) ? data.files : [];
      const response = ResearchResponse.searchResults({
        files: files.map((f: StructuredData) => ({
          path: String(f.path || ''),
          matches: typeof f.matchCount === 'number' ? f.matchCount : undefined,
          line: typeof f.line === 'number' ? f.line : undefined,
        })),
        totalMatches: typeof data.totalMatches === 'number' ? data.totalMatches : 0,
        pagination: data.pagination as { page: number; total: number; hasMore: boolean } | undefined,
        searchPattern: Array.isArray(queries[0]?.keywordsToSearch)
          ? queries[0].keywordsToSearch.join(' ')
          : undefined,
      });

      res.status(rawResult.isError ? 500 : 200).json(response);
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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rawResult = await githubGetFileContent({ queries } as any);
      const data = (rawResult.structuredContent || {}) as StructuredData;

      // Transform to role-based response
      const response = ResearchResponse.fileContent({
        path: String(data.path || queries[0]?.path || 'unknown'),
        content: String(data.content || ''),
        lines:
          typeof data.startLine === 'number'
            ? {
                start: data.startLine,
                end: typeof data.endLine === 'number' ? data.endLine : data.startLine,
              }
            : undefined,
        language: detectLanguageFromPath(queries[0]?.path || ''),
        totalLines: typeof data.totalLines === 'number' ? data.totalLines : undefined,
        isPartial: typeof data.isPartial === 'boolean' ? data.isPartial : undefined,
      });

      res.status(rawResult.isError ? 500 : 200).json(response);
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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rawResult = await githubSearchRepositories({ queries } as any);
      const data = (rawResult.structuredContent || {}) as StructuredData;

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

      const response =
        repos.length === 0
          ? QuickResult.empty(summary, [
              'Try different search terms',
              'Use topicsToSearch for topic-based search',
            ])
          : QuickResult.success(summary, data, [
              'Use githubViewRepoStructure to explore repo',
              'Use githubSearchCode to search within repo',
            ]);

      res.status(rawResult.isError ? 500 : 200).json(response);
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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rawResult = await githubViewRepoStructure({ queries } as any);
      const data = (rawResult.structuredContent || {}) as StructuredData;

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
      });

      res.status(rawResult.isError ? 500 : 200).json(response);
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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rawResult = await githubSearchPullRequests({ queries } as any);
      const data = (rawResult.structuredContent || {}) as StructuredData;

      const prs = Array.isArray(data.pull_requests) ? data.pull_requests : [];

      const response = ResearchResponse.pullRequests({
        prs: prs.map((pr: StructuredData) => ({
          number: typeof pr.number === 'number' ? pr.number : 0,
          title: String(pr.title || ''),
          state: String(pr.state || ''),
          author: typeof pr.author === 'string' ? pr.author : undefined,
          url: typeof pr.html_url === 'string' ? pr.html_url : undefined,
        })),
        repo:
          queries[0]?.owner && queries[0]?.repo
            ? `${queries[0].owner}/${queries[0].repo}`
            : undefined,
        pagination: data.pagination as { page: number; total: number; hasMore: boolean } | undefined,
      });

      res.status(rawResult.isError ? 500 : 200).json(response);
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
