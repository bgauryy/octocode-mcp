import { defineConfig } from 'tsdown';
import { builtinModules } from 'module';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  outDir: 'dist',
  clean: true,
  target: 'node18',
  platform: 'node',

  // Bundle ALL dependencies for standalone CLI execution
  noExternal: [/.*/],
  // Keep Node.js built-ins external (they're always available)
  external: [...builtinModules, ...builtinModules.map((m) => `node:${m}`)],

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
