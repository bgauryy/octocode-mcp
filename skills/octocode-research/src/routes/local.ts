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
import { ResearchResponse, QuickResult, detectLanguageFromPath } from '../utils/responseBuilder.js';
import { parseToolResponse } from '../utils/responseParser.js';
import { withLocalResilience } from '../utils/resilience.js';
import {
  toLocalSearchParams,
  toLocalContentParams,
  toLocalFindParams,
  toLocalStructureParams,
} from '../types/toolTypes.js';
import {
  safeString,
  safeNumber,
  safeArray,
  extractMatchLocations,
  transformPagination,
} from '../utils/responseFactory.js';
import { isObject, hasProperty, hasNumberProperty, hasBooleanProperty } from '../types/guards.js';

export const localRoutes = Router();

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
        () => localSearchCode(toLocalSearchParams(queries)),
        'localSearchCode'
      );
      const { data, isError, hints, research } = parseToolResponse(rawResult);

      const files = safeArray<Record<string, unknown>>(data, 'files');
      const pagination = isObject(data.pagination) ? data.pagination : {};

      // Transform to role-based response
      // MCP returns matches[] array per file with line numbers
      const response = ResearchResponse.searchResults({
        files: files.map((f) => {
          const matchesArray = safeArray<Record<string, unknown>>(f, 'matches');
          const firstMatch = matchesArray[0];
          return {
            path: safeString(f, 'path'),
            matches: hasNumberProperty(f, 'matchCount') ? f.matchCount : matchesArray.length,
            line: isObject(firstMatch) && hasNumberProperty(firstMatch, 'line') ? firstMatch.line : undefined,
            preview: isObject(firstMatch) && hasProperty(firstMatch, 'value') && typeof firstMatch.value === 'string' ? firstMatch.value.trim() : undefined,
            // Preserve all match locations for detailed analysis
            allMatches: extractMatchLocations(matchesArray),
          };
        }),
        totalMatches: safeNumber(data, 'totalMatches', 0),
        pagination: transformPagination(pagination),
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
        () => localGetFileContent(toLocalContentParams(queries)),
        'localGetFileContent'
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

// GET /local/find - Find files by metadata
localRoutes.get(
  '/find',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const queries = parseAndValidate(req.query as Record<string, unknown>, localFindSchema as any);
      const rawResult = await withLocalResilience(
        () => localFindFiles(toLocalFindParams(queries)),
        'localFindFiles'
      );
      const { data, isError, hints: mcpHints } = parseToolResponse(rawResult);

      const files = safeArray<Record<string, unknown>>(data, 'files');
      const summary =
        files.length > 0
          ? `Found ${files.length} files:\n` +
            files
              .slice(0, 20)
              .map((f) =>
                `- ${safeString(f, 'path')}${hasNumberProperty(f, 'size') ? ` (${formatSize(f.size)})` : ''}`
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
        () => localViewStructure(toLocalStructureParams(queries)),
        'localViewStructure'
      );
      const { data, isError, hints, research } = parseToolResponse(rawResult);

      // Parse structured output
      const structuredOutput = safeString(data, 'structuredOutput');
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
        depth: hasNumberProperty(queries[0], 'depth') ? queries[0].depth : undefined,
        totalFiles: hasNumberProperty(data, 'totalFiles') ? data.totalFiles : undefined,
        totalFolders: hasNumberProperty(data, 'totalDirectories') ? data.totalDirectories : undefined,
        mcpHints: hints,
        research,
      });

      res.status(isError ? 500 : 200).json(response);
    } catch (error) {
      next(error);
    }
  }
);

// Helper: Format file size
function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}
