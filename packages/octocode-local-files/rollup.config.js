import typescript from '@rollup/plugin-typescript';
import { nodeResolve } from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import json from '@rollup/plugin-json';

export default {
  input: 'src/index.ts',
  output: {
    file: 'dist/index.js',
    format: 'es',
    sourcemap: false, // Disable source maps for production
    banner: '#!/usr/bin/env node'
  },
  external: [
    // Only externalize Node.js built-ins - users expect dependencies to be bundled
    'fs', 'path', 'os', 'crypto', 'util', 'stream', 'events', 'http', 'https', 'url', 'zlib', 'buffer', 'child_process'
  ],
  plugins: [
    nodeResolve({
      preferBuiltins: true
    }),
    commonjs(),
    typescript({
      tsconfig: './tsconfig.json',
      sourceMap: false, // Disable source maps in TypeScript compilation
      declaration: true,
      declarationMap: false,
      noEmitOnError: false // Don't fail build on TypeScript errors - show all errors
    }),
    json()
  ]
};
