import { minify } from 'terser';
import { transform } from '@babel/core';

// Helper function to check if file is JavaScript/TypeScript/JSX
export function isJavaScriptFile(filePath: string): boolean {
  const ext = filePath.split('.').pop()?.toLowerCase();
  return ['js', 'ts', 'jsx', 'tsx', 'mjs', 'cjs'].includes(ext || '');
}

// Helper function to check if file contains JSX
export function isJSXFile(filePath: string): boolean {
  const ext = filePath.split('.').pop()?.toLowerCase();
  return ['jsx', 'tsx'].includes(ext || '');
}

// Helper function to check if file is TypeScript
export function isTypeScriptFile(filePath: string): boolean {
  const ext = filePath.split('.').pop()?.toLowerCase();
  return ['ts', 'tsx'].includes(ext || '');
}

// Helper function to check if file contains Flow type annotations
export function isFlowFile(content: string): boolean {
  // First check for explicit Flow pragmas (most reliable)
  if (
    content.includes('@flow') ||
    content.includes('// @flow') ||
    content.includes('/* @flow */') ||
    /\$FlowFixMe/.test(content) ||
    /\$FlowIssue/.test(content)
  ) {
    return true;
  }

  // Only check syntax patterns if we have multiple Flow indicators
  const flowIndicators = [
    /import\s+type\s+\w/.test(content), // import type Foo
    /export\s+type\s+\w/.test(content), // export type Foo
    /:\s*\?\w+/.test(content), // optional types like ?string (more specific)
    /:\s*\w+\s*\|/.test(content), // union types like string | number
    /\w+\s*:\s*\w+\s*=>/.test(content), // function types like (x: string) => void
  ].filter(Boolean).length;

  // Require at least 2 Flow syntax patterns to reduce false positives
  return flowIndicators >= 2;
}

// Helper function to validate minified content
export function validateMinifiedContent(
  content: string,
  filePath: string
): boolean {
  const fileType = getFileType(filePath);

  try {
    switch (fileType) {
      case 'json':
        JSON.parse(content);
        return true;
      case 'yaml':
        // Basic YAML structure validation
        return (
          !content.includes('\t') &&
          content
            .split('\n')
            .every(
              line =>
                line.trim() === '' ||
                !line.startsWith(' ') ||
                line.match(/^\s+[^\s]/)
            )
        );
      case 'xml': {
        // Basic XML validation - check for balanced tags
        const openTags = (content.match(/<[^/>]+>/g) || []).length;
        const closeTags = (content.match(/<\/[^>]+>/g) || []).length;
        const selfClosing = (content.match(/<[^>]+\/>/g) || []).length;
        return openTags === closeTags + selfClosing;
      }
      default:
        return true; // Assume valid for other types
    }
  } catch {
    return false;
  }
}

