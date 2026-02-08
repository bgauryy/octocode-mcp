/**
 * Pattern Matching Fallback for Find References
 *
 * Contains pattern matching and workspace search fallback when LSP is not available.
 *
 * @module tools/lsp_find_references/lspReferencesPatterns
 */

import { readFile } from 'fs/promises';
import * as path from 'path';

import type {
  FindReferencesResult,
  ReferenceLocation,
  LSPRange,
  LSPPaginationInfo,
} from '../../lsp/types.js';
import type { LSPFindReferencesQuery } from './scheme.js';
import { getHints } from '../../hints/index.js';
import { STATIC_TOOL_NAMES } from '../toolNames.js';
import { RipgrepMatchOnlySchema } from '../../utils/parsers/schemas.js';

const TOOL_NAME = STATIC_TOOL_NAMES.LSP_FIND_REFERENCES;

// Lazy-load exec to avoid module-level dependency on child_process
// which can cause issues with test mocks
const getExecAsync = async () => {
  const { exec } = await import('child_process');
  const { promisify } = await import('util');
  return promisify(exec);
};

/**
 * Fallback: Find references using pattern matching (ripgrep/grep)
 */
export async function findReferencesWithPatternMatching(
  absolutePath: string,
  workspaceRoot: string,
  query: LSPFindReferencesQuery
): Promise<FindReferencesResult> {
  const allReferences = await searchReferencesInWorkspace(
    workspaceRoot,
    query.symbolName,
    absolutePath,
    query.contextLines ?? 2
  );

  // Filter based on includeDeclaration
  let filteredReferences = allReferences;
  if (!query.includeDeclaration) {
    filteredReferences = allReferences.filter(ref => !ref.isDefinition);
  }

  // Apply pagination
  const referencesPerPage = query.referencesPerPage ?? 20;
  const page = query.page ?? 1;
  const totalReferences = filteredReferences.length;
  const totalPages = Math.ceil(totalReferences / referencesPerPage);
  const startIndex = (page - 1) * referencesPerPage;
  const endIndex = Math.min(startIndex + referencesPerPage, totalReferences);
  const paginatedReferences = filteredReferences.slice(startIndex, endIndex);

  if (paginatedReferences.length === 0) {
    return {
      status: 'empty',
      totalReferences: 0,
      researchGoal: query.researchGoal,
      reasoning: query.reasoning,
      hints: [
        ...getHints(TOOL_NAME, 'empty'),
        `No references found for '${query.symbolName}'`,
        'Note: Using text-based search (language server not available)',
        'Install typescript-language-server for semantic reference finding',
      ],
    };
  }

  const uniqueFiles = new Set(paginatedReferences.map(ref => ref.uri));
  const hasMultipleFiles = uniqueFiles.size > 1;

  const pagination: LSPPaginationInfo = {
    currentPage: page,
    totalPages,
    totalResults: totalReferences,
    hasMore: page < totalPages,
    resultsPerPage: referencesPerPage,
  };

  const hints = [
    ...getHints(TOOL_NAME, 'hasResults'),
    `Found ${totalReferences} reference(s) using text search`,
    'Note: Using text-based search (language server not available)',
    'Install typescript-language-server for semantic reference finding',
  ];

  if (pagination.hasMore) {
    hints.push(
      `Showing page ${page} of ${totalPages}. Use page=${page + 1} for more.`
    );
  }

  return {
    status: 'hasResults',
    locations: paginatedReferences,
    pagination,
    totalReferences,
    hasMultipleFiles,
    researchGoal: query.researchGoal,
    reasoning: query.reasoning,
    hints,
  };
}

/**
 * Find the workspace root by looking for common markers
 * @internal Exported for testing
 */
export function findWorkspaceRoot(filePath: string): string {
  let currentDir = path.dirname(filePath);
  const markers = [
    'package.json',
    'tsconfig.json',
    '.git',
    'Cargo.toml',
    'go.mod',
    'pyproject.toml',
  ];

  for (let i = 0; i < 10; i++) {
    for (const marker of markers) {
      try {
        const markerPath = path.join(currentDir, marker);
        require('fs').accessSync(markerPath);
        return currentDir;
      } catch {
        // Continue
      }
    }

    const parentDir = path.dirname(currentDir);
    if (parentDir === currentDir) break;
    currentDir = parentDir;
  }

  return path.dirname(filePath);
}

