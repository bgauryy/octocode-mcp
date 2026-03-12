import { defineConfig } from 'vite';
import { builtinModules } from 'module';
import { readFileSync } from 'fs';

const pkg = JSON.parse(readFileSync('./package.json', 'utf-8'));

// Externalize all dependencies — this is a Node.js CLI, not a browser bundle
const externalDeps = [
  ...Object.keys(pkg.dependencies || {}),
  ...Object.keys(pkg.devDependencies || {}),
];

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  build: {
    target: 'node20',
    outDir: 'dist',
    lib: {
      entry: 'src/index.ts',
      formats: ['es'],
      fileName: () => 'octocode-tools.js',
    },
    rollupOptions: {
      external: [
        ...builtinModules,
        ...builtinModules.map(m => `node:${m}`),
        ...externalDeps,
        // Also externalize any transitive imports from octocode-mcp
        /^octocode-/,
        /^@modelcontextprotocol\//,
        /^@octokit\//,
      ],
      output: {
        banner: '#!/usr/bin/env node',
      },
    },
    minify: true,
    emptyOutDir: true,
  },
});
