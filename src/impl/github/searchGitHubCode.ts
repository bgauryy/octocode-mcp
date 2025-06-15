import { CallToolResult } from '@modelcontextprotocol/sdk/types';
import { GitHubCodeSearchParams, GitHubSearchResult } from '../../types';
import { generateCacheKey, withCache } from '../../utils/cache';
import { createErrorResult, createSuccessResult, needsQuoting } from '../util';
import { executeGitHubCommand } from '../../utils/exec';
import { TOOL_NAMES } from '../../mcp/systemPrompts';

/**
 * Search GitHub code with organizational fallback strategy
 *
 * For internal company projects (like "Astra Nova" at Wix):
 * 1. Try direct code search first
 * 2. If no results, the calling code should implement fallback chain:
 *    - searchGitHubCommits() for commit message references
 *    - searchGitHubPullRequests() for PR mentions
 *    - searchGitHubIssues() for issue discussions
 * 3. Extract repository info from any successful results
 */

export async function searchGitHubCode(
  params: GitHubCodeSearchParams
): Promise<CallToolResult> {
  const cacheKey = generateCacheKey('gh-code', params);

  return withCache(cacheKey, async () => {
    try {
      const { command, args } = buildGitHubCodeSearchCommand(params);
      const actualQuery = args[1]; // Store the actual query string
      const result = await executeGitHubCommand(command, args, {
        cache: false,
      });

      if (result.isError) {
        return result;
      }

      // Extract the actual content from the exec result
      const execResult = JSON.parse(result.content[0].text as string);
      const rawContent = execResult.result;

      // Parse and format the rich JSON results
      let codeResults = [];
      const analysis = {
        totalFound: 0,
        repositories: new Set<string>(),
        languages: new Set<string>(),
        fileTypes: new Set<string>(),
        topMatches: [] as any[],
      };

      try {
        // Parse JSON response from GitHub CLI
        codeResults = JSON.parse(rawContent);

        if (Array.isArray(codeResults) && codeResults.length > 0) {
          analysis.totalFound = codeResults.length;

          // Analyze code search results
          codeResults.forEach((result: any) => {
            // Collect repositories (try multiple possible field names)
            const repoName =
              result.repository?.fullName ||
              result.repository?.nameWithOwner ||
              result.repository?.name ||
              'Unknown';
            if (repoName !== 'Unknown') {
              analysis.repositories.add(repoName);
            }

            // Collect languages from file extensions and repository info
            if (result.path) {
              const extension = result.path.split('.').pop();
              if (extension) analysis.fileTypes.add(extension);
            }
            if (result.repository?.language) {
              analysis.languages.add(result.repository.language);
            }

            // Build top matches with better context
            analysis.topMatches.push({
              repository: repoName,
              path: result.path || '',
              url: result.url || '',
              matchCount: result.textMatches?.length || 0,
              language: result.repository?.language || 'Unknown',
              stars:
                result.repository?.stargazersCount ||
                result.repository?.stargazers_count ||
                0,
            });
          });

          // Sort by match count (number of text matches) for best matches first
          analysis.topMatches.sort(
            (a, b) => (b.matchCount || 0) - (a.matchCount || 0)
          );
        }

        // Format comprehensive results
        const searchResult: GitHubSearchResult = {
          searchType: 'code',
          query: params.query || '',
          actualQuery: actualQuery,
          results: codeResults,
          analysis: {
            summary: `${analysis.totalFound} matches across ${analysis.repositories.size} repos`,
            repositories: Array.from(analysis.repositories).slice(0, 10),
            languages: Array.from(analysis.languages),
            fileTypes: Array.from(analysis.fileTypes),
            topMatches: analysis.topMatches.slice(0, 5),
            ...(analysis.totalFound === 0 && {
              suggestions: params.owner
                ? [
                    `${TOOL_NAMES.GITHUB_SEARCH_COMMITS} "${params.query}" owner:${params.owner}`,
                    `${TOOL_NAMES.GITHUB_SEARCH_PULL_REQUESTS} "${params.query}" owner:${params.owner}`,
                    `${TOOL_NAMES.GITHUB_SEARCH_ISSUES} "${params.query}" owner:${params.owner}`,
                    `${TOOL_NAMES.NPM_SEARCH_PACKAGES} "${params.query}"`,
                  ]
                : [
                    `${TOOL_NAMES.NPM_SEARCH_PACKAGES} "${params.query}"`,
                    `${TOOL_NAMES.GITHUB_SEARCH_REPOS} "${params.query}" stars:>10`,
                    `${TOOL_NAMES.GITHUB_SEARCH_TOPICS} "${params.query}"`,
                  ],
            }),
          },
        };

        // Add organizational fallback guidance for zero results
        if (analysis.totalFound === 0 && params.owner) {
          searchResult.organizationalFallback = {
            suggestion: `No code matches found for "${params.query}" in ${params.owner}. Try organizational fallback strategy:`,
            fallbackSteps: [
              `Search commits: "${params.query}" with owner:${params.owner}`,
              `Search pull requests: "${params.query}" with owner:${params.owner}`,
              `Search issues: "${params.query}" with owner:${params.owner}`,
              'Extract repository references from any successful results',
            ],
          };
        }

        return createSuccessResult(searchResult);
      } catch (parseError) {
        // Fallback to raw output if JSON parsing fails
        const searchResult: GitHubSearchResult = {
          searchType: 'code',
          query: params.query || '',
          actualQuery: actualQuery,
          results: rawContent,
        };
        return createSuccessResult(searchResult);
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
  // Build search query following official GitHub CLI patterns
  const queryParts: string[] = [];

  // Handle main search terms - preserve user's intent for boolean operators
  if (params.query) {
    const query = params.query.trim();

    // Check if query already contains GitHub search syntax
    const hasGitHubSyntax =
      /\b(OR|AND|NOT|\w+:|repo:|org:|user:|language:|path:|filename:|extension:)/.test(
        query
      );

    if (hasGitHubSyntax) {
      // User provided GitHub search syntax, use as-is but don't add redundant qualifiers
      queryParts.push(query);

      // Skip adding individual qualifiers if they're already in the query
      const skipRepo = /\b(repo|org|user):/.test(query);
      const skipLanguage = /\blanguage:/.test(query);
      const skipPath = /\bpath:/.test(query);
      const skipFilename = /\bfilename:/.test(query);
      const skipExtension = /\bextension:/.test(query);

      // Build repository/organization qualifiers only if not already present
      if (!skipRepo) {
        if (params.owner && params.repo) {
          queryParts.push(`repo:${params.owner}/${params.repo}`);
        } else if (params.owner) {
          queryParts.push(`org:${params.owner}`);
        }
      }

      // Add language qualifier only if not already present
      if (!skipLanguage && params.language) {
        const lang = params.language.toLowerCase().trim();
        queryParts.push(`language:${lang}`);
      }

      // Add filename qualifier only if not already present
      if (!skipFilename && params.filename) {
        const filename = params.filename.trim();
        queryParts.push(
          `filename:${needsQuoting(filename) ? `"${filename}"` : filename}`
        );
      }

      // Add extension qualifier only if not already present
      if (!skipExtension && params.extension) {
        const ext = params.extension.startsWith('.')
          ? params.extension.slice(1)
          : params.extension;
        queryParts.push(`extension:${ext}`);
      }

      // Add path qualifier only if not already present
      if (!skipPath && params.path) {
        const path = params.path.trim();
        queryParts.push(`path:${needsQuoting(path) ? `"${path}"` : path}`);
      }
    } else {
      // Simple search terms - quote if contains spaces or special characters
      queryParts.push(needsQuoting(query) ? `"${query}"` : query);

      // Build repository/organization qualifiers
      if (params.owner && params.repo) {
        queryParts.push(`repo:${params.owner}/${params.repo}`);
      } else if (params.owner) {
        queryParts.push(`org:${params.owner}`);
      }

      // Add language qualifier (following GitHub CLI patterns)
      if (params.language) {
        const lang = params.language.toLowerCase().trim();
        queryParts.push(`language:${lang}`);
      }

      // Add filename qualifier
      if (params.filename) {
        const filename = params.filename.trim();
        queryParts.push(
          `filename:${needsQuoting(filename) ? `"${filename}"` : filename}`
        );
      }

      // Add extension qualifier (convert to path pattern)
      if (params.extension) {
        const ext = params.extension.startsWith('.')
          ? params.extension.slice(1)
          : params.extension;
        queryParts.push(`extension:${ext}`);
      }

      // Add path qualifier
      if (params.path) {
        const path = params.path.trim();
        queryParts.push(`path:${needsQuoting(path) ? `"${path}"` : path}`);
      }
    }
  } else {
    // No main query, just build from qualifiers
    if (params.owner && params.repo) {
      queryParts.push(`repo:${params.owner}/${params.repo}`);
    } else if (params.owner) {
      queryParts.push(`org:${params.owner}`);
    }

    if (params.language) {
      const lang = params.language.toLowerCase().trim();
      queryParts.push(`language:${lang}`);
    }

    if (params.filename) {
      const filename = params.filename.trim();
      queryParts.push(
        `filename:${needsQuoting(filename) ? `"${filename}"` : filename}`
      );
    }

    if (params.extension) {
      const ext = params.extension.startsWith('.')
        ? params.extension.slice(1)
        : params.extension;
      queryParts.push(`extension:${ext}`);
    }

    if (params.path) {
      const path = params.path.trim();
      queryParts.push(`path:${needsQuoting(path) ? `"${path}"` : path}`);
    }
  }

  // Construct final query string (space-separated = implicit AND)
  const queryString = queryParts.filter(part => part.length > 0).join(' ');

  // Build GitHub CLI command arguments
  const args = ['code', queryString];

  // Add output format for structured parsing
  args.push('--json', 'repository,path,textMatches,sha,url');

  // Add optional parameters
  if (params.limit && params.limit > 0) {
    args.push('--limit', params.limit.toString());
  }

  if (params.match) {
    args.push('--match', params.match);
  }

  return { command: 'search', args };
}
