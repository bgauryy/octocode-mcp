import { defineConfig } from 'tsdown';
import { builtinModules } from 'module';

// Main server entry - single bundled CLI file
const serverConfig = defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  outDir: 'dist',
  clean: true,
  target: 'node18',
  platform: 'node',

  // Configure .md files to be loaded as raw text
  inputOptions: {
    moduleTypes: {
      '.md': 'text',
    },
  },

  // Bundle ALL dependencies for standalone CLI execution
  noExternal: [/.*/],
  // Keep Node.js built-ins external
  external: [...builtinModules, ...builtinModules.map(m => `node:${m}`)],

  // Inline dynamic imports for single file output
  outputOptions: {
    inlineDynamicImports: true,
  },

  treeshake: true,
  minify: true,
  shims: true,

  // No type declarations - will use tsc separately
  dts: false,

  // NO sourcemaps
  sourcemap: false,

  outExtensions: () => ({ js: '.js' }),

  // Shebang for CLI execution
  banner: '#!/usr/bin/env node',

  define: {
    'process.env.NODE_ENV': '"production"',
  },
});

export default serverConfig;
