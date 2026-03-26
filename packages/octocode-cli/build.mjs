import * as esbuild from 'esbuild';
import { readFileSync } from 'fs';
import { rm } from 'fs/promises';

const pkg = JSON.parse(readFileSync('./package.json', 'utf-8'));

await rm('out', { recursive: true, force: true });

await esbuild.build({
  entryPoints: ['src/index.ts'],
  bundle: true,
  platform: 'node',
  target: 'node18',
  format: 'esm',
  outfile: 'out/octocode-cli.js',
  minify: true,
  treeShaking: true,
  banner: { js: '#!/usr/bin/env node' },
  external: [
    '@inquirer/prompts',
    '@octokit/oauth-methods',
    '@octokit/request',
    'open',
  ],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  logLevel: 'info',
});

console.log('✓ esbuild complete');
