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
   Runs `yarn health:check` and `yarn docs:verify` to ensure every first-class workspace exposes the required scripts and the docs/workflow references are consistent.
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
