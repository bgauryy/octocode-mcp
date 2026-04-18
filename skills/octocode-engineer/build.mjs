import * as esbuild from 'esbuild';
import { rm } from 'fs/promises';

await rm('scripts', { recursive: true, force: true });

const NATIVE_EXTERNALS = [
  '@ast-grep/napi',
  '@ast-grep/lang-python',
  'tree-sitter',
  'tree-sitter-typescript',
  'tree-sitter-python',
];

const ESM_REQUIRE_SHIM =
  "import{createRequire as __cjsCreateRequire}from'node:module';" +
  "import{fileURLToPath as __esmFileURL}from'node:url';" +
  "import __esmPath from'node:path';" +
  "const require=__cjsCreateRequire(import.meta.url);" +
  "const __filename=__esmFileURL(import.meta.url);" +
  "const __dirname=__esmPath.dirname(__filename);";

const sharedOptions = {
  bundle: true,
  splitting: false,
  platform: 'node',
  target: 'node18',
  format: 'esm',
  outdir: 'scripts',
  minify: true,
  treeShaking: true,
  external: NATIVE_EXTERNALS,
  banner: { js: ESM_REQUIRE_SHIM },
  logLevel: 'info',
};

await esbuild.build({
  ...sharedOptions,
  entryPoints: {
    run: 'src/run.ts',
    'ast/search': 'src/ast/search.ts',
    'ast/tree-search': 'src/ast/tree-search.ts',
  },
});

console.log('✓ esbuild complete');
