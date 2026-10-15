import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** A path's real location, or the path itself when it does not resolve. */
const realOrSelf = (p) => { try { return fs.realpathSync(p); } catch { return path.resolve(p); } };

/**
 * Whether the module at `moduleUrl` (its `import.meta.url`) is the script Node was started with. argv[1] keeps a
 * symlinked path while import.meta.url is the real path, so real paths are compared.
 */
export function isMain(moduleUrl) {
  return Boolean(process.argv[1]) && realOrSelf(process.argv[1]) === realOrSelf(fileURLToPath(moduleUrl));
}
