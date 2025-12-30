/**
 * Unified content minification utilities for token optimization
 *
 * Provides both sync and async minification:
 * - minifyContentSync: Fast, regex-based, no external dependencies
 * - minifyContent: Async, uses terser/clean-css/html-minifier for better quality
 */

import { minify } from 'terser';
import CleanCSS from 'clean-css';
import { minify as htmlMinifierTerser } from 'html-minifier-terser';
import { getExtension } from '../fileFilters.js';

// ============================================================================
// Types
// ============================================================================

type CommentPatternGroup =
  | 'c-style'
  | 'hash'
  | 'html'
  | 'sql'
  | 'lua'
  | 'template'
  | 'haskell';

type Strategy =
  | 'terser'
  | 'conservative'
  | 'aggressive'
  | 'json'
  | 'general'
  | 'markdown';

interface FileTypeMinifyConfig {
  strategy: Strategy;
  comments?: CommentPatternGroup | CommentPatternGroup[];
}

interface MinifyConfig {
  commentPatterns: {
    [key in CommentPatternGroup]: RegExp[];
  };
  fileTypes: {
    [extension: string]: FileTypeMinifyConfig;
  };
}

interface MinifyResult {
  content: string;
  failed: boolean;
  type: Strategy | 'failed';
  reason?: string;
}

// ============================================================================
// Configuration
// ============================================================================

