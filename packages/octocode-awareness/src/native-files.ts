/** Load the shared native boundary only for requested filesystem/evidence work. */
let loading: Promise<typeof import('@octocodeai/octocode-extension-rust')> | undefined;

export function loadNativeFiles(): Promise<typeof import('@octocodeai/octocode-extension-rust')> {
  return loading ??= import('@octocodeai/octocode-extension-rust').catch((cause: unknown) => {
    loading = undefined;
    throw new Error('Awareness native filesystem is unavailable. Install @octocodeai/octocode-extension-rust with its matching platform package to use history or file fingerprints.', { cause });
  });
}

/** Abort affects precommit work; it must never erase a successful native receipt. */
export async function withNativeFiles<T>(
  signal: AbortSignal | undefined,
  run: (native: Awaited<ReturnType<typeof loadNativeFiles>>, cancellation: import('@octocodeai/octocode-extension-rust').NativeCancellation) => Promise<T>,
): Promise<T> {
  signal?.throwIfAborted();
  const native = await loadNativeFiles();
  signal?.throwIfAborted();
  const cancellation = new native.NativeCancellation();
  const abort = () => cancellation.cancel();
  signal?.addEventListener('abort', abort, { once: true });
  try { return await run(native, cancellation); }
  finally { signal?.removeEventListener('abort', abort); }
}
