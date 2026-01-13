/**
 * Find files by name, type, or metadata
 *
 * Usage: npx tsx scripts/find-files.ts <path> [name-pattern]
 *
 * Examples:
 *   npx tsx scripts/find-files.ts .
 *   npx tsx scripts/find-files.ts /project "*.ts"
 *   npx tsx scripts/find-files.ts ./src "*.test.ts"
 */

import { executeFindFiles } from 'octocode-mcp/public';

const targetPath = process.argv[2] || process.cwd();
const namePattern = process.argv[3];

console.log(
  `Finding files in ${targetPath}${namePattern ? ` matching "${namePattern}"` : ''}...\n`
);

const result = await executeFindFiles({
  queries: [
    {
      path: targetPath,
      ...(namePattern && { name: namePattern }),
    },
  ],
} as Parameters<typeof executeFindFiles>[0]);

const textContent = result.content.find(c => c.type === 'text');
console.log(textContent?.text ?? JSON.stringify(result, null, 2));
