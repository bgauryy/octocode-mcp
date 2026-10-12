import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { ENV_TOKEN_VARS } from '@octocodeai/config';

/**
 * A stand-in native binary whose `config check <token> --json` reports
 * `source` as the GitHub token it would use (none when undefined); every other
 * invocation exits 1. It is a `.cjs` launcher, so `nativeCommand` runs it
 * through `process.execPath`. Point `OCTOCODE_NATIVE_BIN` at it so no test
 * spawns the real binary, which would consult the developer's stored or `gh`
 * login.
 */
export function fakeNative(dir: string, source?: string): string {
  const bin = path.join(dir, `octocode-${source ?? 'none'}.cjs`);
  const reply = JSON.stringify({
    key: ENV_TOKEN_VARS[0],
    set: false,
    ...(source ? { githubTokenSource: source } : {}),
  });
  const expected = JSON.stringify([
    'config',
    'check',
    ENV_TOKEN_VARS[0],
    '--json',
  ]);
  writeFileSync(
    bin,
    `if (JSON.stringify(process.argv.slice(2)) === ${JSON.stringify(expected)}) process.stdout.write(${JSON.stringify(reply)});\nprocess.exit(1);\n`
  );
  return bin;
}
