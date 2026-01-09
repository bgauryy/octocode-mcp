/**
 * File size formatting and parsing utilities
 */

/**
 * Formats bytes to human-readable string
 * @param bytes - Number of bytes
 * @returns Human-readable size string (e.g., "1.0KB", "5.0MB")
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0.0B';
  if (bytes < 1024) return `${bytes}.0B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  if (bytes < 1024 * 1024 * 1024)
    return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
  if (bytes < 1024 * 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)}GB`;
  }
  return `${(bytes / (1024 * 1024 * 1024 * 1024)).toFixed(1)}TB`;
}

/**
 * Parses human-readable size string to bytes
 * Supports formats: "1024", "1K", "5M", "2G", "1T" and also
 * decimal formats like "1.0KB", "5.5MB", "2.3GB", "1.0B"
 * @param sizeStr - Human-readable size string
 * @returns Number of bytes
 */
export function parseFileSize(sizeStr: string): number {
  const trimmed = sizeStr.trim();

  // Handle plain numbers (bytes)
  if (/^\d+$/.test(trimmed)) {
    return parseInt(trimmed, 10);
  }

  // Handle decimal format with full unit names (e.g., "1.0KB", "5.5MB", "0.0B")
  const decimalMatch = trimmed.match(/^(\d+(?:\.\d+)?)(B|KB|MB|GB|TB)$/i);
  if (decimalMatch && decimalMatch[1] && decimalMatch[2]) {
    const value = parseFloat(decimalMatch[1]);
    const unit = decimalMatch[2].toUpperCase();

    switch (unit) {
      case 'B':
        return Math.round(value);
      case 'KB':
        return Math.round(value * 1024);
      case 'MB':
        return Math.round(value * 1024 * 1024);
      case 'GB':
        return Math.round(value * 1024 * 1024 * 1024);
      case 'TB':
        return Math.round(value * 1024 * 1024 * 1024 * 1024);
    }
  }

  // Handle size with single letter unit (K, M, G, T) - supports both integer and decimal
  const match = trimmed.match(/^(\d+(?:\.\d+)?)([KMGT])$/i);
  if (!match || !match[1] || !match[2]) {
    throw new Error(`Invalid size format: ${sizeStr}`);
  }

  const value = parseFloat(match[1]);
  const unit = match[2].toUpperCase();

  switch (unit) {
    case 'K':
      return Math.round(value * 1024);
    case 'M':
      return Math.round(value * 1024 * 1024);
    case 'G':
      return Math.round(value * 1024 * 1024 * 1024);
    default:
      // 'T' - only remaining option after regex validation
      return Math.round(value * 1024 * 1024 * 1024 * 1024);
  }
}
