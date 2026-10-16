import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { allowLocalExecutables } from '../../../../test-utils/external-effects-guard.js';

const require = createRequire(import.meta.url);
export const launcher = resolve(__dirname, '..', '..', 'out', 'octocode.js');

function nativeBinary(): string | null {
  try {
    const { resolveNativeBinaryPath } =
      require('@octocodeai/octocode-native/bin/resolve-binary.cjs') as {
        resolveNativeBinaryPath(): string;
      };
    return resolveNativeBinaryPath();
  } catch {
    return null;
  }
}

export const binary = nativeBinary();
if (binary) allowLocalExecutables(binary);
export const ready = existsSync(launcher) && binary !== null;
