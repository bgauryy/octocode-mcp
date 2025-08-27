import typescript from '@rollup/plugin-typescript';
import { nodeResolve } from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import json from '@rollup/plugin-json';
import { terser } from 'rollup-plugin-terser';

const isProduction = process.env.NODE_ENV === 'production';

export default {
  input: 'api/index.ts',
  output: {
    file: 'dist/index.js',
    format: 'es',
    sourcemap: !isProduction, // Enable source maps for development
    banner: '#!/usr/bin/env node'
  },
  plugins: [
    nodeResolve({
      preferBuiltins: true,
      exportConditions: ['node']
    }),
    commonjs(),
    json(),
    typescript({
      tsconfig: './tsconfig.json',
      sourceMap: !isProduction,
      declaration: false,
      outputToFilesystem: true
    }),
    ...(isProduction ? [terser()] : [])
  ],
  external: (id) => {
    // Never externalize the entry module or relative imports
    if (id === 'api/index.ts' || id.startsWith('./') || id.startsWith('../')) {
      return false;
    }
    
    // Don't externalize workspace packages
    if (id.startsWith('octocode-')) {
      return false;
    }
    
    // Externalize all node_modules dependencies
    return !id.startsWith('.') && !id.startsWith('/');
  }
};
