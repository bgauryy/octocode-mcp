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
  noExternal: [/.*/], // Bundle all dependencies for standalone execution
  external: [...builtinModules, ...builtinModules.map(m => `node:${m}`)],
  banner: {
    js: '#!/usr/bin/env node',
  },
  esbuildOptions(options) {
    options.drop = ['debugger'];
    // Keep console for MCP stdio communication
  },
});
