/**
 * Pattern Matching Fallback for Find References
 *
 * Contains pattern matching and workspace search fallback when LSP is not available.
 * Uses lazy enhancement: search → filter → paginate → enhance only visible page.
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
import { matchesFilePatterns } from './lspReferencesCore.js';

const TOOL_NAME = STATIC_TOOL_NAMES.LSP_FIND_REFERENCES;

// Lazy-load exec to avoid module-level dependency on child_process
// which can cause issues with test mocks
const getExecAsync = async () => {
  const { exec } = await import('child_process');
  const { promisify } = await import('util');
  return promisify(exec);
};

/**
 * Raw reference before content enhancement (no file I/O).
 */
interface RawPatternReference {
  uri: string;
  absolutePath: string;
  range: LSPRange;
  lineContent: string;
  isDefinition: boolean;
  lineNumber: number;
}

/**
 * Enhance a raw reference with context lines from file content.
 * Only called for paginated (visible) items to minimize file I/O.
 */
async function enhancePatternReference(
  raw: RawPatternReference,
  contextLines: number
): Promise<ReferenceLocation> {
  let content = raw.lineContent;
  let displayStartLine = raw.lineNumber;
  let displayEndLine = raw.lineNumber;

  if (contextLines > 0) {
    try {
      const fileContent = await readFile(raw.absolutePath, 'utf-8');
      const fileLines = fileContent.split('\n');
      const startLine = Math.max(0, raw.lineNumber - 1 - contextLines);
      const endLine = Math.min(fileLines.length, raw.lineNumber + contextLines);
      content = fileLines.slice(startLine, endLine).join('\n');
      displayStartLine = startLine + 1;
      displayEndLine = endLine;
    } catch {
      // Keep single line content
    }
  }

  return {
    uri: raw.uri,
    range: raw.range,
    content,
    isDefinition: raw.isDefinition,
    displayRange: {
      startLine: displayStartLine,
      endLine: displayEndLine,
    },
  };
}

/**
 * Fallback: Find references using pattern matching (ripgrep/grep).
 * Applies file pattern filtering and lazy enhancement.
 */
