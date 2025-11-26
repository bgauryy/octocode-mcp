# octocode-utils Architecture

Shared utilities for Octocode MCP packages, focused on AI/LLM token efficiency.

## Package Overview

| Property | Value |
|----------|-------|
| **Version** | 5.0.0 |
| **Purpose** | Content transformation utilities for optimal AI consumption |
| **Node** | >=20.0.0 |
| **Format** | ESM + CJS dual export |

## Directory Structure

```
octocode-utils/
├── src/
│   ├── index.ts              # Public API exports
│   ├── jsonToYamlString.ts   # JSON→YAML conversion (2.5KB)
│   └── minifier.ts           # Multi-strategy minification (21KB)
├── tests/
│   ├── jsonToYamlString.config.test.ts   # Config options testing
│   ├── jsonToYamlString.output.test.ts   # Token efficiency validation
│   └── minifier.test.ts                  # Strategy & error handling
├── dist/                     # Build output (CJS + ESM + types)
└── package.json
```

## Public API

```typescript
// Main exports
export { jsonToYamlString, YamlConversionConfig } from './jsonToYamlString';
export { minifyContent } from './minifier';
```

---

## Utility #1: jsonToYamlString

### Purpose

Converts JSON to YAML format optimized for **AI/LLM token efficiency** (20-40% token reduction compared to JSON).

### API

```typescript
function jsonToYamlString(
  jsonObject: unknown,
  config?: YamlConversionConfig
): string

interface YamlConversionConfig {
  sortKeys?: boolean;         // Alphabetical sorting
  keysPriority?: string[];    // Priority keys appear first (recursive)
}
```

### Implementation Details

Uses `js-yaml` library with optimized settings:

| Option | Value | Purpose |
|--------|-------|---------|
| `forceQuotes` | `true` | Consistent string quoting |
| `quotingType` | `"` | Double quotes for JSON-like syntax |
| `lineWidth` | `-1` | No line wrapping |
| `noRefs` | `true` | No YAML references |
| `indent` | `2` | 2-space indentation |

### Key Sorting Logic

1. **No config** → Preserves original key order
2. **`sortKeys: true`** → Alphabetical via `localeCompare`
3. **`keysPriority: [...]`** → Priority keys first, then alphabetical

**Important**: Priority sorting is **recursive** - applies to all nested objects at every level.

### Error Handling

```
YAML conversion fails
  └→ Fallback to JSON.stringify(obj, null, 2)
      └→ If that fails, return commented error message
```

---

## Utility #2: minifyContent

### Purpose

Multi-strategy content minification for **50+ file types**, optimized for token reduction while preserving semantic meaning.

### API

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

### Strategy Selection

Strategy is selected based on file extension via `MINIFY_CONFIG.fileTypes`:

| Strategy | File Types | Method |
|----------|------------|--------|
| **terser** | `.js`, `.ts`, `.jsx`, `.tsx`, `.mjs`, `.cjs` | AST-based minification via Terser |
| **aggressive** | `.html`, `.css`, `.go`, `.java`, `.rust`, `.swift`, `.kotlin`, etc. | Library-based (CleanCSS/html-minifier) + regex fallback |
| **conservative** | `.py`, `.yaml`, `.yml`, `.coffee`, `.sass`, `.pug` | Remove comments, preserve indentation |
| **json** | `.json` | `JSON.parse` → `JSON.stringify` (compact) |
| **markdown** | `.md`, `.markdown` | Remove HTML comments, normalize spacing |
| **general** | `.txt`, `.log`, unknown extensions | Basic whitespace normalization |

### Comment Pattern Groups

The minifier recognizes different comment syntaxes grouped by language family:

| Group | Pattern Examples | Languages |
|-------|------------------|-----------|
| `c-style` | `/* */`, `//` | JS, Go, Java, C, Rust, Swift |
| `hash` | `#` | Python, Ruby, Shell, YAML |
| `html` | `<!-- -->` | HTML, XML, SVG |
| `sql` | `--`, `/* */` | SQL |
| `lua` | `--`, `--[[ ]]` | Lua |
| `template` | `{{!-- --}}`, `<%# %>`, `{# #}` | Handlebars, EJS, Jinja, Twig |
| `haskell` | `--`, `{- -}` | Haskell |

### Special File Handling

**Indentation-Sensitive Files** (use `conservative` strategy):
- `Makefile`, `Dockerfile`, `Procfile`, `Jenkinsfile`
- `Rakefile`, `Gemfile`, `Podfile`, `Vagrantfile`
- And other build/config files without extensions

### Safety Features

1. **Size Limit**: 1MB maximum (returns original with error if exceeded)
2. **Graceful Fallbacks**: Regex-based minification if library fails
3. **Never Throws**: Always returns content, even on failure
4. **Indentation Preservation**: Detects and protects sensitive files

### Helper Exports

```typescript
// Check if file uses Terser strategy
isJavaScriptFileV2(filePath: string): boolean

// Check if file is indentation-sensitive
isIndentationSensitiveV2(filePath: string): boolean

// Full configuration object
MINIFY_CONFIG: MinifyConfig
```

---

## Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| `terser` | ^5.19.0 | JavaScript/TypeScript AST minification |
| `clean-css` | ^5.3.0 | CSS minification |
| `html-minifier-terser` | ^7.2.0 | HTML minification |
| `js-yaml` | ^4.1.0 | YAML serialization |

### Dev Dependencies (Testing)

| Package | Purpose |
|---------|---------|
| `@microsoft/tiktokenizer` | Token counting for efficiency validation |
| `vitest` | Test framework |

---

## Design Principles

### 1. Token Efficiency First

Primary goal is reducing LLM token consumption:
- YAML format uses fewer tokens than JSON
- Comment removal reduces noise
- Whitespace normalization compacts output

### 2. Graceful Degradation

Every function returns usable content:
```
Primary method fails
  └→ Try fallback method
      └→ Return original content with error flag
```

### 3. File-Type Awareness

Strategy selection based on:
1. File extension (primary)
2. Filename patterns (Makefile, Dockerfile, etc.)
3. Sensible defaults for unknown types

### 4. Recursive Configuration

Key sorting in `jsonToYamlString` applies uniformly at all nesting levels, ensuring consistent structure throughout complex objects.

---

## Usage Patterns

### Basic JSON to YAML

```typescript
import { jsonToYamlString } from 'octocode-utils';

const data = { name: "John", age: 30, roles: ["admin"] };
const yaml = jsonToYamlString(data);
// name: "John"
// age: 30
// roles:
//   - "admin"
```

### Priority-Based Key Sorting

```typescript
const yaml = jsonToYamlString(data, {
  keysPriority: ["id", "name", "type"]
});
// id appears first, then name, then type, then alphabetical
```

### Content Minification

```typescript
import { minifyContent } from 'octocode-utils';

const result = await minifyContent(jsCode, 'app.ts');
if (!result.failed) {
  console.log(`Minified with ${result.type} strategy`);
  console.log(result.content);
}
```

---

## Test Coverage

| Test File | Lines | Focus |
|-----------|-------|-------|
| `minifier.test.ts` | ~422 | Strategy selection, comment removal, error handling |
| `jsonToYamlString.config.test.ts` | ~415 | Config options, key sorting, recursion |
| `jsonToYamlString.output.test.ts` | ~735 | Token efficiency validation |

Tests use `@microsoft/tiktokenizer` (`cl100k_base` encoder) to verify actual token savings.

---

## Integration Points

This package is consumed by:
- `octocode-mcp` - GitHub code research MCP server
- `octocode-local` - Local filesystem MCP server

Both use these utilities to optimize content before returning to LLM clients.

