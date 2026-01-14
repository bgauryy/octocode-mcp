<div align="center">
  <img src="https://github.com/bgauryy/octocode-mcp/raw/main/packages/octocode-mcp/assets/logo_white.png" width="400px" alt="Octocode Logo">

  <h1>Octocode Research</h1>
  
  **The official way to use Octocode** — A skill for AI agents to search, navigate, and understand codebases.

  [![Skill](https://img.shields.io/badge/skill-agentskills.io-purple)](https://agentskills.io/what-are-skills)
  [![License](https://img.shields.io/badge/license-PolyForm--Small--Business-green)]()

</div>

---

## What is a Skill?

Skills are reusable AI agent capabilities. Learn more at **[agentskills.io/what-are-skills](https://agentskills.io/what-are-skills)**.

With Octocode Research as a skill:
- ✅ **No tools or context bloat** — Runs without installing MCP tools into your agent
- ✅ **Works everywhere** — Any host that supports skills can run Octocode research flows
- ✅ **GitHub authenticated** — One-time authentication, then use across all compatible hosts

---

## Installation

```bash
npx octocode-cli
```

This handles everything:
- GitHub authentication
- Skill registration

> The skill runs locally on your machine via a lightweight server that exposes research capabilities to AI agents.

---



https://github.com/user-attachments/assets/7f4ab179-b810-40d5-aab5-e903a5c45c6e



## What It Does

Octocode Research enables AI agents to perform **deep code research** — both locally and externally.

### Local Research
Search and navigate your own codebase:

| Capability | Description |
|------------|-------------|
| **Code Search** | Find patterns across files (ripgrep-powered) |
| **LSP Navigation** | Go-to-definition, find references, call hierarchy |
| **File Discovery** | Browse structure, find files by metadata |

### External Research
Explore code across GitHub:

| Capability | Description |
|------------|-------------|
| **GitHub Code Search** | Search code across public/private repos |
| **Repository Exploration** | Browse repo structure and file contents |
| **PR Research** | Search and analyze pull requests |
| **Package Discovery** | Search npm and PyPI registries |

---

## Why Use This?

| Without Skill | With Octocode Research Skill |
|---------------|------------------------------|
| Install MCP tools per host | One installation, works everywhere |
| Context window bloat from tool definitions | Clean context, tools run server-side |
| Manual setup per agent | Pre-configured research flows |
| Limited to basic file reading | LSP-powered semantic navigation |

---

## Troubleshooting

### Check Server Status
```bash
npx octocode-cli
# Select "Skills" → "Status"
```

### Logs Location

Server logs are stored in `~/.octocode/logs/`:

| File | Contents |
|------|----------|
| `tools.log` | All API calls with timing |
| `errors.log` | Errors and validation failures |

```bash
# View recent logs
tail -f ~/.octocode/logs/tools.log

# View errors
cat ~/.octocode/logs/errors.log
```

---

## License

PolyForm-Small-Business-1.0.0
