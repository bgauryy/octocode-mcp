const typescript = require('@rollup/plugin-typescript');
const { nodeResolve } = require('@rollup/plugin-node-resolve');
const dts = require('rollup-plugin-dts').default;
const { readFileSync } = require('fs');

const pkg = JSON.parse(readFileSync('./package.json', 'utf8'));

const external = [
  ...Object.keys(pkg.dependencies || {}),
  ...Object.keys(pkg.peerDependencies || {}),
];

module.exports = [
  // JavaScript build
  {
    input: 'src/index.ts',
    output: [
      {
        file: 'dist/index.js',
        format: 'cjs',
        sourcemap: true,
      },
      {
        file: 'dist/index.mjs',
        format: 'es',
        sourcemap: true,
      },
    ],
    external,
    plugins: [
      nodeResolve(),
      typescript({
        tsconfig: './tsconfig.json',
        declaration: false,
        declarationMap: false,
      }),
    ],
  },
  // Individual export for jsonToLLMString
  {
    input: 'src/jsonToLLMString.ts',
    output: [
      {
        file: 'dist/jsonToLLMString.js',
        format: 'cjs',
        sourcemap: true,
      },
      {
        file: 'dist/jsonToLLMString.mjs',
        format: 'es',
        sourcemap: true,
      },
    ],
    external,
    plugins: [
      nodeResolve(),
      typescript({
        tsconfig: './tsconfig.json',
        declaration: false,
        declarationMap: false,
      }),
    ],
  },
  // Individual export for minifier
  {
    input: 'src/minifier.ts',
    output: [
      {
        file: 'dist/minifier.js',
        format: 'cjs',
        sourcemap: true,
      },
      {
        file: 'dist/minifier.mjs',
        format: 'es',
        sourcemap: true,
      },
    ],
    external,
    plugins: [
      nodeResolve(),
      typescript({
        tsconfig: './tsconfig.json',
        declaration: false,
        declarationMap: false,
      }),
    ],
  },
  // TypeScript declarations
  {
    input: 'src/index.ts',
    output: {
      file: 'dist/index.d.ts',
      format: 'es',
    },
    plugins: [dts()],
  },
  // Individual declaration for jsonToLLMString
  {
    input: 'src/jsonToLLMString.ts',
    output: {
      file: 'dist/jsonToLLMString.d.ts',
      format: 'es',
    },
    plugins: [dts()],
  },
  // Individual declaration for minifier
  {
    input: 'src/minifier.ts',
    output: {
      file: 'dist/minifier.d.ts',
      format: 'es',
    },
    plugins: [dts()],
  },
];