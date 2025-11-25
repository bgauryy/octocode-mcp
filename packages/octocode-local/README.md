# @octocode/local

> Fast local codebase search using ripgrep, find, and ls  
> **[BETA]** - Efficient AI-powered search using only local files, no indexing required

<p align="center">
  <img src="https://raw.githubusercontent.com/bgauryy/local-explorer-mcp/main/assets/logo.png" alt="@octocode/local" width="150" />
</p>

An MCP server that provides AI assistants with native Unix tools for local code exploration. Built on ripgrep for pattern search, find for file metadata queries, and ls for directory traversal. **No local or cloud indexing required** - direct filesystem access for efficient, real-time search.

Most AI tools use stateless queries that either load too much context or miss important connections. This server enables iterative research workflows: start with structure overview, search with context, extract specific content. Similar to how you'd manually explore an unfamiliar codebase.

**Features:**
- Fast pattern search via ripgrep's regex engine and multi-threaded execution
- File discovery using find's metadata filtering (modified time, size, permissions)
- Directory structure analysis with ls-based traversal
- Automated codebase documentation generation
- Workspace-scoped operations with sensitive file filtering

---

## Installation

### Prerequisites

- **Node.js** >= 18.0.0
- **ripgrep** (required for `local_ripgrep` tool):
  - ✅ **Already available** in Claude Code and Cursor
  - macOS: `brew install ripgrep`
  - Ubuntu/Debian: `apt-get install ripgrep`
  - Windows: `choco install ripgrep`
  - [Installation guide](https://github.com/BurntSushi/ripgrep#installation)

### Quick Install

<details>
<summary>Claude Code</summary>

```bash
claude mcp add octocode-local npx @octocode/local@latest
```

</details>

<details>
<summary>Claude Desktop</summary>

Edit `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "octocode-local": {
      "command": "npx",
      "args": ["@octocode/local@latest"]
    }
  }
}
```

</details>

<details>
<summary>Cursor</summary>

Manually edit your Cursor MCP settings and add:

```json
{
  "mcpServers": {
    "octocode-local": {
      "command": "npx",
      "args": ["@octocode/local@latest"]
    }
  }
}
```

</details>

### Environment Variables

- **WORKSPACE_ROOT** (required): Project root directory. Defaults to current working directory.
- **DEBUG** (optional): Set to "true" for detailed logging

---

## Built-in Research Prompts

Codebase analysis workflows using coordinated tool execution:

| Prompt | What It Does | Output |
|--------|--------------|--------|
| **`local_explorer`** | Interactive workflow: structure discovery → context search → targeted extraction → verification | Iterative codebase exploration |

---

## Core Tools

Each tool wraps a Unix command with pagination and token optimization:

| Tool | Unix Command | What It Does | Use Case |
|------|--------------|--------------|----------|
| **`local_ripgrep`** | `ripgrep` (rg) | Pattern search with regex, context lines, and pagination | Find functions, classes, TODOs across codebase |
| **`local_view_structure`** | `ls` recursive | Directory tree with file sizes and filtering | Understand project layout and entry points |
| **`local_find_files`** | `find` | File discovery by metadata (time, size, permissions) | Locate recent changes or specific file types |
| **`local_fetch_content`** | File I/O | Read files or extract sections by pattern | Get specific functions without full file load |

---

## Common Workflows

Tool combinations for typical codebase research tasks:

**Explore new codebase:**
- `local_view_structure` → view directory layout
- `local_ripgrep` → find entry points (main, index, etc.)
- `local_fetch_content` → read key files

**Debug library error:**
- `local_ripgrep` in node_modules → search error text
- `local_find_files` → locate source file
- `local_fetch_content` → read implementation

**Refactor function:**
- `local_ripgrep` → find all usages with regex
- Check each call site
- Verify safe to modify

**Investigate recent bug:**
- `local_find_files` → files modified last 7 days
- `local_ripgrep` → search for patterns
- `local_fetch_content` → extract changes

**Find performance issues:**
- `local_find_files` → sort by size
- `local_ripgrep` → search TODOs/FIXMEs
- Identify bottlenecks

**Map feature implementation:**
- `local_ripgrep` → find feature references
- Build file dependency list
- `local_fetch_content` → read each step

---

## Security

**Path protection:**
- All operations scoped to workspace directory
- Path traversal attacks prevented
- Symlink validation

**Auto-filtered files:**
- Secrets: `.env`, `*.pem`, `*.key`
- Dependencies: `node_modules/`
- Build artifacts: `dist/`, `build/`
- Version control: `.git/`

**Execution Control:**
- **Checks only on running path:** Operations are strictly scoped to the workspace root
- **Can't reach other parts:** Complete isolation from the rest of the filesystem
- **Limited commands:** Only specific, safe binaries (`rg`, `find`, `ls`) are allowed

---

## Performance

**Unix tool efficiency:**
- Ripgrep: multi-threaded regex engine with parallel search
- Find: efficient filesystem traversal
- Ls: optimized directory reads

**Token optimization:**
- Progressive discovery (overview → search → extract)
- Automatic pagination for large results
- Content minification enabled by default
- Pattern matching instead of full file reads

---

## Troubleshooting

**ripgrep not found:**
```bash
brew install ripgrep              # macOS
apt-get install ripgrep           # Ubuntu/Debian
choco install ripgrep             # Windows
```

**Permission denied:** Check `WORKSPACE_ROOT` permissions

**Server not starting:**
- Verify Node.js >= 18.0.0
- Check MCP config syntax

**Issues:** [GitHub Issues](https://github.com/bgauryy/local-explorer-mcp/issues)

---

## License

MIT License - see [LICENSE.md](LICENSE.md)

---

**npm:** [@octocode/local](https://www.npmjs.com/package/@octocode/local)
