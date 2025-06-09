import { CallToolResult } from '@modelcontextprotocol/sdk/types';
import {
  GitHubRepositoryViewParams,
  GitHubRepositoryViewResult,
} from '../../types';
import { generateCacheKey, withCache } from '../../utils/cache';
import { createErrorResult, createSuccessResult } from '../util';
import { executeGitHubCommand } from '../../utils/exec';

export async function viewGitHubRepositoryInfo(
  params: GitHubRepositoryViewParams
): Promise<CallToolResult> {
  const cacheKey = generateCacheKey('gh-repo-view', params);

  return withCache(cacheKey, async () => {
    try {
      const owner = params.owner || '';
      const args = ['view', `${owner}/${params.repo}`];
      const result = await executeGitHubCommand('repo', args, { cache: false });

      if (result.isError) {
        // Parse the error message to provide better context
        const errorMsg = result.content[0].text as string;

        // Handle repository not found
        if (
          errorMsg.includes('404') ||
          errorMsg.includes('Not Found') ||
          errorMsg.includes('could not resolve to a Repository')
        ) {
          return createErrorResult(
            `Repository not found: ${owner}/${params.repo}`,
            new Error(`
❌ REPOSITORY NOT FOUND: The repository '${owner}/${params.repo}' does not exist or is not accessible.

🔍 COMMON CAUSES:
• Repository name is incorrect
• Repository is private and you lack access
• Owner/organization name is wrong
• Repository has been deleted or moved

🎯 RECOMMENDED DISCOVERY WORKFLOW (in this order):

1️⃣ **NPM PACKAGE DISCOVERY** (if this is a package):
   • Use 'npm_search_packages' with keywords: "${params.repo}"
   • Then 'npm_get_package' to find the GitHub repository URL
   • This automatically discovers the correct owner/repo

2️⃣ **GITHUB TOPICS SEARCH** (for broader discovery):
   • Use 'github_search_topics' with terms: "${params.repo}"
   • Discover related repositories and ecosystems
   • Find the correct repository among similar projects

3️⃣ **REPOSITORY SEARCH** (last resort):
   • Use 'github_search_repositories' with query: "${params.repo}"
   • Add filters like language, stars, etc.
   • Manual selection from search results

💡 ORGANIZATION ACCESS:
If this should be a private repository, try:
• 'github_get_user_organizations' to see your available orgs
• Use the correct organization name as owner

🔧 VERIFICATION:
• Check repository exists at: https://github.com/${owner}/${params.repo}
• Verify spelling and case sensitivity`)
          );
        }

        // Handle access denied
        if (errorMsg.includes('403') || errorMsg.includes('Forbidden')) {
          return createErrorResult(
            `Access denied to repository: ${owner}/${params.repo}`,
            new Error(`
🔒 ACCESS DENIED: You don't have permission to access '${owner}/${params.repo}'.

🔍 POSSIBLE CAUSES:
• Repository is private
• Organization restrictions
• Invalid authentication

💡 RECOMMENDED ACTIONS:
1. Check authentication: gh auth status
2. Request repository access from owner: ${owner}
3. Use 'github_get_user_organizations' if this is your org
4. Verify you're logged into the correct GitHub account

🎯 ALTERNATIVE DISCOVERY:
If you're looking for similar repositories, try:
• 'npm_search_packages' for packages
• 'github_search_topics' for general discovery
• 'github_search_repositories' with broader terms`)
          );
        }

        // Handle rate limiting
        if (errorMsg.includes('rate limit') || errorMsg.includes('429')) {
          return createErrorResult(
            'GitHub API rate limit exceeded',
            new Error(`
⏱️ RATE LIMIT: GitHub API rate limit has been exceeded.

💡 RECOMMENDED ACTIONS:
1. Wait a few minutes before trying again
2. Use authentication to increase rate limits: gh auth login
3. Try discovery tools instead: npm_search_packages or github_search_topics`)
          );
        }

        // Generic error fallback
        return createErrorResult(
          `Failed to access repository: ${owner}/${params.repo}`,
          new Error(`GitHub CLI Error: ${errorMsg}

🔧 TROUBLESHOOTING:
• Verify repository exists: https://github.com/${owner}/${params.repo}
• Check spelling and case sensitivity
• Confirm authentication: gh auth status

🎯 DISCOVERY WORKFLOW:
1. npm_search_packages → npm_get_package
2. github_search_topics  
3. github_search_repositories
4. github_get_repository (current step)`)
        );
      }

      // Extract the actual content from the exec result
      const execResult = JSON.parse(result.content[0].text as string);
      const content = execResult.result;

      // Parse repository info to extract key details
      const viewResult: GitHubRepositoryViewResult = {
        owner,
        repo: params.repo,
        repositoryInfo: content,
        rawOutput: content,
      };

      // Try to extract branch information from the output
      let defaultBranch = 'main'; // fallback
      try {
        // The content is usually YAML-like output from gh repo view
        const lines = content.split('\n');
        for (const line of lines) {
          if (
            line.includes('default branch:') ||
            line.includes('Default branch:')
          ) {
            const branchMatch = line.split(':')[1]?.trim();
            if (branchMatch) {
              defaultBranch = branchMatch;
              break;
            }
          }
        }
      } catch (parseError) {
        // If we can't parse the branch, keep the fallback
      }

      return createSuccessResult({
        ...viewResult,
        defaultBranch,
        success: true,
        message: `✅ Repository found: ${owner}/${params.repo}
        
📋 REPOSITORY DETAILS:
• Default branch: ${defaultBranch}
• Ready for file operations

🔄 NEXT RECOMMENDED STEPS:
1. Explore structure: github_get_contents
2. Search for code: github_search_code  
3. Fetch specific files: github_get_file_content

⚠️ IMPORTANT: Use branch '${defaultBranch}' in subsequent file operations.`,
      });
    } catch (error) {
      return createErrorResult(
        `Unexpected error accessing repository: ${params.owner}/${params.repo}`,
        new Error(`
❌ UNEXPECTED ERROR: ${(error as Error).message}

📍 REPOSITORY DETAILS:
• Owner: ${params.owner}
• Repository: ${params.repo}

🔧 TROUBLESHOOTING STEPS:
1. Verify GitHub CLI is installed and authenticated
2. Check network connectivity
3. Try discovery workflow instead:

🎯 DISCOVERY WORKFLOW:
1. npm_search_packages "${params.repo}"
2. github_search_topics "${params.repo}"  
3. github_search_repositories query="${params.repo}" owner="${params.owner}"
4. github_get_repository (retry after discovery)

💡 This ensures you have the correct owner/repo before attempting direct access.`)
      );
    }
  });
}
