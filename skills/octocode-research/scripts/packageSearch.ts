/**
 * Look up npm or Python package information
 *
 * Usage: cd packages/octocode-research && npx tsx scripts/lookup-package.ts <package-name> [npm|python]
 *
 * Examples:
 *   npx tsx scripts/lookup-package.ts express
 *   npx tsx scripts/lookup-package.ts requests python
 */

import { searchPackages } from 'octocode-mcp/public';

const packageName = process.argv[2];
const ecosystem = (process.argv[3] || 'npm') as 'npm' | 'python';

if (!packageName) {
  console.error(
    'Usage: npx tsx scripts/lookup-package.ts <package-name> [npm|python]'
  );
  console.error('Example: npx tsx scripts/lookup-package.ts express');
  process.exit(1);
}

console.log(`Looking up ${ecosystem} package "${packageName}"...\n`);

const result = await searchPackages({
  queries: [
    {
      name: packageName,
      ecosystem,
    },
  ],
});

console.log(JSON.stringify(result, null, 2));
