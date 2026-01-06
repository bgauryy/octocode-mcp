import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { builtinModules } from 'module';
import { readFileSync } from 'fs';

const pkg = JSON.parse(readFileSync('./package.json', 'utf-8'));

export default defineConfig({
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  build: {
    target: 'node18',
    outDir: 'out',
    lib: {
      entry: 'src/index.ts',
      formats: ['es'],
      fileName: () => 'octocode-cli.js',
    },
    rollupOptions: {
      external: [
        ...builtinModules,
        ...builtinModules.map((m) => `node:${m}`),
        '@inquirer/prompts',
        'keytar', // Native addon - must be external
        'better-sqlite3', // Native addon - must be external
        'react', // External for ink
        'ink', // Ink runtime
        '@inkjs/ui', // Ink UI components
      ],
      output: {
        banner: '#!/usr/bin/env node',
      },
    },
    minify: false,
    emptyOutDir: true,
  },
});

