import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, relative } from 'node:path';
import { emitCatalogTypes } from './catalog-types.ts';
import { libraryEntries, root } from './entry-points.ts';

const dist = join(root, 'dist');
// tsc emits declarations under dist/types, mirroring the source tree from the monorepo packages directory, because the CLI library's sources are part of the program.
const declarations = join(dist, 'types');

/**
 * Declarations for every library entry: published `types`, and the types the tests see for the bundles they run.
 * tsconfig.types.json compiles src/entries and src/hosts; each entry bundle gets a stub declaration beside it (dist/<name>.d.ts).
 */
export function emitDeclarations(): void {
  rmSync(declarations, { recursive: true, force: true });
  execFileSync(process.execPath, [createRequire(import.meta.url).resolve('typescript/bin/tsc'), '-p', join(root, 'tsconfig.types.json')], { cwd: root, stdio: 'inherit' });
  for (const [name, source] of Object.entries(libraryEntries())) {
    const stub = join(dist, `${name}.d.ts`);
    mkdirSync(dirname(stub), { recursive: true });
    const emitted = join(declarations, basename(root), relative(root, source).replace(/\.ts$/, '.d.ts'));
    const path = relative(dirname(stub), emitted).replace(/\.d\.ts$/, '.js');
    const target = path.startsWith('.') ? path : `./${path}`;
    writeFileSync(stub, `export * from '${target}';\n${/^export default /m.test(readFileSync(emitted, 'utf8')) ? `export { default } from '${target}';\n` : ''}`);
  }
}

if (import.meta.main) {
  if (process.argv.includes('--check')) await emitCatalogTypes(true);
  else {
    await emitCatalogTypes();
    emitDeclarations();
  }
}
