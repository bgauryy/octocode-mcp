import type { PromiseResult, PromiseExecutionOptions } from '../types.js';

export async function executeWithErrorIsolation<T>(
  promises: Array<() => Promise<T>>,
  options: PromiseExecutionOptions = {}
): Promise<PromiseResult<T>[]> {
  if (!Array.isArray(promises)) {
    throw new Error('promises must be an array');
  }

  if (promises.length === 0) {
    return [];
  }

  const { timeout = 30000, concurrency = promises.length, onError } = options;

  if (timeout <= 0) {
    throw new Error('timeout must be positive');
  }
  if (concurrency <= 0) {
    throw new Error('concurrency must be positive');
  }

  const validPromises = promises.map((promiseFn, index) =>
    typeof promiseFn === 'function'
      ? promiseFn
      : () =>
          Promise.reject(
            new Error(`Promise function at index ${index} is not a function`)
          )
  );

  if (concurrency < validPromises.length) {
    return executeWithConcurrencyLimit(
      validPromises,
      concurrency,
      timeout,
      onError
    );
  }

  const isolatedPromises = validPromises.map((promiseFn, index) =>
    createIsolatedPromise(promiseFn, index, timeout, onError)
  );

  const results = await Promise.allSettled(isolatedPromises);

  return results.map((result, index) => {
    if (result.status === 'fulfilled') {
      return result.value;
    } else {
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

async function createIsolatedPromise<T>(
  promiseFn: () => Promise<T>,
  index: number,
  timeout: number,
  onError?: (error: Error, index: number) => void
): Promise<PromiseResult<T>> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  const cleanup = () => {
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId);
      timeoutId = undefined;
    }
  };

  try {
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => {
        reject(new Error(`Promise ${index} timed out after ${timeout}ms`));
      }, timeout);
    });

    const data = await Promise.race([promiseFn(), timeoutPromise]);

    cleanup();

    return {
      success: true,
      data,
      index,
    };
  } catch (error) {
    cleanup();

    const errorObj = error instanceof Error ? error : new Error(String(error));

    if (onError) {
      try {
        onError(errorObj, index);
      } catch (handlerError) {
        void handlerError;
      }
    }

    return {
      success: false,
      error: errorObj,
      index,
    };
  }
}

async function executeWithConcurrencyLimit<T>(
  promiseFns: Array<() => Promise<T>>,
  concurrency: number,
  timeout: number,
  onError?: (error: Error, index: number) => void
): Promise<PromiseResult<T>[]> {
  const results: PromiseResult<T>[] = new Array(promiseFns.length);
  let nextIndex = 0;

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
        results[currentIndex] = {
          success: false,
          error: error instanceof Error ? error : new Error(String(error)),
          index: currentIndex,
        };
      }
    }
  };

  const workers: Promise<void>[] = [];
  for (let i = 0; i < Math.min(concurrency, promiseFns.length); i++) {
    workers.push(executeNext());
  }

  await Promise.all(workers);

  return results;
}
