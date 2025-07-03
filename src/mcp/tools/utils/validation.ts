/**
 * Shared validation utilities for MCP tools
 * Centralized validation logic to reduce duplication across tools
 */

/**
 * Extracts owner/repo from various query formats
 * Handles: owner/repo, https://github.com/owner/repo, github.com/owner/repo
 */
export function extractOwnerRepoFromQuery(query: string): {
  owner?: string;
  repo?: string;
  remainingQuery?: string;
} {
  // Try to extract GitHub URL patterns
  const urlPatterns = [
    /(?:https?:\/\/)?(?:www\.)?github\.com\/([^/]+)\/([^/\s]+)/i,
    /\bgithub\.com\/([^/]+)\/([^/\s]+)/i,
    /^([^/\s]+)\/([^/\s]+)$/,
  ];

  for (const pattern of urlPatterns) {
    const match = query.match(pattern);
    if (match) {
      const [fullMatch, owner, repo] = match;
      const remainingQuery = query.replace(fullMatch, '').trim();

      return {
        owner: owner.replace(/\.git$/, ''),
        repo: repo.replace(/\.git$/, ''),
        remainingQuery: remainingQuery || undefined,
      };
    }
  }

  // Try to find owner/repo pattern in the middle of query
  const inlinePattern = /\b([a-zA-Z0-9-]+)\/([a-zA-Z0-9-]+)\b/;
  const match = query.match(inlinePattern);

  if (match) {
    const [fullMatch, owner, repo] = match;
    const remainingQuery = query.replace(fullMatch, '').trim();

    return {
      owner,
      repo,
      remainingQuery: remainingQuery || undefined,
    };
  }

  return {};
}

/**
 * Creates a standardized tool suggestion message
 */
export function createToolSuggestion(
  currentTool: string,
  suggestedTools: Array<{ tool: string; reason: string }>
): string {
  if (suggestedTools.length === 0) {
    return '';
  }

  const suggestions = suggestedTools
    .map(({ tool, reason }) => `• Use ${tool} ${reason}`)
    .join('\n');

  return `\n\nCurrent tool: ${currentTool}\nAlternative tools:\n${suggestions}`;
}
