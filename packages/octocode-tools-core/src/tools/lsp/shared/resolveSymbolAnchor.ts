import { open, stat } from 'node:fs/promises';
import {
  SymbolResolver,
  SymbolResolutionError,
} from '@octocodeai/octocode-engine/lsp/resolver';
import { toUri } from '@octocodeai/octocode-engine/lsp/uri';
import type {
  ExactPosition,
  LSPRange,
} from '@octocodeai/octocode-engine/lsp/types';
import { validateToolPath } from '../../../utils/file/toolHelpers.js';
import { LSP_ERROR_CODES } from '@octocodeai/octocode-engine/lsp/lspErrorCodes';
import type {
  DocumentSymbolsSemanticQuery,
  SymbolAnchoredSemanticQuery,
  ResolvedSymbol,
} from './semanticTypes.js';

export type FileAnchor = {
  uri: string;
  absolutePath: string;
  content: string;
};

export type SymbolAnchor = FileAnchor & {
  resolvedSymbol: ResolvedSymbol;
};

export type AnchorResolutionResult<T> =
  { ok: true; value: T } | { ok: false; error: Record<string, unknown> };

const MAX_SEMANTIC_SOURCE_BYTES = 1_000_000;
const SOURCE_LIMIT_MESSAGE =
  '[lspSourceTooLarge] Semantic source exceeds 1000000 bytes; choose a smaller source file.';

async function readBoundedSource(path: string): Promise<string> {
  const file = await open(path, 'r');
  try {
    const info = await file.stat();
    if (!info.isFile())
      throw new Error('Semantic source must be a regular file.');
    if (info.size > MAX_SEMANTIC_SOURCE_BYTES)
      throw new Error(SOURCE_LIMIT_MESSAGE);
    // Read at most one sentinel byte beyond the bound, including when a file
    // grows between stat and read.
    const buffer = Buffer.alloc(MAX_SEMANTIC_SOURCE_BYTES + 1);
    let offset = 0;
    while (offset < buffer.length) {
      const { bytesRead } = await file.read(
        buffer,
        offset,
        buffer.length - offset,
        null
      );
      if (bytesRead === 0) break;
      offset += bytesRead;
    }
    if (offset > MAX_SEMANTIC_SOURCE_BYTES)
      throw new Error(SOURCE_LIMIT_MESSAGE);
    return buffer.toString('utf8', 0, offset);
  } finally {
    await file.close();
  }
}

export async function resolveFileAnchor(
  query: { uri?: string },
  toolName: string
): Promise<AnchorResolutionResult<FileAnchor>> {
  const uri = query.uri;
  const pathValidation = validateToolPath({ ...query, path: uri }, toolName);
  if (!pathValidation.isValid) {
    return {
      ok: false,
      error: pathValidation.errorResult as Record<string, unknown>,
    };
  }

  const absolutePath = pathValidation.sanitizedPath;
  // Stat first so a missing path or a directory produces an actionable message
  // instead of a raw, confusing "EISDIR: illegal operation on a directory" or
  // "ENOENT" surfaced verbatim. LSP semantics operate on a single file.
  try {
    const stats = await stat(absolutePath);
    if (!stats.isFile()) {
      return {
        ok: false,
        error: {
          status: 'error',
          error: `Path is not a regular source file: ${absolutePath}.`,
          errorType: 'not_a_file',
          errorCode: LSP_ERROR_CODES.LSP_REQUEST_FAILED,
          hints: [
            'Choose a source file, or use workspaceSymbol with symbolName.',
          ],
        },
      };
    }
    if (stats.size > MAX_SEMANTIC_SOURCE_BYTES) {
      return {
        ok: false,
        error: {
          status: 'error',
          error: SOURCE_LIMIT_MESSAGE,
          errorType: 'source_limit',
          errorCode: LSP_ERROR_CODES.LSP_REQUEST_FAILED,
        },
      };
    }
  } catch {
    return {
      ok: false,
      error: {
        status: 'error',
        error: `File not found: ${absolutePath}.`,
        errorType: 'file_not_found',
        errorCode: LSP_ERROR_CODES.LSP_REQUEST_FAILED,
        hints: ['Use astSearch with operation:"files" to resolve the path.'],
      },
    };
  }

  try {
    return {
      ok: true,
      value: {
        uri: toUri(absolutePath),
        absolutePath,
        content: await readBoundedSource(absolutePath),
      },
    };
  } catch (error) {
    return {
      ok: false,
      error: {
        status: 'error',
        error: error instanceof Error ? error.message : String(error),
        errorType:
          error instanceof Error &&
          error.message.includes('[lspSourceTooLarge]')
            ? 'source_limit'
            : 'file_not_found',
        errorCode: LSP_ERROR_CODES.LSP_REQUEST_FAILED,
        hints: [`Could not read file: ${uri ?? '<missing>'}`],
      },
    };
  }
}

