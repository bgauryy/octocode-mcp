# octocode-local-files

> **Fast, Smart, Efficient Local File System Research for AI Agents**

An MCP (Model Context Protocol) server that empowers AI assistants with intelligent local file system exploration capabilities. Built with token efficiency, security, and agent-optimized workflows in mind.

---

## ⚠️ DISCLAIMER

**This MCP server is provided for research, development, and educational purposes only.**

**USE AT YOUR OWN RISK.** By using this software, you acknowledge and agree that:

- **No Warranty**: This software is provided "AS IS" without warranty of any kind, either express or implied, including but not limited to warranties of merchantability, fitness for a particular purpose, or non-infringement.
- **User Responsibility**: You are solely responsible for ensuring you have proper authorization before accessing, reading, or analyzing any files, directories, or systems.
- **Legal Compliance**: You agree to comply with all applicable local, state, national, and international laws and regulations when using this tool.
- **Liability**: The authors and contributors shall not be held liable for any damages, losses, or legal issues arising from the use or misuse of this software.
- **Security**: While security measures are implemented, users must evaluate and ensure the tool meets their specific security requirements before use.
- **Authorization Required**: Only use this tool on systems and files you own or have explicit permission to access.
- **Copyright & License**: Copyright © 2025 Octocode Team. This software is licensed under the MIT License (see [LICENSE.md](./LICENSE.md)). All copies or substantial portions must include the copyright notice and license terms.

**IF YOU DO NOT AGREE TO THESE TERMS, DO NOT USE THIS SOFTWARE.**

---

##  Why This MCP Server?

AI agents need to understand codebases quickly and efficiently. Traditional file reading approaches waste tokens and time. **octocode-local-files** solves this by providing:

### **🚀 Structure-First Discovery**
Understand the layout before diving into content. Start broad, then refine based on what you find.

### **⚡ Token-Optimized Content Access**
- **Smart Minification**: Automatic content compression for JS/TS, JSON, CSS, HTML, Markdown, Python, and more
- **Partial Fetching**: Read only the lines you need, not entire files
- **Pattern-Based Extraction**: Find specific code sections with context lines
- **Bulk Operations**: Process 5-10 queries in parallel (5-10x faster than sequential)

### ** Semantic Search Without Embeddings**
Fast grep-based pattern matching with regex support. Find functions, classes, imports, or any text pattern across your codebase in milliseconds.

### **🔒 Security-First Design**
- Command injection prevention (whitelisted commands only)
- Path traversal protection (sandboxed to allowed directories)
- Automatic filtering of sensitive files (.env, credentials, keys)
- Resource limits (timeouts, output size caps)

---

## 📦 Installation

```bash
npm install octocode-local-files
```

Or with yarn:

```bash
yarn add octocode-local-files
```

---

## 🔧 Configuration

