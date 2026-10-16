import {
  delegateToNative,
  NativeLaunchError,
  resolveNativeBin,
} from './native-delegate.js';

export async function runCLI(
  argv: readonly string[] = process.argv.slice(2)
): Promise<void> {
  const resolved = resolveNativeBin();
  if ('error' in resolved) throw new NativeLaunchError(resolved.error);
  process.exitCode = await delegateToNative(resolved.bin, argv);
}
