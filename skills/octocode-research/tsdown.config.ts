import { defineConfig } from 'tsdown';
import { builtinModules } from 'module';

export default defineConfig({
  entry: { server: 'src/server.ts' },
  format: ['esm'],
  outDir: 'scripts',
  clean: true,
  target: 'node20',
  platform: 'node',

  // Bundle ALL dependencies for standalone execution
  noExternal: [/.*/],

  // Keep Node.js built-ins and native modules external
  external: [
    ...builtinModules,
    ...builtinModules.map((m) => `node:${m}`),
  ],

  // Single file output
  outputOptions: {
    inlineDynamicImports: true,
  },

  treeshake: true,
  minify: true,
  shims: true, // ESM shims for __dirname, etc.
  dts: true, // Generate type declarations (crucial for TypeScript consumers)
  sourcemap: false,

  // Output as server.js
  outExtensions: () => ({ js: '.js' }),

  // Shebang for direct execution
  banner: '#!/usr/bin/env node',

  define: {
    'process.env.NODE_ENV': '"production"',
  },
});
