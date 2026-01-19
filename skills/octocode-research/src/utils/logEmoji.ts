/**
 * Environment-aware emoji toggle for log messages.
 *
 * Disables emojis in production or when LOG_NO_EMOJI is set,
 * as they can cause issues with log parsing tools.
 *
 * @module utils/logEmoji
 */

// =============================================================================
// Configuration
// =============================================================================

/**
 * Check if emojis should be used in logs.
 * Returns false when:
 * - NODE_ENV is 'production'
 * - LOG_NO_EMOJI env var is truthy ('true', '1', 'yes')
 */
export function shouldUseEmoji(): boolean {
  if (process.env.NODE_ENV === 'production') return false;
  const noEmoji = process.env.LOG_NO_EMOJI;
  if (noEmoji === 'true' || noEmoji === '1' || noEmoji === 'yes') return false;
  return true;
}

// =============================================================================
// Emoji Registry
// =============================================================================

/**
 * Supported emoji keys for logging
 */
export type LogEmojiKey =
  | 'server'
  | 'shutdown'
  | 'logs'
  | 'routes'
  | 'success'
  | 'error'
  | 'warning'
  | 'info'
  | 'circuit_open'
  | 'circuit_closed'
  | 'circuit_half_open'
  | 'cleanup'
  | 'reset'
  | 'retry'
  | 'evict';

/**
 * Emoji map with fallback text alternatives
 */
const EMOJI_MAP: Record<LogEmojiKey, { emoji: string; fallback: string }> = {
  server: { emoji: '🔍', fallback: '[SERVER]' },
  shutdown: { emoji: '🛑', fallback: '[SHUTDOWN]' },
  logs: { emoji: '📁', fallback: '[LOGS]' },
  routes: { emoji: '📋', fallback: '[ROUTES]' },
  success: { emoji: '✅', fallback: '[OK]' },
  error: { emoji: '❌', fallback: '[ERROR]' },
  warning: { emoji: '⚠️', fallback: '[WARN]' },
  info: { emoji: 'ℹ️', fallback: '[INFO]' },
  circuit_open: { emoji: '🔴', fallback: '[OPEN]' },
  circuit_closed: { emoji: '🟢', fallback: '[CLOSED]' },
  circuit_half_open: { emoji: '🟡', fallback: '[HALF-OPEN]' },
  cleanup: { emoji: '🧹', fallback: '[CLEANUP]' },
  reset: { emoji: '🔄', fallback: '[RESET]' },
  retry: { emoji: '⟳', fallback: '[RETRY]' },
  evict: { emoji: '⚠️', fallback: '[EVICT]' },
};

// =============================================================================
// Public API
// =============================================================================

/**
 * Get the appropriate emoji or fallback text for a log key.
 *
 * @param key - The emoji key to retrieve
 * @returns Emoji string or fallback text based on environment
 */
export function getLogEmoji(key: LogEmojiKey): string {
  const entry = EMOJI_MAP[key];
  return shouldUseEmoji() ? entry.emoji : entry.fallback;
}

/**
 * Prefix a message with the appropriate emoji or fallback.
 *
 * @param key - The emoji key to use
 * @param message - The message to prefix
 * @returns Formatted message with emoji/fallback prefix
 *
 * @example
 * ```typescript
 * // Development: "🔍 Server running on port 1987"
 * // Production:  "[SERVER] Server running on port 1987"
 * console.log(prefixLog('server', 'Server running on port 1987'));
 * ```
 */
export function prefixLog(key: LogEmojiKey, message: string): string {
  return `${getLogEmoji(key)} ${message}`;
}