/**
 * Search for references in the workspace using ripgrep
 */
async function searchReferencesInWorkspace(
  workspaceRoot: string,
  symbolName: string,
  sourceFilePath: string,
  contextLines: number
): Promise<ReferenceLocation[]> {
  const references: ReferenceLocation[] = [];
  const escapedSymbol = symbolName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  const rgArgs = [
    '--json',
    '--line-number',
    '--column',
    '-w',
    '--type-add',
    'code:*.{ts,tsx,js,jsx,mjs,cjs,py,go,rs,java,c,cpp,h,hpp,cs,rb,php}',
    '-t',
    'code',
    escapedSymbol,
    workspaceRoot,
  ];

  try {
    const execAsync = await getExecAsync();
    const { stdout } = await execAsync(
      `rg ${rgArgs.map(a => `'${a}'`).join(' ')}`,
      {
        maxBuffer: 10 * 1024 * 1024,
        timeout: 30000,
      }
    );

    const lines = stdout.trim().split('\n').filter(Boolean);

    for (const line of lines) {
      try {
        const raw = JSON.parse(line);
        const validation = RipgrepMatchOnlySchema.safeParse(raw);
        if (!validation.success) continue;
        const parsed = validation.data;
        if (parsed.type === 'match') {
          const match = parsed.data;
          const filePath = match.path.text;
          const lineNumber = match.line_number;
          const lineContent = match.lines.text.replace(/\n$/, '');

          const regex = new RegExp(`\\b${escapedSymbol}\\b`, 'g');
          let matchResult;
          while ((matchResult = regex.exec(lineContent)) !== null) {
            const column = matchResult.index;
            const isDefinition =
              filePath === sourceFilePath &&
              isLikelyDefinition(lineContent, symbolName);

            const range: LSPRange = {
              start: { line: lineNumber - 1, character: column },
              end: {
                line: lineNumber - 1,
                character: column + symbolName.length,
              },
            };

            let content = lineContent;
            let displayStartLine = lineNumber;
            let displayEndLine = lineNumber;

            if (contextLines > 0) {
              try {
                const fileContent = await readFile(filePath, 'utf-8');
                const fileLines = fileContent.split('\n');
                const startLine = Math.max(0, lineNumber - 1 - contextLines);
                const endLine = Math.min(
                  fileLines.length,
                  lineNumber + contextLines
                );
                content = fileLines.slice(startLine, endLine).join('\n');
                displayStartLine = startLine + 1;
                displayEndLine = endLine;
              } catch {
                // Keep single line
              }
            }

            const relativeUri = path.relative(workspaceRoot, filePath);

            references.push({
              uri: relativeUri,
              range,
              content,
              isDefinition,
              displayRange: {
                startLine: displayStartLine,
                endLine: displayEndLine,
              },
            });
          }
        }
      } catch {
        // Skip malformed JSON
      }
    }
  } catch (error) {
    const execError = error as { code?: number };
    if (execError.code !== 1) {
      return await searchReferencesWithGrep(
        workspaceRoot,
        symbolName,
        sourceFilePath,
        contextLines
      );
    }
  }

  references.sort((a, b) => {
    if (a.isDefinition && !b.isDefinition) return -1;
    if (!a.isDefinition && b.isDefinition) return 1;
    if (a.uri !== b.uri) return a.uri.localeCompare(b.uri);
    return a.range.start.line - b.range.start.line;
  });

  return references;
}

/**
 * Fallback search using grep
 */
