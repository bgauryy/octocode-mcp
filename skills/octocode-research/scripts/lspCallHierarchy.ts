/**
 * Trace function call hierarchy using LSP
 *
 * Usage: npx tsx scripts/call-hierarchy.ts <file-path> <function-name> <line-hint> [incoming|outgoing]
 *
 * Examples:
 *   npx tsx scripts/call-hierarchy.ts ./src/index.ts processRequest 42 incoming
 *   npx tsx scripts/call-hierarchy.ts /project/src/service.ts handleAuth 15 outgoing
 */

import { executeCallHierarchy } from 'octocode-mcp/public';
import { resolve } from 'path';

const filePath = process.argv[2];
const symbolName = process.argv[3];
const lineHint = parseInt(process.argv[4] || '1', 10);
const direction = (process.argv[5] || 'incoming') as 'incoming' | 'outgoing';

if (!filePath || !symbolName) {
  console.error(
    'Usage: npx tsx scripts/call-hierarchy.ts <file-path> <function-name> <line-hint> [incoming|outgoing]'
  );
  console.error(
    'Example: npx tsx scripts/call-hierarchy.ts ./src/index.ts processRequest 42 incoming'
  );
  process.exit(1);
}

const absolutePath = resolve(filePath);

console.log(
  `Finding ${direction} calls for "${symbolName}" at line ${lineHint}...\n`
);

const result = await executeCallHierarchy({
  queries: [
    {
      uri: absolutePath,
      symbolName,
      lineHint,
      direction,
    },
  ],
} as Parameters<typeof executeCallHierarchy>[0]);

const textContent = result.content.find(c => c.type === 'text');
console.log(textContent?.text ?? JSON.stringify(result, null, 2));
