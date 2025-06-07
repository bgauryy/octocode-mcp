import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

export function registerUsageGuideResource(server: McpServer) {
  server.resource('usage-guide', 'help://usage', async uri => ({
    contents: [
      {
        uri: uri.href,
        mimeType: 'text/markdown',
        text: `# Octocode MCP Quick Start

## Setup (Required)
\`\`\`bash
gh auth login  # GitHub CLI authentication
\`\`\`

## Core Workflow
1. **Check Auth**: Read \`github://auth-status\` and \`github://rate-limits\`
2. **Discover**: Use topics → repositories → code progression  
3. **Extract**: Get complete implementations, not just descriptions
4. **Validate**: Cross-reference multiple sources

## Essential Tools
- **\`search_github_topics\`**: Find technology ecosystems
- **\`search_github_repos\`**: Discover quality projects
- **\`view_repository\`**: Get branch info (required first!)
- **\`search_github_code\`**: Find specific implementations
- **\`fetch_github_file_content\`**: Extract complete code
- **\`npm_view\`**: Package metadata and repo links

## Search Strategy
- Start broad → narrow down
- Use language filters early
- Check rate limits before intensive operations
- Extract working code, not just descriptions

## Quick Examples
- Package research: \`npm_view\` → \`view_repository\` → \`search_github_code\`
- Problem solving: \`search_github_topics\` → \`search_github_issues\` → \`search_github_code\`
- Code discovery: \`search_github_repos\` → \`view_repository\` → \`fetch_github_file_content\`

Generated: ${new Date().toISOString()}`,
      },
    ],
  }));
}
