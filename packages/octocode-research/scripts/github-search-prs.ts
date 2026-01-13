/**
 * Search GitHub pull requests
 *
 * Usage: npx tsx scripts/github-search-prs.ts <owner/repo> [query] [--merged]
 *
 * Examples:
 *   npx tsx scripts/github-search-prs.ts facebook/react
 *   npx tsx scripts/github-search-prs.ts facebook/react "hooks" --merged
 *
 * Token: Auto-detected from env vars, gh CLI, or octocode storage
 */

import { initialize, getGitHubToken, getTokenSource } from '../src/index.js';
import { searchMultipleGitHubPullRequests } from 'octocode-mcp/public';

const ownerRepo = process.argv[2];
const query =
  process.argv[3] && !process.argv[3].startsWith('--')
    ? process.argv[3]
    : undefined;
const merged = process.argv.includes('--merged');

if (!ownerRepo || !ownerRepo.includes('/')) {
  console.error(
    'Usage: npx tsx scripts/github-search-prs.ts <owner/repo> [query] [--merged]'
  );
  console.error(
    'Example: npx tsx scripts/github-search-prs.ts facebook/react "hooks" --merged'
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

const [owner, repo] = ownerRepo.split('/');

console.log(
  `Searching PRs in ${owner}/${repo}${query ? ` for "${query}"` : ''}${merged ? ' (merged only)' : ''}...\n`
);

const result = await searchMultipleGitHubPullRequests({
  queries: [
    {
      owner,
      repo,
      ...(query && { query }),
      ...(merged && { merged: true, state: 'closed' as const }),
    },
  ],
});

const textContent = result.content.find(c => c.type === 'text');
console.log(textContent?.text ?? JSON.stringify(result, null, 2));
