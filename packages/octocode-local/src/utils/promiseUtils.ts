/**
 * Promise utility functions for bulk operations
 */

/**
 * Runs promises in parallel with concurrency limit
 */
export async function parallelLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  const executing: Promise<void>[] = [];

  const enqueue = (index: number): Promise<void> =>
    fn(items[index]).then((result) => {
      results[index] = result;
    });

  for (let i = 0; i < items.length; i++) {
    const p = enqueue(i).then(() => {
      const idx = executing.indexOf(p as unknown as Promise<void>);
      if (idx >= 0) executing.splice(idx, 1);
    });
    executing.push(p);
    if (executing.length >= limit) {
      await Promise.race(executing);
    }
  }

  await Promise.all(executing);
  return results;
}

/**
 * Runs promises with error isolation
 */
export async function settleAll<T>(
  promises: Promise<T>[]
): Promise<
  Array<
    { status: 'fulfilled'; value: T } | { status: 'rejected'; reason: unknown }
  >
> {
  return Promise.allSettled(promises);
}

// Note: retry() removed as unused to reduce code surface
