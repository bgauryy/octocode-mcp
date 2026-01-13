/**
 * Go to symbol definition using LSP
 *
 * Usage: npx tsx scripts/goto-definition.ts <file-path> <symbol-name> <line-hint>
 *
 * Examples:
 *   npx tsx scripts/goto-definition.ts ./src/index.ts myFunction 10
 *   npx tsx scripts/goto-definition.ts /project/src/app.ts UserService 25
 */

import { executeGotoDefinition } from 'octocode-mcp/public';
import { resolve } from 'path';

const filePath = process.argv[2];
const symbolName = process.argv[3];
const lineHint = parseInt(process.argv[4] || '1', 10);

if (!filePath || !symbolName) {
  console.error(
    'Usage: npx tsx scripts/goto-definition.ts <file-path> <symbol-name> <line-hint>'
  );
  console.error(
    'Example: npx tsx scripts/goto-definition.ts ./src/index.ts myFunction 10'
  );
  process.exit(1);
}

const absolutePath = resolve(filePath);

console.log(`Finding definition of "${symbolName}" at line ${lineHint}...\n`);

const result = await executeGotoDefinition({
  queries: [
    {
      uri: absolutePath,
      symbolName,
      lineHint,
    },
  ],
} as Parameters<typeof executeGotoDefinition>[0]);

const textContent = result.content.find(c => c.type === 'text');
console.log(textContent?.text ?? JSON.stringify(result, null, 2));
