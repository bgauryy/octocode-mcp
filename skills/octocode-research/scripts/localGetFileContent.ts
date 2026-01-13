/**
 * Read local file content
 *
 * Usage: npx tsx scripts/get-file.ts <file-path> [match-string]
 *
 * Examples:
 *   npx tsx scripts/get-file.ts ./src/index.ts
 *   npx tsx scripts/get-file.ts ./src/index.ts "export"
 */

import { executeFetchContent } from 'octocode-mcp/public';

const filePath = process.argv[2];
const matchString = process.argv[3];

if (!filePath) {
  console.error('Usage: npx tsx scripts/get-file.ts <file-path> [match-string]');
  console.error('Example: npx tsx scripts/get-file.ts ./src/index.ts "export"');
  process.exit(1);
}

console.log(
  `Reading ${filePath}${matchString ? ` (matching "${matchString}")` : ''}...\n`
);

const result = await executeFetchContent({
  queries: [
    {
      path: filePath,
      ...(matchString ? { matchString } : { fullContent: true }),
    },
  ],
} as Parameters<typeof executeFetchContent>[0]);

const textContent = result.content.find(c => c.type === 'text');
console.log(textContent?.text ?? JSON.stringify(result, null, 2));
