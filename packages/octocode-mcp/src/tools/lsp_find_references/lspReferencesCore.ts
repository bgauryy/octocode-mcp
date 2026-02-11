/**
 * Core LSP Find References Implementation
 *
 * Contains the Language Server Protocol implementation for finding references.
 * Uses lazy enhancement: filter → paginate → enhance only visible page.
 *
 * @module tools/lsp_find_references/lspReferencesCore
 */

import { readFile } from 'fs/promises';
import * as path from 'path';
import picomatch from 'picomatch';

import type {
  FindReferencesResult,
  ReferenceLocation,
  LSPRange,
  LSPPaginationInfo,
  ExactPosition,
} from '../../lsp/types.js';
import type { LSPFindReferencesQuery } from './scheme.js';
import type { SymbolKind } from '../../lsp/types.js';
import { createClient } from '../../lsp/index.js';
import { getHints } from '../../hints/index.js';
import { STATIC_TOOL_NAMES } from '../toolNames.js';

/**
 * Infer symbol kind from the definition line content.
 * Used to provide accurate symbolKind instead of hardcoding 'function'.
 * @internal Exported for testing
 */
export function inferSymbolKindFromContent(lineContent: string): SymbolKind {
  const trimmed = lineContent.trim();
  if (/\bclass\b/.test(trimmed)) return 'class';
  if (/\binterface\b/.test(trimmed)) return 'interface';
  if (/\b(type)\s+\w/.test(trimmed)) return 'type';
  if (/\benum\b/.test(trimmed)) return 'enum';
  if (/\bnamespace\b/.test(trimmed)) return 'namespace';
  if (/\bmodule\b/.test(trimmed)) return 'module';
  if (/\bconst\b/.test(trimmed) && !/=>|function/.test(trimmed))
    return 'constant';
  if (/\b(?:let|var)\b/.test(trimmed) && !/=>|function/.test(trimmed))
    return 'variable';
  if (
    /\bproperty\b/.test(trimmed) ||
    /^\s*(public|private|protected|readonly)\s+\w+\s*[:;]/.test(trimmed)
  )
    return 'property';
  return 'function';
}

const TOOL_NAME = STATIC_TOOL_NAMES.LSP_FIND_REFERENCES;

/**
 * Check if a relative file path matches include/exclude glob patterns.
 * - If excludePattern is set and path matches any, return false.
 * - If includePattern is set, path must match at least one.
 * - If neither is set, return true (no filtering).
 *
 * @internal Exported for testing
 */
export function matchesFilePatterns(
  relativePath: string,
  includePattern?: string[],
  excludePattern?: string[]
): boolean {
  if (excludePattern?.length) {
    const isExcluded = picomatch(excludePattern);
    if (isExcluded(relativePath)) return false;
  }
  if (includePattern?.length) {
    const isIncluded = picomatch(includePattern);
    return isIncluded(relativePath);
  }
  return true;
}

/**
 * Use LSP client to find references.
 * Applies file pattern filtering and lazy enhancement (paginate-then-enhance).
 */
