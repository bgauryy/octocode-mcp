import { minify } from 'terser';
import CleanCSS from 'clean-css';
import { minify as htmlMinifierTerser } from 'html-minifier-terser';

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

const MINIFY_CONFIG: MinifyConfig = {
  // Comment removal patterns by language family
  commentPatterns: {
    'c-style': [
      /\/\*[\s\S]*?\*\//g, // /* block comments */
      /^\s*\/\/.*$/gm, // // line comments at start of line
      /\s+\/\/.*$/gm, // // inline comments with space before
    ],
    hash: [
      /^\s*#(?!!).*$/gm, // # comments at start of line (but not shebangs #!)
      /\s+#.*$/gm, // # inline comments with space before
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
    // Template comment patterns
    template: [
      /\{\{!--[\s\S]*?--\}\}/g, // {{!-- Handlebars comments --}}
      /\{\{![\s\S]*?\}\}/g, // {{! Handlebars comments }}
      /<%#[\s\S]*?%>/g, // <%# EJS comments %>
      /\{#[\s\S]*?#\}/g, // {# Twig/Jinja comments #}
    ],
    // Haskell comment patterns
    haskell: [
      /^\s*--.*$/gm, // -- line comments at start of line
      /\s+--.*$/gm, // -- inline comments with space before
      /\{-[\s\S]*?-\}/g, // {- block comments -}
    ],
  },

  // File type mappings - much simpler than 50+ case statements
  fileTypes: {
    // JavaScript family - use terser
    js: { strategy: 'terser' },
    ts: { strategy: 'terser' },
    jsx: { strategy: 'terser' },
    tsx: { strategy: 'terser' },
    mjs: { strategy: 'terser' },
    cjs: { strategy: 'terser' },

    // Indentation-sensitive languages - conservative approach
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

    // Programming languages with C-style comments
    go: { strategy: 'aggressive', comments: 'c-style' },
    java: { strategy: 'aggressive', comments: 'c-style' },
    c: { strategy: 'aggressive', comments: 'c-style' },
    cpp: { strategy: 'aggressive', comments: 'c-style' },
    cs: { strategy: 'aggressive', comments: 'c-style' },
    rust: { strategy: 'aggressive', comments: 'c-style' },
    rs: { strategy: 'aggressive', comments: 'c-style' }, // Rust extension
    swift: { strategy: 'aggressive', comments: 'c-style' },
    kotlin: { strategy: 'aggressive', comments: 'c-style' },
    scala: { strategy: 'aggressive', comments: 'c-style' },
    dart: { strategy: 'aggressive', comments: 'c-style' },

    // Scripting languages
    php: { strategy: 'aggressive', comments: ['c-style', 'hash'] },
    rb: { strategy: 'aggressive', comments: 'hash' },
    perl: { strategy: 'aggressive', comments: 'hash' },
    sh: { strategy: 'aggressive', comments: 'hash' },
    bash: { strategy: 'aggressive', comments: 'hash' },

    // Query languages
    sql: { strategy: 'aggressive', comments: 'sql' },

    // Others
    lua: { strategy: 'aggressive', comments: 'lua' },
    r: { strategy: 'aggressive', comments: 'hash' },

    // Template languages (missing from V2)
    hbs: { strategy: 'aggressive', comments: 'template' },
    handlebars: { strategy: 'aggressive', comments: 'template' },
    ejs: { strategy: 'aggressive', comments: 'template' },
    pug: { strategy: 'conservative', comments: 'c-style' }, // Indentation-sensitive
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
    csv: { strategy: 'conservative' }, // No comments, just whitespace
    toml: { strategy: 'aggressive', comments: 'hash' },
    ini: { strategy: 'aggressive', comments: 'hash' },
    conf: { strategy: 'aggressive', comments: 'hash' },
    config: { strategy: 'aggressive', comments: 'hash' },
    env: { strategy: 'aggressive', comments: 'hash' },
    properties: { strategy: 'aggressive', comments: 'hash' },

    // Infrastructure
    tf: { strategy: 'aggressive', comments: ['hash', 'c-style'] },
    tfvars: { strategy: 'aggressive', comments: ['hash', 'c-style'] },
    pp: { strategy: 'aggressive', comments: 'hash' }, // Puppet

    // Documentation
    md: { strategy: 'markdown' }, // Markdown - specialized minification
    markdown: { strategy: 'markdown' },
    rst: { strategy: 'conservative', comments: 'hash' },

    // Build systems
    star: { strategy: 'conservative', comments: 'hash' }, // Starlark - Python-like
    bzl: { strategy: 'conservative', comments: 'hash' },
    cmake: { strategy: 'conservative', comments: 'hash' },

    // Additional top development languages
    pl: { strategy: 'aggressive', comments: 'hash' }, // Perl
    pm: { strategy: 'aggressive', comments: 'hash' }, // Perl modules
    fs: { strategy: 'conservative', comments: 'c-style' }, // F#
    fsx: { strategy: 'conservative', comments: 'c-style' }, // F# script
    hs: { strategy: 'conservative', comments: 'haskell' }, // Haskell
    lhs: { strategy: 'conservative', comments: 'haskell' }, // Literate Haskell
    elm: { strategy: 'conservative', comments: 'c-style' }, // Elm
    clj: { strategy: 'aggressive', comments: 'hash' }, // Clojure
    cljs: { strategy: 'aggressive', comments: 'hash' }, // ClojureScript
    ex: { strategy: 'aggressive', comments: 'hash' }, // Elixir
    exs: { strategy: 'aggressive', comments: 'hash' }, // Elixir script
    erl: { strategy: 'aggressive', comments: 'hash' }, // Erlang
    hrl: { strategy: 'aggressive', comments: 'hash' }, // Erlang header
    // Plain text and documentation files
    txt: { strategy: 'general' }, // Plain text - general minification
    log: { strategy: 'general' }, // Log files
    cfg: { strategy: 'aggressive', comments: 'hash' }, // Config files
    gitignore: { strategy: 'aggressive', comments: 'hash' },
    dockerignore: { strategy: 'aggressive', comments: 'hash' },
  },
};

// Helper functions
function getFileExtension(filePath: string): string {
  return filePath.split('.').pop()?.toLowerCase() || 'txt';
}

function getFileConfig(filePath: string) {
  const ext = getFileExtension(filePath);

  // Filename-based detection for indentation/whitespace sensitive files
  // Many infra/devtool files have no extension and rely on indentation/tabs
  const baseName = filePath.split('/').pop() || '';
  const baseNameLower = baseName.toLowerCase();
  const indentationSensitiveNames = new Set([
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

  if (indentationSensitiveNames.has(baseNameLower)) {
    return {
      strategy: 'conservative',
      comments: 'hash',
    } as FileTypeMinifyConfig;
  }

  return (
    MINIFY_CONFIG.fileTypes[ext] || {
      strategy: 'general', // Default to general minification for unknown extensions
    }
  );
}

// Minification strategies with comprehensive error protection
async function minifyWithTerser(
  content: string
): Promise<{ content: string; failed: boolean; reason?: string }> {
  try {
    // Handle empty content gracefully
    if (!content.trim()) {
      return {
        content: content,
        failed: false,
      };
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

    return {
      content: result.code || content,
      failed: false,
    };
  } catch (error: unknown) {
    // Always return original content on failure
    return {
      content: content,
      failed: true,
      reason: `Terser minification failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}

function removeComments(
  content: string,
  commentTypes: string | string[]
): string {
  try {
    let result = content;
    const types = Array.isArray(commentTypes) ? commentTypes : [commentTypes];

    for (const type of types) {
      const patterns =
        MINIFY_CONFIG.commentPatterns[type as CommentPatternGroup];
      if (patterns) {
        for (const pattern of patterns) {
          try {
            result = result.replace(pattern, '');
          } catch {
            // Continue with other patterns if one fails
            continue;
          }
        }
      }
    }

    return result;
  } catch {
    // Return original content if comment removal fails
    return content;
  }
}

function minifyConservative(
  content: string,
  config: FileTypeMinifyConfig
): string {
  try {
    let result = content;

    // Remove comments if specified
    if (config.comments) {
      result = removeComments(result, config.comments as string | string[]);
    }

    // Conservative whitespace handling - preserve line structure and indentation
    result = result
      .replace(/[ \t]+$/gm, '') // Remove trailing whitespace
      .replace(/\n\s*\n\s*\n+/g, '\n\n') // Collapse excessive empty lines (3+ -> 2)
      .trim();

    return result;
  } catch {
    // Return original content if conservative minification fails
    return content;
  }
}

async function minifyCSS(
  content: string
): Promise<{ content: string; failed: boolean; reason?: string }> {
  try {
    const cleanCSS = new CleanCSS({
      level: 2, // More aggressive optimization
      format: false, // Minify completely (no beautification)
      inline: false, // Don't inline imports
      rebase: false, // Don't rebase URLs
    });

    const result = cleanCSS.minify(content);

    if (result.errors && result.errors.length > 0) {
      throw new Error(result.errors.join(', '));
    }

    return {
      content: result.styles,
      failed: false,
    };
  } catch {
    try {
      // Fallback to regex-based minification
      let result = content;
      result = removeComments(result, 'c-style');
      result = result
        .replace(/\s+/g, ' ')
        .replace(/\s*([{}:;,])\s*/g, '$1')
        .trim();

      return {
        content: result,
        failed: false, // Don't mark as failed since we have fallback
      };
    } catch {
      // If even fallback fails, return original content
      return {
        content: content,
        failed: true,
        reason: `CSS minification failed: CleanCSS error and regex fallback failed`,
      };
    }
  }
}

async function minifyHTML(
  content: string
): Promise<{ content: string; failed: boolean; reason?: string }> {
  try {
    const result = await htmlMinifierTerser(content, {
      collapseWhitespace: true,
      removeComments: true,
      removeRedundantAttributes: true,
      removeScriptTypeAttributes: true,
      removeStyleLinkTypeAttributes: true,
      minifyCSS: false, // Don't minify embedded CSS (we handle separately)
      minifyJS: false, // Don't minify embedded JS (we handle separately)
      caseSensitive: false,
    });

    return {
      content: result,
      failed: false,
    };
  } catch {
    try {
      // Fallback to regex-based minification
      let result = content;
      result = removeComments(result, 'html');
      result = result.replace(/\s+/g, ' ').replace(/>\s+</g, '><').trim();

      return {
        content: result,
        failed: false, // Don't mark as failed since we have fallback
      };
    } catch {
      // If even fallback fails, return original content
      return {
        content: content,
        failed: true,
        reason: `HTML minification failed: html-minifier-terser error and regex fallback failed`,
      };
    }
  }
}

function minifyAggressive(
  content: string,
  config: FileTypeMinifyConfig
): string {
  try {
    let result = content;

    // Remove comments if specified
    if (config.comments) {
      result = removeComments(result, config.comments as string | string[]);
    }

    // Aggressive whitespace handling
    result = result
      .replace(/\s+/g, ' ') // Collapse all whitespace to single spaces
      .replace(/\s*([{}:;,])\s*/g, '$1') // Remove spaces around CSS/code syntax
      .replace(/>\s+</g, '><') // Remove whitespace between HTML tags
      .trim();

    return result;
  } catch {
    // Return original content if aggressive minification fails
    return content;
  }
}

function minifyJson(content: string): {
  content: string;
  failed: boolean;
  reason?: string;
} {
  try {
    const parsed = JSON.parse(content);
    return {
      content: JSON.stringify(parsed),
      failed: false,
    };
  } catch {
    try {
      // Try to remove comments (support for JSONC)
      // We try c-style comments as they are the most common in JSONC
      // Note: This might corrupt strings with // in them, but if so,
      // the subsequent JSON.parse will likely fail, sending us to the final fallback
      const contentWithoutComments = removeComments(content, 'c-style');
      const parsed = JSON.parse(contentWithoutComments);
      return {
        content: JSON.stringify(parsed),
        failed: false,
      };
    } catch {
      // Fallback: Return original content (trimmed) to avoid corrupting data
      // We previously used aggressive whitespace removal which corrupted strings
      return {
        content: content.trim(),
        failed: false,
      };
    }
  }
}

function minifyGeneral(content: string): string {
  try {
    // General minification for plain text, logs, etc.
    let result = content;

    // Remove excessive whitespace and normalize line endings
    result = result
      .replace(/[ \t]+$/gm, '') // Remove trailing whitespace
      .replace(/\r\n/g, '\n') // Normalize line endings
      .replace(/\n\s*\n\s*\n+/g, '\n\n') // Collapse excessive empty lines (3+ -> 2)
      .replace(/[ \t]{3,}/g, ' ') // Collapse excessive inline whitespace (3+ spaces/tabs -> 1 space)
      .trim();

    return result;
  } catch {
    // Return original content if general minification fails
    return content;
  }
}

function minifyMarkdown(content: string): string {
  try {
    // Specialized markdown minification preserving structure while reducing tokens
    let result = content;

    // Remove HTML comments (allowed in markdown)
    result = result.replace(/<!--[\s\S]*?-->/g, '');

    // Remove trailing whitespace from lines
    result = result.replace(/[ \t]+$/gm, '');

    // Normalize line endings
    result = result.replace(/\r\n/g, '\n');

    // Collapse excessive empty lines but preserve paragraph breaks
    // Keep double newlines for paragraphs, collapse 3+ newlines to 2
    result = result.replace(/\n\s*\n\s*\n+/g, '\n\n');

    // Reduce excessive inline whitespace but preserve markdown formatting
    // Be careful not to break indented code blocks or lists
    result = result
      // Only collapse excessive inline whitespace (5+ spaces between words -> 1 space)
      // Don't collapse 4-space indentation which is significant for nested lists and code blocks
      .replace(/([^\n])[ \t]{5,}([^\n])/g, '$1 $2');

    // Clean up table formatting by normalizing pipe spacing
    result = result.replace(/\s*\|\s*/g, ' | ');

    // Normalize heading spacing (remove extra spaces after #)
    result = result.replace(/^(#{1,6})[ \t]+/gm, '$1 ');

    // Clean up list formatting - normalize spacing
    result = result.replace(/^(\s*)([-*+]|\d+\.)[ \t]+/gm, '$1$2 ');

    // Remove excessive whitespace around fenced code blocks
    result = result.replace(/\n{3,}(```)/g, '\n\n$1');
    result = result.replace(/(```)\n{3,}/g, '$1\n\n');

    // Final trim
    result = result.trim();

    return result;
  } catch {
    // Return original content if markdown minification fails
    return content;
  }
}

// Main minification functions
export async function minifyContent(
  content: string,
  filePath: string
): Promise<{
  content: string;
  failed: boolean;
  type:
    | 'terser'
    | 'conservative'
    | 'aggressive'
    | 'json'
    | 'general'
    | 'markdown'
    | 'failed';
  reason?: string;
}> {
  try {
    // Check size limit (1MB)
    const MAX_SIZE = 1024 * 1024; // 1MB in bytes
    const contentSize = Buffer.byteLength(content, 'utf8');

    if (contentSize > MAX_SIZE) {
      return {
        content: content,
        failed: true,
        type: 'failed',
        reason: `File too large: ${(contentSize / 1024 / 1024).toFixed(2)}MB exceeds 1MB limit`,
      };
    }

    const config = getFileConfig(filePath);

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
        const result = minifyJson(content);
        return {
          content: result.content,
          failed: result.failed,
          type: result.failed ? 'failed' : 'json',
          ...(result.reason && { reason: result.reason }),
        };
      }

      case 'conservative': {
        const result = minifyConservative(content, config);
        return {
          content: result,
          failed: false,
          type: 'conservative',
        };
      }

      case 'general': {
        const result = minifyGeneral(content);
        return {
          content: result,
          failed: false,
          type: 'general',
        };
      }

      case 'markdown': {
        const result = minifyMarkdown(content);
        return {
          content: result,
          failed: false,
          type: 'markdown',
        };
      }

      case 'aggressive': {
        const ext = getFileExtension(filePath);

        // Use specialized minifiers for CSS and HTML
        if (['css', 'less', 'scss'].includes(ext)) {
          const result = await minifyCSS(content);
          return {
            content: result.content,
            failed: result.failed,
            type: result.failed ? 'failed' : 'aggressive',
            ...(result.reason && { reason: result.reason }),
          };
        }

        if (['html', 'htm'].includes(ext)) {
          const result = await minifyHTML(content);
          return {
            content: result.content,
            failed: result.failed,
            type: result.failed ? 'failed' : 'aggressive',
            ...(result.reason && { reason: result.reason }),
          };
        }

        // Fallback to generic aggressive minification
        const result = minifyAggressive(content, config);
        return {
          content: result,
          failed: false,
          type: 'aggressive',
        };
      }

      default: {
        // Fallback to general minification for unknown file types
        const result = minifyGeneral(content);
        return {
          content: result,
          failed: false,
          type: 'general',
        };
      }
    }
  } catch (error: unknown) {
    // Always return original content if anything fails
    return {
      content: content,
      failed: true,
      type: 'failed',
      reason: `Unexpected minification error: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}

// Utility functions for backward compatibility
export function isJavaScriptFileV2(filePath: string): boolean {
  const ext = getFileExtension(filePath);
  return ['js', 'ts', 'jsx', 'tsx', 'mjs', 'cjs'].includes(ext);
}

export function isIndentationSensitiveV2(filePath: string): boolean {
  const ext = getFileExtension(filePath);
  const indentationSensitive = [
    'py',
    'yaml',
    'yml',
    'coffee',
    'nim',
    'haml',
    'slim',
    'sass',
    'styl',
    'pug',
    'jade',
    'star',
    'bzl',
    'cmake',
    'md',
    'markdown',
    'rst',
  ];
  return indentationSensitive.includes(ext);
}

// Export for testing
export { MINIFY_CONFIG };
