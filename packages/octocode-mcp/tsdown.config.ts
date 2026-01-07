import { defineConfig } from 'tsdown';
import { builtinModules } from 'module';

// Main server entry - bundled CLI with no types
const serverConfig = defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  outDir: 'dist',
  clean: true,
  target: 'node18',
  platform: 'node',

  // Configure .md files to be loaded as raw text (like esbuild's loader option)
  // This allows importing markdown files as strings for prompts
  inputOptions: {
    moduleTypes: {
      '.md': 'text',
    },
  },

  // Bundle ALL dependencies for standalone CLI execution
  noExternal: [/.*/],
  // Keep Node.js built-ins and native modules external
  external: [
    ...builtinModules,
    ...builtinModules.map(m => `node:${m}`),
    'keytar', // Native module - cannot be bundled
  ],

  // Tree shaking - Rolldown has excellent tree shaking by default
  treeshake: true,

  // Minification
  minify: true,

  // ESM shims for __dirname, __filename, require (handled by tsdown)
  shims: true,

  // No type declarations needed for CLI
  dts: false,

  // No sourcemaps for production bundle
  sourcemap: false,

  // Output as .js for ESM (package.json has "type": "module")
  outExtensions: () => ({ js: '.js' }),

  // Shebang for CLI execution
  banner: '#!/usr/bin/env node',

  // Remove debugger statements and set production mode
  define: {
    'process.env.NODE_ENV': '"production"',
  },
});

// Public API entry - exports types and utilities for package consumers
const publicConfig = defineConfig({
  entry: ['src/public.ts'],
  format: ['esm'],
  outDir: 'dist',
  clean: false, // Don't clean - server build runs first
  target: 'node18',
  platform: 'node',

  // Bundle dependencies for standalone use
  noExternal: [/.*/],
  external: [
    ...builtinModules,
    ...builtinModules.map(m => `node:${m}`),
    'keytar', // Native module - cannot be bundled
  ],

  treeshake: true,
  minify: true,
  shims: true,

  // Generate type declarations for public API
  dts: true,

  sourcemap: false,
  outExtensions: () => ({ js: '.js' }),

  define: {
    'process.env.NODE_ENV': '"production"',
  },
});

export default [serverConfig, publicConfig];
