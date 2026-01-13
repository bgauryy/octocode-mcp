/**
 * View directory structure of a local path
 *
 * Usage: cd packages/octocode-research && npx tsx scripts/view-structure.ts [path] [depth]
 *
 * Examples:
 *   npx tsx scripts/view-structure.ts
 *   npx tsx scripts/view-structure.ts /path/to/project 2
 */

import { executeViewStructure } from 'octocode-mcp/public';

const targetPath = process.argv[2] || process.cwd();
const depth = parseInt(process.argv[3] || '1', 10);

console.log(`Viewing structure of ${targetPath} (depth: ${depth})...\n`);

const result = await executeViewStructure({
  queries: [
    {
      path: targetPath,
      depth,
    },
  ],
} as Parameters<typeof executeViewStructure>[0]);

const textContent = result.content.find(c => c.type === 'text');
console.log(textContent?.text ?? JSON.stringify(result, null, 2));
