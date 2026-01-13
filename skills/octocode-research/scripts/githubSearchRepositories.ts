/**
 * Search GitHub repositories
 *
 * Usage: npx tsx scripts/github-search-repos.ts <keywords> [--topics]
 *
 * Examples:
 *   npx tsx scripts/github-search-repos.ts "react state management"
 *   npx tsx scripts/github-search-repos.ts "typescript cli" --topics
 *
 * Token: Auto-detected from env vars, gh CLI, or octocode storage
 */

import { initialize, getGitHubToken, getTokenSource } from '../src/index.js';
import { searchMultipleGitHubRepos } from 'octocode-mcp/public';

const keywords = process.argv[2];
const useTopics = process.argv.includes('--topics');

if (!keywords) {
  console.error(
    'Usage: npx tsx scripts/github-search-repos.ts <keywords> [--topics]'
  );
  console.error('Example: npx tsx scripts/github-search-repos.ts "react hooks"');
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
console.log(`Searching GitHub repos for "${keywords}"...\n`);

const result = await searchMultipleGitHubRepos({
  queries: [
    useTopics
      ? { topicsToSearch: keywords.split(' ') }
      : { keywordsToSearch: keywords.split(' ') },
  ],
});

const textContent = result.content.find(c => c.type === 'text');
console.log(textContent?.text ?? JSON.stringify(result, null, 2));
