import { CallToolResult } from '@modelcontextprotocol/sdk/types';
import { GitHubReposSearchParams } from '../../types';
import { generateCacheKey, withCache } from '../../utils/cache';
import { createErrorResult, createSuccessResult, needsQuoting } from '../util';
import { executeGitHubCommand } from '../../utils/exec';

export async function searchGitHubRepos(
  params: GitHubReposSearchParams
): Promise<CallToolResult> {
  const cacheKey = generateCacheKey('gh-repos', params);

  return withCache(cacheKey, async () => {
    try {
      const { command, args } = buildGitHubReposSearchCommand(params);
      const result = await executeGitHubCommand(command, args, {
        cache: false,
      });

      if (result.isError) {
        return result;
      }

      // Extract the actual content from the exec result
      const execResult = JSON.parse(result.content[0].text as string);
      const rawContent = execResult.result;

      // Parse JSON results and provide structured analysis
      let repositories = [];
      const analysis = {
        totalFound: 0,
        languages: new Set<string>(),
        avgStars: 0,
        recentlyUpdated: 0,
        topStarred: [] as any[],
      };

      // Parse JSON response from GitHub CLI
      repositories = JSON.parse(rawContent);

      if (Array.isArray(repositories) && repositories.length > 0) {
        analysis.totalFound = repositories.length;

        // Analyze repository data
        let totalStars = 0;
        const now = new Date();
        const thirtyDaysAgo = new Date(
          now.getTime() - 30 * 24 * 60 * 60 * 1000
        );

        repositories.forEach(repo => {
          // Collect languages
          if (repo.language) {
            analysis.languages.add(repo.language);
          }

          // Calculate average stars (use correct field name)
          if (repo.stargazersCount) {
            totalStars += repo.stargazersCount;
          }

          // Count recently updated repositories (use correct field name)
          if (repo.updatedAt) {
            const updatedDate = new Date(repo.updatedAt);
            if (updatedDate > thirtyDaysAgo) {
              analysis.recentlyUpdated++;
            }
          }
        });

        analysis.avgStars =
          repositories.length > 0
            ? Math.round(totalStars / repositories.length)
            : 0;

        // Get top starred repositories (limit to top 5)
        analysis.topStarred = repositories
          .sort((a, b) => (b.stargazersCount || 0) - (a.stargazersCount || 0))
          .slice(0, 5)
          .map(repo => ({
            name: repo.fullName || repo.name,
            stars: repo.stargazersCount || 0,
            description: repo.description || 'No description',
            language: repo.language || 'Unknown',
            url: repo.url,
            forks: repo.forksCount || 0,
            isPrivate: repo.isPrivate || false,
            updatedAt: repo.updatedAt,
          }));
      }

      return createSuccessResult({
        totalRepositories: analysis.totalFound,
        languages: Array.from(analysis.languages).slice(0, 10), // Top 10 languages
        averageStars: analysis.avgStars,
        recentlyUpdated: analysis.recentlyUpdated,
        topRepositories: analysis.topStarred,
        searchParams: {
          query: params.query,
          owner: params.owner,
          language: params.language,
          stars: params.stars,
          updated: params.updated,
        },
      });
    } catch (error) {
      return createErrorResult('Failed to search GitHub repositories', error);
    }
  });
}

function buildGitHubReposSearchCommand(params: GitHubReposSearchParams): {
  command: string;
  args: string[];
} {
  // Build query following GitHub CLI patterns
  const query = params.query?.trim() || '';
  const queryString = needsQuoting(query) ? `"${query}"` : query;
  const args = ['repos', queryString];

  // Add JSON output with specific fields for structured data parsing (matches official CLI)
  args.push(
    '--json',
    'name,fullName,description,language,stargazersCount,forksCount,updatedAt,createdAt,url,owner,isPrivate,license,hasIssues,openIssuesCount,isArchived,isFork,visibility'
  );

  if (params.owner) args.push(`--owner=${params.owner}`);
  if (params.archived !== undefined) args.push(`--archived=${params.archived}`);
  if (params.created) args.push(`--created="${params.created}"`);
  if (params.followers !== undefined)
    args.push(`--followers=${params.followers}`);
  if (params.forks !== undefined) args.push(`--forks=${params.forks}`);
  if (params.goodFirstIssues !== undefined)
    args.push(`--good-first-issues=${params.goodFirstIssues}`);
  if (params.helpWantedIssues !== undefined)
    args.push(`--help-wanted-issues=${params.helpWantedIssues}`);
  if (params.includeForks) args.push(`--include-forks=${params.includeForks}`);
  if (params.language) args.push(`--language=${params.language}`);
  if (params.license && params.license.length > 0)
    args.push(`--license=${params.license.join(',')}`);
  if (params.limit) args.push(`--limit=${params.limit}`);
  if (params.match) args.push(`--match=${params.match}`);
  if (params.numberTopics !== undefined)
    args.push(`--number-topics=${params.numberTopics}`);
  if (params.order) args.push(`--order=${params.order}`);
  if (params.size) args.push(`--size="${params.size}"`);

  // Use best-match as default, only specify sort if different from default
  const sortBy = params.sort || 'best-match';
  if (sortBy !== 'best-match') {
    args.push(`--sort=${sortBy}`);
  }

  if (params.stars !== undefined) args.push(`--stars="${params.stars}"`);
  if (params.topic && params.topic.length > 0)
    args.push(`--topic=${params.topic.join(',')}`);
  if (params.updated) args.push(`--updated="${params.updated}"`);
  if (params.visibility) args.push(`--visibility=${params.visibility}`);

  return { command: 'search', args };
}
