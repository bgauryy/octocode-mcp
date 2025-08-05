import { logger } from './logger';

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
  const { timeout = 30000, concurrency = promises.length, onError } = options;

  if (promises.length === 0) {
    return [];
  }

  // Create isolated promise wrappers
  const isolatedPromises = promises.map((promiseFn, index) =>
    createIsolatedPromise(promiseFn, index, timeout, onError)
  );

  // Handle concurrency limiting
  if (concurrency < promises.length) {
    return executeWithConcurrencyLimit(isolatedPromises, concurrency);
  }

  // Execute all promises
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
 * Create an isolated promise that never rejects
 */
async function createIsolatedPromise<T>(
  promiseFn: () => Promise<T>,
  index: number,
  timeout: number,
  onError?: (error: Error, index: number) => void
): Promise<PromiseResult<T>> {
  try {
    // Create timeout promise
    const timeoutPromise = new Promise<never>((_, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Promise ${index} timed out after ${timeout}ms`));
      }, timeout);

      // Ensure timer is cleaned up
      return timer;
    });

    // Race the actual promise against timeout
    const data = await Promise.race([promiseFn(), timeoutPromise]);

    return {
      success: true,
      data,
      index,
    };
  } catch (error) {
    const errorObj = error instanceof Error ? error : new Error(String(error));

    // Call custom error handler if provided
    if (onError) {
      try {
        onError(errorObj, index);
      } catch (handlerError) {
        logger.error(
          'Error in custom error handler',
          handlerError instanceof Error ? handlerError : undefined
        );
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
 * Execute promises with concurrency limiting
 */
async function executeWithConcurrencyLimit<T>(
  promises: Array<Promise<PromiseResult<T>>>,
  concurrency: number
): Promise<PromiseResult<T>[]> {
  const results: PromiseResult<T>[] = new Array(promises.length);
  const executing: Promise<void>[] = [];

  for (let i = 0; i < promises.length; i++) {
    const promise = promises[i]?.then(result => {
      if (results[i] !== undefined) {
        results[i] = result;
      }
    });

    if (promise) {
      executing.push(promise);
    }

    if (executing.length >= concurrency) {
      await Promise.race(executing);
      // Remove completed promises
      for (let j = executing.length - 1; j >= 0; j--) {
        if (
          await Promise.race([
            executing[j]?.then(() => true),
            Promise.resolve(false),
          ])
        ) {
          executing.splice(j, 1);
        }
      }
    }
  }

  // Wait for remaining promises
  await Promise.all(executing);

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
  const promises = items.map((item, index) => () => processor(item, index));

  const results = await executeWithErrorIsolation(promises, options);

  const successCount = results.filter(r => r.success).length;
  const errorCount = results.filter(r => !r.success).length;

  const errors = results
    .filter(
      (r): r is PromiseResult<TOutput> & { success: false; error: Error } =>
        !r.success && !!r.error
    )
    .map(r => ({
      index: r.index,
      error: r.error,
      item: items[r.index]!,
    }));

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
  const promiseFunctions = promises.map((promise, _index) => () => promise);

  const results = await executeWithErrorIsolation(promiseFunctions, options);

  const processedResults = results.map(r => (r.success ? r.data! : null));
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

      logger.debug('Retrying operation', {
        attempt: attempt + 1,
        maxRetries,
        delay,
        error: lastError.message,
      });
    }
  }

  throw lastError!;
}
