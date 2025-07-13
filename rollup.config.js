import typescript from '@rollup/plugin-typescript';
import { nodeResolve } from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import json from '@rollup/plugin-json';
import { terser } from 'rollup-plugin-terser';
import { readFileSync } from 'fs';

const pkg = JSON.parse(readFileSync('./package.json', 'utf8'));

export default {
  input: 'src/index.ts',
  output: {
    dir: 'dist',
    format: 'es',
    sourcemap: false, // Disable source maps for production
    minifyInternalExports: true
  },
  external: [
    // List external dependencies that shouldn't be bundled
    ...Object.keys(pkg.dependencies || {}),
    ...Object.keys(pkg.peerDependencies || {})
  ],
  plugins: [
    nodeResolve({
      preferBuiltins: true
    }),
    commonjs(),
    typescript({
      tsconfig: './tsconfig.json',
      sourceMap: false // Disable source maps in TypeScript compilation
    }),
    json(),
    terser({ // Add aggressive minification
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