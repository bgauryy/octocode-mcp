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
import { parseToolResponse } from '../utils/responseParser.js';
import { withLocalResilience } from '../utils/resilience.js';

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
      const rawResult = await withLocalResilience(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        () => localSearchCode({ queries } as any),
        'localSearchCode'
      );
      const { data, isError, hints, research } = parseToolResponse(rawResult);

      const files = Array.isArray(data.files) ? data.files : [];
      const pagination = (data.pagination || {}) as StructuredData;

      // Transform to role-based response
      // MCP returns matches[] array per file with line numbers
      const response = ResearchResponse.searchResults({
        files: files.map((f: StructuredData) => {
          const matchesArray = Array.isArray(f.matches) ? f.matches : [];
          const firstMatch = matchesArray[0] as StructuredData | undefined;
          return {
            path: String(f.path || ''),
            matches: typeof f.matchCount === 'number' ? f.matchCount : matchesArray.length,
            line: firstMatch && typeof firstMatch.line === 'number' ? firstMatch.line : undefined,
            preview: firstMatch && typeof firstMatch.value === 'string' ? firstMatch.value.trim() : undefined,
            // Preserve all match locations for detailed analysis
            allMatches: matchesArray.map((m: StructuredData) => ({
              line: typeof m.line === 'number' ? m.line : 0,
              column: typeof m.column === 'number' ? m.column : undefined,
              value: typeof m.value === 'string' ? m.value.trim() : undefined,
              byteOffset: typeof m.byteOffset === 'number' ? m.byteOffset : undefined,
              charOffset: typeof m.charOffset === 'number' ? m.charOffset : undefined,
            })),
          };
        }),
        totalMatches: typeof data.totalMatches === 'number' ? data.totalMatches : 0,
        pagination:
          typeof pagination.currentPage === 'number'
            ? {
                page: pagination.currentPage as number,
                total: typeof pagination.totalPages === 'number' ? pagination.totalPages : 1,
                hasMore: pagination.hasMore === true,
              }
            : undefined,
        searchPattern: queries[0]?.pattern,
        mcpHints: hints, // Pass through MCP workflow hints
        research, // Pass through research context
      });

      res.status(isError ? 500 : 200).json(response);
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
      const rawResult = await withLocalResilience(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        () => localGetFileContent({ queries } as any),
        'localGetFileContent'
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

// GET /local/find - Find files by metadata
localRoutes.get(
  '/find',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const queries = parseAndValidate(req.query as Record<string, unknown>, localFindSchema as any);
      const rawResult = await withLocalResilience(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        () => localFindFiles({ queries } as any),
        'localFindFiles'
      );
      const { data, isError, hints: mcpHints } = parseToolResponse(rawResult);

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

      // Build hints - start with MCP hints, add contextual info
      const hints: string[] = [...mcpHints];
      const response =
        files.length === 0
          ? QuickResult.empty(summary, hints.length > 0 ? hints : [
              'Try different name pattern',
              'Check path filter',
              'Use -iname for case-insensitive search',
            ])
          : QuickResult.success(summary, data, hints.length > 0 ? hints : [
              'Use localGetFileContent to read file contents',
              'Use localSearchCode to search within files',
            ]);

      res.status(isError ? 500 : 200).json(response);
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
      const rawResult = await withLocalResilience(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        () => localViewStructure({ queries } as any),
        'localViewStructure'
      );
      const { data, isError, hints, research } = parseToolResponse(rawResult);

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

// Helper: Format file size
function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}
