import { minifyContentSync } from '../../utils/minifier/index.js';

/**
 * Apply minification to content (always enabled for token efficiency)
 * Only replaces content if minification reduces size
 *
 * @param content - The content to minify
 * @param filePath - File path for determining minification strategy
 * @returns Minified content if smaller, otherwise original
 */
export function applyMinification(content: string, filePath: string): string {
  try {
    const minifiedContent = minifyContentSync(content, filePath);
    // Only use minified version if it's actually smaller
    return minifiedContent.length < content.length ? minifiedContent : content;
  } catch {
    // Keep original if minification fails
    return content;
  }
}
