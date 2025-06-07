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

## MANDATORY SEARCH STRATEGY
1. **ALWAYS START**: \`search_github_topics\` - **NEVER SKIP** - Maps ecosystem terminology
2. **PRIMARY DISCOVERY**: \`npm_search\` and \`npm_view\` - Minimizes GitHub API calls
3. **TARGETED EXTRACTION**: \`search_github_code\` with owner/repo from NPM
4. **LAST RESORT**: \`search_github_repos\` - Single terms only when NPM insufficient

## Core Workflow
1. **Check Auth**: Read \`github://auth-status\` and \`github://rate-limits\`
2. **MANDATORY**: \`search_github_topics\` for ecosystem mapping
3. **NPM Discovery**: \`npm_search\` → \`npm_view\` → extract repository URLs
4. **Extract**: Get complete implementations from discovered repositories
5. **Validate**: Cross-reference multiple NPM packages

## Essential Tools (Priority Order)
- **\`search_github_topics\`**: **MANDATORY FIRST STEP** - Find technology ecosystems
- **\`npm_search\`**: **PRIMARY DISCOVERY** - Find packages by functionality
- **\`npm_view\`**: **PRIMARY DISCOVERY** - Package metadata and repo links
- **\`view_repository\`**: Get branch info (required before file operations!)
- **\`search_github_code\`**: Find specific implementations in discovered repos
- **\`fetch_github_file_content\`**: Extract complete code
- **\`search_github_repos\`**: **LAST RESORT ONLY** - Single terms when NPM fails

## Search Strategy Rules
- **Topics First**: Every workflow starts with \`search_github_topics\`
- **NPM Primary**: Use NPM tools before GitHub repo search
- **Single Terms Only**: NEVER multi-term searches in \`search_github_repos\`
- **API Conservation**: NPM discovery reduces GitHub API usage by 60%

## Search Term Strategy
- **✅ GOOD**: "react", "authentication", "typescript", "deployment"
- **❌ BAD**: "react hooks", "full-stack app", "react angular auth"
- **Decompose**: "react typescript auth" → ["react", "typescript", "authentication"]

## Quick Examples
- **Package research**: \`search_github_topics\` → \`npm_search\` → \`npm_view\` → \`view_repository\` → \`search_github_code\`
- **Problem solving**: \`search_github_topics\` → \`npm_search\` → \`search_github_issues\` → \`search_github_code\`
- **Technology discovery**: \`search_github_topics\` → \`npm_search\` → \`npm_view\` → \`view_repository\` → \`fetch_github_file_content\`

## CRITICAL REMINDERS
- **NEVER skip** \`search_github_topics\` - provides essential context
- **NPM FIRST** - use NPM tools before GitHub repo search
- **SINGLE TERMS** - never combine multiple concepts in repo searches
- **REPOS LAST** - \`search_github_repos\` is lowest priority discovery tool

Generated: ${new Date().toISOString()}`,
      },
    ],
  }));
}
