import * as esbuild from 'esbuild';
import { builtinModules } from 'module';
import { readFileSync } from 'fs';
import { rm } from 'fs/promises';

const pkg = JSON.parse(readFileSync('./package.json', 'utf-8'));

await rm('out', { recursive: true, force: true });

await esbuild.build({
  entryPoints: ['src/index.ts'],
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'esm',
  outfile: 'out/octocode-cli.js',
  minify: true,
  treeShaking: true,
  banner: { js: '#!/usr/bin/env node' },
  external: [
    ...builtinModules,
    ...builtinModules.map((m) => `node:${m}`),
  ],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  logLevel: 'info',
});

console.log('✓ esbuild complete');
