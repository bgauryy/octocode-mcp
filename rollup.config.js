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
    '@modelcontextprotocol/sdk/server/mcp.js',
    '@modelcontextprotocol/sdk/server/stdio.js',
    'zod',
    'node-cache',
    'node-fetch'
    // NOTE: terser and @babel/core are NOT in external - they will be bundled
  ],
  plugins: [
    resolve({
      preferBuiltins: true,
      exportConditions: ['node'],
      extensions: ['.ts', '.js', '.json'],
      // Include these packages in the bundle
      include: ['terser', '@babel/core']
    }),
    commonjs({
      // Handle CommonJS modules for terser and babel
      include: ['node_modules/**']
    }),
    json(),
    typescript({
      tsconfig: './tsconfig.json',
      declaration: false,
      declarationMap: false,
      sourceMap: false
    })
  ]
}; 