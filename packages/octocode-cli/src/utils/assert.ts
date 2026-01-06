/**
 * Runtime assertion utilities for defensive programming.
 *
 * These helpers replace non-null assertions (!) with explicit runtime checks
 * that provide clear error messages when invariants are violated.
 */

/**
 * Asserts that a value is defined (not null or undefined).
 * Use this instead of non-null assertion (!) when you need runtime safety.
 *
 * @throws Error if value is null or undefined
 */
export function assertDefined<T>(
  value: T | null | undefined,
  message: string
): T {
  if (value === null || value === undefined) {
    throw new Error(`Assertion failed: ${message}`);
  }
  return value;
}

/**
 * Asserts that code path should never be reached.
 * Useful for exhaustive switch statements.
 *
 * @throws Error always
 */
export function assertNever(value: never, message?: string): never {
  throw new Error(message ?? `Unexpected value: ${JSON.stringify(value)}`);
}
