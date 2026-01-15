/**
 * Type guard utilities for consistent runtime type checking.
 * Use these instead of inline typeof checks across routes.
 *
 * @module types/guards
 */

/**
 * Check if value is a non-empty string
 */
export function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

/**
 * Check if value is a positive finite number
 */
export function isPositiveNumber(value: unknown): value is number {
  return typeof value === 'number' && value > 0 && Number.isFinite(value);
}

/**
 * Check if value is a non-negative finite number
 */
export function isNonNegativeNumber(value: unknown): value is number {
  return typeof value === 'number' && value >= 0 && Number.isFinite(value);
}

/**
 * Check if value is an array of non-empty strings
 */
export function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(isNonEmptyString);
}

/**
 * Check if value is an array (of any type)
 */
export function isArray(value: unknown): value is unknown[] {
  return Array.isArray(value);
}

/**
 * Check if value is a non-null object
 */
export function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Check if object has a specific property
 */
export function hasProperty<K extends string>(
  obj: unknown,
  key: K
): obj is Record<K, unknown> {
  return typeof obj === 'object' && obj !== null && key in obj;
}

/**
 * Check if object has a string property
 */
export function hasStringProperty<K extends string>(
  obj: unknown,
  key: K
): obj is Record<K, string> {
  return hasProperty(obj, key) && typeof obj[key] === 'string';
}

/**
 * Check if object has a number property
 */
export function hasNumberProperty<K extends string>(
  obj: unknown,
  key: K
): obj is Record<K, number> {
  return hasProperty(obj, key) && typeof obj[key] === 'number';
}

/**
 * Check if object has a boolean property
 */
export function hasBooleanProperty<K extends string>(
  obj: unknown,
  key: K
): obj is Record<K, boolean> {
  return hasProperty(obj, key) && typeof obj[key] === 'boolean';
}

/**
 * Check if object has an array property
 */
export function hasArrayProperty<K extends string>(
  obj: unknown,
  key: K
): obj is Record<K, unknown[]> {
  return hasProperty(obj, key) && Array.isArray(obj[key]);
}
