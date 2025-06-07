import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

export function registerUsageGuideResource(server: McpServer) {
  server.resource('usage-guide', 'help://usage', async uri => ({
    contents: [
      {
        uri: uri.href,
        mimeType: 'text/markdown',
        text: `# Octocode MCP Usage Guide

## Quick Start
1. Authenticate Github CLI: \`gh auth login\`

## Best Practices
- Use specific search terms for better results
- Combine multiple tools for comprehensive analysis
- Check repository structure before fetching files
- Use organization filters for private repos
- Deep dive using several prompts

## Tool Categories
- **Search Tools**: Find repositories, code, issues, PRs
- **Content Tools**: Fetch files, view repo structure
- **npm Tools**: Search packages, view package info

Generated: ${new Date().toISOString()}`,
      },
    ],
  }));
}