// Helper function to detect file type for fallback minification
export function getFileType(filePath: string): string {
  const ext = filePath.split('.').pop()?.toLowerCase();
  const filename = filePath.split('/').pop()?.toLowerCase();

  // Special filename handling
  if (
    filename === 'dockerfile' ||
    filename === 'makefile' ||
    filename === 'jenkinsfile'
  ) {
    return filename;
  }

  // Special indentation-sensitive files
  if (filename === 'build' || filename === 'build.bazel') {
    return 'starlark';
  }
  if (filename === 'cmakelists.txt') {
    return 'cmake';
  }

  switch (ext) {
    case 'html':
    case 'htm':
      return 'html';
    case 'css':
      return 'css';
    case 'less':
      return 'less';
    case 'scss':
      return 'scss';
    case 'sass':
      return 'sass';
    case 'styl':
    case 'stylus':
      return 'stylus';
    case 'json':
      return 'json';
    case 'xml':
    case 'svg':
    case 'xaml':
      return 'xml';
    case 'md':
    case 'markdown':
      return 'markdown';
    case 'yml':
    case 'yaml':
      return 'yaml';
    case 'toml':
      return 'toml';
    case 'ini':
    case 'conf':
    case 'config':
      return 'config';
    case 'env':
      return 'env';
    case 'properties':
      return 'properties';
    case 'sql':
      return 'sql';
    case 'sh':
    case 'bash':
      return 'shell';
    case 'py':
      return 'python';
    case 'rb':
      return 'ruby';
    case 'go':
      return 'go';
    case 'java':
      return 'java';
    case 'kt':
    case 'kts':
      return 'kotlin';
    case 'scala':
      return 'scala';
    case 'swift':
      return 'swift';
    case 'dart':
      return 'dart';
    case 'c':
    case 'cpp':
    case 'cc':
    case 'cxx':
    case 'h':
    case 'hpp':
      return 'c';
    case 'cs':
      return 'csharp';
    case 'php':
      return 'php';
    case 'pl':
    case 'pm':
      return 'perl';
    case 'lua':
      return 'lua';
    case 'r':
      return 'r';
    case 'rs':
      return 'rust';
    // Template languages
    case 'hbs':
    case 'handlebars':
      return 'handlebars';
    case 'ejs':
      return 'ejs';
    case 'pug':
    case 'jade':
      return 'pug';
    case 'mustache':
      return 'mustache';
    case 'twig':
      return 'twig';
    case 'j2':
    case 'jinja':
    case 'jinja2':
      return 'jinja';
    case 'erb':
      return 'erb';
    // Modern frontend
    case 'vue':
      return 'vue';
    case 'svelte':
      return 'svelte';
    // Data formats
    case 'graphql':
    case 'gql':
      return 'graphql';
    case 'proto':
      return 'protobuf';
    case 'csv':
      return 'csv';
    // Infrastructure
    case 'tf':
    case 'tfvars':
      return 'terraform';
    case 'pp':
      return 'puppet';
    case 'gd':
      return 'gdscript';
    // Indentation-sensitive languages
    case 'coffee':
      return 'coffeescript';
    case 'haml':
      return 'haml';
    case 'slim':
      return 'slim';
    case 'nim':
      return 'nim';
    case 'fs':
    case 'fsx':
      return 'fsharp';
    case 'hs':
    case 'lhs':
      return 'haskell';
    case 'rst':
      return 'restructuredtext';
    case 'ls':
      return 'livescript';
    case 'elm':
      return 'elm';
    case 'star':
    case 'bzl':
      return 'starlark';
    case 'cmake':
      return 'cmake';
    default:
      return 'text';
  }
}

