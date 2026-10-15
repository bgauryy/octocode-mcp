import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { ENV_TOKEN_VARS } from '@octocodeai/config';

/**
 * A stand-in native binary. `config check <token> --json` reports `source` as
 * the GitHub token it would use (none when undefined); `config check <key>
 * --json` reports `set: true` for each of `setKeys`; every other invocation
 * exits 1. It is a `.cjs` launcher, so `nativeCommand` runs it through
 * `process.execPath`. Point `OCTOCODE_NATIVE_BIN` at it so no test spawns the
 * real binary, which would consult the developer's stored or `gh` login and
 * config files.
 */
export function fakeNative(
  dir: string,
  source?: string,
  setKeys: readonly string[] = []
): string {
  const bin = path.join(
    dir,
    `octocode-${source ?? 'none'}-${setKeys.join('_') || 'unset'}.cjs`
  );
  const replies: Record<string, unknown> = {
    [ENV_TOKEN_VARS[0]!]: {
      key: ENV_TOKEN_VARS[0],
      set: false,
      ...(source ? { githubTokenSource: source } : {}),
    },
  };
  for (const key of setKeys) replies[key] = { key, set: true };
  writeFileSync(
    bin,
    `const replies = ${JSON.stringify(replies)};
const [command, sub, key, json] = process.argv.slice(2);
if (command === 'config' && sub === 'check' && json === '--json' && key in replies) {
  process.stdout.write(JSON.stringify(replies[key]));
}
process.exit(1);
`
  );
  return bin;
}
