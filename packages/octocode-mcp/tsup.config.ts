import { defineConfig } from 'tsup';
import { builtinModules } from 'module';
import fs from 'node:fs/promises';
import path from 'node:path';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['cjs'],
  target: 'node20',
  platform: 'node',
  outDir: 'dist',
  outExtension: () => ({ js: '.js' }),
  async onSuccess() {
    // Create package.json in dist to override parent's "type": "module"
    await fs.writeFile(
      path.resolve('dist', 'package.json'),
      '{"type": "commonjs"}'
    );
  },
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