// Fallback minification function for non-JavaScript files
export function minifyGenericContent(
  content: string,
  filePath: string
): { content: string; failed: boolean } {
  try {
    const fileType = getFileType(filePath);
    let minified = content;
    let usedFallback = false; // Track if we used fallback processing

    // Remove comments based on file type
    switch (fileType) {
      case 'html':
        // Remove HTML comments <!-- ... -->
        minified = minified.replace(/<!--[\s\S]*?-->/g, '');
        // Remove excessive whitespace but preserve some structure
        minified = minified.replace(/\s+/g, ' ');
        // Remove whitespace between tags
        minified = minified.replace(/>\s+</g, '><');
        break;

      case 'css':
      case 'less':
      case 'scss':
      case 'stylus':
        // Remove CSS/LESS/SCSS/Stylus comments /* ... */ and // ...
        minified = minified.replace(/\/\*[\s\S]*?\*\//g, '');
        minified = minified.replace(/^\s*\/\/.*$/gm, '');
        // Remove excessive whitespace
        minified = minified.replace(/\s+/g, ' ');
        // Remove spaces around CSS syntax
        minified = minified.replace(/\s*([{}:;,])\s*/g, '$1');
        break;

      case 'sass':
        // Sass (indented syntax) is indentation-sensitive!
        // Remove comments // ... and /* ... */
        minified = minified.replace(/\/\*[\s\S]*?\*\//g, '');
        minified = minified.replace(/^\s*\/\/.*$/gm, '');
        // Remove trailing whitespace but preserve indentation structure
        minified = minified.replace(/[ \t]+$/gm, '');
        // Only collapse multiple consecutive empty lines
        minified = minified.replace(/\n\s*\n\s*\n+/g, '\n\n');
        break;

      case 'json':
        // Parse and stringify to remove whitespace (safest for JSON)
        try {
          const parsed = JSON.parse(minified);
          minified = JSON.stringify(parsed);
        } catch {
          // If JSON parsing fails, just remove basic whitespace
          minified = minified.replace(/\s+/g, ' ');
          usedFallback = true; // Mark that we used fallback processing
        }
        break;

      case 'xml':
        // Remove XML comments <!-- ... -->
        minified = minified.replace(/<!--[\s\S]*?-->/g, '');
        // Remove excessive whitespace but preserve some structure
        minified = minified.replace(/\s+/g, ' ');
        // Remove whitespace between tags
        minified = minified.replace(/>\s+</g, '><');
        break;

      case 'yaml':
        // YAML is indentation-sensitive! Be very careful
        // Remove YAML comments # ... (but not inline after content)
        minified = minified.replace(/^\s*#.*$/gm, '');
        // Remove trailing whitespace but preserve indentation structure
        minified = minified.replace(/[ \t]+$/gm, '');
        // Only collapse excessive empty lines (3+ -> 2) to preserve structure
        minified = minified.replace(/\n\s*\n\s*\n+/g, '\n\n');
        // Be very conservative with space reduction - only remove obvious excess
        minified = minified.replace(/^(\s*)[ ]{4,}/gm, '$1  '); // 4+ spaces -> 2 spaces
        break;

      case 'toml':
        // Remove TOML comments # ...
        minified = minified.replace(/^\s*#.*$/gm, '');
        // Remove empty lines
        minified = minified.replace(/^\s*\n/gm, '');
        break;

      case 'config':
      case 'ini':
      case 'env':
      case 'properties':
        // Remove comments starting with # or ;
        minified = minified.replace(/^\s*[#;].*$/gm, '');
        // Remove empty lines
        minified = minified.replace(/^\s*\n/gm, '');
        break;

      case 'sql':
        // Remove SQL comments -- ...
        minified = minified.replace(/--.*$/gm, '');
        // Remove SQL comments /* ... */
        minified = minified.replace(/\/\*[\s\S]*?\*\//g, '');
        // Remove excessive whitespace
        minified = minified.replace(/\s+/g, ' ');
        break;

      case 'shell':
      case 'dockerfile':
        // Remove shell comments # ...
        minified = minified.replace(/^\s*#.*$/gm, '');
        // Remove empty lines
        minified = minified.replace(/^\s*\n/gm, '');
        break;

      case 'makefile':
        // Makefiles are indentation-sensitive and require TABS for recipes!
        // Remove comments # ... but preserve tab structure
        minified = minified.replace(/^\s*#.*$/gm, '');
        // Remove trailing whitespace but preserve tabs and line structure
        minified = minified.replace(/[ ]+$/gm, ''); // Only remove spaces, keep tabs
        // Only collapse multiple consecutive empty lines
        minified = minified.replace(/\n\s*\n\s*\n+/g, '\n\n');
        break;

      case 'python':
        // Python is indentation-sensitive! Be very conservative
        // Only remove comment-only lines, preserve empty lines for indentation context
        minified = minified.replace(/^\s*#.*$/gm, '');
        // Remove trailing whitespace but preserve line structure
        minified = minified.replace(/[ \t]+$/gm, '');
        // Only collapse multiple consecutive empty lines (3+ -> 2)
        minified = minified.replace(/\n\s*\n\s*\n+/g, '\n\n');
        break;

      case 'ruby':
      case 'perl':
      case 'r':
      case 'gdscript':
        // These languages use braces/end keywords, safe to remove empty lines
        // Remove comments # ... (but not in strings)
        minified = minified.replace(/^\s*#.*$/gm, '');
        // Remove empty lines
        minified = minified.replace(/^\s*\n/gm, '');
        break;

      case 'go':
      case 'java':
      case 'kotlin':
      case 'scala':
      case 'swift':
      case 'dart':
      case 'c':
      case 'csharp':
      case 'rust':
        // Remove C-style comments // ...
        minified = minified.replace(/^\s*\/\/.*$/gm, '');
        // Remove C-style comments /* ... */
        minified = minified.replace(/\/\*[\s\S]*?\*\//g, '');
        // Remove excessive whitespace
        minified = minified.replace(/\s+/g, ' ');
        break;

      case 'php':
        // Remove PHP comments // ...
        minified = minified.replace(/^\s*\/\/.*$/gm, '');
        // Remove PHP comments # ...
        minified = minified.replace(/^\s*#.*$/gm, '');
        // Remove PHP comments /* ... */
        minified = minified.replace(/\/\*[\s\S]*?\*\//g, '');
        // Remove excessive whitespace
        minified = minified.replace(/\s+/g, ' ');
        break;

      case 'lua':
        // Remove Lua comments -- ...
        minified = minified.replace(/^\s*--.*$/gm, '');
        // Remove Lua block comments --[[ ... ]]
        minified = minified.replace(/--\[\[[\s\S]*?\]\]/g, '');
        // Remove excessive whitespace
        minified = minified.replace(/\s+/g, ' ');
        break;

      // Template languages
      case 'handlebars':
      case 'mustache':
        // Remove Handlebars/Mustache comments {{! ... }} and {{!-- ... --}}
        minified = minified.replace(/\{\{!--[\s\S]*?--\}\}/g, '');
        minified = minified.replace(/\{\{![\s\S]*?\}\}/g, '');
        // Remove excessive whitespace but preserve template structure
        minified = minified.replace(/\s+/g, ' ');
        break;

      case 'ejs':
        // Remove EJS comments <%# ... %>
        minified = minified.replace(/<%#[\s\S]*?%>/g, '');
        // Remove excessive whitespace
        minified = minified.replace(/\s+/g, ' ');
        break;

      case 'pug':
        // Remove Pug comments // ...
        minified = minified.replace(/^\s*\/\/.*$/gm, '');
        // Remove Pug block comments //- ...
        minified = minified.replace(/^\s*\/\/-.*$/gm, '');
        // Be very conservative with indentation (Pug is whitespace-sensitive)
        minified = minified.replace(/[ \t]+$/gm, '');
        break;

      case 'twig':
        // Remove Twig comments {# ... #}
        minified = minified.replace(/\{#[\s\S]*?#\}/g, '');
        // Remove excessive whitespace
        minified = minified.replace(/\s+/g, ' ');
        break;

      case 'jinja':
        // Remove Jinja comments {# ... #}
        minified = minified.replace(/\{#[\s\S]*?#\}/g, '');
        // Remove excessive whitespace
        minified = minified.replace(/\s+/g, ' ');
        break;

      case 'erb':
        // Remove ERB comments <%# ... %>
        minified = minified.replace(/<%#[\s\S]*?%>/g, '');
        // Remove excessive whitespace
        minified = minified.replace(/\s+/g, ' ');
        break;

      // Modern frontend
      case 'vue':
        // Vue SFC - be conservative, just remove HTML comments and basic whitespace
        minified = minified.replace(/<!--[\s\S]*?-->/g, '');
        minified = minified.replace(/\s+/g, ' ');
        break;

      case 'svelte':
        // Svelte - similar to Vue, be conservative
        minified = minified.replace(/<!--[\s\S]*?-->/g, '');
        minified = minified.replace(/\s+/g, ' ');
        break;

      // Data formats
      case 'graphql':
        // Remove GraphQL comments # ...
        minified = minified.replace(/^\s*#.*$/gm, '');
        // Remove excessive whitespace
        minified = minified.replace(/\s+/g, ' ');
        break;

      case 'protobuf':
        // Remove Protocol Buffer comments // ...
        minified = minified.replace(/^\s*\/\/.*$/gm, '');
        // Remove excessive whitespace
        minified = minified.replace(/\s+/g, ' ');
        break;

      case 'csv':
        // For CSV, just remove empty lines and trailing spaces
        minified = minified.replace(/[ \t]+$/gm, '');
        minified = minified.replace(/^\s*\n/gm, '');
        break;

      // Infrastructure
      case 'terraform':
        // Remove Terraform comments # ... and // ...
        minified = minified.replace(/^\s*#.*$/gm, '');
        minified = minified.replace(/^\s*\/\/.*$/gm, '');
        // Remove Terraform block comments /* ... */
        minified = minified.replace(/\/\*[\s\S]*?\*\//g, '');
        // Remove excessive whitespace
        minified = minified.replace(/\s+/g, ' ');
        break;

      case 'puppet':
        // Remove Puppet comments # ...
        minified = minified.replace(/^\s*#.*$/gm, '');
        // Remove empty lines
        minified = minified.replace(/^\s*\n/gm, '');
        break;

      case 'jenkinsfile':
        // Jenkinsfile is Groovy-based, use Java-style comments
        minified = minified.replace(/^\s*\/\/.*$/gm, '');
        minified = minified.replace(/\/\*[\s\S]*?\*\//g, '');
        minified = minified.replace(/\s+/g, ' ');
        break;

      case 'markdown':
        // For markdown, be very conservative to preserve formatting
        // Remove trailing spaces on lines (except intentional line breaks)
        minified = minified.replace(/[ \t]+$/gm, '');
        // Remove more than 2 consecutive newlines (preserve double newlines for paragraphs)
        minified = minified.replace(/\n{3,}/g, '\n\n');
        // Only compress excessive inline whitespace (not at line start)
        minified = minified.replace(/([^\n])[ \t]{3,}/g, '$1 ');
        break;

      // Indentation-sensitive programming languages
      case 'coffeescript':
      case 'livescript':
        // CoffeeScript/LiveScript - Python-like indentation sensitivity
        // Remove CoffeeScript comments # ...
        minified = minified.replace(/^\s*#.*$/gm, '');
        // Remove trailing whitespace but preserve indentation structure
        minified = minified.replace(/[ \t]+$/gm, '');
        // Only collapse multiple consecutive empty lines
        minified = minified.replace(/\n\s*\n\s*\n+/g, '\n\n');
        break;

      case 'nim':
        // Nim - Python-like indentation sensitivity
        // Remove Nim comments # ...
        minified = minified.replace(/^\s*#.*$/gm, '');
        // Remove trailing whitespace but preserve indentation structure
        minified = minified.replace(/[ \t]+$/gm, '');
        // Only collapse multiple consecutive empty lines
        minified = minified.replace(/\n\s*\n\s*\n+/g, '\n\n');
        break;

      case 'fsharp':
        // F# - Indentation-sensitive functional language
        // Remove F# comments // ...
        minified = minified.replace(/^\s*\/\/.*$/gm, '');
        // Remove F# block comments (* ... *)
        minified = minified.replace(/\(\*[\s\S]*?\*\)/g, '');
        // Remove trailing whitespace but preserve indentation structure
        minified = minified.replace(/[ \t]+$/gm, '');
        // Only collapse multiple consecutive empty lines
        minified = minified.replace(/\n\s*\n\s*\n+/g, '\n\n');
        break;

      case 'haskell':
        // Haskell - Partially indentation-sensitive
        // Remove Haskell comments -- ...
        minified = minified.replace(/^\s*--.*$/gm, '');
        // Remove Haskell block comments {- ... -}
        minified = minified.replace(/\{-[\s\S]*?-\}/g, '');
        // Remove trailing whitespace but preserve some indentation structure
        minified = minified.replace(/[ \t]+$/gm, '');
        // Only collapse multiple consecutive empty lines
        minified = minified.replace(/\n\s*\n\s*\n+/g, '\n\n');
        break;

      case 'elm':
        // Elm - Functional language with some indentation sensitivity
        // Remove Elm comments -- ...
        minified = minified.replace(/^\s*--.*$/gm, '');
        // Remove Elm block comments {- ... -}
        minified = minified.replace(/\{-[\s\S]*?-\}/g, '');
        // Remove trailing whitespace but preserve indentation structure
        minified = minified.replace(/[ \t]+$/gm, '');
        // Only collapse multiple consecutive empty lines
        minified = minified.replace(/\n\s*\n\s*\n+/g, '\n\n');
        break;

      // Indentation-sensitive template languages
      case 'haml':
        // Haml - Ruby template engine, very indentation-sensitive
        // Remove Haml comments -# ...
        minified = minified.replace(/^\s*-#.*$/gm, '');
        // Remove Haml silent comments / ...
        minified = minified.replace(/^\s*\/.*$/gm, '');
        // Remove trailing whitespace but preserve critical indentation
        minified = minified.replace(/[ \t]+$/gm, '');
        // Only collapse multiple consecutive empty lines
        minified = minified.replace(/\n\s*\n\s*\n+/g, '\n\n');
        break;

      case 'slim':
        // Slim - Ruby template engine, very indentation-sensitive
        // Remove Slim comments / ...
        minified = minified.replace(/^\s*\/.*$/gm, '');
        // Remove trailing whitespace but preserve critical indentation
        minified = minified.replace(/[ \t]+$/gm, '');
        // Only collapse multiple consecutive empty lines
        minified = minified.replace(/\n\s*\n\s*\n+/g, '\n\n');
        break;

      // Documentation formats
      case 'restructuredtext':
        // reStructuredText - Indentation-sensitive documentation
        // Remove comments .. (but be very careful as .. has other meanings)
        minified = minified.replace(/^\s*\.\.\s+[^:]*$/gm, '');
        // Remove trailing whitespace but preserve indentation structure
        minified = minified.replace(/[ \t]+$/gm, '');
        // Only collapse multiple consecutive empty lines (preserve double newlines)
        minified = minified.replace(/\n\s*\n\s*\n+/g, '\n\n');
        break;

      // Build systems with Python-like syntax
      case 'starlark':
        // Starlark/Bazel - Python-like indentation sensitivity
        // Remove Starlark comments # ...
        minified = minified.replace(/^\s*#.*$/gm, '');
        // Remove trailing whitespace but preserve indentation structure
        minified = minified.replace(/[ \t]+$/gm, '');
        // Only collapse multiple consecutive empty lines
        minified = minified.replace(/\n\s*\n\s*\n+/g, '\n\n');
        break;

      case 'cmake':
        // CMake - Structure-sensitive (not strictly indentation but formatting matters)
        // Remove CMake comments # ...
        minified = minified.replace(/^\s*#.*$/gm, '');
        // Remove trailing whitespace but preserve structure
        minified = minified.replace(/[ \t]+$/gm, '');
        // Only collapse multiple consecutive empty lines
        minified = minified.replace(/\n\s*\n\s*\n+/g, '\n\n');
        break;

      default:
        // Generic text file - remove comments starting with # and excessive whitespace
        minified = minified.replace(/^\s*#.*$/gm, '');
        minified = minified.replace(/\s+/g, ' ');
        break;
    }

    // Final cleanup - remove leading/trailing whitespace
    minified = minified.trim();

    // Validate the minified content for critical file types (but skip if we used fallback)
    if (!usedFallback && !validateMinifiedContent(minified, filePath)) {
      return {
        content: content, // Return original if validation fails
        failed: true,
      };
    }

    return {
      content: minified,
      failed: false,
    };
  } catch (error: any) {
    return {
      content: `DEBUG: Generic minification failed for ${filePath}. Error: ${error.message}`,
      failed: true,
    };
  }
}

// Helper function to minify JavaScript/TypeScript/JSX content
export async function minifyJavaScriptContent(
  content: string,
  filePath: string
): Promise<{ content: string; failed: boolean }> {
  try {
    let processedContent = content;

    // Check if we need Babel transformation
    const needsTypeScript = isTypeScriptFile(filePath);
    const needsJSX = isJSXFile(filePath);
    const needsFlow = !needsTypeScript && isFlowFile(content); // Only check Flow for JS files

    if (needsTypeScript || needsJSX || needsFlow) {
      const babelPresets = [];

      if (needsTypeScript) {
        babelPresets.push('@babel/preset-typescript');
      }
      if (needsJSX) {
        babelPresets.push('@babel/preset-react');
      }
      if (needsFlow) {
        babelPresets.push('@babel/preset-flow');
      }

      try {
        const transformResult = await transform(content, {
          presets: babelPresets,
          filename: filePath,
          retainLines: false,
          compact: false,
          babelrc: false,
          configFile: false,
        });

        if (transformResult?.code) {
          processedContent = transformResult.code;
        } else {
          return {
            content: `DEBUG: No code returned. FilePath: ${filePath}, isTS: ${needsTypeScript}, isJSX: ${needsJSX}, isFlow: ${needsFlow}, presets: ${JSON.stringify(babelPresets)}`,
            failed: true,
          };
        }
      } catch (transformError: any) {
        return {
          content: `DEBUG: Transform error for ${filePath}. isTS: ${needsTypeScript}, isJSX: ${needsJSX}, isFlow: ${needsFlow}, presets: ${JSON.stringify(babelPresets)}, error: ${transformError.message}`,
          failed: true,
        };
      }
    }

    const result = await minify(processedContent, {
      compress: {
        drop_console: false, // Keep console.log for debugging
        drop_debugger: false, // Keep debugger statements
        pure_funcs: [], // Don't remove any function calls
        global_defs: {}, // No global definitions
        sequences: true, // Allow combining statements with comma operator (safe)
        conditionals: true, // Allow basic if-else optimizations (safe)
        comparisons: true, // Allow comparison optimizations (safe)
        evaluate: true, // Allow constant expression evaluation (safe)
        booleans: true, // Allow boolean expression optimization (safe)
        loops: false, // Don't optimize loops (can change behavior)
        unused: false, // Don't remove unused variables (keep for debugging)
        hoist_funs: false, // Don't hoist function declarations
        hoist_vars: false, // Don't hoist variable declarations
        dead_code: true, // Remove unreachable code (safe)
        side_effects: false, // Don't assume functions are side-effect free
      },
      mangle: false, // Don't mangle any names - keep everything readable
      format: {
        comments: false, // Remove comments to save tokens
        beautify: false, // Minify whitespace only
        semicolons: true, // Always include semicolons for safety
      },
      sourceMap: false, // No source maps needed
      parse: {
        // More permissive parsing
        bare_returns: true,
        html5_comments: true,
        shebang: true,
      },
    });

    return {
      content: result.code || content,
      failed: false,
    };
  } catch (error: any) {
    return {
      content: `DEBUG: JavaScript minification failed for ${filePath}. Error: ${error.message}. Stack: ${error.stack}`,
      failed: true,
    };
  }
}

// Main minification function that handles both JavaScript and generic files
export async function minifyContent(
  content: string,
  filePath: string
): Promise<{
  content: string;
  failed: boolean;
  type: 'javascript' | 'generic' | 'failed';
}> {
  if (isJavaScriptFile(filePath)) {
    // Try JavaScript minification first
    const jsResult = await minifyJavaScriptContent(content, filePath);

    if (!jsResult.failed) {
      return {
        content: jsResult.content,
        failed: false,
        type: 'javascript',
      };
    } else {
      // JavaScript minification failed, try generic fallback
      const genericResult = minifyGenericContent(content, filePath);

      if (!genericResult.failed) {
        return {
          content: genericResult.content,
          failed: false,
          type: 'generic',
        };
      } else {
        return {
          content: content, // Return original content
          failed: true,
          type: 'failed',
        };
      }
    }
  } else {
    // Non-JavaScript file - use generic minification
    const genericResult = minifyGenericContent(content, filePath);

    if (!genericResult.failed) {
      return {
        content: genericResult.content,
        failed: false,
        type: 'generic',
      };
    } else {
      return {
        content: content, // Return original content
        failed: true,
        type: 'failed',
      };
    }
  }
}
