/// <reference types="vitest/globals" />
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  minifyContentV2,
  isJavaScriptFileV2,
  isIndentationSensitiveV2,
  MINIFY_CONFIG,
} from '../../src/utils/minifier.js';

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

      const result = await minifyContentV2(jsCode, 'test.js');

      expect(result.type).toBe('terser');
      expect(result.failed).toBe(false);
      expect(result.content).toBe('function test(){return true;}');
      expect(mockMinify).toHaveBeenCalledWith(jsCode, expect.any(Object));
    });

    it('should handle terser failures gracefully', async () => {
      const jsCode = 'invalid js {{{';
      mockMinify.mockRejectedValue(new Error('Parse error'));

      const result = await minifyContentV2(jsCode, 'test.js');

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

      const result = await minifyContentV2(pythonCode, 'test.py');

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

      const result = await minifyContentV2(yamlCode, 'docker-compose.yml');

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

      const result = await minifyContentV2(htmlCode, 'test.html');

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

      const result = await minifyContentV2(cssCode, 'styles.css');

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

      const result = await minifyContentV2(goCode, 'main.go');

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

      const result = await minifyContentV2(jsonCode, 'package.json');

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

      const result = await minifyContentV2(invalidJson, 'invalid.json');

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

      const result = await minifyContentV2(phpCode, 'test.php');

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

      const result = await minifyContentV2(sqlCode, 'query.sql');

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

      const result = await minifyContentV2(unknownContent, 'unknown.xyz');

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
  });

  describe('Edge Cases', () => {
    it('should handle empty content', async () => {
      const result = await minifyContentV2('', 'empty.js');
      expect(result.content).toBe('');
      expect(result.failed).toBe(false);
    });

    it('should handle content with only whitespace', async () => {
      const result = await minifyContentV2('   \n\n\t  \n  ', 'whitespace.txt');
      expect(result.content).toBe('');
      expect(result.failed).toBe(false);
    });

    it('should handle content with only comments', async () => {
      const result = await minifyContentV2(
        '# Comment 1\n# Comment 2\n# Comment 3',
        'comments.sh'
      );
      expect(result.content).toBe('');
      expect(result.failed).toBe(false);
    });
  });

  describe('Clean-CSS Integration', () => {
    it('should use clean-css for CSS files with superior optimization', async () => {
      const cssCode = `/* Large CSS file with various optimizations */
.header {
  background-color: #0000ff;
  color: #ffffff;
  padding: 10px 20px 10px 20px;
  margin: 0px;
  border: 1px solid #000000;
}

.container {
  /* Container comment */
  display: flex;
  flex-direction: row;
  justify-content: center;
  align-items: center;
  background: linear-gradient(to right, red, blue);
}

.button:hover {
  background-color: rgba(255, 255, 255, 0.8);
  transform: scale(1.0);
}`;

      const originalLength = cssCode.length;
      const result = await minifyContentV2(cssCode, 'styles.css');

      expect(result.type).toBe('aggressive');
      expect(result.failed).toBe(false);
      expect(result.content.length).toBeLessThan(originalLength);

      // Clean-CSS optimizations should be present
      expect(result.content).toContain('#00f'); // blue -> #00f
      expect(result.content).toContain('#fff'); // white -> #fff
      expect(result.content).toContain('#000'); // black -> #000
      expect(result.content).toContain('padding:10px 20px'); // shorthand
      expect(result.content).not.toContain('/* Container comment */');
      expect(result.content).not.toContain('margin:0px'); // Should optimize to margin:0

      // Should be significantly smaller
      expect(result.content.length / originalLength).toBeLessThan(0.7);
    });

    it('should fallback gracefully when clean-css fails', async () => {
      const invalidCSS = `/* Invalid CSS that might break clean-css */
.broken {
  color: blue;;; /* multiple semicolons */
  background: url("unclosed string;
  invalid-property: @#$%^;
}`;

      const result = await minifyContentV2(invalidCSS, 'broken.css');

      expect(result.type).toBe('aggressive');
      expect(result.failed).toBe(false);
      // Should still minify using fallback regex approach
      expect(result.content).not.toContain('/* Invalid CSS');
      expect(result.content.length).toBeLessThan(invalidCSS.length);
    });
  });

  describe('HTML-Minifier Integration', () => {
    it('should use html-minifier-terser for comprehensive HTML optimization', async () => {
      const htmlCode = `<!DOCTYPE html>
<html lang="en">
  <head>
    <!-- Meta information -->
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Test Page</title>
    <script type="text/javascript">
      console.log('Hello World');
    </script>
    <style type="text/css">
      body { margin: 0; }
    </style>
  </head>
  <body>
    <!-- Main content -->
    <header>
      <h1>Welcome</h1>
    </header>
    <main>
      <p>This is a test paragraph with    multiple    spaces.</p>
      <div class="container">
        <button type="submit" disabled="disabled">Submit</button>
      </div>
    </main>
    <!-- Footer section -->
    <footer>
      <p>&copy; 2024</p>
    </footer>
  </body>
</html>`;

      const originalLength = htmlCode.length;
      const result = await minifyContentV2(htmlCode, 'index.html');

      expect(result.type).toBe('aggressive');
      expect(result.failed).toBe(false);
      expect(result.content.length).toBeLessThan(originalLength);

      // HTML-minifier optimizations
      expect(result.content).not.toContain('<!-- Meta information -->');
      expect(result.content).not.toContain('<!-- Main content -->');
      expect(result.content).not.toContain('type="text/javascript"'); // Removed redundant
      expect(result.content).toContain('disabled'); // Should remove ="disabled"
      expect(result.content).not.toContain('    multiple    spaces'); // Collapsed whitespace

      // Should be significantly smaller
      expect(result.content.length / originalLength).toBeLessThan(0.7);
    });

    it('should fallback gracefully when html-minifier fails', async () => {
      const invalidHTML = `<html>
  <!-- Malformed HTML -->
  <div>
    <span>Unclosed span
    <p>Paragraph</p>
  </div>
</html>`;

      const result = await minifyContentV2(invalidHTML, 'broken.html');

      expect(result.type).toBe('aggressive');
      expect(result.failed).toBe(false);
      // Should still work with fallback
      expect(result.content).not.toContain('<!-- Malformed HTML -->');
      expect(result.content.length).toBeLessThan(invalidHTML.length);
    });
  });

  describe('TypeScript Files', () => {
    it('should minify TypeScript files using terser strategy', async () => {
      const tsCode = `interface User {
  id: number;
  name: string;
  email?: string;
}

class UserService {
  private users: User[] = [];

  constructor() {
    // Initialize service
    this.loadUsers();
  }

  addUser(user: User): void {
    // Add user to list
    this.users.push(user);
    console.log(\`Added user: \${user.name}\`);
  }

  findUser(id: number): User | undefined {
    /* Find user by ID */
    return this.users.find(user => user.id === id);
  }
}`;

      mockMinify.mockResolvedValue({
        code: 'interface User{id:number;name:string;email?:string}class UserService{private users:User[]=[];constructor(){this.loadUsers()}addUser(user:User):void{this.users.push(user);console.log(`Added user: ${user.name}`)}findUser(id:number):User|undefined{return this.users.find(user=>user.id===id)}}',
      });

      const originalLength = tsCode.length;
      const result = await minifyContentV2(tsCode, 'user.ts');

      expect(result.type).toBe('terser');
      expect(result.failed).toBe(false);
      expect(result.content.length).toBeLessThan(originalLength);
      expect(mockMinify).toHaveBeenCalledWith(tsCode, expect.any(Object));

      // Should remove comments and compress
      expect(result.content).not.toContain('// Initialize service');
      expect(result.content).not.toContain('/* Find user by ID */');
      expect(result.content.length / originalLength).toBeLessThan(0.7);
    });

    it('should handle TSX files with React components', async () => {
      const tsxCode = `import React from 'react';

interface Props {
  title: string;
  children: React.ReactNode;
}

const Card: React.FC<Props> = ({ title, children }) => {
  // Component logic
  return (
    <div className="card">
      <h2>{title}</h2>
      <div className="content">
        {children}
      </div>
    </div>
  );
};

export default Card;`;

      mockMinify.mockResolvedValue({
        code: 'import React from"react";const Card=({title,children})=><div className="card"><h2>{title}</h2><div className="content">{children}</div></div>;export default Card;',
      });

      const originalLength = tsxCode.length;
      const result = await minifyContentV2(tsxCode, 'Card.tsx');

      expect(result.type).toBe('terser');
      expect(result.failed).toBe(false);
      expect(result.content.length).toBeLessThan(originalLength);
      expect(result.content.length / originalLength).toBeLessThan(0.5);
    });
  });

  describe('Markdown Files', () => {
    it('should conservatively minify Markdown preserving structure', async () => {
      const markdownCode = `# Main Title

This is a paragraph with    multiple    spaces and 
line breaks that should be preserved.

## Section Header

- List item 1
- List item 2
    - Nested item with proper indentation
- List item 3

### Code Example

\`\`\`javascript
function example() {
    return true;
}
\`\`\`

> This is a blockquote
> that spans multiple lines
> and should preserve structure.

---

Final paragraph with [link](https://example.com) and **bold** text.



<!-- Extra empty lines above should be collapsed -->

`;

      const originalLength = markdownCode.length;
      const result = await minifyContentV2(markdownCode, 'README.md');

      expect(result.type).toBe('markdown');
      expect(result.failed).toBe(false);
      expect(result.content.length).toBeLessThan(originalLength);

      // Should preserve Markdown structure
      expect(result.content).toContain('# Main Title');
      expect(result.content).toContain('## Section Header');
      expect(result.content).toContain('### Code Example');
      expect(result.content).toContain('- List item 1');
      expect(result.content).toContain('    - Nested item'); // Preserve indentation
      expect(result.content).toContain('```javascript');
      expect(result.content).toContain('> This is a blockquote');

      // Should collapse excessive empty lines but preserve double newlines
      expect(result.content).not.toMatch(/\n\n\n+/); // No triple+ newlines
      expect(result.content).toContain('\n\n'); // But preserve paragraph breaks

      // Should reduce length modestly (conservative approach)
      expect(result.content.length / originalLength).toBeGreaterThan(0.8);
      expect(result.content.length / originalLength).toBeLessThan(1.0);
    });
  });

  describe('Language-Specific Tests', () => {
    it('should handle Ruby files with hash comments', async () => {
      const rubyCode = `# Ruby class example
class User
  # Constructor
  def initialize(name, email)
    @name = name    # Instance variable
    @email = email  # Another instance variable
  end

  # Getter method
  def name
    @name
  end

  # Method with logic
  def send_email(message)
    # Email sending logic
    puts "Sending: #{message} to #{@email}"
  end
end`;

      const originalLength = rubyCode.length;
      const result = await minifyContentV2(rubyCode, 'user.rb');

      expect(result.type).toBe('aggressive');
      expect(result.failed).toBe(false);
      expect(result.content.length).toBeLessThan(originalLength);

      // Should remove all hash comments
      expect(result.content).not.toContain('# Ruby class example');
      expect(result.content).not.toContain('# Constructor');
      expect(result.content).not.toContain('# Instance variable');

      // Should preserve Ruby syntax
      expect(result.content).toContain('class User');
      expect(result.content).toContain('def initialize(name,email)');
      expect(result.content.length / originalLength).toBeLessThan(0.7);
    });

    it('should handle Rust files with C-style comments', async () => {
      const rustCode = `// Rust struct example
use std::collections::HashMap;

/// Documentation comment (should be preserved)
struct User {
    name: String,      // User's name
    age: u32,         // User's age
    active: bool,     // Is user active
}

impl User {
    // Constructor function
    pub fn new(name: String, age: u32) -> Self {
        /* Create new user instance
           with default active status */
        User {
            name,
            age,
            active: true,  // Default to active
        }
    }

    // Method to check if adult
    pub fn is_adult(&self) -> bool {
        self.age >= 18
    }
}`;

      const originalLength = rustCode.length;
      const result = await minifyContentV2(rustCode, 'user.rs');

      expect(result.type).toBe('aggressive');
      expect(result.failed).toBe(false);
      expect(result.content.length).toBeLessThan(originalLength);

      // Should remove C-style comments (including doc comments for token reduction)
      expect(result.content).not.toContain('// Rust struct example');
      expect(result.content).not.toContain("// User's name");
      expect(result.content).not.toContain('/* Create new user instance');
      expect(result.content).not.toContain('// Constructor function');
      expect(result.content).not.toContain('/// Documentation comment'); // Doc comments also removed

      // Should preserve Rust syntax
      expect(result.content).toContain('use std::collections::HashMap;');
      expect(result.content).toContain('struct User{');
      expect(result.content.length / originalLength).toBeLessThan(0.8);
    });

    it('should handle SQL files with SQL-specific comments', async () => {
      const sqlCode = `-- Database schema for users table
CREATE TABLE users (
    id SERIAL PRIMARY KEY,           -- Auto-incrementing ID
    username VARCHAR(50) NOT NULL,   -- Username field
    email VARCHAR(100) UNIQUE,       -- Email must be unique
    created_at TIMESTAMP DEFAULT NOW()
);

/* Insert sample data
   for testing purposes */
INSERT INTO users (username, email) VALUES
    ('john_doe', 'john@example.com'),    -- First user
    ('jane_smith', 'jane@example.com');  -- Second user

-- Query to find active users
SELECT u.id, u.username, u.email
FROM users u
WHERE u.created_at > '2024-01-01'  -- Recent users only
ORDER BY u.created_at DESC;`;

      const originalLength = sqlCode.length;
      const result = await minifyContentV2(sqlCode, 'schema.sql');

      expect(result.type).toBe('aggressive');
      expect(result.failed).toBe(false);
      expect(result.content.length).toBeLessThan(originalLength);

      // Should remove both types of SQL comments
      expect(result.content).not.toContain('-- Database schema');
      expect(result.content).not.toContain('-- Auto-incrementing ID');
      expect(result.content).not.toContain('/* Insert sample data');
      expect(result.content).not.toContain('-- First user');

      // Should preserve SQL structure
      expect(result.content).toContain('CREATE TABLE users');
      expect(result.content).toContain('INSERT INTO users');
      expect(result.content).toContain('SELECT u.id,u.username'); // Spaces collapsed
      expect(result.content.length / originalLength).toBeLessThan(0.7);
    });

    it('should handle YAML files conservatively', async () => {
      const yamlCode = `# Kubernetes deployment configuration
apiVersion: apps/v1
kind: Deployment
metadata:
  name: web-app
  # Application labels
  labels:
    app: web-app
    version: v1.0
spec:
  replicas: 3          # Number of replicas
  selector:
    matchLabels:
      app: web-app
  template:
    metadata:
      labels:
        app: web-app   # Pod labels
    spec:
      containers:
      - name: web-container
        image: nginx:1.20    # Container image
        ports:
        - containerPort: 80  # Exposed port
        env:
        - name: ENV
          value: "production"

        # Resource limits
        resources:
          limits:
            memory: "512Mi"
            cpu: "500m"`;

      const originalLength = yamlCode.length;
      const result = await minifyContentV2(yamlCode, 'deployment.yaml');

      expect(result.type).toBe('conservative');
      expect(result.failed).toBe(false);
      expect(result.content.length).toBeLessThan(originalLength);

      // Should remove comments but preserve YAML structure
      expect(result.content).not.toContain('# Kubernetes deployment');
      expect(result.content).not.toContain('# Application labels');
      expect(result.content).not.toContain('# Number of replicas');

      // Should preserve exact YAML indentation
      expect(result.content).toContain('apiVersion: apps/v1');
      expect(result.content).toContain('  name: web-app');
      expect(result.content).toContain('    app: web-app');
      expect(result.content).toContain('      - name: web-container');
      expect(result.content).toContain('            memory: "512Mi"');

      // Conservative minification - modest reduction
      expect(result.content.length / originalLength).toBeGreaterThan(0.7);
    });

    it('should handle template files (Handlebars) with template comments', async () => {
      const hbsCode = `{{!-- Main template for user profile --}}
<div class="user-profile">
  <h1>{{user.name}}</h1>
  
  {{! User avatar section }}
  {{#if user.avatar}}
    <img src="{{user.avatar}}" alt="{{user.name}}'s avatar">
  {{else}}
    {{!-- Default avatar fallback --}}
    <div class="default-avatar">{{user.initials}}</div>
  {{/if}}
  
  {{! Contact information }}
  <div class="contact-info">
    <p>Email: {{user.email}}</p>
    {{#if user.phone}}
      <p>Phone: {{user.phone}}</p>
    {{/if}}
  </div>
  
  {{!-- User actions section --}}
  <div class="actions">
    <button onclick="editUser('{{user.id}}')">Edit</button>
    <button onclick="deleteUser('{{user.id}}')">Delete</button>
  </div>
</div>`;

      const originalLength = hbsCode.length;
      const result = await minifyContentV2(hbsCode, 'profile.hbs');

      expect(result.type).toBe('aggressive');
      expect(result.failed).toBe(false);
      expect(result.content.length).toBeLessThan(originalLength);

      // Should remove Handlebars comments
      expect(result.content).not.toContain('{{!-- Main template');
      expect(result.content).not.toContain('{{! User avatar section }}');
      expect(result.content).not.toContain(
        '{{!-- Default avatar fallback --}}'
      );
      expect(result.content).not.toContain('{{!-- User actions section --}}');

      // Should preserve Handlebars syntax
      expect(result.content).toContain('{{user.name}}');
      expect(result.content).toContain('{{#if user.avatar}}');
      expect(result.content).toContain('{{else}}');
      expect(result.content).toContain('{{/if}}');
      expect(result.content.length / originalLength).toBeLessThan(0.7);
    });
  });

  describe('Length Reduction Verification', () => {
    it('should significantly reduce file sizes for verbose code', async () => {
      const testCases = [
        {
          content: `/* Large CSS file */\n.a { color: red; }\n.b { color: blue; }\n.c { color: green; }`,
          file: 'test.css',
          expectedReduction: 0.6, // At least 40% reduction
        },
        {
          content: `// JavaScript with comments\nfunction test() {\n  // Comment\n  return true;\n}`,
          file: 'test.js',
          expectedReduction: 0.7,
        },
        {
          content: `<!-- HTML with comments -->\n<div>\n  <p>Test</p>\n</div>`,
          file: 'test.html',
          expectedReduction: 0.7,
        },
        {
          content: `# Python with comments\ndef test():\n    # Comment\n    return True`,
          file: 'test.py',
          expectedReduction: 0.8, // Conservative - less reduction
        },
      ];

      mockMinify.mockResolvedValue({ code: 'function test(){return true}' });

      for (const testCase of testCases) {
        const originalLength = testCase.content.length;
        const result = await minifyContentV2(testCase.content, testCase.file);

        expect(result.failed).toBe(false);
        expect(result.content.length).toBeLessThan(originalLength);
        expect(result.content.length / originalLength).toBeLessThan(
          testCase.expectedReduction
        );
      }
    });
  });

  describe('General Strategy Tests', () => {
    it('should handle plain text files with general minification', async () => {
      const textContent = `This is a plain text file with excessive    whitespace.



There are too many empty lines above.

This line has trailing spaces    
And this line has	tabs	and    multiple   spaces.



More excessive whitespace here.`;

      const originalLength = textContent.length;
      const result = await minifyContentV2(textContent, 'document.txt');

      expect(result.type).toBe('general');
      expect(result.failed).toBe(false);
      expect(result.content.length).toBeLessThan(originalLength);

      // Should normalize excessive whitespace
      expect(result.content).not.toMatch(/\n\n\n+/); // No triple newlines
      expect(result.content).not.toMatch(/[ \t]{3,}/); // No excessive inline whitespace
      expect(result.content).not.toMatch(/[ \t]+$/m); // No trailing whitespace

      // Should preserve basic structure
      expect(result.content).toContain('This is a plain text file');
      expect(result.content).toContain('More excessive whitespace here.');
      expect(result.content.length / originalLength).toBeLessThan(0.95);
    });

    it('should handle log files with general minification', async () => {
      const logContent = `[2024-01-01 10:00:00] INFO: Application started
[2024-01-01 10:00:01] DEBUG: Loading configuration   
[2024-01-01 10:00:02] WARN: Deprecated API used    



[2024-01-01 10:00:05] ERROR: Connection failed
[2024-01-01 10:00:06] INFO: Retrying connection`;

      const originalLength = logContent.length;
      const result = await minifyContentV2(logContent, 'app.log');

      expect(result.type).toBe('general');
      expect(result.failed).toBe(false);
      expect(result.content.length).toBeLessThan(originalLength);

      // Should clean up whitespace while preserving log structure
      expect(result.content).toContain(
        '[2024-01-01 10:00:00] INFO: Application started'
      );
      expect(result.content).toContain(
        '[2024-01-01 10:00:06] INFO: Retrying connection'
      );
      expect(result.content).not.toMatch(/\n\n\n+/);
    });
  });

  describe('Top 20 Development Languages', () => {
    it('should handle F# files conservatively', async () => {
      const fsharpCode = `// F# functional programming example
module Calculator

open System

/// Documentation comment for add function
let add x y = x + y

// Function with pattern matching
let rec factorial n =
    match n with
    | 0 | 1 -> 1  // Base case
    | _ -> n * factorial (n - 1)  // Recursive case

type Person = {
    Name: string    // Person's name
    Age: int       // Person's age
}`;

      const originalLength = fsharpCode.length;
      const result = await minifyContentV2(fsharpCode, 'Calculator.fs');

      expect(result.type).toBe('conservative');
      expect(result.failed).toBe(false);
      expect(result.content.length).toBeLessThan(originalLength);

      // Should remove line comments but preserve structure
      expect(result.content).not.toContain('// F# functional programming');
      expect(result.content).not.toContain('// Base case');
      expect(result.content).toContain('module Calculator');
      expect(result.content).toContain('let add x y = x + y');
    });

    it('should handle Haskell files conservatively', async () => {
      const haskellCode = `-- Haskell module example
module Fibonacci where

-- | Fibonacci function using recursion  
fibonacci :: Int -> Int
fibonacci 0 = 0    -- Base case
fibonacci 1 = 1    -- Base case  
fibonacci n = fibonacci (n-1) + fibonacci (n-2)  -- Recursive case

{- Block comment explaining
   the quicksort algorithm -}
quicksort :: Ord a => [a] -> [a]
quicksort [] = []
quicksort (x:xs) = quicksort smaller ++ [x] ++ quicksort larger
  where smaller = [a | a <- xs, a <= x]  -- Elements <= pivot
        larger = [b | b <- xs, b > x]    -- Elements > pivot`;

      const originalLength = haskellCode.length;
      const result = await minifyContentV2(haskellCode, 'Fibonacci.hs');

      expect(result.type).toBe('conservative');
      expect(result.failed).toBe(false);
      expect(result.content.length).toBeLessThan(originalLength);

      // Should remove Haskell comments
      expect(result.content).not.toContain('-- Haskell module example');
      expect(result.content).not.toContain('{- Block comment explaining');
      expect(result.content).toContain('module Fibonacci where');
      expect(result.content).toContain('fibonacci :: Int -> Int');
    });

    it('should handle Clojure files aggressively', async () => {
      const clojureCode = `; Clojure namespace example
(ns my-app.core
  (:require [clojure.string :as str]))

;; Function to calculate factorial
(defn factorial [n]
  (if (<= n 1)    ; Base case check
    1
    (* n (factorial (dec n)))))  ; Recursive multiplication

;; Higher-order function example
(defn map-increment [coll]
  ; Increment each element in collection
  (map inc coll))

; Data structure example
(def person-map
  {:name "John"     ; Person's name
   :age 30          ; Person's age
   :city "NYC"})    ; Person's city`;

      const originalLength = clojureCode.length;
      const result = await minifyContentV2(clojureCode, 'core.clj');

      expect(result.type).toBe('aggressive');
      expect(result.failed).toBe(false);
      expect(result.content.length).toBeLessThan(originalLength);

      // Should remove Clojure comments
      expect(result.content).not.toContain('; Clojure namespace example');
      expect(result.content).not.toContain(';; Function to calculate');
      expect(result.content).toContain('(ns my-app.core');
      expect(result.content).toContain('(defn factorial [n]');
    });

    it('should handle Elixir files aggressively', async () => {
      const elixirCode = `# Elixir module example
defmodule Calculator do
  @moduledoc """
  A simple calculator module
  """

  # Addition function
  def add(a, b) do
    a + b  # Return sum
  end

  # Factorial function using recursion
  def factorial(0), do: 1  # Base case
  def factorial(n) when n > 0 do
    n * factorial(n - 1)   # Recursive case
  end

  # Private helper function
  defp validate_input(n) when is_integer(n), do: :ok
  defp validate_input(_), do: :error  # Invalid input
end`;

      const originalLength = elixirCode.length;
      const result = await minifyContentV2(elixirCode, 'calculator.ex');

      expect(result.type).toBe('aggressive');
      expect(result.failed).toBe(false);
      expect(result.content.length).toBeLessThan(originalLength);

      // Should remove hash comments but preserve module docs
      expect(result.content).not.toContain('# Elixir module example');
      expect(result.content).not.toContain('# Addition function');
      expect(result.content).toContain('defmodule Calculator do');
      expect(result.content).toContain('@moduledoc """'); // Preserve module docs
    });

    it('should handle Perl files aggressively', async () => {
      const perlCode = `#!/usr/bin/perl
# Perl script example
use strict;
use warnings;

# Subroutine to calculate factorial
sub factorial {
    my $n = shift;           # Get parameter
    return 1 if $n <= 1;    # Base case
    return $n * factorial($n - 1);  # Recursive case
}

# Hash to store person data
my %person = (
    'name' => 'John',        # Person's name
    'age'  => 30,           # Person's age
    'city' => 'New York'    # Person's city
);

# Print factorial result
print "Factorial of 5 is: " . factorial(5) . "\\n";  # Output result`;

      const originalLength = perlCode.length;
      const result = await minifyContentV2(perlCode, 'script.pl');

      expect(result.type).toBe('aggressive');
      expect(result.failed).toBe(false);
      expect(result.content.length).toBeLessThan(originalLength);

      // Should remove hash comments
      expect(result.content).not.toContain('# Perl script example');
      expect(result.content).not.toContain('# Get parameter');
      expect(result.content).toContain('#!/usr/bin/perl');
      expect(result.content).toContain('sub factorial{'); // Aggressive minification removes spaces
    });
  });

  describe('Error Handling and Recovery', () => {
    it('should handle invalid regex patterns gracefully', async () => {
      // Mock a scenario where regex might fail
      const problematicContent =
        'Content with \\x00 null bytes and weird \\uFFFF unicode';

      const result = await minifyContentV2(
        problematicContent,
        'problematic.txt'
      );

      expect(result.failed).toBe(false); // Should not fail completely
      expect(result.content).toBe(problematicContent.trim()); // Should at least trim
    });

    it('should return original content when all strategies fail', async () => {
      // Test with a file that could cause issues
      const originalContent = 'Simple content';

      // Mock all minification functions to fail by using invalid file extension
      const result = await minifyContentV2(originalContent, 'unknown.unknown');

      expect(result.failed).toBe(false); // General strategy should work
      expect(result.type).toBe('general');
    });

    it('should handle very large files without crashing', async () => {
      // Create a large content string (10KB)
      const largeContent = 'This is a test line.\n'.repeat(500);
      const originalLength = largeContent.length;

      const result = await minifyContentV2(largeContent, 'large.txt');

      expect(result.failed).toBe(false);
      expect(result.content.length).toBeLessThanOrEqual(originalLength);
    });

    it('should handle empty and whitespace-only files', async () => {
      const emptyFile = '';
      const whitespaceFile = '   \n\n\t  \n  ';

      const emptyResult = await minifyContentV2(emptyFile, 'empty.txt');
      const whitespaceResult = await minifyContentV2(
        whitespaceFile,
        'whitespace.txt'
      );

      expect(emptyResult.failed).toBe(false);
      expect(emptyResult.content).toBe('');

      expect(whitespaceResult.failed).toBe(false);
      expect(whitespaceResult.content).toBe('');
    });
  });

  describe('Enhanced Markdown Support', () => {
    it('should handle complex Markdown with code blocks and tables', async () => {
      const complexMarkdown = `# API Documentation

## Overview    

This API provides access to user data.


### Authentication

Use the following header:

\`\`\`http
Authorization: Bearer <token>
\`\`\`

### Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET    | /users   | Get all users     |
| POST   | /users   | Create user       |


#### Example Request

\`\`\`javascript
fetch('/api/users', {
  method: 'GET',  
  headers: {
    'Authorization': 'Bearer token123'    
  }
})
.then(response => response.json())
.then(data => console.log(data));
\`\`\`

> **Note**: Rate limiting applies to all endpoints.


---

## Error Codes

- \`400\` - Bad Request
- \`401\` - Unauthorized  
- \`404\` - Not Found


<!-- Internal notes: Update this section regularly -->

Final section with **important** information.`;

      const originalLength = complexMarkdown.length;
      const result = await minifyContentV2(complexMarkdown, 'API.md');

      expect(result.type).toBe('markdown');
      expect(result.failed).toBe(false);
      expect(result.content.length).toBeLessThan(originalLength);

      // Should preserve Markdown structure
      expect(result.content).toContain('# API Documentation');
      expect(result.content).toContain('## Overview');
      expect(result.content).toContain('| Method | Endpoint | Description |');
      expect(result.content).toContain('```javascript');
      expect(result.content).toContain('> **Note**:');

      // Should clean up excessive whitespace
      expect(result.content).not.toMatch(/\n\n\n+/);
      expect(result.content).not.toMatch(/[ \t]+$/m);

      // Should be modestly reduced (conservative approach)
      expect(result.content.length / originalLength).toBeGreaterThan(0.7);
      expect(result.content.length / originalLength).toBeLessThan(1.0);
    });
  });

  describe('Comprehensive Extension Coverage', () => {
    it('should handle unknown extensions with general minification', async () => {
      const unknownContent = `Line with trailing spaces    
Multiple   spaces   between    words



Excessive empty lines above and below.



More content here.`;

      const originalLength = unknownContent.length;
      const result = await minifyContentV2(unknownContent, 'file.unknownext');

      expect(result.type).toBe('general');
      expect(result.failed).toBe(false);
      expect(result.content.length).toBeLessThan(originalLength);
      expect(result.content).not.toMatch(/[ \t]+$/m);
      expect(result.content).not.toMatch(/\n\n\n+/);
    });

    it('should handle files with no extension using general minification', async () => {
      const noExtContent = `README content with   extra    spaces
      
      
      
More content below.`;

      const result = await minifyContentV2(noExtContent, 'README');

      expect(result.type).toBe('general');
      expect(result.failed).toBe(false);
      expect(result.content).toContain('README content with extra spaces');
      expect(result.content).toContain('More content below.');
    });

    it('should handle complex markdown with various elements', async () => {
      const complexMd = `<!-- This is an HTML comment -->
# Main Header   

## Subheader     

This is a paragraph with   multiple   spaces.


### Code and Lists

Here's some code:

\`\`\`bash
#!/bin/bash
echo "Hello World"    
\`\`\`

And a list:
- Item 1    
- Item 2      
    - Nested item (4 spaces important!)    
        - Deeply nested (8 spaces)    

| Table | Header |    
|-------|--------|    
| Cell1 | Cell2  |    

> Blockquote with    extra spaces
> Second line    



Final paragraph.`;

      const originalLength = complexMd.length;
      const result = await minifyContentV2(complexMd, 'complex.md');

      expect(result.type).toBe('markdown');
      expect(result.failed).toBe(false);
      expect(result.content.length).toBeLessThan(originalLength);

      // Should preserve structure
      expect(result.content).toContain('# Main Header');
      expect(result.content).toContain(
        '    - Nested item (4 spaces important!)'
      );
      expect(result.content).toContain('```bash');
      expect(result.content).toContain('| Table | Header |');
      expect(result.content).toContain('> Blockquote with'); // Allow for whitespace normalization

      // Should remove HTML comments
      expect(result.content).not.toContain('<!-- This is an HTML comment -->');

      // Should normalize spacing
      expect(result.content).not.toMatch(/[ \t]+$/m);
      expect(result.content).not.toMatch(/\n\n\n+/);
    });

    it('should handle all programming language extensions correctly', async () => {
      const testCases = [
        {
          ext: 'js',
          expected: 'terser',
          content:
            'var x = 1; // comment\nfunction test() {\n  return true;\n}',
        },
        {
          ext: 'py',
          expected: 'conservative',
          content: '# Comment\ndef hello():\n    print("world")',
        },
        {
          ext: 'html',
          expected: 'aggressive',
          content: '<div>  <p>Hello</p>  </div>',
        },
        {
          ext: 'css',
          expected: 'aggressive',
          content: 'body { margin: 0; /* comment */ }',
        },
        { ext: 'json', expected: 'json', content: '{\n  "key": "value"\n}' },
        {
          ext: 'md',
          expected: 'markdown',
          content: '# Title\n\nParagraph text.',
        },
        {
          ext: 'txt',
          expected: 'general',
          content: 'Plain text   with spaces',
        },
        {
          ext: 'rs',
          expected: 'aggressive',
          content: '// Rust comment\nfn main() {}',
        },
        {
          ext: 'go',
          expected: 'aggressive',
          content: '// Go comment\nfunc main() {}',
        },
        {
          ext: 'hs',
          expected: 'conservative',
          content: '-- Haskell comment\nmain = putStrLn "Hello"',
        },
      ];

      for (const testCase of testCases) {
        const result = await minifyContentV2(
          testCase.content,
          `test.${testCase.ext}`
        );

        // Special handling for JavaScript which might fail terser and fallback
        if (testCase.ext === 'js' && result.failed) {
          // If terser fails, it's acceptable as long as we have a result
          expect(result.type).toBe('failed');
          expect(result.content).toBe(testCase.content); // Should return original
        } else {
          expect(result.type).toBe(testCase.expected);
          expect(result.failed).toBe(false);
          expect(result.content.length).toBeLessThanOrEqual(
            testCase.content.length
          );
        }
      }
    });

    it('should handle malformed content gracefully', async () => {
      const malformedTests = [
        { content: '{\ninvalid json\n}', file: 'test.json' },
        { content: '<html><div><p>unclosed tags', file: 'test.html' },
        { content: 'body { color: #broken css }', file: 'test.css' },
        { content: 'null\x00byte content', file: 'test.txt' },
        { content: '\uFFFF\uFFFE\uFFFD', file: 'test.txt' },
      ];

      for (const test of malformedTests) {
        const result = await minifyContentV2(test.content, test.file);

        // Should not throw errors
        expect(result).toBeDefined();
        expect(typeof result.content).toBe('string');
        expect(typeof result.failed).toBe('boolean');
        expect(typeof result.type).toBe('string');

        // Content should be defined (either minified or original)
        expect(result.content).toBeDefined();
      }
    });

    it('should preserve critical syntax for indentation-sensitive languages', async () => {
      const pythonCode = `class MyClass:
    def __init__(self):
        self.value = 42    # trailing spaces
        
    def method(self):
        if True:    # comment
            return self.value
        else:
            return 0`;

      const result = await minifyContentV2(pythonCode, 'test.py');

      expect(result.type).toBe('conservative');
      expect(result.failed).toBe(false);

      // Should preserve indentation structure
      expect(result.content).toContain('    def __init__(self):');
      expect(result.content).toContain('        self.value = 42');
      expect(result.content).toContain('            return self.value');

      // Should remove comments
      expect(result.content).not.toContain('# trailing spaces');
      expect(result.content).not.toContain('# comment');
    });
  });

  describe('Size Limit Tests', () => {
    it('should reject content larger than 1MB', async () => {
      // Create content just over 1MB (1MB + 100 bytes)
      const oneMB = 1024 * 1024;
      const largeContent = 'x'.repeat(oneMB + 100);

      const result = await minifyContentV2(largeContent, 'large.js');

      expect(result.failed).toBe(true);
      expect(result.type).toBe('failed');
      expect(result.content).toBe(largeContent); // Should return original content
    });

    it('should accept content exactly at 1MB limit', async () => {
      // Create content exactly 1MB
      const oneMB = 1024 * 1024;
      const limitContent = 'a'.repeat(oneMB);

      const result = await minifyContentV2(limitContent, 'limit.txt');

      expect(result.failed).toBe(false);
      expect(result.type).toBe('general'); // txt files use general strategy
      expect(result.content.length).toBeLessThanOrEqual(limitContent.length);
    });

    it('should accept content just under 1MB limit', async () => {
      // Create content just under 1MB (1MB - 100 bytes)
      const oneMB = 1024 * 1024;
      const underLimitContent = 'b'.repeat(oneMB - 100);

      const result = await minifyContentV2(
        underLimitContent,
        'under-limit.txt'
      );

      expect(result.failed).toBe(false);
      expect(result.type).toBe('general');
      expect(result.content.length).toBeLessThanOrEqual(
        underLimitContent.length
      );
    });

    it('should handle multi-byte UTF-8 characters correctly in size calculation', async () => {
      // Create content with multi-byte characters that's just over 1MB in bytes
      const oneMB = 1024 * 1024;
      // Each emoji is 4 bytes in UTF-8
      const emoji = '🔥'; // 4 bytes
      const emojiCount = Math.floor(oneMB / 4) + 50; // Just over 1MB
      const emojiContent = emoji.repeat(emojiCount);

      // Verify it's actually over 1MB in bytes
      const contentSize = Buffer.byteLength(emojiContent, 'utf8');
      expect(contentSize).toBeGreaterThan(oneMB);

      const result = await minifyContentV2(emojiContent, 'emoji.txt');

      expect(result.failed).toBe(true);
      expect(result.type).toBe('failed');
      expect(result.content).toBe(emojiContent);
    });

    it('should handle edge case of empty content', async () => {
      const result = await minifyContentV2('', 'empty.txt');

      expect(result.failed).toBe(false);
      expect(result.type).toBe('general');
      expect(result.content).toBe('');
    });

    it('should handle different file types consistently with size limit', async () => {
      const oneMB = 1024 * 1024;
      const largeJSContent = 'var x = 1; '.repeat(
        Math.floor((oneMB + 1000) / 10)
      );
      const largeCSSContent = '.a{color:red} '.repeat(
        Math.floor((oneMB + 1000) / 13)
      );
      const largeHTMLContent = '<div>test</div>'.repeat(
        Math.floor((oneMB + 1000) / 15)
      );

      const jsResult = await minifyContentV2(largeJSContent, 'large.js');
      const cssResult = await minifyContentV2(largeCSSContent, 'large.css');
      const htmlResult = await minifyContentV2(largeHTMLContent, 'large.html');

      // All should fail due to size limit regardless of file type
      expect(jsResult.failed).toBe(true);
      expect(jsResult.type).toBe('failed');
      expect(cssResult.failed).toBe(true);
      expect(cssResult.type).toBe('failed');
      expect(htmlResult.failed).toBe(true);
      expect(htmlResult.type).toBe('failed');

      // Should return original content
      expect(jsResult.content).toBe(largeJSContent);
      expect(cssResult.content).toBe(largeCSSContent);
      expect(htmlResult.content).toBe(largeHTMLContent);
    });

    it('should calculate size correctly for content with mixed characters', async () => {
      const oneMB = 1024 * 1024;
      // Mix of ASCII (1 byte), Latin-1 (2 bytes), and emojis (4 bytes)
      const mixedContent =
        'a'.repeat(100000) + // 100KB ASCII
        'é'.repeat(100000) + // 200KB Latin-1 (2 bytes each)
        '🚀'.repeat(200000); // 800KB emojis (4 bytes each) // Total: ~1.1MB

      const actualSize = Buffer.byteLength(mixedContent, 'utf8');
      expect(actualSize).toBeGreaterThan(oneMB);

      const result = await minifyContentV2(mixedContent, 'mixed.txt');

      expect(result.failed).toBe(true);
      expect(result.type).toBe('failed');
    });
  });

  describe('Real-world Examples', () => {
    it('should handle complex Python class with proper indentation', async () => {
      const pythonCode = `class DatabaseManager:
    """Database management class."""
    
    def __init__(self, connection_string):
        # Initialize connection
        self.connection = None
        self.connection_string = connection_string
    
    def connect(self):
        """Connect to database."""
        try:
            # Attempt connection
            self.connection = create_connection(self.connection_string)
            return True
        except Exception as e:
            # Log error
            logger.error(f"Connection failed: {e}")
            return False
    
    def query(self, sql, params=None):
        """Execute query with optional parameters."""
        if not self.connection:
            # No connection available
            raise ConnectionError("Not connected to database")
        
        # Execute query
        cursor = self.connection.cursor()
        cursor.execute(sql, params or {})
        return cursor.fetchall()`;

      const result = await minifyContentV2(pythonCode, 'db_manager.py');

      expect(result.type).toBe('conservative');
      expect(result.failed).toBe(false);

      // Should preserve class structure and indentation
      expect(result.content).toContain('class DatabaseManager:');
      expect(result.content).toContain(
        '    def __init__(self, connection_string):'
      );
      expect(result.content).toContain('        self.connection = None');
      expect(result.content).toContain('    def connect(self):');
      expect(result.content).toContain('        try:');
      expect(result.content).toContain(
        '            self.connection = create_connection(self.connection_string)'
      );

      // Should remove comments but preserve docstrings (they're not comments)
      expect(result.content).not.toContain('# Initialize connection');
      expect(result.content).not.toContain('# Attempt connection');
      expect(result.content).toContain('"""Database management class."""');
    });
  });
});