export async function findReferencesWithPatternMatching(
  absolutePath: string,
  workspaceRoot: string,
  query: LSPFindReferencesQuery
): Promise<FindReferencesResult> {
  const allRawReferences = await searchReferencesInWorkspace(
    workspaceRoot,
    query.symbolName,
    absolutePath,
    query.includePattern,
    query.excludePattern
  );

  const totalUnfiltered = allRawReferences.length;

  // Filter based on includeDeclaration
  let filteredReferences = allRawReferences;
  if (!query.includeDeclaration) {
    filteredReferences = allRawReferences.filter(ref => !ref.isDefinition);
  }

  // Apply file pattern filtering (post-search for any results ripgrep globs missed)
  const hasFilters =
    query.includePattern?.length || query.excludePattern?.length;
  if (hasFilters) {
    filteredReferences = filteredReferences.filter(ref =>
      matchesFilePatterns(ref.uri, query.includePattern, query.excludePattern)
    );
  }

  // Paginate
  const referencesPerPage = query.referencesPerPage ?? 20;
  const page = query.page ?? 1;
  const totalReferences = filteredReferences.length;
  const totalPages = Math.ceil(totalReferences / referencesPerPage);
  const startIndex = (page - 1) * referencesPerPage;
  const endIndex = Math.min(startIndex + referencesPerPage, totalReferences);
  const paginatedRaw = filteredReferences.slice(startIndex, endIndex);

  if (paginatedRaw.length === 0) {
    const emptyHints = [
      ...getHints(TOOL_NAME, 'empty'),
      `No references found for '${query.symbolName}'`,
      'Note: Using text-based search (language server not available)',
      'Install typescript-language-server for semantic reference finding',
    ];

    if (hasFilters && totalUnfiltered > 0) {
      emptyHints.push(
        `Found ${totalUnfiltered} reference(s) but none matched the file patterns`
      );
    }

    return {
      status: 'empty',
      totalReferences: 0,
      researchGoal: query.researchGoal,
      reasoning: query.reasoning,
      hints: emptyHints,
    };
  }

  // Lazy enhancement: only enhance the current page with context
  const contextLines = query.contextLines ?? 2;
  const paginatedReferences: ReferenceLocation[] = [];
  for (const raw of paginatedRaw) {
    paginatedReferences.push(await enhancePatternReference(raw, contextLines));
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

  if (hasFilters && totalUnfiltered !== totalReferences) {
    hints.push(
      `Filtered: ${totalReferences} of ${totalUnfiltered} total references match patterns.`
    );
  }

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
 * Build ripgrep glob arguments from include/exclude patterns.
 * @internal Exported for testing
 */
export function buildRipgrepGlobArgs(
  includePattern?: string[],
  excludePattern?: string[]
): string[] {
  const args: string[] = [];
  if (includePattern?.length) {
    for (const pattern of includePattern) {
      args.push('--glob', pattern);
    }
  }
  if (excludePattern?.length) {
    for (const pattern of excludePattern) {
      args.push('--glob', `!${pattern}`);
    }
  }
  return args;
}

/**
 * Build grep include/exclude arguments from patterns.
 * @internal Exported for testing
 */
export function buildGrepFilterArgs(
  includePattern?: string[],
  excludePattern?: string[]
): string {
  const parts: string[] = [];
  if (includePattern?.length) {
    for (const pattern of includePattern) {
      // Convert glob patterns to grep --include
      // e.g. "**/*.test.ts" -> "*.test.ts"
      const filename = pattern.replace(/^\*\*\//, '');
      parts.push(`--include="${filename}"`);
    }
  }
  if (excludePattern?.length) {
    for (const pattern of excludePattern) {
      // Convert glob patterns to grep --exclude / --exclude-dir
      const cleaned = pattern.replace(/^\*\*\//, '').replace(/\/\*\*$/, '');
      if (pattern.includes('/')) {
        parts.push(`--exclude-dir="${cleaned}"`);
      } else {
        parts.push(`--exclude="${cleaned}"`);
      }
    }
  }
  return parts.join(' ');
}

/**
 * Search for references in the workspace using ripgrep.
 * Returns raw references without content enhancement.
 */
async function searchReferencesInWorkspace(
  workspaceRoot: string,
  symbolName: string,
  sourceFilePath: string,
  includePattern?: string[],
  excludePattern?: string[]
): Promise<RawPatternReference[]> {
  const references: RawPatternReference[] = [];
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
    ...buildRipgrepGlobArgs(includePattern, excludePattern),
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

            const relativeUri = path.relative(workspaceRoot, filePath);

            references.push({
              uri: relativeUri,
              absolutePath: filePath,
              range,
              lineContent,
              isDefinition,
              lineNumber,
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
        includePattern,
        excludePattern
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
 * Fallback search using grep.
 * Returns raw references without content enhancement.
 */
async function searchReferencesWithGrep(
  workspaceRoot: string,
  symbolName: string,
  sourceFilePath: string,
  includePattern?: string[],
  excludePattern?: string[]
): Promise<RawPatternReference[]> {
  const references: RawPatternReference[] = [];
  const escapedSymbol = symbolName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  // Use custom patterns if provided, otherwise default extensions
  let filterArgs: string;
  if (includePattern?.length || excludePattern?.length) {
    filterArgs = buildGrepFilterArgs(includePattern, excludePattern);
    // If only exclude patterns but no include, keep default extensions
    if (!includePattern?.length) {
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
      const defaultIncludes = extensions
        .map(ext => `--include="*.${ext}"`)
        .join(' ');
      filterArgs = `${defaultIncludes} ${filterArgs}`;
    }
  } else {
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
    filterArgs = extensions.map(ext => `--include="*.${ext}"`).join(' ');
  }

  try {
    const execAsync = await getExecAsync();
    const { stdout } = await execAsync(
      `grep -rn -w ${filterArgs} '${escapedSymbol}' '${workspaceRoot}' 2>/dev/null || true`,
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

        const relativeUri = path.relative(workspaceRoot, filePath);

        references.push({
          uri: relativeUri,
          absolutePath: filePath,
          range,
          lineContent,
          isDefinition,
          lineNumber,
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
