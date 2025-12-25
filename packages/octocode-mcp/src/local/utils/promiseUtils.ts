/**
 * Promise utility functions for bulk operations
 */

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
