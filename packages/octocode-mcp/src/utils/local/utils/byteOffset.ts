/**
 * Byte offset utilities for handling ripgrep's UTF-8 byte-based offsets.
 *
 * Ripgrep returns byte offsets for performance, but JavaScript strings use
 * UTF-16 code units. These utilities help convert between the two.
 *
 */

/**
 * Extract a substring from content using byte offsets.
 *
 * This is the recommended approach (used by VS Code) for extracting content
 * when you have byte offsets from ripgrep.
 *
 * @param content - The string content
 * @param byteStart - Start byte offset (inclusive)
 * @param byteEnd - End byte offset (exclusive)
 * @returns The extracted substring
 *
 * @example
 * ```typescript
 * const content = "Hello 🌍 World";
 * // The emoji is 4 bytes in UTF-8
 * const slice = byteSlice(content, 6, 10); // Returns "🌍"
 * ```
 */
export function byteSlice(
  content: string,
  byteStart: number,
  byteEnd: number
): string {
  const buffer = Buffer.from(content, 'utf8');
  return buffer.slice(byteStart, byteEnd).toString('utf8');
}

/**
 * Convert a byte offset to a character (UTF-16 code unit) index.
 *
 * Useful when you need to work with string indices in JavaScript
 * but have byte offsets from ripgrep.
 *
 * @param content - The string content
 * @param byteOffset - The byte offset to convert
 * @returns The character index corresponding to the byte offset
 *
 * @example
 * ```typescript
 * const content = "Hello 🌍 World";
 * const charIndex = byteToCharIndex(content, 10); // Returns 7
 * // Byte 10 is after the 4-byte emoji, which is 1 char at index 6
 * ```
 */
export function byteToCharIndex(content: string, byteOffset: number): number {
  if (byteOffset === 0) return 0;

  const buffer = Buffer.from(content, 'utf8');
  // Clamp to valid range
  const clampedOffset = Math.min(byteOffset, buffer.length);
  // Get the substring up to the byte offset and return its length
  const substring = buffer.slice(0, clampedOffset).toString('utf8');
  return substring.length;
}

/**
 * Convert a character (UTF-16 code unit) index to a byte offset.
 *
 * Useful for converting JavaScript string indices to byte offsets
 * that can be used with ripgrep or other byte-based tools.
 *
 * @param content - The string content
 * @param charIndex - The character index to convert
 * @returns The byte offset corresponding to the character index
 *
 * @example
 * ```typescript
 * const content = "Hello 🌍 World";
 * const byteOffset = charToByteIndex(content, 7); // Returns 10
 * // Character 7 is after the emoji, which takes 4 bytes
 * ```
 */
export function charToByteIndex(content: string, charIndex: number): number {
  return Buffer.byteLength(content.substring(0, charIndex), 'utf8');
}

/**
 * Get the byte length of a string in UTF-8 encoding.
 *
 * @param content - The string to measure
 * @returns The byte length in UTF-8
 *
 * @example
 * ```typescript
 * getByteLength("Hello"); // Returns 5 (ASCII)
 * getByteLength("🌍"); // Returns 4 (emoji is 4 bytes)
 * getByteLength("日本語"); // Returns 9 (3 chars × 3 bytes each)
 * ```
 */
export function getByteLength(content: string): number {
  return Buffer.byteLength(content, 'utf8');
}

/**
 * Convert byte-based match location to character-based location.
 *
 * This is useful for converting ripgrep match results to editor positions.
 *
 * @param content - The full content string
 * @param byteOffset - The byte offset of the match
 * @param byteLength - The byte length of the match
 * @returns Object with character offset, length, and the matched text
 *
 * @example
 * ```typescript
 * const content = "Hello 🌍 World";
 * const result = convertByteMatchToChar(content, 6, 4);
 * // Returns { charOffset: 6, charLength: 2, text: "🌍" }
 * // Note: emoji is 2 UTF-16 code units (surrogate pair)
 * ```
 */
export function convertByteMatchToChar(
  content: string,
  byteOffset: number,
  byteLength: number
): {
  charOffset: number;
  charLength: number;
  text: string;
} {
  const text = byteSlice(content, byteOffset, byteOffset + byteLength);
  const charOffset = byteToCharIndex(content, byteOffset);

  return {
    charOffset,
    charLength: text.length,
    text,
  };
}
