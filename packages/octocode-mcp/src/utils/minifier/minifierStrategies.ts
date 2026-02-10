/**
 * Language-specific minification strategies
 */

import { minify } from 'terser';
import CleanCSS from 'clean-css';
import { minify as htmlMinifierTerser } from 'html-minifier-terser';
import type {
  CommentPatternGroup,
  FileTypeMinifyConfig,
} from './minifierTypes.js';
import { MINIFY_CONFIG } from './minifierTypes.js';

/**
 * Remove comments from content based on comment pattern groups.
 */
export function removeComments(
  content: string,
  commentTypes: CommentPatternGroup | CommentPatternGroup[]
): string {
  try {
    let result = content;
    const types = Array.isArray(commentTypes) ? commentTypes : [commentTypes];

    for (const type of types) {
      const patterns = MINIFY_CONFIG.commentPatterns[type];
      if (patterns) {
        for (const pattern of patterns) {
          try {
            result = result.replace(pattern, '');
          } /* v8 ignore start */ catch {
            continue;
          } /* v8 ignore stop */
        }
      }
    }
    return result;
  } /* v8 ignore start */ catch {
    return content;
  } /* v8 ignore stop */
}

/**
 * Conservative minification - preserves structure, removes comments and trailing whitespace.
 */
export function minifyConservativeCore(
  content: string,
  config: FileTypeMinifyConfig
): string {
  try {
    let result = content;

    if (config.comments) {
      result = removeComments(
        result,
        config.comments as CommentPatternGroup | CommentPatternGroup[]
      );
    }

    return result
      .replace(/[ \t]+$/gm, '') // Remove trailing whitespace
      .replace(/\n\s*\n\s*\n+/g, '\n\n') // Collapse 3+ empty lines to 2
      .trim();
  } /* v8 ignore start */ catch {
    return content;
  } /* v8 ignore stop */
}

/**
 * Aggressive minification - collapses whitespace, removes comments.
 */
export function minifyAggressiveCore(
  content: string,
  config: FileTypeMinifyConfig
): string {
  try {
    let result = content;

    if (config.comments) {
      result = removeComments(
        result,
        config.comments as CommentPatternGroup | CommentPatternGroup[]
      );
    }

    return result
      .replace(/\s+/g, ' ') // Collapse all whitespace
      .replace(/\s*([{}:;,])\s*/g, '$1') // Remove spaces around syntax
      .replace(/>\s+</g, '><') // Remove whitespace between tags
      .trim();
  } /* v8 ignore start */ catch {
    return content;
  } /* v8 ignore stop */
}

/**
 * JSON minification - validates and stringifies JSON.
 */
export function minifyJsonCore(content: string): {
  content: string;
  failed: boolean;
  reason?: string;
} {
  try {
    return { content: JSON.stringify(JSON.parse(content)), failed: false };
  } catch {
    try {
      // Try JSONC (JSON with comments)
      const cleaned = removeComments(content, 'c-style');
      return { content: JSON.stringify(JSON.parse(cleaned)), failed: false };
    } catch {
      return { content: content.trim(), failed: false };
    }
  }
}

/**
 * General minification - basic whitespace cleanup.
 */
export function minifyGeneralCore(content: string): string {
  try {
    return content
      .replace(/[ \t]+$/gm, '') // Remove trailing whitespace
      .replace(/\r\n/g, '\n') // Normalize line endings
      .replace(/\n\s*\n\s*\n+/g, '\n\n') // Collapse 3+ empty lines
      .replace(/[ \t]{3,}/g, ' ') // Collapse excessive inline whitespace
      .trim();
  } /* v8 ignore start */ catch {
    return content;
  } /* v8 ignore stop */
}

/**
 * Markdown minification - preserves structure, removes comments and normalizes whitespace.
 */
