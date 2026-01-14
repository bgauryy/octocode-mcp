# Octocode Research

**Code research HTTP server for AI agents** - Search, navigate, and understand codebases locally and on GitHub.

[![Server](https://img.shields.io/badge/server-localhost:1987-blue)]()
[![License](https://img.shields.io/badge/license-PolyForm--Small--Business-green)]()

---

## What It Does

| Capability | Description |
|------------|-------------|
| **Local Code Search** | Ripgrep-powered search across your codebase |
| **LSP Navigation** | Go-to-definition, find references, call hierarchy |
| **GitHub Exploration** | Search code, repos, PRs across GitHub |
| **Package Discovery** | Search npm and PyPI registries |

> Runs **locally** on your machine at `http://localhost:1987`. Direct filesystem access + GitHub API.

---

## Quick Start

```bash
# Install and start
./install.sh start

# Verify running
curl http://localhost:1987/health
# {"status":"ok","port":1987,"version":"2.0.0"}
```

---

## Example Usage

### Search Local Code
```bash
curl "http://localhost:1987/local/search?pattern=authenticate&path=/my/project/src"
```

### Trace Call Flow (LSP)
```bash
# Find who calls a function
curl "http://localhost:1987/lsp/calls?uri=/project/src/auth.ts&symbolName=login&lineHint=42&direction=incoming"
```

### Search GitHub
```bash
curl "http://localhost:1987/github/search?keywordsToSearch=middleware,express&language=typescript"
```

### Find npm Package Source
```bash
curl "http://localhost:1987/package/search?name=lodash&ecosystem=npm"
```

---

## API Endpoints

### Local Tools
| Endpoint | Description |
|----------|-------------|
| `GET /local/search` | Search code patterns (ripgrep) |
| `GET /local/content` | Read file content |
| `GET /local/structure` | View directory tree |
| `GET /local/find` | Find files by metadata |

### LSP Tools
| Endpoint | Description |
|----------|-------------|
| `GET /lsp/definition` | Jump to symbol definition |
| `GET /lsp/references` | Find all usages |
| `GET /lsp/calls` | Call hierarchy (incoming/outgoing) |

### GitHub Tools
| Endpoint | Description |
|----------|-------------|
| `GET /github/search` | Search code across repos |
| `GET /github/content` | Read file from repo |
| `GET /github/structure` | View repo file tree |
| `GET /github/repos` | Search repositories |
| `GET /github/prs` | Search pull requests |

### Package Tools
| Endpoint | Description |
|----------|-------------|
| `GET /package/search` | Search npm/PyPI packages |

---

## Server Management

```bash
./install.sh start     # Start server
./install.sh stop      # Stop server
./install.sh restart   # Restart server
./install.sh status    # Check if running
./install.sh logs      # View logs
```

---

## Logs

Server logs to `~/.octocode/logs/`:

| File | Contents |
|------|----------|
| `tools.log` | All API calls with timing |
| `errors.log` | Errors and validation failures |

---

## Documentation

| Document | Purpose |
|----------|---------|
| [SKILL.md](./SKILL.md) | Agent integration guide, research flows, decision trees |
| [references/](./references/) | Detailed API documentation per endpoint |

---

## For AI Agents

This server is designed for AI agent integration. See [SKILL.md](./SKILL.md) for:

- Research flow patterns (Local vs External)
- Task tool integration with Claude Code
- Required parameters (`mainResearchGoal`, `researchGoal`, `reasoning`)
- Output protocols and document templates
- Decision trees for tool selection

---

## License

PolyForm-Small-Business-1.0.0
