import { defineConfig } from 'tsdown';
import { builtinModules } from 'module';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
  },
  format: ['esm'],
  outDir: 'scripts',
  clean: true,
  target: 'node18',
  platform: 'node',

  // Keep ts-morph external (it's a large dep, install at runtime)
  external: [
    'ts-morph',
    ...builtinModules,
    ...builtinModules.map((m) => `node:${m}`),
  ],

  // Code splitting disabled for standalone scripts
  splitting: false,

  treeshake: true,
  minify: true,
  shims: true, // ESM shims for __dirname, etc.
  dts: true, // Generate type declarations
  sourcemap: false,

  // Output as index.js
  outExtensions: () => ({ js: '.js' }),

  // Shebang for direct execution
  banner: '#!/usr/bin/env node',

  define: {
    'process.env.NODE_ENV': '"production"',
  },
});