const MINIFY_CONFIG: MinifyConfig = {
  commentPatterns: {
    'c-style': [
      /\/\*[\s\S]*?\*\//g, // /* block comments */
      /^\s*\/\/.*$/gm, // // line comments at start of line
      /\s+\/\/.*$/gm, // // inline comments with space before
    ],
    hash: [
      /^\s*#(?!!).*$/gm, // # comments (but not shebangs #!)
      /\s+#.*$/gm, // # inline comments
    ],
    html: [
      /<!--[\s\S]*?-->/g, // <!-- HTML comments -->
    ],
    sql: [
      /--.*$/gm, // -- SQL comments
      /\/\*[\s\S]*?\*\//g, // /* SQL block comments */
    ],
    lua: [
      /^\s*--.*$/gm, // -- line comments
      /--\[\[[\s\S]*?\]\]/g, // --[[ block comments ]]
    ],
    template: [
      /\{\{!--[\s\S]*?--\}\}/g, // {{!-- Handlebars --}}
      /\{\{![\s\S]*?\}\}/g, // {{! Handlebars }}
      /<%#[\s\S]*?%>/g, // <%# EJS %>
      /\{#[\s\S]*?#\}/g, // {# Twig/Jinja #}
    ],
    haskell: [
      /^\s*--.*$/gm, // -- line comments
      /\s+--.*$/gm, // -- inline comments
      /\{-[\s\S]*?-\}/g, // {- block comments -}
    ],
  },

  fileTypes: {
    // JavaScript family - use terser (async) or aggressive (sync)
    js: { strategy: 'terser' },
    jsx: { strategy: 'terser' },
    mjs: { strategy: 'terser' },
    cjs: { strategy: 'terser' },

    // TypeScript - aggressive with c-style comments
    ts: { strategy: 'aggressive', comments: 'c-style' },
    tsx: { strategy: 'aggressive', comments: 'c-style' },

    // Indentation-sensitive languages - conservative
    py: { strategy: 'conservative', comments: 'hash' },
    yaml: { strategy: 'conservative', comments: 'hash' },
    yml: { strategy: 'conservative', comments: 'hash' },
    coffee: { strategy: 'conservative', comments: 'hash' },
    nim: { strategy: 'conservative', comments: 'hash' },
    haml: { strategy: 'conservative', comments: 'hash' },
    slim: { strategy: 'conservative', comments: 'hash' },
    sass: { strategy: 'conservative', comments: 'c-style' },
    styl: { strategy: 'conservative', comments: 'c-style' },

    // Markup languages
    html: { strategy: 'aggressive', comments: 'html' },
    htm: { strategy: 'aggressive', comments: 'html' },
    xml: { strategy: 'aggressive', comments: 'html' },
    svg: { strategy: 'aggressive', comments: 'html' },

    // Stylesheets
    css: { strategy: 'aggressive', comments: 'c-style' },
    less: { strategy: 'aggressive', comments: 'c-style' },
    scss: { strategy: 'aggressive', comments: 'c-style' },

    // Data formats
    json: { strategy: 'json' },

    // C-style comment languages
    go: { strategy: 'aggressive', comments: 'c-style' },
    java: { strategy: 'aggressive', comments: 'c-style' },
    c: { strategy: 'aggressive', comments: 'c-style' },
    cpp: { strategy: 'aggressive', comments: 'c-style' },
    cs: { strategy: 'aggressive', comments: 'c-style' },
    rust: { strategy: 'aggressive', comments: 'c-style' },
    rs: { strategy: 'aggressive', comments: 'c-style' },
    swift: { strategy: 'aggressive', comments: 'c-style' },
    kotlin: { strategy: 'aggressive', comments: 'c-style' },
    scala: { strategy: 'aggressive', comments: 'c-style' },
    dart: { strategy: 'aggressive', comments: 'c-style' },

    // Scripting languages
    php: { strategy: 'aggressive', comments: ['c-style', 'hash'] },
    rb: { strategy: 'aggressive', comments: 'hash' },
    perl: { strategy: 'aggressive', comments: 'hash' },
    sh: { strategy: 'conservative', comments: 'hash' },
    bash: { strategy: 'conservative', comments: 'hash' },

    // Query languages
    sql: { strategy: 'aggressive', comments: 'sql' },

    // Others
    lua: { strategy: 'aggressive', comments: 'lua' },
    r: { strategy: 'aggressive', comments: 'hash' },

    // Template languages
    hbs: { strategy: 'aggressive', comments: 'template' },
    handlebars: { strategy: 'aggressive', comments: 'template' },
    ejs: { strategy: 'aggressive', comments: 'template' },
    pug: { strategy: 'conservative', comments: 'c-style' },
    jade: { strategy: 'conservative', comments: 'c-style' },
    mustache: { strategy: 'aggressive', comments: 'template' },
    twig: { strategy: 'aggressive', comments: 'template' },
    jinja: { strategy: 'aggressive', comments: 'template' },
    jinja2: { strategy: 'aggressive', comments: 'template' },
    erb: { strategy: 'aggressive', comments: 'template' },

    // Modern frontend
    vue: { strategy: 'aggressive', comments: 'html' },
    svelte: { strategy: 'aggressive', comments: 'html' },

    // Data formats
    graphql: { strategy: 'aggressive', comments: 'hash' },
    gql: { strategy: 'aggressive', comments: 'hash' },
    proto: { strategy: 'aggressive', comments: 'c-style' },
    csv: { strategy: 'conservative' },
    toml: { strategy: 'aggressive', comments: 'hash' },
    ini: { strategy: 'aggressive', comments: 'hash' },
    conf: { strategy: 'aggressive', comments: 'hash' },
    config: { strategy: 'aggressive', comments: 'hash' },
    env: { strategy: 'aggressive', comments: 'hash' },
    properties: { strategy: 'aggressive', comments: 'hash' },

    // Infrastructure
    tf: { strategy: 'aggressive', comments: ['hash', 'c-style'] },
    tfvars: { strategy: 'aggressive', comments: ['hash', 'c-style'] },
    pp: { strategy: 'aggressive', comments: 'hash' },

    // Documentation
    md: { strategy: 'markdown' },
    markdown: { strategy: 'markdown' },
    rst: { strategy: 'conservative', comments: 'hash' },

    // Build systems
    star: { strategy: 'conservative', comments: 'hash' },
    bzl: { strategy: 'conservative', comments: 'hash' },
    cmake: { strategy: 'conservative', comments: 'hash' },

    // Additional languages
    pl: { strategy: 'aggressive', comments: 'hash' },
    pm: { strategy: 'aggressive', comments: 'hash' },
    fs: { strategy: 'conservative', comments: 'c-style' },
    fsx: { strategy: 'conservative', comments: 'c-style' },
    hs: { strategy: 'conservative', comments: 'haskell' },
    lhs: { strategy: 'conservative', comments: 'haskell' },
    elm: { strategy: 'conservative', comments: 'c-style' },
    clj: { strategy: 'aggressive', comments: 'hash' },
    cljs: { strategy: 'aggressive', comments: 'hash' },
    ex: { strategy: 'aggressive', comments: 'hash' },
    exs: { strategy: 'aggressive', comments: 'hash' },
    erl: { strategy: 'aggressive', comments: 'hash' },
    hrl: { strategy: 'aggressive', comments: 'hash' },

    // Plain text and misc
    txt: { strategy: 'general' },
    log: { strategy: 'general' },
    cfg: { strategy: 'aggressive', comments: 'hash' },
    gitignore: { strategy: 'aggressive', comments: 'hash' },
    dockerignore: { strategy: 'aggressive', comments: 'hash' },
  },
};

// Indentation-sensitive filenames (no extension)
const INDENTATION_SENSITIVE_NAMES = new Set([
  'makefile',
  'dockerfile',
  'procfile',
  'justfile',
  'rakefile',
  'gemfile',
  'podfile',
  'fastfile',
  'vagrantfile',
  'jenkinsfile',
  'cakefile',
  'pipfile',
  'buildfile',
  'capfile',
  'brewfile',
]);

// ============================================================================
// Shared Utilities
// ============================================================================

/** Extension options for minifier: lowercase with 'txt' fallback */
const MINIFIER_EXT_OPTIONS = { lowercase: true, fallback: 'txt' } as const;

function getFileConfig(filePath: string): FileTypeMinifyConfig {
  const ext = getExtension(filePath, MINIFIER_EXT_OPTIONS);
  const baseName = (filePath.split('/').pop() || '').toLowerCase();

  if (INDENTATION_SENSITIVE_NAMES.has(baseName)) {
    return { strategy: 'conservative', comments: 'hash' };
  }

  return MINIFY_CONFIG.fileTypes[ext] || { strategy: 'general' };
}

function removeComments(
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

// ============================================================================
// Core Minification Functions (Shared by sync and async)
// ============================================================================

function minifyConservativeCore(
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

function minifyAggressiveCore(
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

function minifyJsonCore(content: string): {
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

function minifyGeneralCore(content: string): string {
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

function minifyMarkdownCore(content: string): string {
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

function minifyCSSCore(content: string): string {
  try {
    return removeComments(content, 'c-style')
      .replace(/\s+/g, ' ')
      .replace(/\s*([{}:;,])\s*/g, '$1')
      .trim();
  } /* v8 ignore start */ catch {
    return content;
  } /* v8 ignore stop */
}

function minifyHTMLCore(content: string): string {
  try {
    return removeComments(content, 'html')
      .replace(/\s+/g, ' ')
      .replace(/>\s+</g, '><')
      .trim();
  } /* v8 ignore start */ catch {
    return content;
  } /* v8 ignore stop */
}

function minifyJavaScriptCore(content: string): string {
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
// Synchronous Minification (regex-based, no external deps)
// ============================================================================

/**
 * Synchronous content minification - fast, regex-based, no external dependencies.
 * Preferred for local file operations where simplicity and performance matter.
 */
export function minifyContentSync(content: string, filePath: string): string {
  const config = getFileConfig(filePath);
  const ext = getExtension(filePath, MINIFIER_EXT_OPTIONS);

  try {
    switch (config.strategy) {
      case 'terser':
        // Sync version uses regex-based JS minification
        return minifyJavaScriptCore(content);

      case 'json':
        return minifyJsonCore(content).content;

      case 'conservative':
        return minifyConservativeCore(content, config);

      case 'markdown':
        return minifyMarkdownCore(content);

      case 'aggressive':
        if (['css', 'less', 'scss'].includes(ext)) {
          return minifyCSSCore(content);
        }
        if (['html', 'htm', 'xml', 'svg'].includes(ext)) {
          return minifyHTMLCore(content);
        }
        return minifyAggressiveCore(content, config);

      case 'general':
      default:
        return minifyGeneralCore(content);
    }
  } /* v8 ignore start */ catch {
    return content;
  } /* v8 ignore stop */
}

// ============================================================================
// Async Minification (uses external libs for better quality)
// ============================================================================

async function minifyWithTerser(
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

async function minifyCSSAsync(
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

async function minifyHTMLAsync(
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

/**
 * Async content minification - uses terser/clean-css/html-minifier for better quality.
 * Preferred for GitHub API operations where minification quality matters.
 */
export async function minifyContent(
  content: string,
  filePath: string
): Promise<MinifyResult> {
  try {
    const MAX_SIZE = 1024 * 1024; // 1MB
    const contentSize = Buffer.byteLength(content, 'utf8');

    if (contentSize > MAX_SIZE) {
      return {
        content,
        failed: true,
        type: 'failed',
        reason: `File too large: ${(contentSize / 1024 / 1024).toFixed(2)}MB exceeds 1MB limit`,
      };
    }

    const config = getFileConfig(filePath);
    const ext = getExtension(filePath, MINIFIER_EXT_OPTIONS);

    switch (config.strategy) {
      case 'terser': {
        const result = await minifyWithTerser(content);
        return {
          content: result.content,
          failed: result.failed,
          type: result.failed ? 'failed' : 'terser',
          ...(result.reason && { reason: result.reason }),
        };
      }

      case 'json': {
        const result = minifyJsonCore(content);
        return {
          content: result.content,
          failed: result.failed,
          type: result.failed ? 'failed' : 'json',
          ...(result.reason && { reason: result.reason }),
        };
      }

      case 'conservative':
        return {
          content: minifyConservativeCore(content, config),
          failed: false,
          type: 'conservative',
        };

      case 'general':
        return {
          content: minifyGeneralCore(content),
          failed: false,
          type: 'general',
        };

      case 'markdown':
        return {
          content: minifyMarkdownCore(content),
          failed: false,
          type: 'markdown',
        };

      case 'aggressive': {
        if (['css', 'less', 'scss'].includes(ext)) {
          const result = await minifyCSSAsync(content);
          return {
            content: result.content,
            failed: false,
            type: 'aggressive',
            ...(result.reason && { reason: result.reason }),
          };
        }

        if (['html', 'htm'].includes(ext)) {
          const result = await minifyHTMLAsync(content);
          return {
            content: result.content,
            failed: false,
            type: 'aggressive',
            ...(result.reason && { reason: result.reason }),
          };
        }

        return {
          content: minifyAggressiveCore(content, config),
          failed: false,
          type: 'aggressive',
        };
      }
    }
  } catch (error: unknown) {
    return {
      content,
      failed: true,
      type: 'failed',
      reason: `Unexpected minification error: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}

export { MINIFY_CONFIG };
