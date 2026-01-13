/**
 * Find all references to a symbol using LSP
 *
 * Usage: npx tsx scripts/find-references.ts <file-path> <symbol-name> <line-hint>
 *
 * Examples:
 *   npx tsx scripts/find-references.ts ./src/index.ts UserConfig 5
 *   npx tsx scripts/find-references.ts /project/src/types.ts MyInterface 10
 */

import { executeFindReferences } from 'octocode-mcp/public';
import { resolve } from 'path';

const filePath = process.argv[2];
const symbolName = process.argv[3];
const lineHint = parseInt(process.argv[4] || '1', 10);

if (!filePath || !symbolName) {
  console.error(
    'Usage: npx tsx scripts/find-references.ts <file-path> <symbol-name> <line-hint>'
  );
  console.error(
    'Example: npx tsx scripts/find-references.ts ./src/index.ts UserConfig 5'
  );
  process.exit(1);
}

const absolutePath = resolve(filePath);

console.log(`Finding references to "${symbolName}" at line ${lineHint}...\n`);

const result = await executeFindReferences({
  queries: [
    {
      uri: absolutePath,
      symbolName,
      lineHint,
    },
  ],
} as Parameters<typeof executeFindReferences>[0]);

const textContent = result.content.find(c => c.type === 'text');
console.log(textContent?.text ?? JSON.stringify(result, null, 2));
