import { Router, type Request, type Response, type NextFunction } from 'express';
import {
  localSearchCode,
  localGetFileContent,
  localFindFiles,
  localViewStructure,
} from '../index.js';
import { parseAndValidate } from '../middleware/queryParser.js';
import {
  localSearchSchema,
  localContentSchema,
  localFindSchema,
  localStructureSchema,
} from '../validation/index.js';
import { ResearchResponse, QuickResult } from '../utils/responseBuilder.js';

export const localRoutes = Router();

// Type for structured content (flexible)
type StructuredData = Record<string, unknown>;

// GET /local/search - Search code with ripgrep
localRoutes.get(
  '/search',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const queries = parseAndValidate(
        req.query as Record<string, unknown>,
        localSearchSchema
      );
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rawResult = await localSearchCode({ queries } as any);
      const data = (rawResult.structuredContent || {}) as StructuredData;

      const files = Array.isArray(data.files) ? data.files : [];
      const pagination = (data.pagination || {}) as StructuredData;

      // Transform to role-based response
      const response = ResearchResponse.searchResults({
        files: files.map((f: StructuredData) => ({
          path: String(f.path || ''),
          matches: typeof f.matchCount === 'number' ? f.matchCount : undefined,
          line: typeof f.line === 'number' ? f.line : undefined,
        })),
        totalMatches: typeof data.totalMatches === 'number' ? data.totalMatches : 0,
        pagination:
          typeof pagination.currentPage === 'number'
            ? {
                page: pagination.currentPage,
                total: typeof pagination.totalPages === 'number' ? pagination.totalPages : 1,
                hasMore: pagination.hasMore === true,
              }
            : undefined,
        searchPattern: queries[0]?.pattern,
      });

      res.status(rawResult.isError ? 500 : 200).json(response);
    } catch (error) {
      next(error);
    }
  }
);

// GET /local/content - Read file contents
localRoutes.get(
  '/content',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const queries = parseAndValidate(
        req.query as Record<string, unknown>,
        localContentSchema
      );
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rawResult = await localGetFileContent({ queries } as any);
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

// GET /local/find - Find files by metadata
localRoutes.get(
  '/find',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const queries = parseAndValidate(
        req.query as Record<string, unknown>,
        localFindSchema
      );
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rawResult = await localFindFiles({ queries } as any);
      const data = (rawResult.structuredContent || {}) as StructuredData;

      const files = Array.isArray(data.files) ? data.files : [];
      const summary =
        files.length > 0
          ? `Found ${files.length} files:\n` +
            files
              .slice(0, 20)
              .map((f: StructuredData) =>
                `- ${f.path}${typeof f.size === 'number' ? ` (${formatSize(f.size)})` : ''}`
              )
              .join('\n')
          : 'No files found';

      const response =
        files.length === 0
          ? QuickResult.empty(summary, [
              'Try different name pattern',
              'Check path filter',
              'Use -iname for case-insensitive search',
            ])
          : QuickResult.success(summary, data, [
              'Use localGetFileContent to read file contents',
              'Use localSearchCode to search within files',
            ]);

      res.status(rawResult.isError ? 500 : 200).json(response);
    } catch (error) {
      next(error);
    }
  }
);

// GET /local/structure - View directory structure
localRoutes.get(
  '/structure',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const queries = parseAndValidate(
        req.query as Record<string, unknown>,
        localStructureSchema
      );
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rawResult = await localViewStructure({ queries } as any);
      const data = (rawResult.structuredContent || {}) as StructuredData;

      // Parse structured output
      const structuredOutput = String(data.structuredOutput || '');
      const files: string[] = [];
      const folders: string[] = [];

      // Extract files and folders from output
      const lines = structuredOutput.split('\n');
      for (const line of lines) {
        if (line.includes('[FILE]')) {
          const match = line.match(/\[FILE\]\s+(.+?)(?:\s+\(|$)/);
          if (match) files.push(match[1].trim());
        } else if (line.includes('[DIR]')) {
          const match = line.match(/\[DIR\]\s+(.+?)(?:\s*$)/);
          if (match) folders.push(match[1].trim());
        }
      }

      const response = ResearchResponse.repoStructure({
        path: queries[0]?.path || '.',
        structure: { files, folders },
        depth: typeof queries[0]?.depth === 'number' ? queries[0].depth : undefined,
        totalFiles: typeof data.totalFiles === 'number' ? data.totalFiles : undefined,
        totalFolders:
          typeof data.totalDirectories === 'number' ? data.totalDirectories : undefined,
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

// Helper: Format file size
function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}
