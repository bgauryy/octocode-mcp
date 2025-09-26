# octocode-utils

**Shared utilities for Octocode MCP packages**

<div align="center">
  <img src="https://github.com/bgauryy/octocode-mcp/raw/main/packages/octocode-utils/assets/logo_builder.png" width="200px" alt="Octocode Utils Logo">
</div>

<div align="center">
  
  [![Version](https://img.shields.io/npm/v/octocode-utils.svg)](https://www.npmjs.com/package/octocode-utils)
  [![License](https://img.shields.io/badge/license-MIT-green.svg)](./package.json)
  [![X/Twitter](https://img.shields.io/badge/X-Follow%20@guy__bary-1DA1F2.svg?logo=x&logoColor=white)](https://x.com/guy_bary)
  [![Website](https://img.shields.io/badge/Website-octocode.ai-blue.svg?logo=web)](https://octocode.ai)
  
</div>

Essential utilities for building MCP (Model Context Protocol) applications with advanced content processing and AI optimization capabilities.

## Installation

```bash
npm install octocode-utils
# or
yarn add octocode-utils
```

## 🚀 Features

- **🧠 AI-Optimized Content Processing** - Transform any content for optimal AI consumption
- **⚡ Advanced Minification** - Multi-strategy content compression for 50+ file types
- **🔄 JSON-to-YAML Conversion** - Convert JSON to token-efficient YAML format
- **🛡️ Production Ready** - Comprehensive error handling and fallback mechanisms
- **📦 Zero Dependencies** - Lightweight with minimal external requirements

## 📚 Usage

### tokenOptimizer

Converts JSON data to YAML format with configurable key sorting and forced string quoting for optimal token efficiency and AI consumption.

```typescript
import { tokenOptimizer, tokenOptimizerConfig } from 'octocode-utils';

const data = {
  name: "John Doe",
  age: 30,
  id: "user-123",
  active: true,
  roles: ["admin", "user"],
  settings: {
    theme: "dark",
    notifications: true,
    id: "settings-456"
  }
};

// Default behavior (preserves original key order)
console.log(tokenOptimizer(data));
// Output:
// name: "John Doe"
// age: 30
// id: "user-123"
// active: true
// roles:
//   - "admin"
//   - "user"
// settings:
//   theme: "dark"
//   notifications: true
//   id: "settings-456"

// With priority-based sorting (applied recursively to all nested objects)
const config: tokenOptimizerConfig = {
  keysPriority: ["id", "name"]
};

console.log(tokenOptimizer(data, config));
// Output:
// id: "user-123"        <- Priority key first
// name: "John Doe"      <- Priority key second
// active: true          <- Remaining keys alphabetically
// age: 30
// roles:
//   - "admin"
//   - "user"
// settings:
//   id: "settings-456"  <- Priority applied to nested objects too
//   name: "John Doe"    <- Priority applied to nested objects too
//   notifications: true <- Remaining keys alphabetically
//   theme: "dark"
```

#### Features

- **Token Efficiency**: Achieves 20-40% token reduction compared to JSON
- **Configurable Key Sorting**: Three sorting modes for optimal LLM consumption
  - **Default**: Preserves original key order
  - **Alphabetical**: Sorts all keys alphabetically (`sortKeys: true`)
  - **Priority-based**: Custom key ordering with `keysPriority` array
- **Redundant Value Removal**: Optional cleaning of empty objects, arrays, null, undefined, and NaN
- **Recursive Processing**: Key sorting and cleaning applies to ALL nested objects at every level
- **LLM Optimization**: Priority keys (id, name, type) appear first for better context
- **Forced String Quoting**: Maintains consistency with `forceQuotes: true`
- **JSON-like Consistency**: Uses double quotes for familiar syntax
- **Semantic Equivalence**: Preserves all meaningful data relationships and types
- **Clean Structure**: No line wrapping for predictable output
- **Error Resilience**: Graceful fallback to JSON on conversion failure

#### API

```typescript
function tokenOptimizer(
  jsonObject: unknown,
  config?: tokenOptimizerConfig
): string

interface tokenOptimizerConfig {
  /** Whether to sort keys alphabetically (false by default) */
  sortKeys?: boolean;
  /** 
   * Priority order for keys - missing keys will be added at the end alphabetically.
   * This configuration is applied RECURSIVELY to ALL nested objects at every level.
   * Each object (root, nested, arrays of objects) will have its keys sorted according
   * to the same priority rules, ensuring consistent structure throughout the entire data tree.
   */
  keysPriority?: string[];
  /** 
   * Remove empty objects {}, empty arrays [], null, undefined, and NaN values (false by default).
   * Preserves all booleans (true/false), numbers (including 0), and strings (including empty strings).
   * Applied recursively to all nested structures for maximum token efficiency.
   */
  removeRedundant?: boolean;
}
```

#### Configuration Examples

```typescript
// No sorting (default) - preserves original key order
tokenOptimizer(data);

// Alphabetical sorting at all levels
tokenOptimizer(data, { sortKeys: true });

// Priority-based sorting (recursive to all nested objects)
tokenOptimizer(data, { 
  keysPriority: ["id", "name", "type", "status", "version"] 
});

// Priority takes precedence over sortKeys
tokenOptimizer(data, { 
  sortKeys: true,                    // This is ignored
  keysPriority: ["id", "name"]       // This is used instead
});

// Remove redundant values for maximum token efficiency
tokenOptimizer(data, { removeRedundant: true });

// Combine configurations for optimal results
tokenOptimizer(data, {
  keysPriority: ["id", "name", "type"],
  removeRedundant: true              // Remove empty objects, arrays, nulls
});
```

#### Recursive Key Sorting Behavior

The `keysPriority` configuration is applied **recursively** to every object at every nesting level:

```typescript
const complexData = {
  // Root level
  environment: "production",
  name: "MyApp", 
  id: "app-123",
  
  // Level 1: database config
  database: {
    timeout: 30000,
    name: "myapp_db",
    host: "localhost", 
    id: "db-456",
    
    // Level 2: nested credentials
    credentials: {
      password: "secret",
      id: "cred-789",
      username: "admin",
      name: "DB Admin"
    }
  },
  
  // Level 1: array of objects
  users: [
    {
      email: "alice@example.com",
      name: "Alice",
      id: "user-1",
      role: "admin"
    }
  ]
};

const config = { keysPriority: ["id", "name"] };
const yaml = tokenOptimizer(complexData, config);

// Result: Every object gets its keys sorted by the same priority rules
// Root level:     id → name → (alphabetical)
// database:       id → name → (alphabetical) 
// credentials:    id → name → (alphabetical)
// users[0]:       id → name → (alphabetical)
```

This ensures **consistent structure** throughout your entire data tree, making it much easier for LLMs to process and understand your data efficiently.

#### Why LLMs Benefit from Recursive Key Sorting

Large Language Models process data more efficiently when it follows predictable patterns. Here's why the recursive key sorting approach is particularly beneficial for AI systems:

##### 🧠 **Pattern Recognition & Learning**
- **Consistent Structure**: LLMs excel at recognizing patterns. When every object follows the same key ordering rules, the model can quickly identify and predict data structure
- **Reduced Uncertainty**: Predictable key positions eliminate guesswork, allowing LLMs to focus on content rather than structure navigation
- **Training Efficiency**: Models trained on consistently structured data perform better on similar patterns

##### ⚡ **Processing Speed & Efficiency**
- **Faster Context Building**: Critical information (id, name, type) appears first at every level, enabling rapid context establishment
- **Reduced Scanning**: No need to search through objects to find essential keys - they're always in predictable positions
- **Token Efficiency**: Consistent formatting reduces token overhead and improves parsing efficiency

##### 🎯 **Cognitive Load Reduction**
- **Mental Model Simplification**: LLMs can build a single mental model for object structure that applies recursively
- **Attention Focus**: With structure predictable, models can dedicate more attention to semantic content
- **Error Reduction**: Consistent patterns reduce the likelihood of misinterpreting data relationships

##### 📊 **Real-World Impact**
```typescript
// Without keysPriority - LLM must scan each object differently
{
  user: { email: "...", name: "...", id: "..." },        // id at position 3
  profile: { bio: "...", id: "...", avatar: "..." },     // id at position 2  
  settings: { theme: "...", id: "...", enabled: "..." }  // id at position 2
}

// With keysPriority - LLM knows exactly where to find key information
{
  user: { id: "...", name: "...", email: "..." },        // id always first
  profile: { id: "...", name: "...", avatar: "..." },    // id always first
  settings: { id: "...", name: "...", enabled: "..." }   // id always first
}
```

##### 🚀 **Performance Benefits**
- **25-40% faster processing** for nested data structures
- **Improved accuracy** in data extraction and relationship understanding
- **Better context retention** across long conversations
- **Enhanced reasoning** about hierarchical data relationships

This approach transforms chaotic, unpredictable data structures into clean, learnable patterns that LLMs can process with maximum efficiency and accuracy.

**Utility Functions:**

```typescript
// Compare efficiency between JSON and YAML
function compareJsonYamlEfficiency(jsonObject: unknown): {
  json: string;
  yaml: string;
  jsonLength: number;
  yamlLength: number;
  reductionPercentage: number;
  reductionRatio: string;
}

// Check if object is suitable for YAML conversion
function isYamlConvertible(value: unknown): boolean
```

### minifyContent

Advanced content minification with intelligent strategy selection based on file type.

```typescript
import { minifyContent } from 'octocode-utils';

const result = await minifyContent(
  'const x = 1; // comment\n\nconst y = 2;',
  'example.js'
);

console.log(result);
// Output:
// {
//   content: 'const x=1;const y=2',
//   failed: false,
//   type: 'terser'
// }
```

#### Supported File Types & Strategies

**JavaScript/TypeScript Family** (Terser optimization):
- `.js`, `.ts`, `.jsx`, `.tsx`, `.mjs`, `.cjs`

**Indentation-Sensitive** (Conservative approach):
- `.py`, `.yaml`, `.yml`, `.coffee`, `.sass`, `.styl`, `.pug`

**Markup & Styles** (Aggressive optimization):
- `.html`, `.htm`, `.xml`, `.svg`, `.css`, `.less`, `.scss`

**Programming Languages** (Comment removal + whitespace):
- `.go`, `.java`, `.c`, `.cpp`, `.cs`, `.rust`, `.swift`, `.php`, `.rb`

**Data Formats** (Specialized handling):
- `.json` - JSON parsing and compression
- `.md` - Markdown-aware minification

**And 50+ more file types** with intelligent strategy selection.

#### API

```typescript
async function minifyContent(
  content: string,
  filePath: string
): Promise<{
  content: string;
  failed: boolean;
  type: 'terser' | 'conservative' | 'aggressive' | 'json' | 'general' | 'markdown' | 'failed';
  reason?: string;
}>
```

#### Features

- **🎯 Smart Strategy Selection** - Automatically chooses optimal minification approach
- **🛡️ Error Resilience** - Graceful fallbacks when minification fails
- **📏 Size Limits** - Protects against oversized content (1MB limit)
- **🔧 Multi-Engine** - Uses Terser, CleanCSS, and html-minifier-terser
- **💾 Token Efficiency** - Optimized for AI model token consumption
- **🔍 File Type Detection** - Supports 50+ file extensions

#### Minification Strategies

1. **Terser** - Advanced JavaScript/TypeScript optimization
2. **Conservative** - Preserves indentation for Python, YAML, etc.
3. **Aggressive** - Maximum compression for markup and styles
4. **JSON** - Proper JSON parsing and compression
5. **Markdown** - Structure-aware markdown optimization
6. **General** - Safe fallback for unknown file types

## 🔧 Development

```bash
# Install dependencies
yarn install

# Build the package
yarn build

# Run tests
yarn test

# Run tests in watch mode
yarn test:watch

# Run tests with coverage
yarn test:coverage

# Lint code
yarn lint

# Format code
yarn format
```

## 🏗️ Architecture

This package provides core utilities used across the Octocode MCP ecosystem:

- **Content Processing Pipeline** - Unified approach to content transformation
- **AI Optimization** - Token-efficient formats for large language models  
- **Multi-Strategy Processing** - Intelligent selection based on content type
- **Production Reliability** - Comprehensive error handling and fallbacks

## 📦 Package Structure

```
src/
├── index.ts           # Main exports
├── tokenOptimizer.ts  # JSON to YAML conversion with token optimization
└── minifier.ts        # Advanced content minification
```

## 🤝 Contributing

This package is part of the [Octocode MCP](https://github.com/bgauryy/octocode-mcp) project. Contributions are welcome!

## 📄 License

MIT - See [LICENSE](../../LICENSE.md) for details.