export function minifyMarkdownCore(content: string): string {
  try {
    return content
      .replace(/<!--[\s\S]*?-->/g, '') // Remove HTML comments
      .replace(/[ \t]+$/gm, '') // Remove trailing whitespace
      .replace(/\r\n/g, '\n') // Normalize line endings
      .replace(/\n\s*\n\s*\n+/g, '\n\n') // Collapse empty lines
      .replace(/([^\n])[ \t]{5,}([^\n])/g, '$1 $2') // Collapse inline spaces
      .replace(/\s*\|\s*/g, ' | ') // Normalize table pipes
      .replace(/^(#{1,6})[ \t]+/gm, '$1 ') // Normalize headings
      .replace(/^(\s*)([-*+]|\d+\.)[ \t]+/gm, '$1$2 ') // Normalize lists
      .replace(/\n{3,}(```)/g, '\n\n$1') // Normalize before code blocks
      .replace(/(```)\n{3,}/g, '$1\n\n') // Normalize after code blocks
      .trim();
  } /* v8 ignore start */ catch {
    return content;
  } /* v8 ignore stop */
}

/**
 * CSS minification - removes comments and collapses whitespace.
 */
export function minifyCSSCore(content: string): string {
  try {
    return removeComments(content, 'c-style')
      .replace(/\s+/g, ' ')
      .replace(/\s*([{}:;,])\s*/g, '$1')
      .trim();
  } /* v8 ignore start */ catch {
    return content;
  } /* v8 ignore stop */
}

/**
 * HTML minification - removes comments and collapses whitespace.
 */
export function minifyHTMLCore(content: string): string {
  try {
    return removeComments(content, 'html')
      .replace(/\s+/g, ' ')
      .replace(/>\s+</g, '><')
      .trim();
  } /* v8 ignore start */ catch {
    return content;
  } /* v8 ignore stop */
}

/**
 * JavaScript minification - removes comments and collapses whitespace.
 */
export function minifyJavaScriptCore(content: string): string {
  try {
    return removeComments(content, 'c-style')
      .replace(/\s+/g, ' ')
      .replace(/\s*([{}();,:])\s*/g, '$1')
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0)
      .join('\n');
  } /* v8 ignore start */ catch {
    return content;
  } /* v8 ignore stop */
}

// ============================================================================
// Async Minification Strategies (uses external libs for better quality)
// ============================================================================

/**
 * Async JavaScript minification using Terser.
 */
export async function minifyWithTerser(
  content: string
): Promise<{ content: string; failed: boolean; reason?: string }> {
  try {
    if (!content.trim()) {
      return { content, failed: false };
    }

    const result = await minify(content, {
      compress: {
        drop_console: false,
        drop_debugger: false,
        sequences: true,
        conditionals: true,
        comparisons: true,
        evaluate: true,
        booleans: true,
        loops: false,
        unused: false,
        dead_code: true,
        side_effects: false,
      },
      mangle: false,
      format: {
        comments: false,
        beautify: false,
        semicolons: true,
      },
      sourceMap: false,
    });

    return { content: result.code || content, failed: false };
  } catch (error: unknown) {
    return {
      content,
      failed: true,
      reason: `Terser minification failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}

/**
 * Async CSS minification using CleanCSS.
 */
export async function minifyCSSAsync(
  content: string
): Promise<{ content: string; failed: boolean; reason?: string }> {
  try {
    const cleanCSS = new CleanCSS({
      level: 2,
      format: false,
      inline: false,
      rebase: false,
    });

    const result = cleanCSS.minify(content);

    if (result.errors && result.errors.length > 0) {
      throw new Error(result.errors.join(', '));
    }

    return { content: result.styles, failed: false };
  } catch (error: unknown) {
    // Gracefully fallback to regex minification
    return {
      content: minifyCSSCore(content),
      failed: false,
      reason: `CleanCSS fallback: ${error instanceof Error ? error.message : 'unknown'}`,
    };
  }
}

/**
 * Async HTML minification using html-minifier-terser.
 */
export async function minifyHTMLAsync(
  content: string
): Promise<{ content: string; failed: boolean; reason?: string }> {
  try {
    const result = await htmlMinifierTerser(content, {
      collapseWhitespace: true,
      removeComments: true,
      removeRedundantAttributes: true,
      removeScriptTypeAttributes: true,
      removeStyleLinkTypeAttributes: true,
      minifyCSS: false,
      minifyJS: false,
      caseSensitive: false,
    });

    return { content: result, failed: false };
  } catch (error: unknown) {
    // Gracefully fallback to regex minification
    return {
      content: minifyHTMLCore(content),
      failed: false,
      reason: `html-minifier fallback: ${error instanceof Error ? error.message : 'unknown'}`,
    };
  }
}
