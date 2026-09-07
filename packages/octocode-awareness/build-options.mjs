import { builtinModules } from 'node:module';

export const nodeExternals = [...builtinModules, ...builtinModules.map((name) => `node:${name}`)];
export const baseOptions = {
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  external: nodeExternals,
  // Bundled Git dependencies contain CommonJS calls to Node builtins. Every
  // split chunk and standalone hook needs its own ESM-compatible require.
  banner: { js: "import { createRequire as __awarenessCreateRequire } from 'node:module'; const require = __awarenessCreateRequire(import.meta.url);" },
  sourcemap: false,
  treeShaking: true,
  logLevel: 'info',
};
