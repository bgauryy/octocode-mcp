/**
 * Search GitHub repositories for code patterns
 *
 * Usage: npx tsx scripts/github-search-code.ts <keywords> [owner/repo]
 *
 * Examples:
 *   npx tsx scripts/github-search-code.ts "useState hook"
 *   npx tsx scripts/github-search-code.ts "authentication" facebook/react
 *
 * Token: Auto-detected from env vars, gh CLI, or octocode storage
 */

import { initialize, getGitHubToken, getTokenSource } from '../src/index.js';
import { searchMultipleGitHubCode } from 'octocode-mcp/public';

const keywords = process.argv[2];
const ownerRepo = process.argv[3];

if (!keywords) {
  console.error(
    'Usage: npx tsx scripts/github-search-code.ts <keywords> [owner/repo]'
  );
  console.error(
    'Example: npx tsx scripts/github-search-code.ts "useState" facebook/react'
  );
  process.exit(1);
}

// Initialize and get token
await initialize();
const token = await getGitHubToken();

if (!token) {
  const source = await getTokenSource();
  console.error(`Error: No GitHub token found (source: ${source})`);
  console.error('Set GITHUB_TOKEN env var or login with: gh auth login');
  process.exit(1);
}

const tokenSource = await getTokenSource();
console.log(`Using token from: ${tokenSource}`);

const [owner, repo] = ownerRepo?.split('/') ?? [];

console.log(
  `Searching GitHub for "${keywords}"${ownerRepo ? ` in ${ownerRepo}` : ''}...\n`
);

const result = await searchMultipleGitHubCode({
  queries: [
    {
      keywordsToSearch: keywords.split(' '),
      ...(owner && { owner }),
      ...(repo && { repo }),
    },
  ],
});

const textContent = result.content.find(c => c.type === 'text');
console.log(textContent?.text ?? JSON.stringify(result, null, 2));
