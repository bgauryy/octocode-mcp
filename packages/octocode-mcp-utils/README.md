# @octocode/mcp-utils

**Shared utilities for Octocode MCP packages**

<div align="center">
  <img src="./assets/logo_builder.png.png" width="200px">
</div>

<div align="center">
  
  [![Version](https://img.shields.io/npm/v/@octocode/mcp-utils.svg)](https://www.npmjs.com/package/@octocode/mcp-utils)
  [![License](https://img.shields.io/badge/license-MIT-green.svg)](./package.json)
  [![X/Twitter](https://img.shields.io/badge/X-Follow%20@guy__bary-1DA1F2.svg?logo=x&logoColor=white)](https://x.com/guy_bary)
  [![Website](https://img.shields.io/badge/Website-octocode.ai-blue.svg?logo=web)](https://octocode.ai)
  
</div>

Essential utilities for building MCP (Model Context Protocol) applications with advanced content processing and AI optimization capabilities.

## Installation

```bash
npm install @octocode/mcp-utils
# or
yarn add @octocode/mcp-utils
```

## 🚀 Features

- **🧠 AI-Optimized Content Processing** - Transform any content for optimal AI consumption
- **⚡ Advanced Minification** - Multi-strategy content compression for 50+ file types
- **🔄 JSON-to-Natural Language** - Convert structured data to human-readable format
- **🛡️ Production Ready** - Comprehensive error handling and fallback mechanisms
- **📦 Zero Dependencies** - Lightweight with minimal external requirements

## 📚 Usage

### jsonToLLMString

Converts JSON data to natural language format optimized for LLM consumption.

```typescript
import { jsonToLLMString } from '@octocode/mcp-utils';

const data = {
  name: 'John',
  age: 30,
  active: true,
  roles: ['admin', 'user']
};

console.log(jsonToLLMString(data));
// Output:
// Name: John
// Age: 30
// Active: yes
// Roles: admin, user
```

#### Features

- **Clean Semantic Algorithm**: Removes JSON syntax (quotes, brackets, braces, commas)
- **Natural Hierarchy**: Creates simple indentation-based structure
- **Array Transformation**: Converts arrays into natural language patterns
- **Semantic Labels**: Uses meaningful labels (File:, Size:, Contents:, etc.)
- **Token Efficiency**: Optimized for LLM token consumption
- **Circular Reference Detection**: Prevents infinite recursion
- **Performance Optimized**: Handles large datasets efficiently

#### API

```typescript
function jsonToLLMString(
  data: unknown,
  indentation?: number,
  maxDepth?: number,
  visited?: Set<unknown> | null,
  parentKey?: string,
  maxLength?: number,
  maxArrayItems?: number
): string
```

Parameters:
- `data`: The JSON data to convert
- `indentation`: Current indentation level (default: 0)
- `maxDepth`: Maximum recursion depth (default: 10)
- `visited`: Set for circular reference detection (default: null)
- `parentKey`: Parent key for context-aware labeling (default: '')
- `maxLength`: Maximum string length before truncation (default: 1000)
- `maxArrayItems`: Maximum array items to display (default: 50)

### minifyContent

Advanced content minification with intelligent strategy selection based on file type.

```typescript
import { minifyContent } from '@octocode/mcp-utils';

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
├── jsonToLLMString.ts # JSON to natural language conversion
└── minifier.ts        # Advanced content minification
```

## 🤝 Contributing

This package is part of the [Octocode MCP](https://github.com/bgauryy/octocode-mcp) project. Contributions are welcome!

## 📄 License

MIT - See [LICENSE](../../LICENSE.md) for details.