/**
 * File size formatting utilities
 * Shared across tools to ensure consistent human-readable size formatting
 */

/**
 * Formats bytes to human-readable size (B, KB, MB, GB, TB)
 *
 * Uses binary units (1024 bytes = 1KB) and formats to 1 decimal place.
 *
 * @param bytes - File size in bytes
 * @returns Formatted size string (e.g., "1.5MB", "192KB", "3.2GB")
 *
 * @example
 * ```typescript
 * formatFileSize(1024)       // "1.0KB"
 * formatFileSize(1536)       // "1.5KB"
 * formatFileSize(1048576)    // "1.0MB"
 * formatFileSize(512)        // "512.0B"
 * ```
 */
export function formatFileSize(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let size = bytes;
  let unitIndex = 0;

  // Divide by 1024 until we reach the appropriate unit
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }

  // Format to 1 decimal place for consistency
  return `${size.toFixed(1)}${units[unitIndex]}`;
}

/**
 * Parses human-readable size string to bytes
 *
 * Supports K, M, G, T suffixes (binary units: 1K = 1024 bytes)
 *
 * @param sizeStr - Size string (e.g., "1.5M", "192K", "10G")
 * @returns Size in bytes, or 0 if parsing fails
 *
 * @example
 * ```typescript
 * parseFileSize("1K")    // 1024
 * parseFileSize("1.5M")  // 1572864
 * parseFileSize("10G")   // 10737418240
 * ```
 */
export function parseFileSize(sizeStr: string): number {
  const match = sizeStr.match(/^([\d.]+)([KMGT]?)$/);
  if (!match) return 0;

  const [, numStr, unit] = match;
  const num = parseFloat(numStr);

  switch (unit) {
    case 'K':
      return Math.round(num * 1024);
    case 'M':
      return Math.round(num * 1024 * 1024);
    case 'G':
      return Math.round(num * 1024 * 1024 * 1024);
    case 'T':
      return Math.round(num * 1024 * 1024 * 1024 * 1024);
    default:
      return Math.round(num);
  }
}
