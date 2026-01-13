/**
 * View GitHub repository structure
 *
 * Usage: npx tsx scripts/github-view-repo.ts <owner/repo> [path] [branch]
 *
 * Examples:
 *   npx tsx scripts/github-view-repo.ts facebook/react
 *   npx tsx scripts/github-view-repo.ts facebook/react packages main
 *
 * Token: Auto-detected from env vars, gh CLI, or octocode storage
 */

import { initialize, getGitHubToken, getTokenSource } from '../src/index.js';
import { exploreMultipleRepositoryStructures } from 'octocode-mcp/public';

const ownerRepo = process.argv[2];
const path = process.argv[3] || '';
const branch = process.argv[4] || 'main';

if (!ownerRepo || !ownerRepo.includes('/')) {
  console.error(
    'Usage: npx tsx scripts/github-view-repo.ts <owner/repo> [path] [branch]'
  );
  console.error('Example: npx tsx scripts/github-view-repo.ts facebook/react');
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
  `Viewing ${owner}/${repo}${path ? `/${path}` : ''} (branch: ${branch})...\n`
);

const result = await exploreMultipleRepositoryStructures({
  queries: [
    {
      owner,
      repo,
      branch,
      path,
    },
  ],
});

const textContent = result.content.find(c => c.type === 'text');
console.log(textContent?.text ?? JSON.stringify(result, null, 2));
