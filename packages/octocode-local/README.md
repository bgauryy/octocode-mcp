# octocode-mcp-local

> Fast local codebase search using ripgrep, find, and ls, leveraging research flow  

<p align="center">
  <img src="https://raw.githubusercontent.com/bgauryy/local-explorer-mcp/main/assets/logo.png" alt="octocode-mcp-local" width="150" />
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

### Getting Started

First, install the Octocode Local MCP server with your client.

**Standard config** works in most of the tools:

```js
{
  "mcpServers": {
    "octocode-local": {
      "command": "npx",
      "args": [
        "octocode-mcp-local"
      ]
    }
  }
}
```

<details>
<summary>Amp</summary>

Add via the Amp VS Code extension settings screen or by updating your settings.json file:

```json
"amp.mcpServers": {
  "octocode-local": {
    "command": "npx",
    "args": [
      "octocode-mcp-local"
    ]
  }
}
```

**Amp CLI Setup:**

Add via the `amp mcp add` command below:

```bash
amp mcp add octocode-local -- npx octocode-mcp-local
```

</details>

<details>
<summary>Claude Code</summary>

Use the Claude Code CLI to add the Octocode Local MCP server:

```bash
claude mcp add octocode-local npx octocode-mcp-local
```

</details>

<details>
<summary>Claude Desktop</summary>

