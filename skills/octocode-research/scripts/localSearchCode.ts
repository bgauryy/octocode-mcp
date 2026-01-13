/**
 * Search local codebase for patterns
 *
 * Usage: cd packages/octocode-research && npx tsx scripts/search-local.ts <pattern> [path]
 *
 * Examples:
 *   npx tsx scripts/search-local.ts "export function" ./src
 *   npx tsx scripts/search-local.ts "TODO" /path/to/project
 */

import { executeRipgrepSearch } from 'octocode-mcp/public';

const pattern = process.argv[2];
const searchPath = process.argv[3] || process.cwd();

if (!pattern) {
  console.error('Usage: npx tsx scripts/search-local.ts <pattern> [path]');
  console.error(
    'Example: npx tsx scripts/search-local.ts "export function" ./src'
  );
  process.exit(1);
}

console.log(`Searching for "${pattern}" in ${searchPath}...\n`);

const result = await executeRipgrepSearch({
  queries: [
    {
      pattern,
      path: searchPath,
    },
  ],
} as Parameters<typeof executeRipgrepSearch>[0]);

const textContent = result.content.find(c => c.type === 'text');
console.log(textContent?.text ?? JSON.stringify(result, null, 2));
