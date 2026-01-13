/**
 * Read file content from GitHub repository
 *
 * Usage: npx tsx scripts/github-get-file.ts <owner/repo> <file-path> [match-string]
 *
 * Examples:
 *   npx tsx scripts/github-get-file.ts facebook/react README.md
 *   npx tsx scripts/github-get-file.ts facebook/react packages/react/src/React.js "export"
 *
 * Token: Auto-detected from env vars, gh CLI, or octocode storage
 */

import { initialize, getGitHubToken, getTokenSource } from '../src/index.js';
import { fetchMultipleGitHubFileContents } from 'octocode-mcp/public';

const ownerRepo = process.argv[2];
const filePath = process.argv[3];
const matchString = process.argv[4];

if (!ownerRepo || !ownerRepo.includes('/') || !filePath) {
  console.error(
    'Usage: npx tsx scripts/github-get-file.ts <owner/repo> <file-path> [match-string]'
  );
  console.error(
    'Example: npx tsx scripts/github-get-file.ts facebook/react README.md'
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
  `Reading ${owner}/${repo}/${filePath}${matchString ? ` (matching "${matchString}")` : ''}...\n`
);

const result = await fetchMultipleGitHubFileContents({
  queries: [
    {
      owner,
      repo,
      path: filePath,
      ...(matchString ? { matchString } : { fullContent: true }),
    },
  ],
});

const textContent = result.content.find(c => c.type === 'text');
console.log(textContent?.text ?? JSON.stringify(result, null, 2));
