# Contributing to Octocode

Thank you for your interest in contributing to Octocode! This guide covers conventions, requirements, and quality standards for all contributions.

> **First time?** Start with the [Development Guide](https://github.com/bgauryy/octocode-mcp/blob/main/docs/DEVELOPMENT_GUIDE.md) for setup instructions and commands.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Commit Conventions](#commit-conventions)
- [Pull Request Guidelines](#pull-request-guidelines)
- [Provider Scope](#provider-scope)
- [Testing Requirements](#testing-requirements)
- [Documentation Requirements](#documentation-requirements)
- [New Features & Configuration Gates](#new-features--configuration-gates)
- [Style Guide](#style-guide)
- [Repository Structure](#repository-structure)

---

## Code of Conduct

Be respectful, constructive, and inclusive. We welcome contributors of all experience levels.

## Getting Started

### Prerequisites

- **Node.js** >= 20.12.0
- **Yarn** (via Corepack: `corepack enable`)

### Setup

```bash
git clone https://github.com/bgauryy/octocode-mcp.git
cd octocode-mcp
corepack enable
yarn install
yarn build
yarn test
```

### Branching

1. Fork the repository and clone your fork.
2. Add the upstream remote and sync your local `main` before starting:
   ```bash
   git remote add upstream https://github.com/bgauryy/octocode-mcp.git
   git fetch upstream
   git checkout main
   git rebase upstream/main
   ```
3. Create a feature branch from `main`:
   ```bash
   git checkout -b feat/my-feature main
   ```
4. Make your changes, commit, push, and open a PR against `main`.

---

## Commit Conventions

We follow [Conventional Commits](https://www.conventionalcommits.org/). Every commit message must use this format:

```
<type>(<scope>): <short summary>

<optional body>

<optional footer>
```

### Types

| Type | When to Use |
|------|-------------|
| `feat` | New feature |
| `fix` | Bug fix |
| `docs` | Documentation only |
| `refactor` | Code change that neither fixes a bug nor adds a feature |
| `test` | Adding or updating tests |
| `perf` | Performance improvement |
| `build` | Build system or dependency changes |
| `ci` | CI/CD configuration |
| `chore` | Maintenance (tooling, configs, etc.) |

### Scopes

Use the package name as scope: `mcp`, `cli`, `vscode`, `shared`, `skills`.

### Examples

```
feat(mcp): add GitLab merge request diff support
fix(cli): resolve skill install path on Windows
docs(shared): update credentials architecture reference
test(mcp): add coverage for raw URL file fetch
refactor(mcp): extract pagination logic into shared helper
```

### Footer

- **Breaking changes**: `BREAKING CHANGE: <description>`
- **Issue references**: `Fixes #123` or `Closes #456` (in the PR body, not in commit messages)

---

## Pull Request Guidelines

### Before Opening a PR

Run through this self-review checklist:

1. **Search first** — check for existing issues or PRs that address the same thing.
2. **One concern per PR** — keep PRs focused. Split unrelated changes into separate PRs.
3. **Self-review your diff** — read every changed line before requesting review.
4. **All CI checks pass locally**:
   ```bash
   yarn lint
   yarn build
   yarn test
   ```

### PR Title

Use the same Conventional Commits format:

```
feat(mcp): add raw URL file content fetching
fix(cli): handle missing config gracefully
```

### PR Description

Use the [PR template](https://github.com/bgauryy/octocode-mcp/blob/main/.github/PULL_REQUEST_TEMPLATE.md) — it is loaded automatically when you open a PR. Fill in every section.

### PR Size

- **Small PRs merge faster.** Aim for < 400 lines changed.
- Large features should be split into stacked PRs or use feature branches with incremental merges.

### Review Process

- At least **1 approval** required before merge.
- Address all review comments. Resolve conversations only after the reviewer confirms.
- CI must be green before merge.

---

## Provider Scope

Octocode supports multiple Git providers (GitHub, GitLab). Every PR that touches provider-specific code **must clearly indicate** which provider it affects.

### How to Indicate Provider

1. **PR title prefix** — include the provider when relevant:
   ```
   feat(mcp): [GitHub] add commit status checks
   fix(mcp): [GitLab] fix merge request pagination
   feat(mcp): [GitHub][GitLab] unify diff parsing
   ```
2. **PR template** — check the appropriate provider box in the template.
3. **Labels** — maintainers will apply `provider:github`, `provider:gitlab`, or `provider:both`.

### Provider-Specific Rules

- Changes to a single provider **must not** break the other provider.
- Shared logic should be provider-agnostic. Use the existing adapter pattern in `octocode-mcp`.
- If adding a new tool or capability for one provider, document whether the other provider is supported and create a tracking issue if not.

---

## Testing Requirements

**All PRs must include tests** for features and bug fixes.

### Coverage Thresholds

| Package | Statements | Branches | Functions | Lines | Notes |
|---------|-----------|----------|-----------|-------|-------|
| `octocode-mcp` | **90%** | **90%** | **90%** | **90%** | Strictly enforced |
| `octocode-shared` | 35% | 20% | 40% | 35% | Growing — improve when touching |
| `octocode-cli` | — | — | — | — | No thresholds yet — tests still required |
| `octocode-vscode` | — | — | — | — | Manual testing only (see below) |

- **Framework**: Vitest with V8 coverage provider.
- **Config**: Each package has its own `vitest.config.ts`.

### VS Code Extension Exception

`octocode-vscode` is a single-file extension (`extension.ts`) with no automated tests. For changes to this package, follow the **manual testing checklist** in [packages/octocode-vscode/AGENTS.md](https://github.com/bgauryy/octocode-mcp/blob/main/packages/octocode-vscode/AGENTS.md). Document your manual validation steps in the PR description.

### What to Test

- **Bug fixes**: Include a test that **fails without the fix** and passes with it (TDD style).
- **New features**: Unit tests for all public functions. Integration tests for tool endpoints.
- **Refactors**: Existing tests must continue to pass. Add tests if coverage drops.

### Test Commands

```bash
yarn test            # Full suite with coverage (all packages)
yarn test:quiet      # Minimal output
```

Package-specific (run from the package directory):

```bash
yarn test:watch      # Watch mode (octocode-mcp)
yarn test:ui         # Vitest UI (octocode-mcp)
yarn lint && yarn build && yarn test   # Full validation (octocode-mcp)
```

### Test Structure

```
packages/<name>/tests/
├── <module>.test.ts       # Unit tests
├── integration/           # Integration tests
├── security/              # Security-focused tests
├── github/                # GitHub API tests
├── gitlab/                # GitLab API tests
├── lsp/                   # LSP tool tests
└── helpers/               # Test utilities
```

### Sanity Checks

Before marking your PR as ready for review, verify:

- [ ] Tests pass locally (`yarn test`)
- [ ] No test is skipped (`.skip`) without an explanatory comment
- [ ] Mocks are realistic — don't mock away the logic you're testing
- [ ] Edge cases are covered (empty input, large input, error paths)
- [ ] Both providers tested if touching provider-shared code

---

## Documentation Requirements

### When to Update Docs

| Change Type | Documentation Required |
|-------------|----------------------|
| New tool or capability | Tool reference docs + README mention |
| New configuration option | [Configuration Reference](https://github.com/bgauryy/octocode-mcp/blob/main/docs/CONFIGURATION_REFERENCE.md) |
| API change (public) | Relevant package docs |
| New CLI command or flag | [CLI Reference](https://github.com/bgauryy/octocode-mcp/blob/main/packages/octocode-cli/docs/CLI_REFERENCE.md) |
| Breaking change | Migration notes in PR description + docs update |
| New skill | [Skills README](https://github.com/bgauryy/octocode-mcp/blob/main/skills/README.md) |

### Documentation Rules

- All doc links **must use absolute GitHub URLs** — never relative paths. See [AGENTS.md](https://github.com/bgauryy/octocode-mcp/blob/main/AGENTS.md#documentation-links-rule) for the format.
- Docs must be updated **in the same PR** as the code change — not deferred to a follow-up.
- If documentation conflicts, treat `AGENTS.md` and package-level `AGENTS.md`
  files as the source of truth and update stale docs in the same PR.

---

## New Features & Configuration Gates

### Configuration-First Policy

**All new user-facing features must be behind a configuration option** until they are stable and validated in production.

### Why

- Allows users to opt-in gradually.
- Provides a rollback path without a code revert.
- Keeps `main` always releasable.

### Configuration System

Octocode uses two configuration sources (env vars take precedence):

1. **Environment variables** — set in the MCP client `env` block.
2. **`.octocoderc` file** — located at `~/.octocode/.octocoderc` (JSON with comments).

Resolution order: **env vars > `.octocoderc` > built-in defaults**.

Config is defined in `packages/octocode-shared/src/config/` (types, loader, validator, resolver).

### Existing Feature Gates (Follow This Pattern)

| Env Variable | `.octocoderc` Field | Purpose |
|-------------|---------------------|---------|
| `ENABLE_LOCAL` | `local.enabled` | Enable local filesystem + LSP tools |
| `ENABLE_CLONE` | `local.enableClone` | Enable `githubCloneRepo` and directory fetch |
| `ENABLE_TOOLS` | `tools.enableAdditional` | Add extra tools by name |
| `DISABLE_TOOLS` | `tools.disabled` | Remove specific tools by name |
| `TOOLS_TO_RUN` | `tools.enabled` | Strict whitelist — only these tools are registered |
| `DISABLE_PROMPTS` | `tools.disablePrompts` | Disable MCP prompts registration |

### How to Add a New Feature Gate

1. **Define the config option** — add to the schema in `packages/octocode-shared/src/config/types.ts` and the resolver in `resolverSections.ts`.
2. **Support both sources** — env var (`ENABLE_MY_FEATURE`) and `.octocoderc` field (e.g. `tools.enableMyFeature`).
3. **Default to off** — new features default to disabled until validated.
4. **Gate the code path**:
   ```typescript
   if (config.enableMyFeature) {
     // new behavior
   } else {
     // existing behavior (must remain unchanged)
   }
   ```
5. **Document the option** — add it to the [Configuration Reference](https://github.com/bgauryy/octocode-mcp/blob/main/docs/CONFIGURATION_REFERENCE.md).
6. **Test both paths** — tests must cover the feature enabled AND disabled.
7. **PR description** — fill in the Configuration section of the PR template with the option name, default, and how to enable.

### Exceptions

- Internal refactors with no user-visible behavior change.
- Bug fixes restoring intended behavior.
- Documentation-only changes.

---

## Style Guide

### Quick Reference

| Rule | Standard |
|------|----------|
| Language | TypeScript (strict mode) |
| Semicolons | Yes |
| Quotes | Single |
| Line width | 80 characters |
| Indentation | 2 spaces |
| Prefer | `const` over `let`, explicit return types, `?.` and `??` |
| Forbidden | `any` type (use `unknown` and narrow) |

### Naming

| Type | Convention | Example |
|------|------------|---------|
| Functions | `camelCase` | `fetchData()` |
| Classes | `PascalCase` | `TokenManager` |
| Constants | `UPPER_SNAKE_CASE` | `MAX_RETRIES` |
| Files | `camelCase.ts` or `kebab-case.ts` | `toolConfig.ts` |
| Tests | `<name>.test.ts` | `session.test.ts` |

For the full style guide and linting setup, see the [Development Guide](https://github.com/bgauryy/octocode-mcp/blob/main/docs/DEVELOPMENT_GUIDE.md#development-standards).

---

## Repository Structure

```
octocode-mcp/
├── packages/
│   ├── octocode-mcp/      # MCP server — 14 tools: GitHub/GitLab API, local FS, LSP
│   ├── octocode-cli/      # CLI installer, MCP marketplace (70+ servers), skills manager
│   ├── octocode-vscode/   # VS Code extension — OAuth, multi-editor MCP config
│   └── octocode-shared/   # Shared: credentials (AES-256-GCM), config, session, platform
├── skills/                 # AI agent skills (research, plan, roast, docs, PR review, etc.)
├── docs/                   # Monorepo documentation
└── package.json            # Workspace root (yarn workspaces)
```

### Provider Architecture

Octocode uses a **provider abstraction** (`ICodeHostProvider` interface) for GitHub and GitLab:

```
packages/octocode-mcp/src/providers/
├── types.ts           # ICodeHostProvider interface, ProviderType
├── factory.ts         # getProvider(), registerProvider()
├── github/            # GitHub implementation (Octokit REST)
│   └── GitHubProvider.ts
└── gitlab/            # GitLab implementation (GitLab REST)
    └── GitLabProvider.ts
```

Provider is selected automatically: if `GITLAB_TOKEN` / `GL_TOKEN` is set, GitLab mode activates; otherwise GitHub.

Each package has its own `AGENTS.md` with package-specific guidelines. See the [Package AGENTS.md table](https://github.com/bgauryy/octocode-mcp/blob/main/AGENTS.md#package-agentsmd) for links.

### Contributing Skills

Skills are markdown-based instruction sets in the `skills/` directory. To add a new skill:

1. Create a directory under `skills/` with a `SKILL.md` file.
2. Follow the structure of existing skills (see [Skills Guide](https://github.com/bgauryy/octocode-mcp/blob/main/packages/octocode-cli/docs/SKILLS_GUIDE.md)).
3. Add the skill to [skills/README.md](https://github.com/bgauryy/octocode-mcp/blob/main/skills/README.md).
4. Skills don't require automated tests but must include usage examples and when-to-use guidance.

---

## Pre-Submit Checklist

Before opening your PR, verify every item:

- [ ] Branch is up to date with `main` (`git fetch upstream && git rebase upstream/main`)
- [ ] Commit messages follow [Conventional Commits](#commit-conventions)
- [ ] `yarn lint` passes
- [ ] `yarn build` succeeds
- [ ] `yarn test` passes with required coverage
- [ ] Tests added for bug fixes and new features
- [ ] Documentation updated (same PR, not deferred)
- [ ] New features are behind a configuration gate (env var + `.octocoderc`)
- [ ] Provider scope is indicated (PR template checkbox + PR title prefix, if touching provider-specific code)
- [ ] PR description is complete (using the template)
- [ ] Self-reviewed the diff — no debug logs, no commented-out code, no TODOs without issues

---

## Questions?

- **Issues**: [GitHub Issues](https://github.com/bgauryy/octocode-mcp/issues)
- **Configuration**: [Configuration Reference](https://github.com/bgauryy/octocode-mcp/blob/main/docs/CONFIGURATION_REFERENCE.md)
- **Troubleshooting**: [Troubleshooting Guide](https://github.com/bgauryy/octocode-mcp/blob/main/docs/TROUBLESHOOTING.md)
- **Auth Setup**: [Authentication Guide](https://github.com/bgauryy/octocode-mcp/blob/main/packages/octocode-mcp/docs/AUTHENTICATION_SETUP.md)
