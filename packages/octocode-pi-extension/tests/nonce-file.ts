import fs from 'node:fs';
import path from 'node:path';
import { tmp } from './helpers.js';

/** The owner-only file a parent writes for a child (`writeNonceFile`): its path goes in `PERMISSION_NONCE_FILE_ENV`. */
export function nonceFile(secret: string): string {
  const file = path.join(tmp(), 'nonce');
  fs.writeFileSync(file, secret, { mode: 0o600 });
  return file;
}
