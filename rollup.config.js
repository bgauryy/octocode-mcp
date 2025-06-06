import typescript from '@rollup/plugin-typescript';
import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import json from '@rollup/plugin-json';

export default {
  input: 'src/index.ts',
  output: {
    file: 'build/index.js',
    format: 'es',
    banner: '#!/usr/bin/env node'
  },
  external: [
    // Mark Node.js built-ins as external
    'fs',
    'path',
    'util',
    'events',
    'stream',
    'url',
    'buffer',
    'child_process',
    'crypto',
    // Mark dependencies as external (they should be installed separately)
    '@modelcontextprotocol/sdk/server/mcp.js',
    '@modelcontextprotocol/sdk/server/stdio.js',
    'zod',
    'commander',
    'lodash',
    'node-cache',
    'node-fetch'
  ],
  plugins: [
    resolve({
      preferBuiltins: true,
      exportConditions: ['node'],
      extensions: ['.ts', '.js', '.json']
    }),
    commonjs(),
    json(),
    typescript({
      tsconfig: './tsconfig.json',
      declaration: false,
      declarationMap: false,
      sourceMap: false
    })
  ]
}; 