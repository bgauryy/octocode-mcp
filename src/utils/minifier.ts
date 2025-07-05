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
  // Check for Flow pragma or type annotations
  return (
    content.includes('@flow') ||
    content.includes('// @flow') ||
    content.includes('/* @flow */') ||
    // Look for Flow-specific syntax patterns
    /import\s+type\s+/.test(content) ||
    /export\s+type\s+/.test(content) ||
    /:\s*\?\w/.test(content) || // Optional types like ?string
    /\$FlowFixMe/.test(content) ||
    /\$FlowIssue/.test(content)
  );
}

// Helper function to detect file type for fallback minification
export function getFileType(filePath: string): string {
  const ext = filePath.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'html':
    case 'htm':
      return 'html';
    case 'css':
      return 'css';
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
    case 'c':
    case 'cpp':
    case 'cc':
    case 'cxx':
      return 'c';
    case 'cs':
      return 'csharp';
    case 'php':
      return 'php';
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
        // Remove CSS comments /* ... */
        minified = minified.replace(/\/\*[\s\S]*?\*\//g, '');
        // Remove excessive whitespace
        minified = minified.replace(/\s+/g, ' ');
        // Remove spaces around CSS syntax
        minified = minified.replace(/\s*([{}:;,])\s*/g, '$1');
        break;

      case 'json':
        // Parse and stringify to remove whitespace (safest for JSON)
        try {
          const parsed = JSON.parse(minified);
          minified = JSON.stringify(parsed);
        } catch {
          // If JSON parsing fails, just remove basic whitespace
          minified = minified.replace(/\s+/g, ' ');
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
        // Remove YAML comments # ...
        minified = minified.replace(/^\s*#.*$/gm, '');
        // Remove empty lines
        minified = minified.replace(/^\s*\n/gm, '');
        // Reduce multiple spaces to single space (but preserve indentation structure)
        minified = minified.replace(/^(\s*)[ \t]+/gm, '$1');
        break;

      case 'toml':
        // Remove TOML comments # ...
        minified = minified.replace(/^\s*#.*$/gm, '');
        // Remove empty lines
        minified = minified.replace(/^\s*\n/gm, '');
        break;

      case 'config':
      case 'ini':
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
        // Remove shell comments # ...
        minified = minified.replace(/^\s*#.*$/gm, '');
        // Remove empty lines
        minified = minified.replace(/^\s*\n/gm, '');
        break;

      case 'python':
        // Remove Python comments # ... (but not in strings)
        minified = minified.replace(/^\s*#.*$/gm, '');
        // Remove empty lines
        minified = minified.replace(/^\s*\n/gm, '');
        break;

      case 'ruby':
        // Remove Ruby comments # ...
        minified = minified.replace(/^\s*#.*$/gm, '');
        // Remove empty lines
        minified = minified.replace(/^\s*\n/gm, '');
        break;

      case 'go':
        // Remove Go comments // ...
        minified = minified.replace(/^\s*\/\/.*$/gm, '');
        // Remove Go comments /* ... */
        minified = minified.replace(/\/\*[\s\S]*?\*\//g, '');
        // Remove excessive whitespace
        minified = minified.replace(/\s+/g, ' ');
        break;

      case 'java':
      case 'c':
      case 'csharp':
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

      case 'markdown':
        // For markdown, only remove excessive whitespace but preserve structure
        minified = minified.replace(/[ \t]+/g, ' ');
        // Remove more than 2 consecutive newlines
        minified = minified.replace(/\n{3,}/g, '\n\n');
        break;

      default:
        // Generic text file - remove comments starting with # and excessive whitespace
        minified = minified.replace(/^\s*#.*$/gm, '');
        minified = minified.replace(/\s+/g, ' ');
        break;
    }

    // Final cleanup - remove leading/trailing whitespace
    minified = minified.trim();

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
        sequences: false, // Don't combine statements with comma operator
        conditionals: false, // Don't optimize if-else statements
        comparisons: false, // Don't optimize comparisons
        evaluate: false, // Don't evaluate constant expressions
        booleans: false, // Don't optimize boolean expressions
        loops: false, // Don't optimize loops
        unused: false, // Don't remove unused variables
        hoist_funs: false, // Don't hoist function declarations
        hoist_vars: false, // Don't hoist variable declarations
      },
      mangle: false, // Don't mangle any names - keep everything readable
      format: {
        comments: false, // Remove comments to save tokens
        beautify: false, // Minify whitespace only
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
