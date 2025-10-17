/**
 * local_search_content tool - grep-based pattern search
 */

import { GrepCommandBuilder } from '../commands/GrepCommandBuilder.js';
import { safeExec } from '../utils/exec.js';
import { pathValidator } from '../security/pathValidator.js';
import { DEFAULTS } from '../constants.js';
import { getToolHints } from './hints.js';
import type {
  SearchContentQuery,
  SearchContentResult,
  SearchMatch,
} from '../types.js';

/**
 * Executes a content search query using grep
 */
export async function searchContent(
  query: SearchContentQuery
): Promise<SearchContentResult> {
  try {
    // Validate path
    const pathValidation = pathValidator.validate(query.path);
    if (!pathValidation.isValid) {
      return {
        status: 'error',
        error: pathValidation.error,
        researchGoal: query.researchGoal,
        reasoning: query.reasoning,
      };
    }

    // Build grep command
    const builder = new GrepCommandBuilder();
    const { command, args } = builder.fromQuery(query).build();

    // Execute command
    const result = await safeExec(command, args);

    // Parse results
    if (!result.success || !result.stdout.trim()) {
      return {
        status: 'empty',
        searchPath: query.path,
        totalMatches: 0,
        researchGoal: query.researchGoal,
        reasoning: query.reasoning,
        hints: getToolHints('LOCAL_SEARCH_CONTENT', 'empty'),
      };
    }

    // Parse grep output
    const matches = parseGrepOutput(
      result.stdout,
      query.lineNumbers,
      query.count
    );

    // Apply limit
    const limitedMatches = query.limit
      ? matches.slice(0, query.limit)
      : matches.slice(0, DEFAULTS.MAX_RESULTS);

    return {
      status: 'hasResults',
      matches: limitedMatches,
      totalMatches: matches.length,
      searchPath: query.path,
      researchGoal: query.researchGoal,
      reasoning: query.reasoning,
      hints: getToolHints('LOCAL_SEARCH_CONTENT', 'hasResults'),
    };
  } catch (error) {
    return {
      status: 'error',
      error: error instanceof Error ? error.message : String(error),
      researchGoal: query.researchGoal,
      reasoning: query.reasoning,
      hints: getToolHints('LOCAL_SEARCH_CONTENT', 'error'),
    };
  }
}

/**
 * Parses grep output into structured matches
 */
function parseGrepOutput(
  output: string,
  withLineNumbers?: boolean,
  withCount?: boolean
): SearchMatch[] {
  const lines = output.split('\n').filter((line) => line.trim());
  const matches: SearchMatch[] = [];

  for (const line of lines) {
    if (withCount) {
      // Format: file:count
      const match = line.match(/^(.+):(\d+)$/);
      if (match) {
        matches.push({
          file: match[1],
          matchCount: parseInt(match[2], 10),
        });
      }
    } else if (withLineNumbers) {
      // Format: file:lineNumber:content
      const match = line.match(/^(.+?):(\d+):(.*)$/);
      if (match) {
        matches.push({
          file: match[1],
          lineNumber: parseInt(match[2], 10),
          context: match[3],
        });
      }
    } else {
      // Format: file:content or just file (with -l flag)
      const colonIndex = line.indexOf(':');
      if (colonIndex === -1) {
        // Files only mode
        matches.push({
          file: line,
        });
      } else {
        matches.push({
          file: line.substring(0, colonIndex),
          context: line.substring(colonIndex + 1),
        });
      }
    }
  }

  return matches;
}