### Claude Desktop

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "local-files": {
      "command": "npx",
      "args": ["octocode-local-files"],
      "env": {
        "WORKSPACE_ROOT": "/path/to/your/project"
      }
    }
  }
}
```

### Other MCP Clients

Use the standard MCP connection method:

```bash
npx octocode-local-files
```

Set `WORKSPACE_ROOT` environment variable to restrict access to specific directories.

---

## 🛠️ Tools Overview

### 1. **`local_view_structure`** - Directory Exploration
**Purpose**: Understand codebase organization, file types, and structure before reading content.

**Why Use It**: 
- Get the lay of the land quickly
- Identify entry points and important directories  
- See file sizes, modification times, and types
- Sort and filter to find what matters

**Key Features**:
- Recursive depth control (1-5 levels)
- Sort by: name, size, time, extension
- Filter by: file type, extension, pattern
- Human-readable sizes, hidden file support
- Summary statistics (total files, directories, size)

**Example - Explore Project Structure**:
```json
{
  "queries": [
    {
      "path": "./src",
      "details": true,
      "humanReadable": true,
      "sortBy": "time",
      "depth": 2,
      "summary": true,
      "researchGoal": "Understand src directory organization and recent changes"
    },
    {
      "path": "./tests",
      "filesOnly": true,
      "extensions": ["test.ts", "spec.ts"],
      "researchGoal": "Find all test files"
    }
  ]
}
```

**Workflow**: Start here → Understand structure → Then search content

---

### 2. **`local_search_content`** - Pattern Search
**Purpose**: Find code, text, or patterns across files without reading everything.

**Why Use It**:
- Locate function definitions, class usage, imports
- Find TODO comments, error messages, configuration values
- Search with regex for complex patterns
- Get context lines around matches for understanding

**Key Features**:
- Extended regex support (grep -E)
- Perl-compatible regex (grep -P)
- Fixed string search (3x faster for literals)
- Context lines (before/after matches)
- Smart case-insensitive matching
- File type filtering (include/exclude patterns)
- Whole word matching

**Example - Find Function Usage**:
```json
{
  "queries": [
    {
      "pattern": "function\\s+processData",
      "path": "./src",
      "regex": true,
      "include": ["*.ts", "*.js"],
      "contextLines": 5,
      "lineNumbers": true,
      "researchGoal": "Find processData function definitions with surrounding context"
    },
    {
      "pattern": "import.*from.*processData",
      "path": "./src",
      "regex": true,
      "filesOnly": true,
      "researchGoal": "List all files that import processData"
    }
  ]
}
```

**Performance Tips**:
- Use `fixedString: true` for literal text (faster than regex)
- Set `include` patterns to narrow search scope
- Use `filesOnly: true` first to identify files, then search deeper
- Exclude build artifacts: `excludeDir: ["node_modules", "dist", ".git"]`

---

### 3. **`local_find_files`** - Advanced File Discovery
**Purpose**: Locate files by name, type, size, time, or permissions with powerful filtering.

**Why Use It**:
- Find files by name patterns (wildcards, regex)
- Filter by modification time ("last 7 days")
- Find large files or empty files
- Search by permissions or executability
- Combine multiple criteria for precision

**Key Features**:
- Name pattern matching (case-sensitive or insensitive)
- Multiple patterns with OR logic
- Time-based filters (modified, accessed)
- Size-based filters (greater/less than)
- Type filters (file, directory, symlink)
- Permission checks (executable, readable, writable)
- Content pattern filtering (combines find + grep)

**Example - Find Recent Large Files**:
```json
{
  "queries": [
    {
      "path": "./src",
      "type": "f",
      "sizeGreater": "1M",
      "modifiedWithin": "7d",
      "details": true,
      "maxDepth": 5,
      "researchGoal": "Find large files modified in the last week"
    },
    {
      "path": "./",
      "names": ["*.config.js", "*.config.ts"],
      "type": "f",
      "researchGoal": "Find all config files"
    },
    {
      "path": "./scripts",
      "type": "f",
      "executable": true,
      "researchGoal": "Find executable scripts"
    }
  ]
}
```

**Advanced Filtering**:
```json
{
  "path": "./src",
  "regex": ".*\\.(ts|tsx)$",
  "regexType": "posix-egrep",
  "containsPattern": "export default",
  "modifiedWithin": "30d",
  "details": true,
  "researchGoal": "Find TypeScript files with default exports modified in last 30 days"
}
```

---

### 4. **`local_fetch_content`** - Smart Content Fetching
**Purpose**: Read file content with maximum token efficiency through partial reads and minification.

**Why Use It**:
- **Token Optimization**: Get only what you need, minified by default
- **Partial Reads**: Read specific line ranges instead of entire files
- **Pattern Extraction**: Find and extract sections matching a pattern
- **Minification**: Automatic compression removes comments, extra whitespace

**Key Features**:
- **3 Fetch Modes**:
  1. **Full Content**: `fullContent: true` (use sparingly)
  2. **Line Range**: `startLine: 10, endLine: 50` (precise extraction)
  3. **Pattern Match**: `matchString: "function", matchStringContextLines: 10` (most efficient)
- Automatic minification (optional, enabled by default)
- File type-aware compression (JS/TS, JSON, CSS, HTML, Markdown, Python, etc.)
- Partial read indicators show what was extracted

**Example - Efficient Content Fetching**:
```json
{
  "queries": [
    {
      "path": "./src/index.ts",
      "matchString": "export default",
      "matchStringContextLines": 10,
      "minified": true,
      "researchGoal": "Find main export with surrounding context"
    },
    {
      "path": "./src/config.ts",
      "startLine": 1,
      "endLine": 50,
      "minified": true,
      "researchGoal": "Read config file header"
    },
    {
      "path": "./src/utils/helpers.ts",
      "matchString": "export function",
      "matchStringContextLines": 15,
      "researchGoal": "Extract all exported helper functions"
    }
  ]
}
```

**Minification Savings**:
- JavaScript/TypeScript: 30-50% reduction (removes comments, extra spaces)
- JSON: 40-60% reduction (compact formatting)
- CSS: 35-55% reduction (removes comments, whitespace)
- HTML: 25-45% reduction (removes whitespace between tags)
- Markdown: 15-25% reduction (removes excessive blank lines)

**Best Practices**:
1. **After Search**: Use `local_search_content` first to get line numbers, then fetch specific ranges
2. **After Find**: Use `local_find_files` to discover files, then fetch content
3. **After Structure**: Use `local_view_structure` to understand layout, then fetch key files
4. **Pattern Mode**: Most efficient for finding specific code sections
5. **Line Range**: When you know exact locations from previous searches
6. **Full Content**: Only for small files (<200 lines) or when entire file is needed

---

## 🚀 Optimal Workflows

### **Workflow 1: Understand New Codebase**
```
1. local_view_structure (./src, depth=2)
   → Understand project organization
   
