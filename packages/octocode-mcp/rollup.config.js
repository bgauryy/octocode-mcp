import typescript from '@rollup/plugin-typescript';
import { nodeResolve } from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import json from '@rollup/plugin-json';
import { terser } from 'rollup-plugin-terser';

export default {
  input: 'src/index.ts',
  output: {
    dir: 'dist',
    format: 'es',
    sourcemap: false, // Disable source maps for production
    minifyInternalExports: true,
    banner: '#!/usr/bin/env node',
    entryFileNames: 'index.js',
    // Control chunk naming to preserve predictable paths for dynamic imports
    chunkFileNames: (chunkInfo) => {
      // For enterprise modules, use predictable names
      if (chunkInfo.facadeModuleId) {
        const fileName = chunkInfo.facadeModuleId.split('/').pop()?.replace('.ts', '.js');
        if (fileName && ['auditLogger.js', 'organizationManager.js', 'rateLimiter.js', 'policyManager.js'].includes(fileName)) {
          return `security/${fileName}`;
        }
      }
      // For other chunks, use hash-based names
      return '[name]-[hash].js';
    }
  },
  external: [],
  plugins: [
    nodeResolve({
      preferBuiltins: true
    }),
    commonjs(),
    typescript({
      tsconfig: './tsconfig.json',
      sourceMap: false, // Disable source maps in TypeScript compilation
      declaration: false,
      declarationMap: false,
      noEmitOnError: true // Fail build on TypeScript errors
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