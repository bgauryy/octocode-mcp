/**
 * Content minification utilities for token optimization
 */

import { getExtension } from './fileFilters.js';

/**
 * Minifies content based on file type
 * Removes extra whitespace, comments where safe, and normalizes line endings
 */
export function minifyContent(content: string, filePath: string): string {
  const extension = getExtension(filePath);

  try {
    switch (extension) {
      case 'js':
      case 'jsx':
      case 'ts':
      case 'tsx':
      case 'mjs':
      case 'cjs':
        return minifyJavaScript(content);

      case 'json':
        return minifyJSON(content);

      case 'css':
      case 'scss':
      case 'sass':
      case 'less':
        return minifyCSS(content);

      case 'html':
      case 'htm':
      case 'xml':
        return minifyHTML(content);

      case 'md':
      case 'markdown':
        return minifyMarkdown(content);

      case 'py':
      case 'rb':
      case 'sh':
      case 'bash':
      case 'yaml':
      case 'yml':
        // Conservative minification for indentation-sensitive languages
        return minifyConservative(content);

      default:
        return minifyGeneral(content);
    }
  } catch {
    // If minification fails, return original content
    return content;
  }
}

/**
 * Minifies JavaScript/TypeScript code
 * Removes single-line comments, extra whitespace, and normalizes formatting
 */
function minifyJavaScript(content: string): string {
  return (
    content
      // Remove single-line comments (but not URLs)
      .replace(/(?<!:)\/\/[^\n]*/g, '')
      // Remove multi-line comments (but preserve JSDoc for types)
      .replace(/\/\*(?!\*)[^*]*\*+(?:[^/*][^*]*\*+)*\//g, '')
      // Remove extra whitespace
      .replace(/\s+/g, ' ')
      // Remove whitespace around operators and brackets
      .replace(/\s*([{}();,:])\s*/g, '$1')
      // Trim lines
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .join('\n')
  );
}

/**
 * Minifies JSON content
 */
function minifyJSON(content: string): string {
  try {
    const parsed = JSON.parse(content);
    return JSON.stringify(parsed);
  } catch {
    return content;
  }
}

/**
 * Minifies CSS content
 */
function minifyCSS(content: string): string {
  return (
    content
      // Remove comments
      .replace(/\/\*[^*]*\*+(?:[^/*][^*]*\*+)*\//g, '')
      // Remove extra whitespace
      .replace(/\s+/g, ' ')
      // Remove whitespace around special characters
      .replace(/\s*([{}:;,])\s*/g, '$1')
      .trim()
  );
}

/**
 * Minifies HTML/XML content
 */
function minifyHTML(content: string): string {
  return (
    content
      // Remove HTML comments
      .replace(/<!--[^>]*-->/g, '')
      // Remove extra whitespace between tags
      .replace(/>\s+</g, '><')
      // Remove extra whitespace
      .replace(/\s+/g, ' ')
      .trim()
  );
}

/**
 * Minifies Markdown content
 * Removes excessive blank lines while preserving structure
 */
function minifyMarkdown(content: string): string {
  return (
    content
      // Remove excessive blank lines (more than 2)
      .replace(/\n{3,}/g, '\n\n')
      // Remove trailing whitespace from lines
      .split('\n')
      .map((line) => line.trimEnd())
      .join('\n')
      .trim()
  );
}

/**
 * Conservative minification for indentation-sensitive languages
 * Only removes trailing whitespace and excessive blank lines
 */
function minifyConservative(content: string): string {
  return (
    content
      // Remove excessive blank lines (more than 2)
      .replace(/\n{3,}/g, '\n\n')
      // Remove trailing whitespace
      .split('\n')
      .map((line) => line.trimEnd())
      .join('\n')
      .trim()
  );
}

/**
 * General minification for unknown file types
 * Very conservative - only removes trailing whitespace and excessive blank lines
 */
function minifyGeneral(content: string): string {
  return (
    content
      // Remove excessive blank lines
      .replace(/\n{3,}/g, '\n\n')
      // Remove trailing whitespace
      .split('\n')
      .map((line) => line.trimEnd())
      .join('\n')
      .trim()
  );
}

/**
 * Calculates token savings from minification
 */
export function calculateTokenSavings(
  original: string,
  minified: string
): number {
  const originalSize = original.length;
  const minifiedSize = minified.length;
  const savings = originalSize - minifiedSize;
  return Math.round((savings / originalSize) * 100);
}
