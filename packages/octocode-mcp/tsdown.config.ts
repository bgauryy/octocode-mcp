import { defineConfig, type UserConfig } from 'tsdown';
import { builtinModules } from 'module';

// Keep Node.js built-ins external (not bundled)
const nodeBuiltins = [
  ...builtinModules,
  ...builtinModules.map(m => `node:${m}`),
];

// Shared configuration for all entry points
const baseConfig: UserConfig = {
  format: ['esm'],
  outDir: 'dist',
  target: 'node18',
  platform: 'node',

  // Bundle ALL dependencies for standalone execution
  noExternal: [/.*/],
  external: nodeBuiltins,

  // Single file output (no code-splitting)
  outputOptions: {
    inlineDynamicImports: true,
  },

  treeshake: true,
  minify: true,
  shims: true, // ESM shims for __dirname, require, etc.
  dts: false, // Types generated separately via tsc
  sourcemap: false,
  outExtensions: () => ({ js: '.js' }),

  define: {
    'process.env.NODE_ENV': '"production"',
  },
};

// Main CLI entry - standalone executable
const mainConfig = defineConfig({
  ...baseConfig,
  entry: { index: 'src/index.ts' },
  clean: true,
  inputOptions: {
    moduleTypes: {
      '.md': 'text', // Load .md files as raw text
    },
  },
  banner: '#!/usr/bin/env node',
});

// Public API for library consumers
const publicConfig = defineConfig({
  ...baseConfig,
  entry: { public: 'src/public.ts' },
  clean: false, // Don't clean - main build already did
  sourcemap: true,
});

export default [mainConfig, publicConfig];
