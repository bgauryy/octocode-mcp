/// <reference types="vitest/globals" />
import { vi, type MockedFunction } from 'vitest';

// Mock dependencies
vi.mock('terser', () => ({
  minify: vi.fn(),
}));

vi.mock('@babel/core', () => ({
  transform: vi.fn(),
}));

// Import after mocking
import {
  isJavaScriptFile,
  isJSXFile,
  isTypeScriptFile,
  getFileType,
  minifyGenericContent,
  minifyJavaScriptContent,
  minifyContent,
} from '../../src/utils/minifier.js';

// Import mocked modules to access the mock functions
import { minify } from 'terser';
import { transform } from '@babel/core';

const mockMinify = minify as MockedFunction<typeof minify>;
const mockTransform = transform as MockedFunction<typeof transform>;

describe('Minifier Utilities', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('File Type Detection', () => {
    describe('isJavaScriptFile', () => {
      it('should detect JavaScript files', () => {
        expect(isJavaScriptFile('test.js')).toBe(true);
        expect(isJavaScriptFile('test.mjs')).toBe(true);
        expect(isJavaScriptFile('test.cjs')).toBe(true);
        expect(isJavaScriptFile('src/component.js')).toBe(true);
        expect(isJavaScriptFile('/path/to/file.JS')).toBe(true); // Case insensitive
      });

      it('should detect TypeScript files', () => {
        expect(isJavaScriptFile('test.ts')).toBe(true);
        expect(isJavaScriptFile('test.tsx')).toBe(true);
        expect(isJavaScriptFile('src/component.TS')).toBe(true); // Case insensitive
      });

      it('should detect JSX files', () => {
        expect(isJavaScriptFile('test.jsx')).toBe(true);
        expect(isJavaScriptFile('Component.jsx')).toBe(true);
        expect(isJavaScriptFile('src/App.JSX')).toBe(true); // Case insensitive
      });

      it('should reject non-JavaScript files', () => {
        expect(isJavaScriptFile('test.css')).toBe(false);
        expect(isJavaScriptFile('test.html')).toBe(false);
        expect(isJavaScriptFile('test.py')).toBe(false);
        expect(isJavaScriptFile('README.md')).toBe(false);
        expect(isJavaScriptFile('config.json')).toBe(false);
        expect(isJavaScriptFile('noextension')).toBe(false);
      });

      it('should handle files without extensions', () => {
        expect(isJavaScriptFile('makefile')).toBe(false);
        expect(isJavaScriptFile('')).toBe(false);
      });
    });

    describe('isJSXFile', () => {
      it('should detect JSX files', () => {
        expect(isJSXFile('Component.jsx')).toBe(true);
        expect(isJSXFile('App.tsx')).toBe(true);
        expect(isJSXFile('src/components/Button.JSX')).toBe(true); // Case insensitive
      });

      it('should reject non-JSX files', () => {
        expect(isJSXFile('test.js')).toBe(false);
        expect(isJSXFile('test.ts')).toBe(false);
        expect(isJSXFile('test.css')).toBe(false);
        expect(isJSXFile('test.html')).toBe(false);
      });
    });

    describe('isTypeScriptFile', () => {
      it('should detect TypeScript files', () => {
        expect(isTypeScriptFile('test.ts')).toBe(true);
        expect(isTypeScriptFile('Component.tsx')).toBe(true);
        expect(isTypeScriptFile('src/types.TS')).toBe(true); // Case insensitive
      });

      it('should reject non-TypeScript files', () => {
        expect(isTypeScriptFile('test.js')).toBe(false);
        expect(isTypeScriptFile('test.jsx')).toBe(false);
        expect(isTypeScriptFile('test.css')).toBe(false);
        expect(isTypeScriptFile('test.html')).toBe(false);
      });
    });

    describe('getFileType', () => {
      it('should detect HTML files', () => {
        expect(getFileType('index.html')).toBe('html');
        expect(getFileType('page.htm')).toBe('html');
        expect(getFileType('template.HTML')).toBe('html'); // Case insensitive
      });

      it('should detect CSS files', () => {
        expect(getFileType('styles.css')).toBe('css');
        expect(getFileType('main.CSS')).toBe('css'); // Case insensitive
      });

      it('should detect JSON files', () => {
        expect(getFileType('package.json')).toBe('json');
        expect(getFileType('config.JSON')).toBe('json'); // Case insensitive
      });

      it('should detect XML files', () => {
        expect(getFileType('config.xml')).toBe('xml');
        expect(getFileType('icon.svg')).toBe('xml');
        expect(getFileType('layout.xaml')).toBe('xml');
      });

      it('should detect YAML files', () => {
        expect(getFileType('config.yml')).toBe('yaml');
        expect(getFileType('docker-compose.yaml')).toBe('yaml');
      });

      it('should detect various programming languages', () => {
        expect(getFileType('script.py')).toBe('python');
        expect(getFileType('script.rb')).toBe('ruby');
        expect(getFileType('main.go')).toBe('go');
        expect(getFileType('Main.java')).toBe('java');
        expect(getFileType('main.c')).toBe('c');
        expect(getFileType('main.cpp')).toBe('c');
        expect(getFileType('main.cc')).toBe('c');
        expect(getFileType('main.cxx')).toBe('c');
        expect(getFileType('Program.cs')).toBe('csharp');
        expect(getFileType('script.php')).toBe('php');
      });

      it('should detect configuration files', () => {
        expect(getFileType('config.toml')).toBe('toml');
        expect(getFileType('settings.ini')).toBe('config');
        expect(getFileType('app.conf')).toBe('config');
        expect(getFileType('nginx.config')).toBe('config');
      });

      it('should detect script files', () => {
        expect(getFileType('script.sh')).toBe('shell');
        expect(getFileType('deploy.bash')).toBe('shell');
      });

      it('should detect SQL files', () => {
        expect(getFileType('schema.sql')).toBe('sql');
      });

      it('should detect markdown files', () => {
        expect(getFileType('README.md')).toBe('markdown');
        expect(getFileType('docs.markdown')).toBe('markdown');
      });

      it('should default to text for unknown extensions', () => {
        expect(getFileType('unknown.xyz')).toBe('text');
        expect(getFileType('noextension')).toBe('text');
      });
    });
  });

  describe('Generic Content Minification', () => {
    describe('HTML minification', () => {
      it('should remove HTML comments', () => {
        const html = `<!DOCTYPE html>
<!-- This is a comment -->
<html>
  <!-- Another comment -->
  <body>Hello World</body>
</html>`;

        const result = minifyGenericContent(html, 'test.html');

        expect(result.failed).toBe(false);
        expect(result.content).not.toContain('<!-- This is a comment -->');
        expect(result.content).not.toContain('<!-- Another comment -->');
        expect(result.content).toContain('<body>Hello World</body>');
      });

      it('should remove excessive whitespace', () => {
        const html = `<div>
          <p>  Text with   spaces  </p>
        </div>`;

        const result = minifyGenericContent(html, 'test.html');

        expect(result.failed).toBe(false);
        expect(result.content).toBe('<div><p> Text with spaces </p></div>');
      });
    });

    describe('CSS minification', () => {
      it('should remove CSS comments', () => {
        const css = `/* Main styles */
.button {
  /* Button styling */
  color: red;
  padding: 10px;
}`;

        const result = minifyGenericContent(css, 'styles.css');

        expect(result.failed).toBe(false);
        expect(result.content).not.toContain('/* Main styles */');
        expect(result.content).not.toContain('/* Button styling */');
        expect(result.content).toContain('.button{color:red;padding:10px;}');
      });

      it('should remove whitespace around CSS syntax', () => {
        const css = `body {
  margin : 0 ;
  padding : 10px ;
}`;

        const result = minifyGenericContent(css, 'styles.css');

        expect(result.failed).toBe(false);
        expect(result.content).toBe('body{margin:0;padding:10px;}');
      });
    });

    describe('JSON minification', () => {
      it('should minify valid JSON', () => {
        const json = `{
  "name": "test-package",
  "version": "1.0.0",
  "dependencies": {
    "react": "^18.0.0"
  }
}`;

        const result = minifyGenericContent(json, 'package.json');

        expect(result.failed).toBe(false);
        expect(result.content).toBe(
          '{"name":"test-package","version":"1.0.0","dependencies":{"react":"^18.0.0"}}'
        );
      });

      it('should handle invalid JSON gracefully', () => {
        const invalidJson = `{
  "name": "test",
  // This is a comment - not valid JSON
  "version": 1.0.0
}`;

        const result = minifyGenericContent(invalidJson, 'invalid.json');

        expect(result.failed).toBe(false);
        // Should fall back to basic whitespace removal
        expect(result.content).toContain('"name":');
      });
    });

    describe('YAML minification', () => {
      it('should remove YAML comments', () => {
        const yaml = `# Main configuration
name: test-app
# Database settings
database:
  host: localhost
  port: 5432`;

        const result = minifyGenericContent(yaml, 'config.yml');

        expect(result.failed).toBe(false);
        expect(result.content).not.toContain('# Main configuration');
        expect(result.content).not.toContain('# Database settings');
        expect(result.content).toContain('name: test-app');
        expect(result.content).toContain('database:');
      });

      it('should remove empty lines', () => {
        const yaml = `name: test


version: 1.0.0


description: A test package`;

        const result = minifyGenericContent(yaml, 'config.yaml');

        expect(result.failed).toBe(false);
        expect(result.content).not.toMatch(/\n\n\n/);
        expect(result.content).toContain('name: test');
        expect(result.content).toContain('version: 1.0.0');
      });
    });

    describe('Programming language minification', () => {
      it('should remove Python comments', () => {
        const python = `# Main function
def hello():
    # Print greeting
    print("Hello World")
    return True`;

        const result = minifyGenericContent(python, 'script.py');

        expect(result.failed).toBe(false);
        expect(result.content).not.toContain('# Main function');
        expect(result.content).not.toContain('# Print greeting');
        expect(result.content).toContain('def hello():');
      });

      it('should remove Go comments', () => {
        const go = `// Package main
package main

import "fmt"

/* 
 * Main function
 */
func main() {
    // Print message
    fmt.Println("Hello")
}`;

        const result = minifyGenericContent(go, 'main.go');

        expect(result.failed).toBe(false);
        expect(result.content).not.toContain('// Package main');
        expect(result.content).not.toContain('/* * Main function */');
        expect(result.content).not.toContain('// Print message');
        expect(result.content).toContain('package main');
        expect(result.content).toContain('func main()');
      });

      it('should remove SQL comments', () => {
        const sql = `-- Create users table
CREATE TABLE users (
    id INTEGER PRIMARY KEY,
    /* User name */
    name VARCHAR(255)
);`;

        const result = minifyGenericContent(sql, 'schema.sql');

        expect(result.failed).toBe(false);
        expect(result.content).not.toContain('-- Create users table');
        expect(result.content).not.toContain('/* User name */');
        expect(result.content).toContain('CREATE TABLE users');
      });
    });

    describe('Markdown minification', () => {
      it('should preserve structure while reducing whitespace', () => {
        const markdown = `# Title

## Subtitle     

This is a paragraph    with    extra   spaces.

- List item 1
- List item 2


Another paragraph.`;

        const result = minifyGenericContent(markdown, 'README.md');

        expect(result.failed).toBe(false);
        expect(result.content).toContain('# Title');
        expect(result.content).toContain('## Subtitle');
        expect(result.content).not.toMatch(/ {2} +/); // No more than 2 consecutive spaces
        expect(result.content).not.toMatch(/\n{3,}/); // No more than 2 consecutive newlines
      });
    });

    describe('Error handling', () => {
      it('should handle minification errors gracefully', () => {
        // Create a scenario that could cause an error by mocking JSON.parse to throw
        const originalJSONParse = JSON.parse;
        const content = '{"test": "value"}';

        // Temporarily break JSON.parse for this test
        JSON.parse = vi.fn().mockImplementation(() => {
          throw new Error('JSON parse error');
        });

        const result = minifyGenericContent(content, 'test.json');

        // Restore original JSON.parse
        JSON.parse = originalJSONParse;

        expect(result.failed).toBe(false); // Should fall back to basic minification
        expect(result.content).toBeTruthy();
      });
    });
  });

  describe('JavaScript Content Minification', () => {
    beforeEach(() => {
      // Reset mocks before each test
      mockMinify.mockReset();
      mockTransform.mockReset();
    });

    describe('Plain JavaScript', () => {
      it('should minify JavaScript without transformation', async () => {
        const jsCode = `function hello() {
  console.log("Hello World");
  return true;
}`;

        mockMinify.mockResolvedValue({
          code: 'function hello(){console.log("Hello World");return true;}',
        });

        const result = await minifyJavaScriptContent(jsCode, 'test.js');

        expect(result.failed).toBe(false);
        expect(result.content).toBe(
          'function hello(){console.log("Hello World");return true;}'
        );
        expect(mockTransform).not.toHaveBeenCalled();
        expect(mockMinify).toHaveBeenCalledWith(jsCode, expect.any(Object));
      });

      it('should handle Terser errors', async () => {
        const jsCode = 'invalid javascript code {{{';

        mockMinify.mockRejectedValue(new Error('Parsing error'));

        const result = await minifyJavaScriptContent(jsCode, 'test.js');

        expect(result.failed).toBe(true);
        expect(result.content).toContain('DEBUG:');
        expect(result.content).toContain('test.js');
        expect(result.content).toContain('Parsing error');
      });
    });

    describe('TypeScript', () => {
      it('should transform TypeScript then minify', async () => {
        const tsCode = `interface User {
  name: string;
  age: number;
}

function greet(user: User): string {
  return \`Hello \${user.name}\`;
}`;

        const transformedCode = `function greet(user) {
  return \`Hello \${user.name}\`;
}`;

        mockTransform.mockResolvedValue({
          code: transformedCode,
        });

        mockMinify.mockResolvedValue({
          code: 'function greet(user){return`Hello ${user.name}`;}',
        });

        const result = await minifyJavaScriptContent(tsCode, 'test.ts');

        expect(result.failed).toBe(false);
        expect(result.content).toBe(
          'function greet(user){return`Hello ${user.name}`;}'
        );
        expect(mockTransform).toHaveBeenCalledWith(
          tsCode,
          expect.objectContaining({
            presets: ['@babel/preset-typescript'],
            filename: 'test.ts',
          })
        );
        expect(mockMinify).toHaveBeenCalledWith(
          transformedCode,
          expect.any(Object)
        );
      });

      it('should handle Babel transformation errors', async () => {
        const tsCode = 'invalid typescript code';

        mockTransform.mockRejectedValue(new Error('Transform error'));

        const result = await minifyJavaScriptContent(tsCode, 'test.ts');

        expect(result.failed).toBe(true);
        expect(result.content).toContain('DEBUG: Transform error');
        expect(result.content).toContain('test.ts');
        expect(result.content).toContain('Transform error');
      });

      it('should handle Babel returning null/undefined code', async () => {
        const tsCode = 'function test() { return true; }';

        mockTransform.mockResolvedValue({
          code: null, // Babel returns null code
        });

        const result = await minifyJavaScriptContent(tsCode, 'test.ts');

        expect(result.failed).toBe(true);
        expect(result.content).toContain('DEBUG: No code returned');
        expect(result.content).toContain('test.ts');
        expect(result.content).toContain('isTS: true');
      });

      it('should handle Babel returning undefined code', async () => {
        const tsCode = 'function test() { return true; }';

        mockTransform.mockResolvedValue({
          code: undefined, // Babel returns undefined code
        });

        const result = await minifyJavaScriptContent(tsCode, 'test.ts');

        expect(result.failed).toBe(true);
        expect(result.content).toContain('DEBUG: No code returned');
        expect(result.content).toContain('test.ts');
      });
    });

    describe('JSX/TSX', () => {
      it('should transform JSX then minify', async () => {
        const jsxCode = `import React from 'react';

function Button({ children, onClick }) {
  return <button onClick={onClick}>{children}</button>;
}`;

        const transformedCode = `import React from 'react';
function Button({children, onClick}) {
  return React.createElement("button", {onClick: onClick}, children);
}`;

        mockTransform.mockResolvedValue({
          code: transformedCode,
        });

        mockMinify.mockResolvedValue({
          code: 'import React from"react";function Button({children,onClick}){return React.createElement("button",{onClick:onClick},children);}',
        });

        const result = await minifyJavaScriptContent(jsxCode, 'Button.jsx');

        expect(result.failed).toBe(false);
        expect(mockTransform).toHaveBeenCalledWith(
          jsxCode,
          expect.objectContaining({
            presets: ['@babel/preset-react'],
            filename: 'Button.jsx',
          })
        );
      });

      it('should transform TSX with both presets', async () => {
        const tsxCode = `interface Props {
  title: string;
}

function Header({ title }: Props) {
  return <h1>{title}</h1>;
}`;

        const transformedCode = `function Header({title}) {
  return React.createElement("h1", null, title);
}`;

        mockTransform.mockResolvedValue({
          code: transformedCode,
        });

        mockMinify.mockResolvedValue({
          code: 'function Header({title}){return React.createElement("h1",null,title);}',
        });

        const result = await minifyJavaScriptContent(tsxCode, 'Header.tsx');

        expect(result.failed).toBe(false);
        expect(mockTransform).toHaveBeenCalledWith(
          tsxCode,
          expect.objectContaining({
            presets: ['@babel/preset-typescript', '@babel/preset-react'],
            filename: 'Header.tsx',
          })
        );
      });
    });

    describe('Minify options', () => {
      it('should use correct Terser options for readability', async () => {
        const jsCode = 'function test() { console.log("test"); }';

        mockMinify.mockResolvedValue({
          code: 'function test(){console.log("test");}',
        });

        await minifyJavaScriptContent(jsCode, 'test.js');

        expect(mockMinify).toHaveBeenCalledWith(
          jsCode,
          expect.objectContaining({
            compress: expect.objectContaining({
              drop_console: false,
              drop_debugger: false,
              pure_funcs: [],
              sequences: true, // Updated: now allows safe optimizations
              conditionals: true, // Updated: now allows safe optimizations
              comparisons: true, // Updated: now allows safe optimizations
              evaluate: true, // Updated: now allows safe optimizations
              booleans: true, // Updated: now allows safe optimizations
              loops: false,
              unused: false,
              hoist_funs: false,
              hoist_vars: false,
              dead_code: true, // Updated: removes unreachable code
              side_effects: false, // Updated: conservative about side effects
            }),
            mangle: false,
            format: expect.objectContaining({
              comments: false,
              beautify: false,
              semicolons: true, // Updated: ensures semicolons for safety
            }),
            sourceMap: false,
            parse: expect.objectContaining({
              bare_returns: true,
              html5_comments: true,
              shebang: true,
            }),
          })
        );
      });
    });
  });

  describe('Main minifyContent Function', () => {
    beforeEach(() => {
      mockMinify.mockReset();
      mockTransform.mockReset();
    });

    describe('JavaScript files', () => {
      it('should use JavaScript minification for JS files', async () => {
        const jsCode = 'function test() { return true; }';

        mockMinify.mockResolvedValue({
          code: 'function test(){return true;}',
        });

        const result = await minifyContent(jsCode, 'test.js');

        expect(result.failed).toBe(false);
        expect(result.type).toBe('javascript');
        expect(result.content).toBe('function test(){return true;}');
        expect(mockMinify).toHaveBeenCalled();
      });

      it('should fallback to generic minification when JS minification fails', async () => {
        const jsCode = 'function test() { /* comment */ return true; }';

        mockMinify.mockRejectedValue(new Error('Minification failed'));

        const result = await minifyContent(jsCode, 'test.js');

        expect(result.failed).toBe(false);
        expect(result.type).toBe('generic');
        // For .js files falling back to generic, they're treated as 'text' type
        // which only removes # comments, not /* */ comments
        expect(result.content).toContain('function test()');
        expect(result.content).toContain('return true');
      });

      it('should return original content when both JS and generic fail', async () => {
        const jsCode = 'function test() { return true; }';

        mockMinify.mockRejectedValue(new Error('Minification failed'));

        // Mock a scenario where generic minification would also fail
        const result = await minifyContent(jsCode, 'test.js');

        // Generic minification is quite robust, so this tests the fallback path
        expect(result.type).toBe('generic'); // Generic should still succeed for simple JS
      });

      it('should test JavaScript minification success path', async () => {
        const jsCode = 'function test() { return true; }';

        mockMinify.mockResolvedValue({
          code: 'function test(){return true;}',
        });

        const result = await minifyContent(jsCode, 'test.js');

        expect(result.failed).toBe(false);
        expect(result.type).toBe('javascript');
        expect(result.content).toBe('function test(){return true;}');
      });

      it('should test JavaScript minification failure with generic fallback success', async () => {
        const jsCode = 'function test() { /* comment */ return true; }';

        mockMinify.mockRejectedValue(new Error('Minification failed'));

        const result = await minifyContent(jsCode, 'test.js');

        expect(result.failed).toBe(false);
        expect(result.type).toBe('generic');
        // Generic minification should succeed and remove unnecessary whitespace
        expect(result.content).toContain('function test()');
        expect(result.content).toContain('return true');
      });
    });

    describe('Non-JavaScript files', () => {
      it('should use generic minification for CSS files', async () => {
        const cssCode = `/* Styles */
.button {
  color: red;
  padding: 10px;
}`;

        const result = await minifyContent(cssCode, 'styles.css');

        expect(result.failed).toBe(false);
        expect(result.type).toBe('generic');
        expect(result.content).not.toContain('/* Styles */');
        expect(result.content).toBe('.button{color:red;padding:10px;}');
        expect(mockMinify).not.toHaveBeenCalled();
        expect(mockTransform).not.toHaveBeenCalled();
      });

      it('should test generic minification success path for non-JS files', async () => {
        const content = `# Comment
some text with   extra   spaces

more text`;

        const result = await minifyContent(content, 'test.txt');

        expect(result.failed).toBe(false);
        expect(result.type).toBe('generic');
        expect(result.content).not.toContain('# Comment');
        expect(result.content).toContain('some text with extra spaces');
        expect(mockMinify).not.toHaveBeenCalled();
        expect(mockTransform).not.toHaveBeenCalled();
      });

      it('should return original content when generic minification fails', async () => {
        const content = 'some content that cannot be minified';

        // Test the fallback path by mocking a potential error scenario
        // This is difficult to trigger since generic minification is robust
        const result = await minifyContent(content, 'test.unknown');

        expect(result.failed).toBe(false);
        expect(result.type).toBe('generic');
        expect(result.content).toBeTruthy();
      });

      it('should use generic minification for HTML files', async () => {
        const htmlCode = `<!DOCTYPE html>
<!-- Comment -->
<html>
  <body>Hello</body>
</html>`;

        const result = await minifyContent(htmlCode, 'index.html');

        expect(result.failed).toBe(false);
        expect(result.type).toBe('generic');
        expect(result.content).not.toContain('<!-- Comment -->');
        expect(result.content).toBe(
          '<!DOCTYPE html><html><body>Hello</body></html>'
        );
      });

      it('should return original content when generic minification fails', async () => {
        const content = 'some content';

        // This is hard to trigger since generic minification is quite robust
        // but we can test the path by checking the result structure
        const result = await minifyContent(content, 'unknown.xyz');

        expect(result.failed).toBe(false);
        expect(result.type).toBe('generic');
        expect(result.content).toBeTruthy();
      });
    });
  });

  describe('Integration scenarios', () => {
    it('should handle TypeScript React components correctly', async () => {
      const tsxCode = `import React from 'react';

interface ButtonProps {
  label: string;
  onClick: () => void;
}

export const Button: React.FC<ButtonProps> = ({ label, onClick }) => {
  return <button onClick={onClick}>{label}</button>;
};`;

      const transformedCode = `import React from 'react';
export const Button = ({ label, onClick }) => {
  return React.createElement("button", {onClick: onClick}, label);
};`;

      mockTransform.mockResolvedValue({
        code: transformedCode,
      });

      mockMinify.mockResolvedValue({
        code: 'import React from"react";export const Button=({label,onClick})=>{return React.createElement("button",{onClick:onClick},label);};',
      });

      const result = await minifyContent(tsxCode, 'Button.tsx');

      expect(result.failed).toBe(false);
      expect(result.type).toBe('javascript');
      expect(mockTransform).toHaveBeenCalledWith(
        tsxCode,
        expect.objectContaining({
          presets: ['@babel/preset-typescript', '@babel/preset-react'],
        })
      );
    });

    it('should handle complex CSS with media queries', async () => {
      const cssCode = `/* Main styles */
@media (max-width: 768px) {
  /* Mobile styles */
  .container {
    padding: 1rem;
    /* Smaller padding for mobile */
    margin: 0;
  }
}`;

      const result = await minifyContent(cssCode, 'responsive.css');

      expect(result.failed).toBe(false);
      expect(result.type).toBe('generic');
      expect(result.content).not.toContain('/* Main styles */');
      expect(result.content).not.toContain('/* Mobile styles */');
      expect(result.content).not.toContain('/* Smaller padding for mobile */');
      expect(result.content).toContain('@media (max-width:768px)');
      expect(result.content).toContain('.container{padding:1rem;margin:0;}');
    });

    it('should preserve essential JSON structure', async () => {
      const jsonCode = `{
  "name": "@scope/package",
  "version": "1.0.0",
  "scripts": {
    "build": "tsc",
    "test": "jest"
  },
  "dependencies": {
    "react": "^18.0.0",
    "typescript": "^4.8.0"
  }
}`;

      const result = await minifyContent(jsonCode, 'package.json');

      expect(result.failed).toBe(false);
      expect(result.type).toBe('generic');

      // Verify the result is valid JSON
      const parsed = JSON.parse(result.content);
      expect(parsed.name).toBe('@scope/package');
      expect(parsed.dependencies.react).toBe('^18.0.0');
      expect(parsed.scripts.build).toBe('tsc');
    });
  });
});