2. local_view_structure (./src/main-dir, details=true, sortBy="size")
   → Identify largest/most important files
   
3. local_fetch_content (key files, matchString="export")
   → Read entry points and main exports
   
4. local_search_content (pattern="import.*MainClass")
   → Find usage patterns
```

### **Workflow 2: Find and Understand Function**
```
1. local_search_content (pattern="function getUserData", filesOnly=true)
   → List files containing the function
   
2. local_fetch_content (file from step 1, matchString="getUserData", context=15)
   → Extract function with surrounding context
   
3. local_search_content (pattern="getUserData\\(", regex=true)
   → Find all call sites
```

### **Workflow 3: Track Down Bug**
```
1. local_search_content (pattern="ERROR|error|Error", include=["*.log"])
   → Find error occurrences in logs
   
2. local_find_files (containsPattern="throw new Error", modifiedWithin="7d")
   → Find files with error throwing recently modified
   
3. local_fetch_content (files from step 2, matchString="throw", context=10)
   → Read error handling code with context
```

### **Workflow 4: Refactor Preparation**
```
1. local_find_files (names=["*.ts", "*.tsx"], modifiedWithin="30d")
   → Find recently changed TypeScript files
   
2. local_search_content (pattern="oldFunction", contextLines=3)
   → Find all usages with context
   
3. local_fetch_content (each file, line ranges from search results)
   → Read specific sections for refactoring
```

---

##  Bulk Operations: 5-10x Faster

**All tools support 1-10 queries per call**. Process multiple searches in parallel instead of sequential calls.

### **Why Bulk Operations Matter**

**Traditional Approach** (Sequential):
```
Call 1: Search for pattern A → Wait → Response
Call 2: Search for pattern B → Wait → Response  
Call 3: Search for pattern C → Wait → Response
Total: 3 round trips, 30+ seconds
```

**Bulk Approach** (Parallel):
```
Call 1: Search for patterns A, B, C → Wait → All responses
Total: 1 round trip, 5-8 seconds
```

### **Benefits**:
- **5-10x faster execution** for multi-step research
- **Complete context** for LLM (all results together for cross-referencing)
- **Better reasoning** (compare, validate, identify patterns across results)
- **Reduced latency** (single network round trip)

### **Example - Comprehensive Analysis**:
```json
{
  "queries": [
    {
      "path": "./src",
      "pattern": "async function",
      "regex": true,
      "count": true,
      "researchGoal": "Count async functions"
    },
    {
      "path": "./src",
      "pattern": "await",
      "count": true,
      "researchGoal": "Count await usage"
    },
    {
      "path": "./src",
      "pattern": "Promise\\.",
      "regex": true,
      "contextLines": 2,
      "researchGoal": "Find Promise patterns"
    },
    {
      "path": "./src",
      "pattern": "catch\\s*\\(",
      "regex": true,
      "filesOnly": true,
      "researchGoal": "List files with error handling"
    }
  ]
}
```

All results returned together, enabling the LLM to analyze async patterns holistically.

---

## 🔒 Security Features

### **Command Injection Prevention**
- **Whitelisted commands only**: `grep`, `ls`, `find`, `wc`, `file`, `stat`
- **Argument validation**: No shell metacharacters allowed
- **No shell interpretation**: Uses `spawn()` with argument arrays, not shell strings

### **Path Traversal Protection**
- **Sandboxed to workspace root**: Paths validated against allowed directories
- **Symlink resolution**: Checks if symlink targets are within allowed paths
- **Automatic filtering**: Blocks access to sensitive patterns

### **Automatic Exclusions**
Files and directories automatically ignored:
- **Secrets**: `.env`, `.env.*`, credentials, keys, certificates
- **Dependencies**: `node_modules`, `vendor`, `__pycache__`
- **Build artifacts**: `dist`, `build`, `coverage`, `.next`
- **Version control**: `.git`, `.svn`, `.hg`
- **IDE files**: `.vscode`, `.idea`, `.DS_Store`

### **Resource Limits**
- **30-second timeout** per command
- **10MB max output** per operation
- **Result count limits** to prevent overwhelming responses

---

## 📊 Response Format

All tools return structured responses with:

- **`status`**: `hasResults` | `empty` | `error`
- **`data`**: Tool-specific results (matches, files, entries, content)
- **`researchGoal`**: Your stated research objective
- **`reasoning`**: Your reasoning for the query
- **`hints`**: Contextual suggestions for next steps

### **Bulk Response Structure**:
```yaml
instructions: "Bulk response from local_search_content with 3 queries: 2 with results, 1 empty"
results:
  - query: { pattern: "TODO", path: "./src" }
    status: hasResults
    data:
      matches: [...]
      totalMatches: 15
    researchGoal: "Find all TODO comments"
  - query: { pattern: "FIXME", path: "./src" }
    status: hasResults
    data:
      matches: [...]
      totalMatches: 8
  - query: { pattern: "DEPRECATED", path: "./src" }
    status: empty
    data:
      error: "No matches found"
