# GitHub Actions Workflows

This directory contains the active CI/CD workflows for the Octocode monorepo.

## Overview

| Workflow | Trigger | Purpose |
|---|---|---|
| `ci.yml` | Pull requests | Repo health, lint, typecheck, build, test |
| `releases.yml` | GitHub Release published or manual dispatch | Build and upload `octocode-mcp` binaries |

## CI (`ci.yml`)

The pull request workflow now checks the repo quality contract explicitly:

1. `health`
   Runs `yarn health:check`, `yarn docs:verify`, captures a scan architecture snapshot (`scripts/architecture-snapshot.mjs`), and enforces architecture/maintainability non-regression gates (`scripts/score-gate.mjs`).
2. `lint`
   Runs `yarn lint`.
3. `typecheck`
   Runs `yarn typecheck`.
4. `build`
   Runs `yarn build` and `node scripts/workspace-health.mjs check-outputs`.
5. `test`
   Runs `yarn test` and uploads per-package coverage artifacts.

Useful local commands before opening a PR:

```bash
yarn health:check
yarn docs:verify
node scripts/architecture-snapshot.mjs --summary skills/octocode-code-engineer/.octocode/scan/check-each-tool-current/summary.json --out .octocode/scan/architecture-snapshot.json
node scripts/score-gate.mjs --summary skills/octocode-code-engineer/.octocode/scan/check-each-tool-current/summary.json --min-aspect architecture-structure:67 --min-aspect maintainability-evolvability:68 --max-category shotgun-surgery:21 --max-category high-coupling:15 --max-category missing-error-boundary:42 --max-category cognitive-complexity:22
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

## Maintenance Notes

- Keep this file aligned with the actual workflow files in this directory.
- `yarn docs:verify` fails if this README references a workflow that does not exist.
