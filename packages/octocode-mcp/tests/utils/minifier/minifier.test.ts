/// <reference types="vitest/globals" />
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  minifyContent,
  isJavaScriptFileV2,
  isIndentationSensitiveV2,
  MINIFY_CONFIG,
} from '../../../src/utils/minifier/minifier.js';

// Mock terser
const mockMinify = vi.hoisted(() => vi.fn());
vi.mock('terser', () => ({
  minify: mockMinify,
}));

describe('MinifierV2', () => {
  beforeEach(() => {
    mockMinify.mockReset();
  });

  describe('Configuration', () => {
    it('should have proper comment patterns defined', () => {
      expect(MINIFY_CONFIG.commentPatterns['c-style']).toHaveLength(3); // Block, line, and inline comments
      expect(MINIFY_CONFIG.commentPatterns.hash).toHaveLength(2); // Start of line and inline hash comments
      expect(MINIFY_CONFIG.commentPatterns.html).toHaveLength(1);
    });

    it('should map file extensions to correct strategies', () => {
      expect(MINIFY_CONFIG.fileTypes.js!.strategy).toBe('terser');
      expect(MINIFY_CONFIG.fileTypes.py!.strategy).toBe('conservative');
      expect(MINIFY_CONFIG.fileTypes.html!.strategy).toBe('aggressive');
      expect(MINIFY_CONFIG.fileTypes.json!.strategy).toBe('json');
    });
  });

  describe('Utility Functions', () => {
    describe('isJavaScriptFileV2', () => {
      it('should identify JavaScript files correctly', () => {
        expect(isJavaScriptFileV2('file.js')).toBe(true);
        expect(isJavaScriptFileV2('file.ts')).toBe(true);
        expect(isJavaScriptFileV2('file.jsx')).toBe(true);
        expect(isJavaScriptFileV2('file.tsx')).toBe(true);
        expect(isJavaScriptFileV2('file.mjs')).toBe(true);
        expect(isJavaScriptFileV2('file.cjs')).toBe(true);
        expect(isJavaScriptFileV2('file.py')).toBe(false);
        expect(isJavaScriptFileV2('file.html')).toBe(false);
      });
    });

    describe('isIndentationSensitiveV2', () => {
      it('should identify indentation-sensitive languages', () => {
        expect(isIndentationSensitiveV2('file.py')).toBe(true);
        expect(isIndentationSensitiveV2('file.yaml')).toBe(true);
        expect(isIndentationSensitiveV2('file.yml')).toBe(true);
        expect(isIndentationSensitiveV2('file.coffee')).toBe(true);
        expect(isIndentationSensitiveV2('file.haml')).toBe(true);
        expect(isIndentationSensitiveV2('file.sass')).toBe(true);

        expect(isIndentationSensitiveV2('file.js')).toBe(false);
        expect(isIndentationSensitiveV2('file.html')).toBe(false);
        expect(isIndentationSensitiveV2('file.css')).toBe(false);
      });
    });
  });

  describe('Terser Strategy', () => {
    it('should use terser for JavaScript files', async () => {
      const jsCode = 'function test() { return true; }';
      mockMinify.mockResolvedValue({
        code: 'function test(){return true;}',
      });

      const result = await minifyContent(jsCode, 'test.js');

      expect(result.type).toBe('terser');
      expect(result.failed).toBe(false);
      expect(result.content).toBe('function test(){return true;}');
      expect(mockMinify).toHaveBeenCalledWith(jsCode, expect.any(Object));
    });

    it('should handle terser failures gracefully', async () => {
      const jsCode = 'invalid js {{{';
      mockMinify.mockRejectedValue(new Error('Parse error'));

      const result = await minifyContent(jsCode, 'test.js');

      expect(result.type).toBe('failed');
      expect(result.failed).toBe(true);
      expect(result.content).toBe(jsCode); // Returns original content
    });
  });

  describe('Conservative Strategy (Indentation-Sensitive)', () => {
    it('should preserve Python indentation structure', async () => {
      const pythonCode = `def hello():
    # This is a comment
    if True:
        print("Hello")

        # Another comment
        return True

# Top level comment
class MyClass:
    pass`;

      const result = await minifyContent(pythonCode, 'test.py');

      expect(result.type).toBe('conservative');
      expect(result.failed).toBe(false);

      // Should remove comments but preserve indentation and line structure
      expect(result.content).not.toContain('# This is a comment');
      expect(result.content).not.toContain('# Another comment');
      expect(result.content).not.toContain('# Top level comment');

      // Should preserve indentation
      expect(result.content).toContain('def hello():');
      expect(result.content).toContain('    if True:');
      expect(result.content).toContain('        print("Hello")');
      expect(result.content).toContain('        return True');
    });

    it('should handle YAML conservatively', async () => {
      const yamlCode = `# YAML configuration
version: '3.8'
services:
  web:
    # Web service config
    image: nginx:latest
    ports:
      - "80:80"

  # Database service
  db:
    image: postgres:13`;

      const result = await minifyContent(yamlCode, 'docker-compose.yml');

      expect(result.type).toBe('conservative');
      expect(result.failed).toBe(false);

      // Should remove comments but preserve YAML structure
      expect(result.content).not.toContain('# YAML configuration');
      expect(result.content).not.toContain('# Web service config');
      expect(result.content).not.toContain('# Database service');

      // Should preserve YAML indentation
      expect(result.content).toContain("version: '3.8'");
      expect(result.content).toContain('services:');
      expect(result.content).toContain('  web:');
      expect(result.content).toContain('    image: nginx:latest');
    });
  });

  describe('Aggressive Strategy', () => {
    it('should aggressively minify HTML', async () => {
      const htmlCode = `<!DOCTYPE html>
<!-- This is a comment -->
<html>
  <head>
    <title>Test</title>
  </head>
  <body>
    <h1>Hello World</h1>
    <p>This is a paragraph</p>
  </body>
</html>`;

      const result = await minifyContent(htmlCode, 'test.html');

      expect(result.type).toBe('aggressive');
      expect(result.failed).toBe(false);

      // Should remove comments and excessive whitespace
      expect(result.content).not.toContain('<!-- This is a comment -->');
      expect(result.content).toBe(
        '<!DOCTYPE html><html><head><title>Test</title></head><body><h1>Hello World</h1><p>This is a paragraph</p></body></html>'
      );
    });

    it('should aggressively minify CSS', async () => {
      const cssCode = `/* Main styles */
.container {
  /* Container styles */
  padding: 20px;
  margin: 0 auto;
  max-width: 1200px;
}

.button {
  background-color: blue;
  color: white;
  /* Button styles */
  border: none;
}`;

      const result = await minifyContent(cssCode, 'styles.css');

      expect(result.type).toBe('aggressive');
      expect(result.failed).toBe(false);

      // Should remove comments and excessive whitespace
      expect(result.content).not.toContain('/* Main styles */');
      expect(result.content).not.toContain('/* Container styles */');
      expect(result.content).not.toContain('/* Button styles */');

      // clean-css produces superior minification: optimizes colors, removes trailing semicolons
      expect(result.content).toContain(
        '.container{padding:20px;margin:0 auto;max-width:1200px}'
      );
      expect(result.content).toContain(
        '.button{background-color:#00f;color:#fff;border:none}'
      );
    });

    it('should handle Go code aggressively', async () => {
      const goCode = `package main

import "fmt"

// Main function
func main() {
    /*
     * Print hello world
     */
    fmt.Println("Hello, World!")

    // Another comment
    var x = 42
}`;

      const result = await minifyContent(goCode, 'main.go');

      expect(result.type).toBe('aggressive');
      expect(result.failed).toBe(false);

      // Should remove both types of comments
      expect(result.content).not.toContain('// Main function');
      expect(result.content).not.toContain('/* * Print hello world */');
      expect(result.content).not.toContain('// Another comment');

      // Should compress whitespace
      expect(result.content).toContain('package main import "fmt" func main()');
    });
  });

  describe('JSON Strategy', () => {
    it('should minify valid JSON', async () => {
      const jsonCode = `{
  "name": "test-package",
  "version": "1.0.0",
  "dependencies": {
    "lodash": "^4.17.21"
  }
}`;

      const result = await minifyContent(jsonCode, 'package.json');

      expect(result.type).toBe('json');
      expect(result.failed).toBe(false);
      expect(result.content).toBe(
        '{"name":"test-package","version":"1.0.0","dependencies":{"lodash":"^4.17.21"}}'
      );
    });

    it('should fallback to basic minification for invalid JSON', async () => {
      const invalidJson = `{
  "name": "test",
  // This comment makes it invalid JSON
  "version": "1.0.0"
}`;

      const result = await minifyContent(invalidJson, 'invalid.json');

      expect(result.type).toBe('json');
      expect(result.failed).toBe(false);
      // Should fallback to basic whitespace removal
      expect(result.content).toContain('"name": "test",');
    });
  });

  describe('Multi-language Comment Support', () => {
    it('should handle PHP with multiple comment types', async () => {
      const phpCode = `<?php
// Single line comment
/* Multi-line comment */
# Hash comment
function test() {
    return true; // Inline comment
}
?>`;

      const result = await minifyContent(phpCode, 'test.php');

      expect(result.type).toBe('aggressive');
      expect(result.failed).toBe(false);

      // Should remove all comment types
      expect(result.content).not.toContain('// Single line comment');
      expect(result.content).not.toContain('/* Multi-line comment */');
      expect(result.content).not.toContain('# Hash comment');
      expect(result.content).not.toContain('// Inline comment');
    });

    it('should handle SQL comments', async () => {
      const sqlCode = `-- This is a SQL comment
SELECT * FROM users
/* Multi-line SQL comment
   spanning multiple lines */
WHERE active = 1;
-- Another comment`;

      const result = await minifyContent(sqlCode, 'query.sql');

      expect(result.type).toBe('aggressive');
      expect(result.failed).toBe(false);

      // Should remove both types of SQL comments
      expect(result.content).not.toContain('-- This is a SQL comment');
      expect(result.content).not.toContain('/* Multi-line SQL comment');
      expect(result.content).not.toContain('-- Another comment');

      // Should preserve SQL structure
      expect(result.content).toContain('SELECT * FROM users WHERE active = 1;');
    });
  });

  describe('Unknown File Types', () => {
    it('should fallback to general strategy for unknown extensions', async () => {
      const unknownContent = `# Some config file
setting1=value1
setting2=value2

# Another section


setting3=value3    `;

      const result = await minifyContent(unknownContent, 'unknown.xyz');

      expect(result.type).toBe('general');
      expect(result.failed).toBe(false);

      // Should clean up general whitespace issues
      expect(result.content).toContain('setting1=value1');
      expect(result.content).toContain('setting2=value2');
      expect(result.content).toContain('setting3=value3');

      // Should remove excessive whitespace
      expect(result.content).not.toMatch(/[ \t]+$/m); // No trailing whitespace
      expect(result.content).not.toMatch(/\n\n\n+/); // No triple newlines
    });

    it('should treat indentation-sensitive filenames conservatively (no extension)', async () => {
      const makefile = `# Simple Makefile
build:
	@echo "Building"

test:
	@echo "Testing"`;

      const result = await minifyContent(makefile, 'Makefile');

      expect(result.type).toBe('conservative');
      expect(result.failed).toBe(false);
      // Tabs should be preserved for Makefile recipes
      expect(result.content).toContain('\t@echo "Building"');
      expect(result.content).toContain('\t@echo "Testing"');
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty content', async () => {
      const result = await minifyContent('', 'empty.js');
      expect(result.content).toBe('');
      expect(result.failed).toBe(false);
    });

    it('should handle content with only whitespace', async () => {
      const result = await minifyContent('   \n\n\t  \n  ', 'whitespace.txt');
      expect(result.content).toBe('');
      expect(result.failed).toBe(false);
    });

    it('should handle content with only comments', async () => {
      const result = await minifyContent(
        '# Comment 1\n# Comment 2\n# Comment 3',
        'comments.sh'
      );
      expect(result.content).toBe('');
      expect(result.failed).toBe(false);
    });
  });

  describe('Size Limit Tests', () => {
    it('should reject content larger than 1MB', async () => {
      // Create content just over 1MB (1MB + 100 bytes)
      const oneMB = 1024 * 1024;
      const largeContent = 'x'.repeat(oneMB + 100);

      const result = await minifyContent(largeContent, 'large.js');

      expect(result.failed).toBe(true);
      expect(result.type).toBe('failed');
      expect(result.content).toBe(largeContent); // Should return original content
    });

    it('should accept content exactly at 1MB limit', async () => {
      // Create content exactly 1MB
      const oneMB = 1024 * 1024;
      const limitContent = 'a'.repeat(oneMB);

      const result = await minifyContent(limitContent, 'limit.txt');

      expect(result.failed).toBe(false);
      expect(result.type).toBe('general'); // txt files use general strategy
      expect(result.content.length).toBeLessThanOrEqual(limitContent.length);
    });
  });
});
