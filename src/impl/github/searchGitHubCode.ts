import { CallToolResult } from '@modelcontextprotocol/sdk/types';
import { GitHubCodeSearchParams } from '../../types';
import { generateCacheKey, withCache } from '../../utils/cache';
import { createErrorResult, createSuccessResult } from '../util';
import { executeGitHubCommand } from '../../utils/exec';

export async function searchGitHubCode(
  params: GitHubCodeSearchParams
): Promise<CallToolResult> {
  const cacheKey = generateCacheKey('gh-code', params);

  return withCache(cacheKey, async () => {
    try {
      const { command, args } = buildGitHubCodeSearchCommand(params);
      const result = await executeGitHubCommand(command, args, {
        cache: false,
      });

      if (result.isError) {
        return result;
      }

      // Extract the actual content from the exec result
      const execResult = JSON.parse(result.content[0].text as string);
      const rawContent = execResult.result;

      // Simple result processing - just return the data
      try {
        const codeResults = JSON.parse(rawContent);
        return createSuccessResult({
          searchType: 'code',
          query: params.query || '',
          results: codeResults,
        });
      } catch (parseError) {
        // Return raw content if JSON parsing fails
        return createSuccessResult({
          searchType: 'code',
          query: params.query || '',
          results: rawContent,
        });
      }
    } catch (error) {
      return createErrorResult('Failed to search GitHub code', error);
    }
  });
}

function buildGitHubCodeSearchCommand(params: GitHubCodeSearchParams): {
  command: string;
  args: string[];
} {
  const args = ['code'];

  // Handle query with proper boolean operator preservation
  if (params.query) {
    // Check if query contains boolean operators (AND, OR, NOT)
    const hasBooleanOps = /\b(AND|OR|NOT)\b/.test(params.query);
    // Check if query contains GitHub qualifiers (word:value patterns)
    const hasGitHubQualifiers = /\w+:[^\s]+/.test(params.query);

    if (hasBooleanOps || hasGitHubQualifiers) {
      // For boolean queries or queries with GitHub qualifiers, don't quote to preserve operators/qualifiers
      args.push(params.query);
    } else if (/[\s><|&;]/.test(params.query)) {
      // For non-boolean, non-qualifier queries with special chars, wrap in quotes
      args.push(`"${params.query}"`);
    } else {
      // Simple queries without special chars
      args.push(params.query);
    }
  }

  // Add simple flags
  if (params.language) args.push(`--language=${params.language}`);
  if (params.filename) args.push(`--filename=${params.filename}`);
  if (params.extension)
    args.push(`--extension=${params.extension.replace(/^\./, '')}`);
  if (params.size) {
    // Simple size handling - wrap in quotes if has special chars
    if (/[><]/.test(params.size)) {
      args.push(`--size="${params.size}"`);
    } else {
      args.push(`--size=${params.size}`);
    }
  }

  // Repository filters
  if (params.owner && params.repo) {
    if (Array.isArray(params.repo)) {
      params.repo.forEach(r => args.push(`--repo=${params.owner}/${r}`));
    } else {
      args.push(`--repo=${params.owner}/${params.repo}`);
    }
  } else if (params.owner) {
    args.push(`--owner=${params.owner}`);
  }

  // Add qualifiers to query string (simple approach)
  const queryQualifiers: string[] = [];
  if (params.path) queryQualifiers.push(`path:${params.path}`);
  if (params.symbol) queryQualifiers.push(`symbol:${params.symbol}`);
  if (params.content) queryQualifiers.push(`content:${params.content}`);
  if (params.user) queryQualifiers.push(`user:${params.user}`);
  if (params.org) queryQualifiers.push(`org:${params.org}`);
  if (params.is && params.is.length > 0) {
    params.is.forEach(prop => queryQualifiers.push(`is:${prop}`));
  }

  // If we have qualifiers, append them to the query
  if (queryQualifiers.length > 0) {
    const currentQuery = args[1] || '';
    const enhancedQuery = `${currentQuery} ${queryQualifiers.join(' ')}`.trim();

    // Check if enhanced query has boolean operators or GitHub qualifiers
    const enhancedHasBooleanOps = /\b(AND|OR|NOT)\b/.test(enhancedQuery);
    const enhancedHasGitHubQualifiers = /\w+:[^\s]+/.test(enhancedQuery);

    if (enhancedHasBooleanOps || enhancedHasGitHubQualifiers) {
      // For boolean queries or queries with GitHub qualifiers, don't quote to preserve operators/qualifiers
      args[1] = enhancedQuery;
    } else if (/[\s><|&;]/.test(enhancedQuery)) {
      // Quote non-boolean, non-qualifier queries with special chars
      args[1] = `"${enhancedQuery}"`;
    } else {
      args[1] = enhancedQuery;
    }
  }

  // Standard flags
  args.push('--json=repository,path,textMatches,sha,url');
  if (params.limit) args.push(`--limit=${params.limit}`);
  if (params.match) args.push(`--match=${params.match}`);

  return { command: 'search', args };
}