async function searchReferencesWithGrep(
  workspaceRoot: string,
  symbolName: string,
  sourceFilePath: string,
  contextLines: number
): Promise<ReferenceLocation[]> {
  const references: ReferenceLocation[] = [];
  const escapedSymbol = symbolName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  const extensions = [
    'ts',
    'tsx',
    'js',
    'jsx',
    'py',
    'go',
    'rs',
    'java',
    'c',
    'cpp',
    'h',
  ];
  const includePattern = extensions
    .map(ext => `--include="*.${ext}"`)
    .join(' ');

  try {
    const execAsync = await getExecAsync();
    const { stdout } = await execAsync(
      `grep -rn -w ${includePattern} '${escapedSymbol}' '${workspaceRoot}' 2>/dev/null || true`,
      { maxBuffer: 10 * 1024 * 1024, timeout: 30000 }
    );

    const lines = stdout.trim().split('\n').filter(Boolean);

    for (const line of lines) {
      const colonIndex = line.indexOf(':');
      if (colonIndex === -1) continue;

      const filePath = line.substring(0, colonIndex);
      const rest = line.substring(colonIndex + 1);
      const secondColon = rest.indexOf(':');
      if (secondColon === -1) continue;

      const lineNumber = parseInt(rest.substring(0, secondColon), 10);
      const lineContent = rest.substring(secondColon + 1);

      if (isNaN(lineNumber)) continue;

      const regex = new RegExp(`\\b${escapedSymbol}\\b`, 'g');
      let matchResult;
      while ((matchResult = regex.exec(lineContent)) !== null) {
        const column = matchResult.index;
        const isDefinition =
          filePath === sourceFilePath &&
          isLikelyDefinition(lineContent, symbolName);

        const range: LSPRange = {
          start: { line: lineNumber - 1, character: column },
          end: { line: lineNumber - 1, character: column + symbolName.length },
        };

        let content = lineContent;
        let displayStartLine = lineNumber;
        let displayEndLine = lineNumber;

        if (contextLines > 0) {
          try {
            const fileContent = await readFile(filePath, 'utf-8');
            const fileLines = fileContent.split('\n');
            const startLine = Math.max(0, lineNumber - 1 - contextLines);
            const endLine = Math.min(
              fileLines.length,
              lineNumber + contextLines
            );
            content = fileLines.slice(startLine, endLine).join('\n');
            displayStartLine = startLine + 1;
            displayEndLine = endLine;
          } catch {
            // Keep single line
          }
        }

        const relativeUri = path.relative(workspaceRoot, filePath);

        references.push({
          uri: relativeUri,
          range,
          content,
          isDefinition,
          displayRange: {
            startLine: displayStartLine,
            endLine: displayEndLine,
          },
        });
      }
    }
  } catch {
    // grep failed
  }

  references.sort((a, b) => {
    if (a.isDefinition && !b.isDefinition) return -1;
    if (!a.isDefinition && b.isDefinition) return 1;
    if (a.uri !== b.uri) return a.uri.localeCompare(b.uri);
    return a.range.start.line - b.range.start.line;
  });

  return references;
}

/**
 * Heuristic to determine if a line is likely a definition
 * @internal Exported for testing
 */
export function isLikelyDefinition(
  lineContent: string,
  symbolName: string
): boolean {
  const trimmed = lineContent.trim();

  const definitionPatterns = [
    new RegExp(
      `^(export\\s+)?(const|let|var|function|class|interface|type|enum)\\s+${symbolName}\\b`
    ),
    new RegExp(`^(export\\s+)?async\\s+function\\s+${symbolName}\\b`),
    new RegExp(`^(export\\s+)?default\\s+(function|class)\\s+${symbolName}\\b`),
    new RegExp(
      `^(public|private|protected|static|async|readonly)?\\s*${symbolName}\\s*[(:=]`
    ),
    new RegExp(`^(def|class|async\\s+def)\\s+${symbolName}\\b`),
    new RegExp(`^${symbolName}\\s*=`),
    new RegExp(`^func\\s+(\\([^)]+\\)\\s+)?${symbolName}\\b`),
    new RegExp(`^(var|const|type)\\s+${symbolName}\\b`),
    new RegExp(
      `^(pub\\s+)?(fn|struct|enum|trait|type|const|static)\\s+${symbolName}\\b`
    ),
  ];

  return definitionPatterns.some(pattern => pattern.test(trimmed));
}