export async function findReferencesWithLSP(
  filePath: string,
  workspaceRoot: string,
  position: ExactPosition,
  query: LSPFindReferencesQuery
): Promise<FindReferencesResult | null> {
  const client = await createClient(workspaceRoot, filePath);
  if (!client) return null;

  try {
    // Warm-up: prepareCallHierarchy forces tsserver to load the project graph.
    // Without this, a freshly-spawned language server may only return references
    // from the single opened file because it hasn't finished indexing.
    // This adds ~200ms but dramatically improves cross-file reference coverage.
    try {
      await client.prepareCallHierarchy(filePath, position);
    } catch {
      // Warm-up failure is non-fatal — proceed with references anyway
    }

    const includeDeclaration = query.includeDeclaration ?? true;
    const locations = await client.findReferences(
      filePath,
      position,
      includeDeclaration
    );

    if (!locations || locations.length === 0) {
      return {
        status: 'empty',
        totalReferences: 0,
        researchGoal: query.researchGoal,
        reasoning: query.reasoning,
        hints: [
          ...getHints(TOOL_NAME, 'empty'),
          'Language server found no references',
          'Symbol may be unused or only referenced dynamically',
          'Try localSearchCode for text-based search as fallback',
        ],
      };
    }

    // Step 1: Convert to raw reference locations (no file I/O yet)
    let rawLocations: RawReferenceLocation[] = locations.map(loc => {
      const relativeUri = path.relative(workspaceRoot, loc.uri);
      const isDefinition =
        loc.uri === filePath &&
        loc.range.start.line === position.line &&
        loc.range.start.character === position.character;

      return {
        uri: relativeUri || loc.uri,
        absoluteUri: loc.uri,
        range: loc.range,
        content: loc.content,
        isDefinition,
      };
    });

    // Post-filter: Remove definitions when includeDeclaration is false
    // Some LSP servers (e.g., TypeScript) don't always honor the flag
    if (!includeDeclaration) {
      rawLocations = rawLocations.filter(loc => !loc.isDefinition);
    }

    const totalUnfiltered = rawLocations.length;

    // Step 2: Apply file pattern filtering
    const hasFilters =
      query.includePattern?.length || query.excludePattern?.length;
    const filteredLocations = hasFilters
      ? rawLocations.filter(loc =>
          matchesFilePatterns(
            loc.uri,
            query.includePattern,
            query.excludePattern
          )
        )
      : rawLocations;

    if (filteredLocations.length === 0) {
      return {
        status: 'empty',
        totalReferences: 0,
        researchGoal: query.researchGoal,
        reasoning: query.reasoning,
        hints: [
          ...getHints(TOOL_NAME, 'empty'),
          `Found ${totalUnfiltered} reference(s) but none matched the file patterns`,
          query.includePattern?.length
            ? `Include patterns: ${query.includePattern.join(', ')}`
            : '',
          query.excludePattern?.length
            ? `Exclude patterns: ${query.excludePattern.join(', ')}`
            : '',
          'Try broader patterns or remove filtering to see all results',
        ].filter(Boolean),
      };
    }

    // Step 3: Paginate the filtered results
    const referencesPerPage = query.referencesPerPage ?? 20;
    const page = query.page ?? 1;
    const totalReferences = filteredLocations.length;
    const totalPages = Math.ceil(totalReferences / referencesPerPage);
    const startIndex = (page - 1) * referencesPerPage;
    const endIndex = Math.min(startIndex + referencesPerPage, totalReferences);
    const paginatedRaw = filteredLocations.slice(startIndex, endIndex);

    // Step 4: Lazy enhancement -- only enhance the current page with content
    const contextLines = query.contextLines ?? 2;
    const paginatedReferences: ReferenceLocation[] = [];

    for (const raw of paginatedRaw) {
      const enhanced = await enhanceReferenceLocation(raw, contextLines);
      paginatedReferences.push(enhanced);
    }

    // Determine if references span multiple files
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
      `Found ${totalReferences} reference(s) via Language Server`,
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

    if (hasMultipleFiles) {
      hints.push(`References span ${uniqueFiles.size} files.`);
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
  } finally {
    await client.stop();
  }
}

/**
 * Raw reference location before content enhancement.
 * Keeps the absolute URI for file reading while using relative for output.
 */
interface RawReferenceLocation {
  uri: string;
  absoluteUri: string;
  range: LSPRange;
  content: string;
  isDefinition: boolean;
}

/**
 * Enhance a raw reference location with context snippets.
 * Only called for paginated (visible) items to minimize file I/O.
 */
async function enhanceReferenceLocation(
  raw: RawReferenceLocation,
  contextLines: number
): Promise<ReferenceLocation> {
  let content = raw.content;
  let displayStartLine = raw.range.start.line + 1;
  let displayEndLine = raw.range.end.line + 1;

  // Get context if needed
  if (contextLines > 0) {
    try {
      const fileContent = await readFile(raw.absoluteUri, 'utf-8');
      const lines = fileContent.split(/\r?\n/);
      const startLine = Math.max(0, raw.range.start.line - contextLines);
      const endLine = Math.min(
        lines.length - 1,
        raw.range.end.line + contextLines
      );

      const snippetLines = lines.slice(startLine, endLine + 1);
      content = snippetLines
        .map((line, i) => {
          const lineNum = startLine + i + 1;
          const isTarget = lineNum === raw.range.start.line + 1;
          const marker = isTarget ? '>' : ' ';
          return `${marker}${String(lineNum).padStart(4, ' ')}| ${line}`;
        })
        .join('\n');

      displayStartLine = startLine + 1;
      displayEndLine = endLine + 1;
    } catch {
      // Keep original content
    }
  }

  return {
    uri: raw.uri,
    range: raw.range,
    content,
    isDefinition: raw.isDefinition,
    symbolKind: raw.isDefinition
      ? inferSymbolKindFromContent(content)
      : undefined,
    displayRange: {
      startLine: displayStartLine,
      endLine: displayEndLine,
    },
  };
}
