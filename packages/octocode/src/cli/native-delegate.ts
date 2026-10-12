// Thin Node-to-Rust delegation boundary. Public tools and flag-only management
// commands execute in the compiled native CLI; Node retains only interactive
// installation and skill materialization. This CLI is the single launcher: it
// resolves and spawns the platform native binary directly (no intermediate
// `octocode.cjs` shim process), so a tool call costs one Node hop, not two.
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import { devOverridesAllowed } from '@octocodeai/config';

interface NativeBinaryResolver {
  resolveNativeBinaryPath: () => string;
}

interface NativeLauncher {
  runForwardingSignals: (
    command: string,
    args: readonly string[],
    options?: { env?: NodeJS.ProcessEnv }
  ) => Promise<number>;
  takeSignals: (handler: (signal: NodeJS.Signals) => void) => () => void;
}

const require = createRequire(import.meta.url);

// Replaced with `true` by the esbuild define in build.mjs; undefined when
// running from source (vitest, tsx).
declare const __OCTOCODE_BUNDLED__: boolean | undefined;

/** Dev overrides follow the shared config rule; the shipped bundle is production. */
export const devOverrideOptions: Parameters<typeof devOverridesAllowed>[1] = {
  bundled:
    typeof __OCTOCODE_BUNDLED__ !== 'undefined' &&
    __OCTOCODE_BUNDLED__ === true,
};

/**
 * `skill` remains in Node because the native command intentionally invokes this
 * launcher for shared skill materialization. Delegating it would recurse.
 */
export const NODE_OWNED_COMMANDS: ReadonlySet<string> = new Set(['skill']);

/** The native binary to run, or why there is none (shown to the user as is). */
export type NativeBin = { bin: string } | { error: string };

/** The native binary could not be started (spawn failure). */
export class NativeLaunchError extends Error {
  override name = 'NativeLaunchError';
}

/**
 * Resolve the compiled native `octocode` binary, or the reason there is none.
 * An explicit `OCTOCODE_NATIVE_BIN` path wins only where config allows dev
 * overrides (never in production, as for MCP's `OCTOCODE_NATIVE_BINDING`);
 * otherwise the platform binary is resolved through
 * `@octocodeai/octocode-native`'s shared resolver — so delegation spawns the
 * native binary itself, not a second Node launcher. The resolver's own
 * message (unsupported platform, the missing platform package and its
 * `npm install` fix) is kept. Never throws.
 */
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

/**
 * The command line that runs `bin argv`. A `.cjs`/`.js` bin (only reachable
 * through the `OCTOCODE_NATIVE_BIN` dev override) is a Node launcher and runs
 * through `process.execPath`.
 */
export function nativeCommand(
  bin: string,
  argv: readonly string[]
): [command: string, args: string[]] {
  return /\.[cm]?js$/.test(bin)
    ? [process.execPath, [bin, ...argv]]
    : [bin, [...argv]];
}

/** The native package's signal-forwarding process helpers. */
export function nativeLauncher(): NativeLauncher {
  return require('@octocodeai/octocode-native/bin/launch-native.cjs') as NativeLauncher;
}

/**
 * Decide whether a parsed command is owned by the native binary. Availability
 * is checked separately so a missing installation fails closed instead of
 * silently running the retired TypeScript implementation.
 */
export function shouldDelegateToNative(
  command: string | null | undefined
): boolean {
  return !command || !NODE_OWNED_COMMANDS.has(command);
}

/**
 * Run the native binary with the given argv, passing stdio through, and
 * resolve with the child exit code (128+N on a signal death). While the child
 * owns stdio, signals go only to the child. A binary that cannot start
 * (EACCES, ENOEXEC, a noexec mount) rejects with a `NativeLaunchError` naming
 * the binary and the cause, never a silent exit.
 */
export async function delegateToNative(
  bin: string,
  argv: readonly string[],
  env: NodeJS.ProcessEnv = process.env
): Promise<number> {
  const [command, args] = nativeCommand(bin, argv);
  try {
    return await nativeLauncher().runForwardingSignals(command, args, { env });
  } catch (error) {
    const cause = error instanceof Error ? error.message : String(error);
    throw new NativeLaunchError(
      `The native Octocode binary could not start (${bin}): ${cause}`,
      { cause: error }
    );
  }
}
