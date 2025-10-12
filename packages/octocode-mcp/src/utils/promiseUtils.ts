import type { PromiseResult, PromiseExecutionOptions } from '../types.js';

/**
 * Execute promises with error isolation - prevents one failure from affecting others
 *
 * @param promises Array of promise-returning functions
 * @param options Execution options
 * @returns Array of results with success/failure information
 */
export async function executeWithErrorIsolation<T>(
  promises: Array<() => Promise<T>>,
  options: PromiseExecutionOptions = {}
): Promise<PromiseResult<T>[]> {
  // Input validation
  if (!Array.isArray(promises)) {
    throw new Error('promises must be an array');
  }

  // Handle empty array case first
  if (promises.length === 0) {
    return [];
  }

  const { timeout = 30000, concurrency = promises.length, onError } = options;

  // Validate options
  if (timeout <= 0) {
    throw new Error('timeout must be positive');
  }
  if (concurrency <= 0) {
    throw new Error('concurrency must be positive');
  }

  // Filter out null/undefined promise functions
  const validPromises = promises.map((promiseFn, index) =>
    typeof promiseFn === 'function'
      ? promiseFn
      : () =>
          Promise.reject(
            new Error(`Promise function at index ${index} is not a function`)
          )
  );

  // Handle concurrency limiting
  if (concurrency < validPromises.length) {
    return executeWithConcurrencyLimit(
      validPromises,
      concurrency,
      timeout,
      onError
    );
  }

  // Create isolated promise wrappers and execute all promises
  const isolatedPromises = validPromises.map((promiseFn, index) =>
    createIsolatedPromise(promiseFn, index, timeout, onError)
  );

  // Execute all promises with better error handling
  const results = await Promise.allSettled(isolatedPromises);

  return results.map((result, index) => {
    if (result.status === 'fulfilled') {
      return result.value;
    } else {
      // This should rarely happen due to our isolation, but handle it
      return {
        success: false,
        error:
          result.reason instanceof Error
            ? result.reason
            : new Error(String(result.reason)),
        index,
      };
    }
  });
}

/**
 * Create an isolated promise that never rejects, with guaranteed timeout cleanup
 */
async function createIsolatedPromise<T>(
  promiseFn: () => Promise<T>,
  index: number,
  timeout: number,
  onError?: (error: Error, index: number) => void
): Promise<PromiseResult<T>> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  // Ensure cleanup happens regardless of how the function exits
  const cleanup = () => {
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId);
      timeoutId = undefined;
    }
  };

  try {
    // Create timeout promise with proper cleanup
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => {
        reject(new Error(`Promise ${index} timed out after ${timeout}ms`));
      }, timeout);
    });

    // Race the actual promise against timeout
    const data = await Promise.race([promiseFn(), timeoutPromise]);

    // Clear timeout - promise resolved first
    cleanup();

    return {
      success: true,
      data,
      index,
    };
  } catch (error) {
    // Ensure cleanup happens in all error scenarios
    cleanup();

    const errorObj = error instanceof Error ? error : new Error(String(error));

    // Call custom error handler if provided
    if (onError) {
      try {
        onError(errorObj, index);
      } catch (handlerError) {
        // Silently ignore errors in custom error handler to prevent interference
      }
    }

    return {
      success: false,
      error: errorObj,
      index,
    };
  }
}

/**
 * Execute promises with concurrency limiting using a proper semaphore pattern
 */
async function executeWithConcurrencyLimit<T>(
  promiseFns: Array<() => Promise<T>>,
  concurrency: number,
  timeout: number,
  onError?: (error: Error, index: number) => void
): Promise<PromiseResult<T>[]> {
  const results: PromiseResult<T>[] = new Array(promiseFns.length);
  let nextIndex = 0;

  // Semaphore implementation for concurrency control
  const executeNext = async (): Promise<void> => {
    while (nextIndex < promiseFns.length) {
      const currentIndex = nextIndex++;
      const promiseFn = promiseFns[currentIndex];

      if (!promiseFn) {
        results[currentIndex] = {
          success: false,
          error: new Error('Promise function is undefined'),
          index: currentIndex,
        };
        continue;
      }

      try {
        const result = await createIsolatedPromise(
          promiseFn,
          currentIndex,
          timeout,
          onError
        );
        results[currentIndex] = result;
      } catch (error) {
        // This should rarely happen due to isolation in createIsolatedPromise
        results[currentIndex] = {
          success: false,
          error: error instanceof Error ? error : new Error(String(error)),
          index: currentIndex,
        };
      }
    }
  };

  // Start workers up to concurrency limit
  const workers: Promise<void>[] = [];
  for (let i = 0; i < Math.min(concurrency, promiseFns.length); i++) {
    workers.push(executeNext());
  }

  // Wait for all workers to complete
  await Promise.all(workers);

  return results;
}