export async function resolveSymbolAnchor(
  query: SymbolAnchoredSemanticQuery | DocumentSymbolsSemanticQuery,
  toolName: string
): Promise<AnchorResolutionResult<SymbolAnchor>> {
  const file = await resolveFileAnchor(query, toolName);
  if (file.ok === false) return file;

  if (query.operation === 'documentSymbols') {
    return {
      ok: false,
      error: {
        status: 'error',
        error: 'documentSymbols is file-level and does not use a symbol anchor',
      },
    };
  }

  const resolver = new SymbolResolver();
  const exact =
    'position' in query && query.position
      ? symbolAtPosition(file.value.content, query.position)
      : undefined;
  if ('position' in query && query.position && !exact) {
    return {
      ok: false,
      error: {
        status: 'empty',
        error: 'The supplied position is not inside an identifier.',
        errorType: 'anchor_drift',
        reanchor: { uri: file.value.uri, position: query.position },
      },
    };
  }
  const symbolName = exact?.symbolName ?? query.symbolName;
  const lineHint = exact?.lineHint ?? query.lineHint;
  const orderHint = exact?.orderHint ?? query.orderHint;
  if (!symbolName || lineHint === undefined) {
    return {
      ok: false,
      error: {
        status: 'error',
        error:
          'A semantic anchor requires either position or symbolName with lineHint.',
        errorType: 'anchor_missing',
      },
    };
  }
  try {
    const resolved = resolver.resolvePositionFromContent(file.value.content, {
      symbolName,
      lineHint,
      orderHint: orderHint ?? 0,
    });

    const lineDeviation = Math.abs(resolved.foundAtLine - lineHint);
    const expectedCharacter = exact?.character;
    const resolvedCharacter = resolved.position.character;
    const sameLineOccurrences = countLineOccurrences(
      file.value.content,
      symbolName,
      lineHint
    );
    if (
      lineDeviation > 0 ||
      (expectedCharacter !== undefined &&
        resolvedCharacter !== expectedCharacter) ||
      (exact === undefined &&
        orderHint === undefined &&
        sameLineOccurrences > 1)
    ) {
      return {
        ok: false,
        error: {
          status: 'empty',
          error:
            'The semantic anchor drifted or is ambiguous; refresh the source anchor and retry.',
          errorType: 'anchor_drift',
          reanchor: {
            uri: file.value.uri,
            symbolName,
            lineHint: resolved.foundAtLine,
            orderHint: orderHint ?? 0,
            position: resolved.position,
          },
          ...(lineDeviation > 0 ? { lineDeviation } : {}),
        },
      };
    }

    const escapedName = symbolName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // Match the native resolver's Unicode identifier boundaries; JavaScript's
    // ASCII word boundary miscounts Unicode names and substrings inside them.
    const identifierContinue = '[\\p{ID_Continue}$\\u200C\\u200D]';
    const occurrenceRegex = new RegExp(
      `(?<!${identifierContinue})${escapedName}(?!${identifierContinue})`,
      'gu'
    );
    const totalOccurrences = (file.value.content.match(occurrenceRegex) ?? [])
      .length;
    // The resolver searches within a radius around the hint — with multiple
    // same-named occurrences, ANY nonzero deviation means a stale hint could
    // have bound a neighboring occurrence, not the intended one. Surface
    // both the flag and the raw deviation instead of resolving silently
    // under full confidence (the old threshold of >3 left deviations 1-3 —
    // well inside the radius-5 search — silently unflagged). No hint → no
    // deviation to reason about.
    const lineDeviationFromHint =
      lineHint !== undefined
        ? Math.abs(resolved.foundAtLine - lineHint)
        : undefined;
    const isAmbiguous =
      totalOccurrences > 1 &&
      lineDeviationFromHint !== undefined &&
      lineDeviationFromHint > 0
        ? true
        : undefined;

    return {
      ok: true,
      value: {
        ...file.value,
        resolvedSymbol: {
          name: symbolName,
          uri: file.value.uri,
          range: rangeFromPosition(resolved.position),
          foundAtLine: resolved.foundAtLine,
          orderHint,
          position: resolved.position,
          ...(isAmbiguous && { isAmbiguous }),
          ...(lineDeviationFromHint !== undefined && lineDeviationFromHint > 0
            ? { lineDeviation: lineDeviationFromHint }
            : {}),
        },
      },
    };
  } catch (error) {
    if (error instanceof SymbolResolutionError) {
      return {
        ok: false,
        error: {
          status: 'empty',
          error: error.message,
          errorType: 'symbol_not_found',
          errorCode: LSP_ERROR_CODES.SYMBOL_NOT_FOUND,
          searchRadius: error.searchRadius,
          hints: [
            `Symbol "${symbolName}" was not found near line ${lineHint}.`,
            'Run localSearch with searchText and the exact symbol name to refresh lineHint, then retry.',
          ],
        },
      };
    }
    throw error;
  }
}

function symbolAtPosition(
  content: string,
  position: { line: number; character: number }
):
  | {
      symbolName: string;
      lineHint: number;
      orderHint: number;
      character: number;
    }
  | undefined {
  const lines = content.split('\n');
  const text = lines[position.line]?.replace(/\r$/, '');
  if (text === undefined) return undefined;
  const tokens = /[\p{L}\p{N}_$\u200C\u200D]+/gu;
  for (const match of text.matchAll(tokens)) {
    const start = match.index ?? 0;
    const end = start + match[0].length;
    if (position.character >= start && position.character < end) {
      const orderHint = [...text.slice(0, start).matchAll(tokens)].length;
      return {
        symbolName: match[0],
        lineHint: position.line + 1,
        orderHint,
        character: start,
      };
    }
  }
  return undefined;
}

function countLineOccurrences(
  content: string,
  symbolName: string,
  lineHint: number
): number {
  const line = content.split('\n')[lineHint - 1]?.replace(/\r$/, '') ?? '';
  const escaped = symbolName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(
    `(?<![\\p{ID_Continue}$\\u200C\\u200D])${escaped}(?![\\p{ID_Continue}$\\u200C\\u200D])`,
    'gu'
  );
  return [...line.matchAll(regex)].length;
}

function rangeFromPosition(position: ExactPosition): LSPRange {
  return {
    start: position,
    end: {
      line: position.line,
      character: position.character,
    },
  };
}
