/**
 * Core LSP Find References Implementation
 *
 * Contains the Language Server Protocol implementation for finding references.
 *
 * @module tools/lsp_find_references/lspReferencesCore
 */

import { readFile } from 'fs/promises';
import * as path from 'path';

import type {
  FindReferencesResult,
  ReferenceLocation,
  LSPRange,
  LSPPaginationInfo,
  ExactPosition,
} from '../../lsp/types.js';
import type { LSPFindReferencesQuery } from './scheme.js';
import { createClient } from '../../lsp/index.js';
import { getHints } from '../../hints/index.js';
import { STATIC_TOOL_NAMES } from '../toolNames.js';

const TOOL_NAME = STATIC_TOOL_NAMES.LSP_FIND_REFERENCES;

/**
 * Use LSP client to find references
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

    // Enhance with context and convert to ReferenceLocation
    const contextLines = query.contextLines ?? 2;
    const referenceLocations: ReferenceLocation[] = [];

    for (const loc of locations) {
      const refLoc = await enhanceReferenceLocation(
        loc,
        workspaceRoot,
        contextLines,
        filePath,
        position,
        query.symbolName
      );
      referenceLocations.push(refLoc);
    }

    // Apply pagination
    const referencesPerPage = query.referencesPerPage ?? 20;
    const page = query.page ?? 1;
    const totalReferences = referenceLocations.length;
    const totalPages = Math.ceil(totalReferences / referencesPerPage);
    const startIndex = (page - 1) * referencesPerPage;
    const endIndex = Math.min(startIndex + referencesPerPage, totalReferences);
    const paginatedReferences = referenceLocations.slice(startIndex, endIndex);

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
 * Enhance a code snippet with context and determine if it's a definition
 */
async function enhanceReferenceLocation(
  loc: { uri: string; range: LSPRange; content: string },
  workspaceRoot: string,
  contextLines: number,
  sourceFilePath: string,
  sourcePosition: ExactPosition,
  _symbolName: string
): Promise<ReferenceLocation> {
  let content = loc.content;
  let displayStartLine = loc.range.start.line + 1;
  let displayEndLine = loc.range.end.line + 1;

  // Determine if this is the definition (same file and position)
  const isDefinition =
    loc.uri === sourceFilePath &&
    loc.range.start.line === sourcePosition.line &&
    loc.range.start.character === sourcePosition.character;

  // Get context if needed
  if (contextLines > 0) {
    try {
      const fileContent = await readFile(loc.uri, 'utf-8');
      const lines = fileContent.split(/\r?\n/);
      const startLine = Math.max(0, loc.range.start.line - contextLines);
      const endLine = Math.min(
        lines.length - 1,
        loc.range.end.line + contextLines
      );

      const snippetLines = lines.slice(startLine, endLine + 1);
      content = snippetLines
        .map((line, i) => {
          const lineNum = startLine + i + 1;
          const isTarget = lineNum === loc.range.start.line + 1;
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

  // Make path relative to workspace
  const relativeUri = path.relative(workspaceRoot, loc.uri);

  return {
    uri: relativeUri || loc.uri,
    range: loc.range,
    content,
    isDefinition,
    symbolKind: isDefinition ? 'function' : undefined,
    displayRange: {
      startLine: displayStartLine,
      endLine: displayEndLine,
    },
  };
}
