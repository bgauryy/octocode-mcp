/**
 * Symbol resolver for LSP tools
 * Resolves fuzzy positions (symbolName + lineHint) to exact positions
 * @module lsp/resolver
 */

import { promises as fs } from 'fs';
import type { FuzzyPosition, ExactPosition } from './types.js';

/**
 * Error thrown when symbol cannot be resolved
 */
export class SymbolResolutionError extends Error {
  public readonly symbolName: string;
  public readonly lineHint: number;
  public readonly reason: string;
  public readonly searchRadius: number;

  constructor(
    symbolName: string,
    lineHint: number,
    reason: string,
    searchRadius: number = 2
  ) {
    super(
      `Could not find symbol '${symbolName}' at or near line ${lineHint}. ${reason}`
    );
    this.name = 'SymbolResolutionError';
    this.symbolName = symbolName;
    this.lineHint = lineHint;
    this.reason = reason;
    this.searchRadius = searchRadius;
  }
}

/**
 * Configuration for symbol resolver
 */
interface SymbolResolverConfig {
  /** Number of lines to search above and below lineHint (default: 2) */
  lineSearchRadius?: number;
}

/**
 * Result of symbol resolution
 */
interface ResolvedSymbol {
  /** Exact position where symbol was found */
  position: ExactPosition;
  /** The line where symbol was found (1-indexed) */
  foundAtLine: number;
  /** Offset from the lineHint (0 if found at exact line) */
  lineOffset: number;
  /** The actual line content */
  lineContent: string;
}

/**
 * Symbol resolver class
 * Finds exact character position from fuzzy position (symbolName + lineHint)
 */
export class SymbolResolver {
  private readonly lineSearchRadius: number;

  constructor(config?: SymbolResolverConfig) {
    this.lineSearchRadius = config?.lineSearchRadius ?? 2;
  }

  /**
   * Resolve a fuzzy position to an exact position
   *
   * @param filePath - Absolute path to the file
   * @param fuzzy - Fuzzy position with symbolName and lineHint
   * @returns Resolved symbol with exact position
   * @throws SymbolResolutionError if symbol cannot be found
   */
  async resolvePosition(
    filePath: string,
    fuzzy: FuzzyPosition
  ): Promise<ResolvedSymbol> {
    const content = await fs.readFile(filePath, 'utf-8');
    return this.resolvePositionFromContent(content, fuzzy);
  }

  /**
   * Resolve a fuzzy position from content string
   * Useful when content is already loaded
   *
   * @param content - File content as string
   * @param fuzzy - Fuzzy position with symbolName and lineHint
   * @returns Resolved symbol with exact position
   * @throws SymbolResolutionError if symbol cannot be found
   */
  resolvePositionFromContent(
    content: string,
    fuzzy: FuzzyPosition
  ): ResolvedSymbol {
    const lines = content.split(/\r?\n/);
    const targetLine = fuzzy.lineHint - 1; // Convert to 0-indexed
    const orderHint = fuzzy.orderHint ?? 0;

    // Validate line number
    if (targetLine < 0 || targetLine >= lines.length) {
      throw new SymbolResolutionError(
        fuzzy.symbolName,
        fuzzy.lineHint,
        `Line ${fuzzy.lineHint} is out of range (file has ${lines.length} lines)`,
        this.lineSearchRadius
      );
    }

    // Search exact line first
    const exactLine = lines[targetLine];
    if (exactLine !== undefined) {
      const exactResult = this.findSymbolInLine(
        exactLine,
        fuzzy.symbolName,
        orderHint
      );
      if (exactResult !== null) {
        return {
          position: { line: targetLine, character: exactResult },
          foundAtLine: fuzzy.lineHint,
          lineOffset: 0,
          lineContent: exactLine,
        };
      }
    }

    // Search nearby lines (alternating above and below)
    for (let offset = 1; offset <= this.lineSearchRadius; offset++) {
      for (const delta of [-offset, offset]) {
        const searchLine = targetLine + delta;
        if (searchLine >= 0 && searchLine < lines.length) {
          const line = lines[searchLine];
          if (line !== undefined) {
            const result = this.findSymbolInLine(
              line,
              fuzzy.symbolName,
              orderHint
            );
            if (result !== null) {
              return {
                position: { line: searchLine, character: result },
                foundAtLine: searchLine + 1, // Convert back to 1-indexed
                lineOffset: delta,
                lineContent: line,
              };
            }
          }
        }
      }
    }

    throw new SymbolResolutionError(
      fuzzy.symbolName,
      fuzzy.lineHint,
      `Symbol not found in target line or within ±${this.lineSearchRadius} lines. Verify the exact symbol name and line number.`,
      this.lineSearchRadius
    );
  }

  /**
   * Find symbol in a single line
   *
   * @param line - Line content
   * @param symbolName - Symbol to find (exact match)
   * @param orderHint - Which occurrence to return (0 = first)
   * @returns Character position or null if not found
   */
  private findSymbolInLine(
    line: string,
    symbolName: string,
    orderHint: number
  ): number | null {
    let searchStart = 0;
    let occurrenceCount = 0;

    while (searchStart < line.length) {
      const index = line.indexOf(symbolName, searchStart);
      if (index === -1) return null;

      // Check for word boundary (symbol should not be part of larger identifier)
      const isWordBoundaryStart =
        index === 0 || !this.isIdentifierChar(line[index - 1]!);
      const isWordBoundaryEnd =
        index + symbolName.length >= line.length ||
        !this.isIdentifierChar(line[index + symbolName.length]!);

      if (isWordBoundaryStart && isWordBoundaryEnd) {
        if (occurrenceCount === orderHint) {
          return index;
        }
        occurrenceCount++;
      }

      searchStart = index + 1;
    }

    return null;
  }

  /**
   * Check if character is a valid identifier character
   */
  private isIdentifierChar(char: string): boolean {
    return /[a-zA-Z0-9_$]/.test(char);
  }

  /**
   * Extract context lines around a position
   *
   * @param content - File content
   * @param lineNumber - 1-indexed line number
   * @param contextLines - Number of lines before and after
   * @returns Code snippet with context
   */
  extractContext(
    content: string,
    lineNumber: number,
    contextLines: number
  ): { content: string; startLine: number; endLine: number } {
    const lines = content.split(/\r?\n/);
    const startLine = Math.max(1, lineNumber - contextLines);
    const endLine = Math.min(lines.length, lineNumber + contextLines);

    const contextContent = lines.slice(startLine - 1, endLine).join('\n');

    return {
      content: contextContent,
      startLine,
      endLine,
    };
  }
}

/**
 * Default symbol resolver instance
 */
export const defaultResolver = new SymbolResolver({ lineSearchRadius: 2 });

/**
 * Convenience function to resolve symbol position
 */
export async function resolveSymbolPosition(
  filePath: string,
  symbolName: string,
  lineHint: number,
  orderHint?: number
): Promise<ResolvedSymbol> {
  return defaultResolver.resolvePosition(filePath, {
    symbolName,
    lineHint,
    orderHint,
  });
}
