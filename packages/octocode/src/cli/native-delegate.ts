import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import { devOverridesAllowed } from '@octocodeai/config';

interface NativeBinaryResolver {
  resolveNativeBinaryPath(): string;
}

interface NativeLauncher {
  runForwardingSignals(
    command: string,
    args: readonly string[],
    options?: { env?: NodeJS.ProcessEnv }
  ): Promise<number>;
}

const require = createRequire(import.meta.url);
declare const __OCTOCODE_BUNDLED__: boolean | undefined;
const devOverrideOptions = {
  bundled:
    typeof __OCTOCODE_BUNDLED__ !== 'undefined' &&
    __OCTOCODE_BUNDLED__ === true,
};

type NativeBin = { bin: string } | { error: string };

export class NativeLaunchError extends Error {
  override name = 'NativeLaunchError';
}

export function resolveNativeBin(
  env: NodeJS.ProcessEnv = process.env
): NativeBin {
  const explicit = devOverridesAllowed(env, devOverrideOptions)
    ? env.OCTOCODE_NATIVE_BIN?.trim()
    : undefined;
  if (explicit) {
    return existsSync(explicit)
      ? { bin: explicit }
      : { error: `OCTOCODE_NATIVE_BIN points at a missing path: ${explicit}` };
  }
  try {
    const { resolveNativeBinaryPath } =
      require('@octocodeai/octocode-native/bin/resolve-binary.cjs') as NativeBinaryResolver;
    return { bin: resolveNativeBinaryPath() };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

export async function delegateToNative(
  bin: string,
  argv: readonly string[],
  env: NodeJS.ProcessEnv = process.env
): Promise<number> {
  try {
    const { runForwardingSignals } =
      require('@octocodeai/octocode-native/bin/launch-native.cjs') as NativeLauncher;
    return await runForwardingSignals(bin, argv, { env });
  } catch (error) {
    const cause = error instanceof Error ? error.message : String(error);
    throw new NativeLaunchError(
      `The native Octocode binary could not start (${bin}): ${cause}`,
      { cause: error }
    );
  }
}
