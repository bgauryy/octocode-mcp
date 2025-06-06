import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

export function registerGithubStatusResource(server: McpServer) {
  server.resource('github-status', 'github://status', async uri => ({
    contents: [
      {
        uri: uri.href,
        mimeType: 'application/json',
        text: JSON.stringify(
          {
            status: 'GitHub API integration via CLI',
            authentication: 'Required (gh auth login)',
            rate_limit: 'Inherited from gh CLI',
            cache: '5 minute TTL',
            timestamp: new Date().toISOString(),
          },
          null,
          2
        ),
      },
    ],
  }));
}
