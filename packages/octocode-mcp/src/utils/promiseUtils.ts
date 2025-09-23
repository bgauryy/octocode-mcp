/**
 * Result of a promise operation with error isolation
 */
export interface PromiseResult<T> {
  success: boolean;
  data?: T;
  error?: Error;
  index: number;
}

/**
 * Options for promise execution
 */
export interface PromiseExecutionOptions {
  /** Maximum time to wait for all promises in milliseconds */
  timeout?: number;
  /** Whether to continue execution if some promises fail */
  continueOnError?: boolean;
  /** Maximum number of concurrent promises */
  concurrency?: number;
  /** Custom error handler */
  onError?: (error: Error, index: number) => void;
}

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

/**
 * Utility for batch processing with error isolation
 *
 * @param items Items to process
 * @param processor Function to process each item
 * @param options Processing options
 * @returns Batch results with success/failure information
 */
export async function processBatch<TInput, TOutput>(
  items: TInput[],
  processor: (item: TInput, index: number) => Promise<TOutput>,
  options: PromiseExecutionOptions = {}
): Promise<{
  results: PromiseResult<TOutput>[];
  successCount: number;
  errorCount: number;
  errors: Array<{ index: number; error: Error; item: TInput }>;
}> {
  // Input validation
  if (!Array.isArray(items)) {
    throw new Error('items must be an array');
  }
  if (typeof processor !== 'function') {
    throw new Error('processor must be a function');
  }

  const promises = items.map((item, index) => () => processor(item, index));

  const results = await executeWithErrorIsolation(promises, options);

  const successCount = results.filter(r => r.success).length;
  const errorCount = results.filter(r => !r.success).length;

  const errors = results
    .filter(
      (r): r is PromiseResult<TOutput> & { success: false; error: Error } =>
        !r.success && !!r.error
    )
    .map(r => {
      const item = items[r.index];
      if (item === undefined) {
        throw new Error(
          `Item at index ${r.index} is undefined - this indicates a bug`
        );
      }
      return {
        index: r.index,
        error: r.error,
        item,
      };
    });

  return {
    results,
    successCount,
    errorCount,
    errors,
  };
}

/**
 * Safe Promise.all alternative that provides detailed error information
 */
export async function safePromiseAll<T>(
  promises: Promise<T>[],
  options: { timeout?: number; continueOnError?: boolean } = {}
): Promise<{
  results: (T | null)[];
  errors: Array<{ index: number; error: Error }>;
  successCount: number;
}> {
  // Input validation
  if (!Array.isArray(promises)) {
    throw new Error('promises must be an array');
  }

  // Validate that all items are promises
  const promiseFunctions = promises.map((promise, index) => {
    if (!promise || typeof promise.then !== 'function') {
      return () =>
        Promise.reject(new Error(`Item at index ${index} is not a Promise`));
    }
    return () => promise;
  });

  const results = await executeWithErrorIsolation(promiseFunctions, options);

  const processedResults = results.map(r =>
    r.success && r.data !== undefined ? r.data : null
  );
  const errors = results
    .filter(
      (r): r is PromiseResult<T> & { success: false; error: Error } =>
        !r.success && !!r.error
    )
    .map(r => ({ index: r.index, error: r.error }));

  const successCount = results.filter(r => r.success).length;

  return {
    results: processedResults,
    errors,
    successCount,
  };
}

/**
 * Retry utility with exponential backoff and error isolation
 */
export async function retryWithBackoff<T>(
  operation: () => Promise<T>,
  options: {
    maxRetries?: number;
    initialDelay?: number;
    maxDelay?: number;
    backoffMultiplier?: number;
    shouldRetry?: (error: Error, attempt: number) => boolean;
  } = {}
): Promise<T> {
  const {
    maxRetries = 3,
    initialDelay = 1000,
    maxDelay = 10000,
    backoffMultiplier = 2,
    shouldRetry = () => true,
  } = options;

  let lastError: Error;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (attempt === maxRetries || !shouldRetry(lastError, attempt)) {
        throw lastError;
      }

      const delay = Math.min(
        initialDelay * Math.pow(backoffMultiplier, attempt),
        maxDelay
      );
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  throw lastError!;
}
