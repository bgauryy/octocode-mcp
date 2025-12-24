import { defineConfig } from 'tsup';
import { builtinModules } from 'module';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  target: 'node20',
  platform: 'node',
  outDir: 'dist',
  clean: true,
  dts: false, // Generate declarations separately via tsc to avoid memory issues
  minify: true,
  splitting: false,
  sourcemap: false,
  treeshake: true,
  shims: true, // Enable CJS/ESM interop shims for dynamic require
  noExternal: [/.*/], // Bundle all dependencies for standalone execution
  external: [...builtinModules, ...builtinModules.map(m => `node:${m}`)],
  banner: {
    js: `#!/usr/bin/env node
import { createRequire } from 'module';
const require = createRequire(import.meta.url);`,
  },
  esbuildOptions(options) {
    options.drop = ['debugger'];
    // Keep console for MCP stdio communication
  },
});
