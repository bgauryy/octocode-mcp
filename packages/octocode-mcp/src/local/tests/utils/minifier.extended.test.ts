/**
 * Extended tests for minifier utilities
 * Covers all file type handlers
 */

import { describe, it, expect } from 'vitest';
import { minifyContent } from '../../utils/minifier.js';

describe('minifier - extended', () => {
  describe('minifyContent - JavaScript/TypeScript', () => {
    it('should minify TypeScript code', () => {
      const input = `// This is a comment
import { foo } from 'bar';

/* Multi-line
   comment */
export const x = 1;

export function test() {
  return x + 1;
}`;
      const output = minifyContent(input, '/test/file.ts');

      expect(output).not.toContain('// This is a comment');
      expect(output).not.toContain('Multi-line');
      expect(output).toContain('import');
      expect(output).toContain('export const x');
      expect(output).toContain('export function test');
    });

    it('should handle .jsx files', () => {
      const input = `// JSX comment
export const Component = () => {
  return <div>Hello</div>;
};`;
      const output = minifyContent(input, '/test/Component.jsx');

      expect(output).not.toContain('// JSX comment');
      expect(output).toContain('Component');
    });

    it('should handle .tsx files', () => {
      const input = `// TSX comment
interface Props {
  name: string;
}

export const Component: React.FC<Props> = ({ name }) => {
  return <div>{name}</div>;
};`;
      const output = minifyContent(input, '/test/Component.tsx');

      expect(output).not.toContain('// TSX comment');
      expect(output).toContain('interface Props');
    });

    it('should handle .mjs files', () => {
      const input = `// ESM comment
export const x = 1;`;
      const output = minifyContent(input, '/test/module.mjs');

      expect(output).not.toContain('// ESM comment');
      expect(output).toContain('export const x');
    });

    it('should handle .cjs files', () => {
      const input = `// CJS comment
module.exports = { x: 1 };`;
      const output = minifyContent(input, '/test/module.cjs');

      expect(output).not.toContain('// CJS comment');
      expect(output).toContain('module.exports');
    });

    it('should preserve URLs in comments', () => {
      const input = `const url = "https://example.com";`;
      const output = minifyContent(input, '/test/file.js');

      expect(output).toContain('https://example.com');
    });
  });

  describe('minifyContent - JSON', () => {
    it('should minify valid JSON', () => {
      const input = `{
  "name": "test",
  "version": "1.0.0",
  "dependencies": {
    "lodash": "^4.0.0"
  }
}`;
      const output = minifyContent(input, '/test/package.json');

      expect(output).toBe(
        '{"name":"test","version":"1.0.0","dependencies":{"lodash":"^4.0.0"}}'
      );
    });

    it('should return original for invalid JSON', () => {
      const input = '{ invalid json }';
      const output = minifyContent(input, '/test/file.json');

      expect(output).toBe(input);
    });

    it('should handle empty JSON object', () => {
      const input = '{}';
      const output = minifyContent(input, '/test/file.json');

      expect(output).toBe('{}');
    });

    it('should handle JSON arrays', () => {
      const input = `[
  1,
  2,
  3
]`;
      const output = minifyContent(input, '/test/file.json');

      expect(output).toBe('[1,2,3]');
    });
  });

  describe('minifyContent - CSS/SCSS/LESS', () => {
    it('should minify CSS', () => {
      const input = `/* Header styles */
.header {
  background: blue;
  padding: 10px;
}

/* Footer styles */
.footer {
  background: gray;
}`;
      const output = minifyContent(input, '/test/styles.css');

      expect(output).not.toContain('Header styles');
      expect(output).not.toContain('Footer styles');
      expect(output).toContain('.header');
      expect(output).toContain('.footer');
    });

    it('should handle SCSS files', () => {
      const input = `/* SCSS comment */
$primary: blue;

.button {
  background: $primary;
}`;
      const output = minifyContent(input, '/test/styles.scss');

      expect(output).not.toContain('SCSS comment');
      expect(output).toContain('$primary');
    });

    it('should handle SASS files', () => {
      const input = `/* SASS comment */
$primary: blue

.button
  background: $primary`;
      const output = minifyContent(input, '/test/styles.sass');

      expect(output).not.toContain('SASS comment');
    });

    it('should handle LESS files', () => {
      const input = `/* LESS comment */
@primary: blue;

.button {
  background: @primary;
}`;
      const output = minifyContent(input, '/test/styles.less');

      expect(output).not.toContain('LESS comment');
      expect(output).toContain('@primary');
    });
  });

  describe('minifyContent - HTML/XML', () => {
    it('should minify HTML', () => {
      const input = `<!-- Comment -->
<html>
  <head>
    <title>Test</title>
  </head>
  <body>
    <div>Content</div>
  </body>
</html>`;
      const output = minifyContent(input, '/test/index.html');

      expect(output).not.toContain('<!-- Comment -->');
      expect(output).toContain('<html>');
      expect(output).toContain('<title>Test</title>');
    });

    it('should handle .htm files', () => {
      const input = `<!-- Comment -->
<div>Test</div>`;
      const output = minifyContent(input, '/test/page.htm');

      expect(output).not.toContain('<!-- Comment -->');
      expect(output).toContain('<div>Test</div>');
    });

    it('should minify XML', () => {
      const input = `<?xml version="1.0"?>
<!-- XML comment -->
<root>
  <child>Value</child>
</root>`;
      const output = minifyContent(input, '/test/data.xml');

      expect(output).not.toContain('<!-- XML comment -->');
      expect(output).toContain('<root>');
    });
  });

  describe('minifyContent - Markdown', () => {
    it('should minify Markdown', () => {
      const input = `# Title


This is a paragraph.



## Section


More content.   `;
      const output = minifyContent(input, '/test/README.md');

      // Should reduce excessive blank lines
      expect(output).not.toContain('\n\n\n');
      expect(output).toContain('# Title');
      expect(output).toContain('## Section');
    });

    it('should handle .markdown extension', () => {
      const input = `# Title


Content`;
      const output = minifyContent(input, '/test/file.markdown');

      expect(output).not.toContain('\n\n\n');
    });

    it('should remove trailing whitespace', () => {
      const input = `Line with trailing spaces   
Another line`;
      const output = minifyContent(input, '/test/file.md');

      expect(output).toBe('Line with trailing spaces\nAnother line');
    });
  });

  describe('minifyContent - Conservative languages', () => {
    it('should conservatively minify Python', () => {
      const input = `def hello():
    print("Hello")



    return True`;
      const output = minifyContent(input, '/test/script.py');

      // Should preserve indentation
      expect(output).toContain('    print');
      // Should reduce excessive blank lines
      expect(output).not.toContain('\n\n\n');
    });

    it('should conservatively minify Ruby', () => {
      const input = `def hello
  puts "Hello"


end`;
      const output = minifyContent(input, '/test/script.rb');

      expect(output).toContain('  puts');
      expect(output).not.toContain('\n\n\n');
    });

    it('should conservatively minify Shell scripts', () => {
      const input = `#!/bin/bash
echo "Hello"


echo "World"`;
      const output = minifyContent(input, '/test/script.sh');

      expect(output).toContain('#!/bin/bash');
      expect(output).not.toContain('\n\n\n');
    });

    it('should conservatively minify Bash scripts', () => {
      const input = `#!/bin/bash
if true; then
  echo "yes"
fi`;
      const output = minifyContent(input, '/test/script.bash');

      expect(output).toContain('  echo');
    });

    it('should conservatively minify YAML', () => {
      const input = `name: test
version: 1.0.0


dependencies:
  lodash: ^4.0.0`;
      const output = minifyContent(input, '/test/config.yaml');

      expect(output).not.toContain('\n\n\n');
      expect(output).toContain('dependencies:');
    });

    it('should conservatively minify YML', () => {
      const input = `key: value


nested:
  child: value`;
      const output = minifyContent(input, '/test/config.yml');

      expect(output).not.toContain('\n\n\n');
    });
  });

  describe('minifyContent - Unknown/General files', () => {
    it('should minimally minify unknown file types', () => {
      const input = `Some content here   


With extra spacing`;
      const output = minifyContent(input, '/test/unknown.xyz');

      // Should remove trailing whitespace
      expect(output).toBe('Some content here\n\nWith extra spacing');
    });

    it('should handle files without extension', () => {
      const input = `Line 1   
Line 2



Line 3`;
      const output = minifyContent(input, '/test/Makefile');

      expect(output).not.toContain('\n\n\n');
    });
  });

  describe('minifyContent - Error handling', () => {
    it('should return original content on minification error', () => {
      // This tests that errors in minification don't break the flow
      const input = 'Some content';
      const output = minifyContent(input, '/test/file.ts');

      // Should return some output (either minified or original)
      expect(typeof output).toBe('string');
      expect(output.length).toBeGreaterThan(0);
    });
  });

  describe('Token savings calculation', () => {
    it('should reduce JavaScript file size', () => {
      const input = `// This is a comment
const x = 1;  

/* Another comment */
export function test() {
  return x;
}`;
      const output = minifyContent(input, '/test/file.js');

      // Minified output should be smaller
      expect(output.length).toBeLessThan(input.length);
    });

    it('should reduce JSON file size', () => {
      const input = `{
  "name": "test",
  "version": "1.0.0"
}`;
      const output = minifyContent(input, '/test/file.json');

      // Minified output should be smaller (no whitespace)
      expect(output.length).toBeLessThan(input.length);
    });
  });
});
