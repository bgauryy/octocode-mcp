import { defineConfig } from 'vite';
import { builtinModules } from 'module';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const pkg = JSON.parse(readFileSync('./package.json', 'utf-8'));

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  build: {
    target: 'node18',
    outDir: 'dist',
    lib: {
      entry: {
        index: resolve(__dirname, 'src/index.ts'),
        'credentials/index': resolve(__dirname, 'src/credentials/index.ts'),
        'platform/index': resolve(__dirname, 'src/platform/index.ts'),
        'session/index': resolve(__dirname, 'src/session/index.ts'),
      },
      formats: ['es'],
      fileName: (format, entryName) => `${entryName}.js`,
    },
    rollupOptions: {
      external: [
        ...builtinModules,
        ...builtinModules.map((m) => `node:${m}`),
        '@napi-rs/keyring',
        '@octokit/oauth-methods',
        '@octokit/request',
      ],
    },
    minify: false,
    emptyOutDir: true,
  },
});