summary:
  total: 3
  hasResults: 2
  empty: 1
  errors: 0
hasResultsStatusHints:
  - "Add contextLines=3-5 for code understanding"
  - "Use filesOnly=true to identify files first"
emptyStatusHints:
  - "Try caseInsensitive=true for flexible matching"
  - "Remove include filters if too restrictive"
```

---

## 🎓 Best Practices for AI Agents

### **1. Structure Before Content**
Always start with `local_view_structure` to understand the layout before reading files.

### **2. Search Before Reading**
Use `local_search_content` to find relevant files, then `local_fetch_content` to read them.

### **3. Bulk Everything**
Combine related queries into bulk operations for 5-10x speed improvement.

### **4. Token Optimization**
- Use `minified: true` (default) for content fetching
- Use `matchString` mode for targeted extraction
- Use `filesOnly: true` for initial searches
- Request only the line ranges you need

### **5. Progressive Refinement**
Start broad → analyze results → refine with filters → get specific content

### **6. Context Management**
- Use `contextLines: 3-5` for code understanding
- Use `matchStringContextLines: 10-15` for function extraction
- Balance context vs. token usage

### **7. Leverage Hints**
Pay attention to `hasResultsStatusHints`, `emptyStatusHints`, and `errorStatusHints` for query refinement suggestions.

---

## 🛠️ Development

### Build
```bash
yarn build              # Full build with linting
yarn build:dev          # Quick build without linting
yarn build:watch        # Watch mode for development
```

### Testing
```bash
yarn test               # Run all tests
yarn test:watch         # Watch mode
yarn test:coverage      # Coverage report
yarn test:ui            # Visual test interface
```

### Linting & Formatting
```bash
yarn lint               # Check for linting errors
yarn lint:fix           # Auto-fix linting issues
yarn format             # Format code with Prettier
```

### Debugging
```bash
yarn debug              # Debug with MCP inspector
```

---

## 🔗 Related Projects

- **[octocode-mcp](../octocode-mcp)** - GitHub repository research MCP server (inspiration for this project)
- **[octocode-local-memory](../octocode-local-memory)** - Agent coordination and state management
- **[octocode-utils](../octocode-utils)** - Shared utilities for YAML formatting and response handling

---

## 📝 Architecture Highlights

Built following proven patterns from `octocode-mcp`:

- **Command Builders**: Safe, composable command construction (`BaseCommandBuilder`, `GrepCommandBuilder`, `FindCommandBuilder`, `LsCommandBuilder`)
- **Security Layers**: Multi-level validation (command, path, content filtering)
- **Bulk Operations**: Parallel query processing with error isolation
- **Research Context**: `researchGoal` and `reasoning` fields optimize LLM query planning
- **Hints System**: Context-aware suggestions guide progressive refinement
- **Token Efficiency**: Smart minification, partial reads, structured responses

---

## 📄 License

MIT © Octocode Team

---

## 🤝 Contributing

Contributions welcome! Please follow the established patterns and ensure:
- All commands go through security validation
- Tests cover new functionality
- Code follows existing architectural patterns
- Documentation is updated

---

## 💡 Why "octocode-local-files"?

Part of the **Octocode** family of MCP servers designed to empower AI agents with efficient research capabilities:
- **Octocode-MCP**: GitHub repository research (remote codebases)
- **Octocode-Local-Files**: Local file system research (your workspace)
- **Octocode-Local-Memory**: Agent state and coordination (task management)

Together, they provide AI agents with comprehensive code research superpowers. 🐙

---

**Built with ❤️ by the Octocode Team**

*Giving AI agents the power to understand codebases efficiently, one local file at a time.*
