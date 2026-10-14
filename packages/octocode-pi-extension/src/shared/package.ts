import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PACKAGE_NAME = '@octocodeai/pi-extension';

interface Manifest {
  name?: string;
  version?: string;
  bin?: string | Record<string, string>;
  [key: string]: unknown;
}

/** The nearest `package.json` named `name` at or above `fromDir` (at most `maxDepth` levels up). */
export function findManifest(fromDir: string, name: string, maxDepth = 6): { dir: string; manifest: Manifest } | undefined {
  let dir = path.resolve(fromDir);
  for (let depth = 0; depth < maxDepth; depth++, dir = path.dirname(dir)) {
    try {
      const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8')) as Manifest;
      if (manifest.name === name) return { dir, manifest };
    } catch {
      // No readable manifest at this level.
    }
    if (path.dirname(dir) === dir) break;
  }
  return undefined;
}

/** `a` < `b` for dotted numeric versions (`1.1.0` < `1.2.0`); a pre-release or build suffix is ignored. */
export function versionBelow(a: string, b: string): boolean {
  const parts = (version: string) => version.replace(/[-+].*$/, '').split('.').map((part) => Number.parseInt(part, 10) || 0);
  const [x, y] = [parts(a), parts(b)];
  for (let index = 0; index < Math.max(x.length, y.length); index++) {
    if ((x[index] ?? 0) !== (y[index] ?? 0)) return (x[index] ?? 0) < (y[index] ?? 0);
  }
  return false;
}

/** The oldest Pi this package supports: the floor of its `@earendil-works/pi-coding-agent` peer range (`^1.2.0` → `1.2.0`). */
export function minimumPiVersion(from: string = import.meta.url): string | undefined {
  try {
    const peers = findManifest(path.dirname(fileURLToPath(from)), PACKAGE_NAME)?.manifest['peerDependencies'];
    const range = peers && typeof peers === 'object' ? (peers as Record<string, unknown>)['@earendil-works/pi-coding-agent'] : undefined;
    return typeof range === 'string' ? /\d+(\.\d+)*/.exec(range)?.[0] : undefined;
  } catch {
    return undefined;
  }
}

/**
 * This package's root (the folder holding its `package.json`), found by walking up from a module. Source and compiled
 * modules sit at the same depth under `src/` and `dist/`, but not every module is at the top of it, so a fixed `..` breaks.
 */
export function packageRoot(from: string = import.meta.url): string {
  const found = findManifest(path.dirname(fileURLToPath(from)), PACKAGE_NAME);
  if (!found) throw new Error(`Cannot locate the ${PACKAGE_NAME} package root from ${from}`);
  return found.dir;
}
