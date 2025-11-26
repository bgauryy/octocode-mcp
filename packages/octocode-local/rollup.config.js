import typescript from '@rollup/plugin-typescript';
import { nodeResolve } from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import json from '@rollup/plugin-json';
import terser from '@rollup/plugin-terser';
import { readFileSync } from 'fs';

// Plugin to import markdown files as strings
const markdown = () => ({
  name: 'markdown',
  transform(_code, id) {
    if (id.endsWith('.md')) {
      const content = readFileSync(id, 'utf-8');
      return {
        code: `export default ${JSON.stringify(content)};`,
        map: null
      };
    }
  }
});

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
    markdown(), // Must be first to handle .md files before TypeScript
    nodeResolve({
      preferBuiltins: true
    }),
    commonjs(),
    typescript({
      tsconfig: './tsconfig.json',
      sourceMap: false, // Disable source maps in TypeScript compilation
      declaration: false, // No declaration files needed for executable
      declarationMap: false,
      noEmitOnError: true // Fail build on TypeScript errors
    }),
    json(),
    terser({
      compress: {
        passes: 2,
        drop_console: true,
        drop_debugger: true
      },
      format: {
        comments: false
      }
    })
  ]
};
