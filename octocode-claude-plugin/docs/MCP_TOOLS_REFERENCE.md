# MCP Tools Reference

Quick reference for all tools available to agents.

---

## Claude Code Built-in Tools

**Documentation:** https://docs.anthropic.com/en/docs/build-with-claude/tool-use
**Product:** https://claude.ai/code

### File Operations
- `Read` - Read files from workspace
- `Write` - Create or overwrite files
- `Edit` - Make targeted edits to existing files
- `MultiEdit` - Edit multiple files at once

### Search & Navigation
- `Grep` - Search for text patterns in files
- `Glob` - Find files by name patterns
- `LS` - List directory contents

### Command Execution
- `Bash` - Execute shell commands
- `BashOutput` - Execute commands and capture output
- `KillShell` - Terminate running processes

### Web Access
- `WebFetch` - Fetch content from URLs
- `WebSearch` - Search the web

### Notebook Operations
- `NotebookRead` - Read Jupyter notebook cells
- `NotebookEdit` - Edit Jupyter notebook cells

### Task Management
- `TodoRead` - Read task lists
- `TodoWrite` - Create and update task lists (see detailed guide below)
- `Task` - Spawn child agents (Manager only, see detailed guide below)

### MCP Resources
- `ListMcpResourcesTool` - List available MCP resources
- `ReadMcpResourceTool` - Read MCP resource content

### Other
- `ExitPlanMode` - Exit planning mode (specific workflows)

---

## octocode-mcp (GitHub Research)

**Purpose:** Code research, pattern discovery, repository analysis

**URL:** https://github.com/bgauryy/octocode-mcp

- `mcp__octocode-mcp__githubSearchCode` - Search code across GitHub repositories
- `mcp__octocode-mcp__githubGetFileContent` - Get file contents from GitHub
- `mcp__octocode-mcp__githubSearchRepositories` - Search for repositories
- `mcp__octocode-mcp__githubSearchPullRequests` - Search pull requests
- `mcp__octocode-mcp__githubViewRepoStructure` - View repository file structure

---

## octocode-local-memory (Agent Coordination)

**Purpose:** Fast inter-agent communication and coordination

**URL:** https://github.com/bgauryy/octocode-mcp/tree/main/packages/octocode-local-memory

- `mcp__octocode-local-memory__setStorage` - Store data (tasks, locks, status)
- `mcp__octocode-local-memory__getStorage` - Retrieve data
- `mcp__octocode-local-memory__deleteStorage` - Delete data (release locks)

---

## chrome-devtools-mcp (Browser Testing)

**Purpose:** Automated browser testing and QA

**URL:** https://www.npmjs.com/package/chrome-devtools-mcp

### Navigation
- `mcp__chrome-devtools-mcp__navigate_page` - Navigate to URL
- `mcp__chrome-devtools-mcp__navigate_page_history` - Go back/forward
- `mcp__chrome-devtools-mcp__new_page` - Open new tab
- `mcp__chrome-devtools-mcp__close_page` - Close tab
- `mcp__chrome-devtools-mcp__select_page` - Switch to tab

### Interaction
- `mcp__chrome-devtools-mcp__click` - Click element
- `mcp__chrome-devtools-mcp__fill` - Fill input field
- `mcp__chrome-devtools-mcp__fill_form` - Fill multiple form fields
- `mcp__chrome-devtools-mcp__hover` - Hover over element
- `mcp__chrome-devtools-mcp__drag` - Drag and drop
- `mcp__chrome-devtools-mcp__upload_file` - Upload file
- `mcp__chrome-devtools-mcp__handle_dialog` - Handle alert/confirm dialogs
- `mcp__chrome-devtools-mcp__wait_for` - Wait for text to appear

### Inspection
- `mcp__chrome-devtools-mcp__take_screenshot` - Capture screenshot
- `mcp__chrome-devtools-mcp__take_snapshot` - Get page text snapshot
- `mcp__chrome-devtools-mcp__list_console_messages` - View console logs/errors
- `mcp__chrome-devtools-mcp__list_network_requests` - View network activity
- `mcp__chrome-devtools-mcp__get_network_request` - Get specific request details
- `mcp__chrome-devtools-mcp__list_pages` - List open tabs
- `mcp__chrome-devtools-mcp__evaluate_script` - Run JavaScript

### Performance
- `mcp__chrome-devtools-mcp__performance_start_trace` - Start performance recording
- `mcp__chrome-devtools-mcp__performance_stop_trace` - Stop performance recording
- `mcp__chrome-devtools-mcp__performance_analyze_insight` - Analyze performance data
- `mcp__chrome-devtools-mcp__resize_page` - Resize browser window
- `mcp__chrome-devtools-mcp__emulate_cpu` - Throttle CPU
- `mcp__chrome-devtools-mcp__emulate_network` - Throttle network

---

## Usage by Agent

| Agent | octocode-mcp | local-memory | chrome-devtools |
|-------|--------------|--------------|-----------------|
| agent-rapid-planner | ✅ Planning | ❌ | ❌ |
| agent-rapid-planner-implementation | ⚠️ If needed | ✅ Coordination | ❌ |
| agent-rapid-quality-architect | ✅ Patterns | ✅ Mode 3 only | ✅ QA testing |
| agent-product | ✅ Research | ❌ | ❌ |
| agent-architect | ✅ Research | ❌ | ❌ |
| agent-feature-analyzer | ✅ Research | ❌ | ❌ |
| agent-quality-architect | ✅ Patterns | ✅ Mode 3 only | ✅ QA testing |
| agent-manager | ⚠️ If needed | ✅ Coordination | ❌ |
| agent-implementation | ⚠️ If needed | ✅ Coordination | ❌ |

---

**Legend:**
- ✅ Primary use
- ⚠️ Secondary use (when needed)
- ❌ Not used