Follow the MCP install [guide](https://modelcontextprotocol.io/quickstart/user), use the standard config above.

Edit `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "octocode-local": {
      "command": "npx",
      "args": ["octocode-mcp-local"]
    }
  }
}
```

</details>

<details>
<summary>Codex</summary>

Use the Codex CLI to add the Octocode Local MCP server:

```bash
codex mcp add octocode-local npx "octocode-mcp-local"
```

Alternatively, create or edit the configuration file `~/.codex/config.toml` and add:

```toml
[mcp_servers.octocode-local]
command = "npx"
args = ["octocode-mcp-local"]
```

For more information, see the [Codex MCP documentation](https://github.com/openai/codex/blob/main/codex-rs/config.md#mcp_servers).

</details>

<details>
<summary>Cursor</summary>

Go to `Cursor Settings` -> `MCP` -> `Add new MCP Server`. Name to your liking, use `command` type with the command `npx octocode-mcp-local`. You can also verify config or add command like arguments via clicking `Edit`.

#### Project-Specific Configuration

Create `.cursor/mcp.json` in your project root:

```json
{
  "mcpServers": {
    "octocode-local": {
      "command": "npx",
      "args": ["octocode-mcp-local"]
    }
  }
}
```

</details>

<details>
<summary>Cline</summary>

Add via the Cline VS Code extension settings or by updating your `cline_mcp_settings.json` file:

```json
{
  "mcpServers": {
    "octocode-local": {
      "command": "npx",
      "args": [
        "octocode-mcp-local"
      ]
    }
  }
}
```

</details>

<details>
<summary>Gemini CLI</summary>

Follow the MCP install [guide](https://github.com/google-gemini/gemini-cli/blob/main/docs/tools/mcp-server.md#configure-the-mcp-server-in-settingsjson), use the standard config above.

</details>

<details>
<summary>Goose</summary>

Go to `Advanced settings` -> `Extensions` -> `Add custom extension`. Name to your liking, use type `STDIO`, and set the `command` to `npx octocode-mcp-local`. Click "Add Extension".

</details>

<details>
<summary>Kiro</summary>

Follow the MCP Servers [documentation](https://kiro.dev/docs/mcp/). For example in `.kiro/settings/mcp.json`:

```json
{
  "mcpServers": {
    "octocode-local": {
      "command": "npx",
      "args": [
        "octocode-mcp-local"
      ]
    }
  }
}
```

</details>

<details>
<summary>LM Studio</summary>

Go to `Program` in the right sidebar -> `Install` -> `Edit mcp.json`. Use the standard config above.

</details>

<details>
<summary>opencode</summary>

Follow the MCP Servers [documentation](https://opencode.ai/docs/mcp-servers/). For example in `~/.config/opencode/opencode.json`:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "octocode-local": {
      "type": "local",
      "command": [
        "npx",
        "octocode-mcp-local"
      ],
      "enabled": true
    }
  }
}
```

</details>

<details>
<summary>Qodo Gen</summary>

Open [Qodo Gen](https://docs.qodo.ai/qodo-documentation/qodo-gen) chat panel in VSCode or IntelliJ → Connect more tools → + Add new MCP → Paste the standard config above.

Click <code>Save</code>.

</details>

<details>
<summary>VS Code</summary>

Follow the MCP install [guide](https://code.visualstudio.com/docs/copilot/chat/mcp-servers#_add-an-mcp-server), use the standard config above. You can also install the Octocode Local MCP server using the VS Code CLI:

```bash
# For VS Code
code --add-mcp '{"name":"octocode-local","command":"npx","args":["octocode-mcp-local"]}'
```

After installation, the Octocode Local MCP server will be available for use with your GitHub Copilot agent in VS Code.

</details>

<details>
<summary>Warp</summary>

Go to `Settings` -> `AI` -> `Manage MCP Servers` -> `+ Add` to [add an MCP Server](https://docs.warp.dev/knowledge-and-collaboration/mcp#adding-an-mcp-server). Use the standard config above.

Alternatively, use the slash command `/add-mcp` in the Warp prompt and paste the standard config from above:

```js
{
  "mcpServers": {
    "octocode-local": {
      "command": "npx",
      "args": [
        "octocode-mcp-local"
      ]
    }
  }
}
```

</details>

<details>
<summary>Windsurf</summary>

Follow Windsurf MCP [documentation](https://docs.windsurf.com/windsurf/cascade/mcp). Use the standard config above.

</details>

<details>
<summary>Zed</summary>

Follow the MCP Servers [documentation](https://zed.dev/docs/assistant/model-context-protocol). Use the standard config above.

</details>

---

### Environment Variables

- **WORKSPACE_ROOT** (required): Project root directory. Defaults to current working directory.
- **DEBUG** (optional): Set to "true" for detailed logging

---

### Verify Installation

After installation, verify Octocode Local is working:

1. **Restart your MCP client** completely
2. **Check connection status**:
   - **Cursor**: Look for green dot in Settings → Tools & Integrations → MCP Tools
   - **Claude Desktop**: Check for "octocode-local" in available tools
   - **VS Code**: Verify in GitHub Copilot settings
3. **Test with a simple query**:
   ```
   Show me the directory structure of this project
   ```

If you see Octocode Local tools being used, you're all set! 🎉

---

## Commands

### `/local_explorer` - Local Codebase Research Agent

Expert local code research prompt that orchestrates all four MCP tools for comprehensive codebase analysis. Uses a ReAct workflow (READ → THINK → PLAN → INITIATE → VERIFY) with hints-driven navigation and token efficiency.

**When to use**:
- **Understanding unfamiliar codebases**: Explore structure, find entry points, trace code flows
- **Deep code investigation**: Search patterns, follow imports, map dependencies
- **Bug hunting**: Find recent changes, trace error paths, identify root causes
- **Refactoring preparation**: Locate all usages, understand impact, verify safety
- **Feature mapping**: Trace implementation across files, build dependency graphs

**Usage Examples**:
```
/local_explorer How is authentication implemented in this project?
/local_explorer Find all API endpoints and their handlers
/local_explorer Check from my node_modules for implementaion details for my imported dependency
/local_explorer Trace the data flow from user input to database
```

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

**Issues:** [GitHub Issues](https://github.com/bgauryy/octocode-mcp/issues)

---

## License

MIT License - see [LICENSE.md](LICENSE.md)

---

**npm:** [octocode-mcp-local](https://www.npmjs.com/package/octocode-mcp-local)
