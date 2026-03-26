<div align="center">
  <img src="https://github.com/bgauryy/octocode-mcp/raw/main/packages/octocode-mcp/assets/logo_white.png" width="320" alt="Octocode Logo">
  <h1>Octocode Code Engineer</h1>
  <p><strong>AI agent skill for safe, codebase-aware engineering</strong></p>
</div>

## Why use this skill
Use this skill when you want an agent to change code without guessing.

It helps you:
- find existing implementations before adding new code
- estimate blast radius before refactors and renames
- detect architecture, quality, dead-code, security, and test issues
- validate findings with local + LSP evidence before reporting
- track improvement with file-level findings and hybrid quality ratings

## What it does
The skill runs a scan + validation workflow:
1. Map structure: files, functions, flows, dependency graph.
2. Detect issues: 80+ categories across architecture, quality, dead code, security, and test quality.
3. Validate critical findings: use local search + LSP navigation instead of raw heuristics only.
4. Produce artifacts: machine-readable JSON and human-readable summary.

## Key features
- Architecture analysis: coupling, cycles, chokepoints, dependency critical paths.
- Code quality analysis: complexity, duplication, risky async patterns, error-boundary gaps.
- Dead-code hygiene: dead exports/files, unused deps, barrel issues.
- Security checks: secrets, injection risks, traversal risks, unsafe sinks.
- Test quality checks: assertion density, mocking hygiene, cleanup issues.
- AST tools: structural search and AST tree exploration.
- Hybrid quality ratings (AI + structure): Architecture & Structure, Folder Topology, Naming Quality, Common/Shared Layer Health, Maintainability & Evolvability, Codebase Consistency.

## Rating model behavior
- Soft-signal scoring (not rigid pass/fail lint rules).
- Test files are excluded from hybrid ratings unless `--include-tests` is enabled.
- Generated/minified/vendor paths are excluded from hybrid ratings by default.
- Advisory categories are downweighted relative to hard defects to reduce noise.

## Requirements
For full capability, run with Octocode MCP local tools enabled:

```json
{
  "mcpServers": {
    "octocode": {
      "command": "npx",
      "type": "stdio",
      "args": ["octocode-mcp@latest"],
      "env": {
        "ENABLE_LOCAL": "true"
      }
    }
  }
}
```

Without local tools, scanning still works, but semantic validation is reduced.

## Install
```bash
npx octocode-cli skills install --skill octocode-code-engineer
```

Multi-target install:
```bash
npx octocode-cli skills install --skill octocode-code-engineer --targets claude-code,claude-desktop,cursor,codex,opencode
```

## Common commands
From `skills/octocode-code-engineer/`:

```bash
# Fast default scan
node scripts/run.js --root /path/to/repo --out .octocode/scan/latest

# Include graph + semantic signals
node scripts/run.js --root /path/to/repo --out .octocode/scan/latest --graph --semantic --flow

# Analyze with tests
node scripts/run.js --root /path/to/repo --out .octocode/scan/latest --include-tests
```

## Output files
Typical outputs in `.octocode/scan/<run>/`:
- `summary.md`: concise human report and triage guidance
- `summary.json`: machine-readable overview + hybrid ratings
- `findings.json`: all findings with category/severity/location
- `architecture.json`, `code-quality.json`, `dead-code.json` (+ optional `security.json`, `test-quality.json`)
- `file-inventory.json`: per-file functions/flows/dependencies
- optional `graph.md`, `ast-trees.txt`

## When not to use this skill
Use other tools for:
- syntax/type errors (`tsc`)
- style formatting/lint policy (ESLint/Prettier)
- runtime debugging (tests/debugger)

## License
MIT License © 2026 Octocode — see [LICENSE](https://github.com/bgauryy/octocode-mcp/blob/main/LICENSE).
