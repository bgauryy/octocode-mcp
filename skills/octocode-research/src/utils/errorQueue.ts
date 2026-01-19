/**
 * Bounded queue for fire-and-forget operation errors.
 * Provides visibility into async errors without blocking main flow.
 *
 * @module utils/errorQueue
 */

interface QueuedError {
  timestamp: Date;
  error: Error;
  context?: string;
}

/**
 * Bounded error queue that stores recent errors from async operations.
 * Prevents unbounded memory growth while maintaining error visibility.
 */
class ErrorQueue {
  private errors: QueuedError[] = [];
  private readonly maxSize: number;

  constructor(maxSize = 100) {
    this.maxSize = maxSize;
  }

  /**
   * Add an error to the queue.
   * If queue is full, oldest error is removed.
   */
  push(error: unknown, context?: string): void {
    const normalizedError =
      error instanceof Error ? error : new Error(String(error));

    this.errors.push({
      timestamp: new Date(),
      error: normalizedError,
      context,
    });

    // Bounded: remove oldest when full
    if (this.errors.length > this.maxSize) {
      this.errors.shift();
    }
  }

  /**
   * Get the most recent errors.
   */
  getRecent(count = 10): QueuedError[] {
    return this.errors.slice(-count);
  }

  /**
   * Clear all errors from the queue.
   */
  clear(): void {
    this.errors = [];
  }

  /**
   * Get current queue size.
   */
  get size(): number {
    return this.errors.length;
  }
}

/**
 * Global error queue instance for fire-and-forget operations.
 */
export const errorQueue = new ErrorQueue();
