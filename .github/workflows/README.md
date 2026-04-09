# GitHub Actions Workflows

This directory contains the active CI/CD workflows for the Octocode monorepo.

## Overview

| Workflow | Trigger | Purpose |
|---|---|---|
| `ci.yml` | Pull requests | Repo health, lint, typecheck, build, test |
| `pr-review.yml` | Pull requests + `@octocode` comments | AI code review via Claude Code + Octocode MCP |
| `releases.yml` | GitHub Release published or manual dispatch | Build and upload `octocode-mcp` binaries |

## CI (`ci.yml`)

The pull request workflow runs two parallel jobs to minimize wall-clock time:

1. `checks` — Health, Lint & Typecheck
   Runs `yarn health:check`, `yarn docs:verify`, `yarn lint`, builds shared types, then `yarn typecheck`.
2. `build-and-test` — Build & Test
   Runs `yarn build`, verifies outputs, then `yarn test` and uploads per-package coverage artifacts.

Useful local commands before opening a PR:

```bash
yarn health:check
yarn docs:verify
yarn lint
yarn typecheck
yarn build
yarn test
```

If you want the full repo contract in one command, run:

```bash
yarn verify
```

## Release Binaries (`releases.yml`)

`releases.yml` builds standalone `octocode-mcp` binaries for:

- Linux x64 (glibc)
- Linux ARM64 (glibc)
- Linux x64 (musl)
- macOS ARM64
- macOS x64
- Windows x64

It also uploads the JS build artifact and SHA256 checksums to the release.

## AI PR Review (`pr-review.yml`)

Runs an automated code review on every PR using [Claude Code Action](https://github.com/anthropics/claude-code-action) with [Octocode MCP](https://github.com/bgauryy/octocode-mcp) as a tool server for deep code analysis.

### How it works

1. Checks out the repo with full history (and the actual PR head for `@octocode` comment triggers).
2. **Dynamically fetches** the latest [Octocode PR Review Skill](https://github.com/bgauryy/octocode-mcp/tree/main/skills/octocode-pull-request-reviewer) from GitHub — including flow analysis recipes, domain reviewers, output templates, and verification checklists.
3. Writes an MCP config that starts `octocode-mcp` with `ENABLE_LOCAL=true` and the repo's `GITHUB_TOKEN`.
4. Runs `anthropics/claude-code-action@v1` with the full review protocol.
5. Claude uses **all** Octocode MCP tools — local search, LSP (definitions, references, call hierarchy), GitHub API (PR metadata, comments, code search), and package search — to perform deep analysis.
6. Posts a structured review with ratings, findings, flow impact analysis, and previous comment follow-up.

### Triggers

| Event | Behavior |
|---|---|
| PR opened / synchronized / reopened from the same repository | Automatic full review |
| PR comment containing `@octocode` from a trusted maintainer | Re-review or respond to follow-up |
| PR comment containing `@octocode dismiss` from a trusted maintainer | Dismiss the latest Octocode review |

Fork PRs do not auto-review on `pull_request` because GitHub does not expose repository secrets to those runs. Maintainers can trigger the review on fork PRs by commenting `@octocode`.

### Pass / fail enforcement

After the review is posted, the workflow checks the verdict. If Octocode submitted **REQUEST_CHANGES**, the CI check fails — making it usable as a required status check in branch protection. If the review is **APPROVE** or **COMMENT**, the check passes.

To make this a merge gate, go to **Settings > Branches > Branch protection rules** and add `Octocode PR Review` as a required status check.

### Dismissing a review

Comment `@octocode dismiss` on the PR. The workflow dismisses the latest active Octocode review and reacts with a thumbs-up. Only repository owners, members, and collaborators can dismiss.

### Review capabilities

- **13 review domains**: Bug, Security, Architecture, Performance, Code Quality, Error Handling, Flow Impact, Efficiency, UX/Accessibility, Data/Migration Safety, Reliability/Ops, Testing
- **Flow impact analysis**: Traces callers/consumers of every modified symbol via LSP
- **PR health check**: Description quality, size, linked issues, test coverage
- **Measurements**: Correctness, Security, Performance, Maintainability (rated X/5)
- **Comment awareness**: Checks existing PR comments, flags unresolved ones, avoids duplicates
- **Confidence model**: HIGH/MED per finding with evidence-backed citations
- **Actionable fixes**: Every finding includes `file:line` location and diff-format code fix

### Required secrets

| Secret | Description |
|---|---|
| `ANTHROPIC_API_KEY` | Anthropic API key from [console.anthropic.com](https://console.anthropic.com/) |

`GITHUB_TOKEN` is provided automatically by GitHub Actions.

### Customization

- Edit the `prompt` in the workflow to change review focus areas or CI overrides.
- Adjust `--max-turns` in `claude_args` to control depth (default: 25).
- Add `--model claude-opus-4-6` to `claude_args` for deeper analysis (higher cost).
- The workflow auto-discovers `CLAUDE.md`, `AGENTS.md`, `CONTRIBUTING.md`, and `.octocode/pr-guidelines.md` for project-specific guidelines.
- Add `.octocode/pr-guidelines.md` to your repo with project-specific review rules that override defaults.

## Maintenance Notes

- Keep this file aligned with the actual workflow files in this directory.
- `yarn docs:verify` fails if this README references a workflow that does not exist.
