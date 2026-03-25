import { defineConfig } from 'vite';
import { builtinModules } from 'module';
import { resolve } from 'path';

export default defineConfig({
  build: {
    target: 'node18',
    outDir: 'dist',
    lib: {
      entry: {
        index: resolve(__dirname, 'src/index.ts'),
        pathValidator: resolve(__dirname, 'src/pathValidator.ts'),
        commandValidator: resolve(__dirname, 'src/commandValidator.ts'),
        contentSanitizer: resolve(__dirname, 'src/contentSanitizer.ts'),
        withSecurityValidation: resolve(
          __dirname,
          'src/withSecurityValidation.ts'
        ),
        mask: resolve(__dirname, 'src/mask.ts'),
        ignoredPathFilter: resolve(__dirname, 'src/ignoredPathFilter.ts'),
        workspaceRoot: resolve(__dirname, 'src/workspaceRoot.ts'),
        executionContextValidator: resolve(
          __dirname,
          'src/executionContextValidator.ts'
        ),
        pathUtils: resolve(__dirname, 'src/pathUtils.ts'),
        types: resolve(__dirname, 'src/types.ts'),
        paramExtractors: resolve(__dirname, 'src/paramExtractors.ts'),
        registry: resolve(__dirname, 'src/registry.ts'),
        'regexes/index': resolve(__dirname, 'src/regexes/index.ts'),
      },
      formats: ['es'],
      fileName: (_format, entryName) => `${entryName}.js`,
    },
    rollupOptions: {
      external: [
        ...builtinModules,
        ...builtinModules.map(m => `node:${m}`),
        'octocode-shared',
        '@modelcontextprotocol/sdk',
        /^@modelcontextprotocol\/sdk\/.*/,
      ],
    },
    minify: false,
    emptyOutDir: true,
  },
});
