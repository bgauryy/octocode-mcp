import { CallToolResult } from '@modelcontextprotocol/sdk/types';
import { executeGitHubCommand } from '../../utils/exec';
import { generateCacheKey, withCache } from '../../utils/cache';
import { GithubFetchRequestParams } from '../../types';
import { createErrorResult, createSuccessResult } from '../util';

export async function fetchGitHubFileContent(
  params: GithubFetchRequestParams
): Promise<CallToolResult> {
  const cacheKey = generateCacheKey('gh-file-content', params);

  return withCache(cacheKey, async () => {
    try {
      let apiPath = `/repos/${params.owner}/${params.repo}/contents/${params.filePath}`;

      // Add ref parameter if branch is provided
      if (params.branch) {
        apiPath += `?ref=${params.branch}`;
      }

      const args = [apiPath, '--jq', '.content'];
      const result = await executeGitHubCommand('api', args, { cache: false });

      if (result.isError) {
        // Parse the error message to provide better context
        const errorMsg = result.content[0].text as string;

        // Handle common GitHub API errors
        if (errorMsg.includes('404') || errorMsg.includes('Not Found')) {
          return createErrorResult(
            `File not found: ${params.filePath}`,
            new Error(`
❌ FILE NOT FOUND: The file '${params.filePath}' does not exist in ${params.owner}/${params.repo}${params.branch ? ` on branch '${params.branch}'` : ''}.

🔍 COMMON CAUSES:
• File path is incorrect or has changed
• Branch '${params.branch || 'default'}' doesn't contain this file
• File may exist in a different directory

💡 RECOMMENDED ACTIONS:
1. Use 'github_get_contents' to explore repository structure first
2. Use 'github_search_code' to find files by name or pattern
3. Verify the branch contains the expected files

📍 SEARCH ALTERNATIVES:
• Search for filename: query="${params.filePath.split('/').pop()}"
• Search in repository: repo:${params.owner}/${params.repo}
• Explore repository structure starting from root`)
          );
        }

        if (errorMsg.includes('403') || errorMsg.includes('Forbidden')) {
          return createErrorResult(
            `Access denied to file: ${params.filePath}`,
            new Error(`
🔒 ACCESS DENIED: You don't have permission to access '${params.filePath}' in ${params.owner}/${params.repo}.

🔍 POSSIBLE CAUSES:
• Repository is private and you lack access
• File is in a protected branch
• Organization restrictions apply

💡 RECOMMENDED ACTIONS:
1. Check if you're authenticated: gh auth status
2. Request repository access from owner
3. Use 'github_get_user_organizations' if this is your organization`)
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
3. Try searching for content instead of direct file access`)
          );
        }

        // Generic error fallback
        return createErrorResult(
          `Failed to fetch file content: ${params.filePath}`,
          new Error(`GitHub API Error: ${errorMsg}

🔧 TROUBLESHOOTING:
• Verify repository exists: ${params.owner}/${params.repo}
• Check file path: ${params.filePath}
• Confirm branch: ${params.branch || 'default'}
• Use repository exploration tools first`)
        );
      }

      // Extract the actual content from the exec result
      const execResult = JSON.parse(result.content[0].text as string);
      const base64Content = execResult.result.trim().replace(/\n/g, '');

      // Validate base64 content
      if (!base64Content || base64Content === 'null') {
        return createErrorResult(
          `Empty or invalid file content: ${params.filePath}`,
          new Error(`
📄 EMPTY FILE: The file '${params.filePath}' exists but contains no content or returned invalid data.

🔍 POSSIBLE CAUSES:
• File is empty or binary
• API returned null content
• File is too large for API response

💡 ALTERNATIVES:
• Use 'github_search_code' to find content by pattern
• Check file in GitHub web interface
• Try accessing a different file in the same directory`)
        );
      }

      // Decode base64 content using Node.js Buffer
      let decodedContent: string;
      try {
        decodedContent = Buffer.from(base64Content, 'base64').toString('utf-8');
      } catch (decodeError) {
        return createErrorResult(
          `Failed to decode file content: ${params.filePath}`,
          new Error(`
🔧 DECODE ERROR: Unable to decode base64 content from GitHub API.

📋 DETAILS: ${(decodeError as Error).message}

💡 POSSIBLE CAUSES:
• File contains binary data
• Corrupted response from API
• Encoding mismatch

🔍 ALTERNATIVES:
• Use 'github_search_code' to find text-based content
• Check if file is binary (images, executables, etc.)
• Try accessing a different version of the file`)
        );
      }

      return createSuccessResult({
        filePath: params.filePath,
        owner: params.owner,
        repo: params.repo,
        branch: params.branch,
        content: decodedContent,
        size: decodedContent.length,
        encoding: 'utf-8',
      });
    } catch (error) {
      return createErrorResult(
        `Unexpected error fetching file content: ${params.filePath}`,
        new Error(`
❌ UNEXPECTED ERROR: ${(error as Error).message}

📍 FILE DETAILS:
• Repository: ${params.owner}/${params.repo}
• File: ${params.filePath}
• Branch: ${params.branch || 'default'}

🔧 TROUBLESHOOTING STEPS:
1. Verify repository exists with 'github_get_repository'
2. Explore structure with 'github_get_contents'
3. Search for file with 'github_search_code'
4. Check GitHub authentication: gh auth status

💡 WORKFLOW RECOMMENDATION:
github_get_repository → github_get_contents → github_search_code → github_get_file_content`)
      );
    }
  });
}
