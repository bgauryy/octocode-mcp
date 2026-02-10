import type { RipgrepQuery } from '../../tools/local_ripgrep/scheme.js';
import { RESOURCE_LIMITS } from '../core/constants.js';
import type {
  RipgrepFileMatches,
  RipgrepMatch,
  SearchStats,
} from '../core/types.js';
import { RipgrepJsonMessageSchema } from './schemas.js';

// Ripgrep JSON types are now validated via Zod schemas in ./schemas.ts

export function parseRipgrepJson(
  jsonOutput: string,
  query: RipgrepQuery
): {
  files: RipgrepFileMatches[];
  stats: SearchStats;
} {
  const lines = jsonOutput.trim().split('\n').filter(Boolean);
  type RawMatch = {
    lineText: string;
    lineNumber: number;
    absoluteOffset: number;
    column: number;
    matchLength: number;
  };

  const fileMap = new Map<
    string,
    {
      rawMatches: RawMatch[];
      contexts: Map<number, string>;
    }
  >();

  let stats: SearchStats = {};

  for (const line of lines) {
    if (!line.trim()) continue;

    if (!line.trim().startsWith('{')) {
      continue;
    }

    try {
      const parsed = JSON.parse(line);
      const validation = RipgrepJsonMessageSchema.safeParse(parsed);
      if (!validation.success) continue;
      const msg = validation.data;

      if (msg.type === 'match') {
        const path = msg.data.path.text;
        const lineText = msg.data.lines.text;
        const lineNumber = msg.data.line_number;
        const absoluteOffset = msg.data.absolute_offset;

        if (!fileMap.has(path)) {
          fileMap.set(path, { rawMatches: [], contexts: new Map() });
        }
        const firstSubmatch = msg.data.submatches[0];
        const column = firstSubmatch?.start ?? 0;
        const matchLength = firstSubmatch
          ? firstSubmatch.end - firstSubmatch.start
          : lineText.length;

        const fileEntry = fileMap.get(path);
        if (fileEntry) {
          fileEntry.rawMatches.push({
            lineText,
            lineNumber,
            absoluteOffset,
            column,
            matchLength,
          });
        }
      } else if (msg.type === 'context') {
        const path = msg.data.path.text;
        const lineNumber = msg.data.line_number;
        const lineText = msg.data.lines.text;

        if (!fileMap.has(path)) {
          fileMap.set(path, { rawMatches: [], contexts: new Map() });
        }
        const fileEntry = fileMap.get(path);
        if (fileEntry) {
          fileEntry.contexts.set(lineNumber, lineText);
        }
      } else if (msg.type === 'summary') {
        stats = {
          matchCount: msg.data.stats.matches,
          matchedLines: msg.data.stats.matched_lines,
          filesMatched: msg.data.stats.searches_with_match,
          filesSearched: msg.data.stats.searches,
          bytesSearched: msg.data.stats.bytes_searched,
          searchTime: msg.data.stats.elapsed.human,
        };
      }
    } catch {
      // Skip malformed JSON lines
    }
  }

  // Specific before/after context takes precedence over general contextLines
  const before = query.beforeContext ?? query.contextLines ?? 0;
  const after = query.afterContext ?? query.contextLines ?? 0;
  const maxLength =
    query.matchContentLength || RESOURCE_LIMITS.DEFAULT_MATCH_CONTENT_LENGTH;

  const files: RipgrepFileMatches[] = Array.from(fileMap.entries()).map(
    ([path, entry]) => {
      const matches: RipgrepMatch[] = entry.rawMatches.map(m => {
        const contextLines: string[] = [];
        // prepend before-context
        for (let i = before; i > 0; i--) {
          const ctx = entry.contexts.get(m.lineNumber - i);
          if (ctx) contextLines.push(ctx);
        }
        // current line
        contextLines.push(m.lineText);
        // append after-context
        for (let i = 1; i <= after; i++) {
          const ctx = entry.contexts.get(m.lineNumber + i);
          if (ctx) contextLines.push(ctx);
        }

        let value = contextLines.join('\n');
        const charArray = [...value];
        if (charArray.length > maxLength) {
          // Slice to maxLength - 3 to leave room for '...'
          value = charArray.slice(0, maxLength - 3).join('') + '...';
        }

        return {
          value,
          location: {
            byteOffset: m.absoluteOffset,
            byteLength: m.matchLength,
            charOffset: m.absoluteOffset,
            charLength: m.matchLength,
          },
          line: m.lineNumber,
          column: m.column,
        };
      });

      return {
        path,
        matchCount: matches.length,
        matches,
      };
    }
  );

  return { files, stats };
}

/**
 * Parse grep output into structured format
 * Grep output format: filename:lineNumber:content (with -n -H flags)
 */
export function parseGrepOutput(
  output: string,
  query: RipgrepQuery
): RipgrepFileMatches[] {
  const lines = output.trim().split('\n').filter(Boolean);

  type RawMatch = {
    lineText: string;
    lineNumber: number;
    column: number;
  };

  const fileMap = new Map<string, RawMatch[]>();

  // Grep output format with -n -H: filename:lineNumber:content
  // For files-only mode (-l): just filename
  if (query.filesOnly) {
    // Each line is just a filename
    for (const line of lines) {
      const path = line.trim();
      if (path && !fileMap.has(path)) {
        fileMap.set(path, []);
      }
    }
  } else {
    for (const line of lines) {
      const match = line.match(/:(\d+):/);
      if (match?.index && match.index > 0) {
        const path = line.substring(0, match.index);
        const content = line.substring(match.index + match[0].length);
        const lineNumber = parseInt(match[1]!, 10);

        if (!fileMap.has(path)) {
          fileMap.set(path, []);
        }

        // Try to find the column (position of pattern in the line)
        // For simplicity, we set column to 0 since grep doesn't provide it
        const fileMatches = fileMap.get(path);
        if (fileMatches) {
          fileMatches.push({
            lineText: content,
            lineNumber,
            column: 0,
          });
        }
      } else if (line.includes(':')) {
        // Fallback: try to parse as filename:content (no line number)
        const colonIdx = line.indexOf(':');
        const path = line.substring(0, colonIdx);
        const content = line.substring(colonIdx + 1);

        if (path && !path.includes('\0')) {
          if (!fileMap.has(path)) {
            fileMap.set(path, []);
          }
          const fileMatches = fileMap.get(path);
          if (fileMatches) {
            fileMatches.push({
              lineText: content,
              lineNumber: 0,
              column: 0,
            });
          }
        }
      }
    }
  }

  const maxLength =
    query.matchContentLength || RESOURCE_LIMITS.DEFAULT_MATCH_CONTENT_LENGTH;

  const files: RipgrepFileMatches[] = Array.from(fileMap.entries()).map(
    ([path, rawMatches]) => {
      const matches: RipgrepMatch[] = rawMatches.map(m => {
        let value = m.lineText;
        const charArray = [...value];
        if (charArray.length > maxLength) {
          value = charArray.slice(0, maxLength - 3).join('') + '...';
        }

        return {
          value,
          location: {
            // grep doesn't provide byte offsets, use 0 as placeholder
            byteOffset: 0,
            byteLength: 0,
            charOffset: 0,
            charLength: value.length,
          },
          line: m.lineNumber,
          column: m.column,
        };
      });

      return {
        path,
        matchCount: matches.length,
        matches,
      };
    }
  );

  return files;
}
