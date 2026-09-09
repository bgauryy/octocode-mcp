const { spawnSync } = require('node:child_process');

// Resolve the declared compiler dependency through Node, including workspaces
// whose package-manager install did not create a package-local bin shim.
const result = spawnSync(
  process.execPath,
  [require.resolve('typescript/bin/tsc'), '-p', 'tsconfig.build.json'],
  { stdio: 'inherit' }
);
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
