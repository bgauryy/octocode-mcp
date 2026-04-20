/**
 * Runtime-dependency regression test for the bundled LSP path.
 *
 * `typescript-language-server` is spawned as a child process via
 * `src/lsp/config.ts` → `resolveLanguageServer()` → `require.resolve(...)`.
 * It therefore MUST be listed under `dependencies` (not `devDependencies`),
 * otherwise `npx octocode-mcp@latest` installs a runtime that cannot
 * resolve the bundled server and LSP silently falls back to text search.
 *
 * @module tests/lsp/runtime-deps.test
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkgPath = resolve(__dirname, '../../package.json');

describe('octocode-mcp package.json — LSP runtime dependencies', () => {
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };

  it('lists typescript-language-server under dependencies (needed at runtime for npx users)', () => {
    expect(
      pkg.dependencies?.['typescript-language-server'],
      'typescript-language-server must be a runtime dependency — ' +
        'it is spawned as a child process via require.resolve() and cannot be bundled by esbuild'
    ).toBeDefined();
  });

  it('lists typescript under dependencies (peer of typescript-language-server, provides tsserver binary)', () => {
    expect(
      pkg.dependencies?.['typescript'],
      'typescript must be a runtime dependency — it is the peer ' +
        'of typescript-language-server and ships tsserver used for semantic analysis'
    ).toBeDefined();
  });

  it('does not declare typescript-language-server in devDependencies (would shadow the runtime dep)', () => {
    expect(pkg.devDependencies?.['typescript-language-server']).toBeUndefined();
  });
});
