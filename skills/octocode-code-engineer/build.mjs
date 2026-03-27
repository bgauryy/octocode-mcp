import * as esbuild from 'esbuild';
import { rm } from 'fs/promises';

await rm('scripts', { recursive: true, force: true });

const sharedOptions = {
  bundle: true,
  splitting: false,
  platform: 'node',
  target: 'node18',
  format: 'esm',
  outdir: 'scripts',
  minify: true,
  treeShaking: true,
  packages: 'external',
  logLevel: 'info',
};

await esbuild.build({
  ...sharedOptions,
  entryPoints: {
    run: 'src/run.ts',
    index: 'src/index.ts',
    'ast/search': 'src/ast/search.ts',
    'ast/tree-search': 'src/ast/tree-search.ts',
  },
});

console.log('✓ esbuild complete');
