/** How browser work stops when the tool call is aborted. */

/** The error an aborted browser operation rejects with: the signal's own reason when it is an Error. */
export const abortError = (signal: AbortSignal): Error => (signal.reason instanceof Error ? signal.reason : new Error('Aborted'));

export function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw abortError(signal);
}

/** `work`, unless `signal` aborts first: then it rejects at once, and `release` disposes of what `work` yields later. */
export function unlessAborted<T>(work: Promise<T>, signal: AbortSignal | undefined, release: (value: T) => unknown): Promise<T> {
  if (!signal) return work;
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => {
      void work.then(release, () => undefined);
      reject(abortError(signal));
    };
    if (signal.aborted) return onAbort();
    signal.addEventListener('abort', onAbort, { once: true });
    work.then(
      (value) => {
        signal.removeEventListener('abort', onAbort);
        resolve(value);
      },
      (error: unknown) => {
        signal.removeEventListener('abort', onAbort);
        reject(error);
      },
    );
  });
}
