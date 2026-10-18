#!/usr/bin/env node
// Build helpers shared by the published Node packages (`octocode`,
// `octocode-mcp`): the bundle's externals, the build-time check that every
// external runtime import is a declared dependency, and the shared docs copy.
//
//   node package-build.mjs docs <outDir>   copy repo docs/ to <cwd>/<outDir>/docs
import { cpSync, existsSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { builtinModules } from 'node:module';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(fileURLToPath(new URL('../../..', import.meta.url)));

const nodeBuiltins = new Set([...builtinModules, ...builtinModules.map(name => `node:${name}`)]);

/**
 * What a package bundle keeps external: Node built-ins and the package's
 * published runtime dependencies, so consumers install those from the
 * manifest and the bundle stays an interface, not a partial copy of them.
 */
export function packageExternals(pkg) {
  return [
    ...nodeBuiltins,
    ...Object.keys(pkg.dependencies ?? {}),
  ];
}

function packageName(specifier) {
  const parts = specifier.split('/');
  return specifier.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0];
}

function undeclaredExternalRuntimeImports(metafiles, dependencies = {}) {
  const declared = new Set(Object.keys(dependencies));
  const externalPackages = new Set();

  for (const metafile of metafiles) {
    for (const output of Object.values(metafile.outputs)) {
      for (const imported of output.imports) {
        if (!imported.external) continue;
        const specifier = imported.path;
        if (
          specifier.startsWith('.') ||
          specifier.startsWith('/') ||
          nodeBuiltins.has(specifier)
        ) {
          continue;
        }
        externalPackages.add(packageName(specifier));
      }
    }
  }

  return [...externalPackages].filter(name => !declared.has(name)).sort();
}

export function assertDeclaredRuntimeImports({
  metafiles,
  dependencies,
  label = 'bundle',
}) {
  const undeclared = undeclaredExternalRuntimeImports(metafiles, dependencies);
  if (undeclared.length > 0) {
    throw new Error(
      `${label} has undeclared external runtime import(s): ${undeclared.join(', ')}`
    );
  }
}

/** Where a bundled doc's links to files outside `docs/` resolve once shipped. */
export const REPO_BLOB_URL = 'https://github.com/bgauryy/octocode/blob/main/';

/**
 * Rewrite one Markdown file's relative links that leave `docs/` (for example
 * `../packages/x/README.md#a`) to the repository URL, so they still resolve
 * from the package's `dist/docs` copy. Links inside `docs/` stay relative.
 */
export function rewriteEscapingLinks(markdown, docPath, sourceDocs) {
  return markdown.replace(/\]\(([^)\s]+)\)/g, (match, target) => {
    if (/^(?:[a-z][a-z0-9+.-]*:|#|\/)/i.test(target)) return match;
    const [file, fragment = ''] = target.split(/(?=#)/);
    const absolute = resolve(dirname(docPath), file);
    const inside = relative(sourceDocs, absolute);
    if (!inside.startsWith('..')) return match;
    const repoPath = relative(repoRoot, absolute).split(sep).join('/');
    return `](${REPO_BLOB_URL}${repoPath}${fragment})`;
  });
}

const markdownFiles = dir =>
  readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return markdownFiles(path);
    return entry.name.endsWith('.md') ? [path] : [];
  });

/** Copy the shared repo `docs/` into `<packageRoot>/<outDir>/docs`. */
export function bundleDocs(packageRoot, outDir) {
  const sourceDocs = join(repoRoot, 'docs');
  if (!existsSync(sourceDocs)) {
    throw new Error(`Shared documentation directory is missing: ${sourceDocs}`);
  }
  const outputDocs = join(packageRoot, outDir, 'docs');
  rmSync(outputDocs, { recursive: true, force: true });
  cpSync(sourceDocs, outputDocs, { recursive: true });
  for (const output of markdownFiles(outputDocs)) {
    const source = join(sourceDocs, relative(outputDocs, output));
    writeFileSync(output, rewriteEscapingLinks(readFileSync(output, 'utf8'), source, sourceDocs));
  }
  return outputDocs;
}

// Installed skills are often symlinks: argv[1] keeps the link path while import.meta.url is the real path.
const realOrSelf = (p) => { try { return realpathSync(p); } catch { return resolve(p); } };
if (process.argv[1] && realOrSelf(process.argv[1]) === realOrSelf(fileURLToPath(import.meta.url))) {
  const [command, outDir] = process.argv.slice(2);
  if (command !== 'docs' || !outDir) {
    console.error('Usage: node package-build.mjs docs <outDir>');
    process.exit(2);
  }
  console.log(`✓ docs bundled → ${bundleDocs(process.cwd(), outDir)}`);
}
