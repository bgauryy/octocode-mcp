# GitHub Actions workflows

| Workflow | Trigger | Purpose |
|---|---|---|
| `ci.yml` | Pull requests and pushes to `main` | Lint and test; Rust checks; end-to-end tool health |

CI publishes nothing: no release builds, platform packages, or uploaded
binaries. Only the `e2e` job builds the packages, a throwaway debug build
(`build:dev`) that `test:tools` drives through the CLI and MCP server; it runs
after the `native` job passes. Release builds stay local (`build:target <platform>`, `build:all`,
or `dev.mjs build:publish`).

Run the same checks locally:

```bash
node skills-dev/octocode-dev/scripts/dev.mjs lint:ci
node skills-dev/octocode-dev/scripts/dev.mjs test:ci
node skills-dev/octocode-dev/scripts/dev.mjs build:dev && node skills-dev/octocode-dev/scripts/dev.mjs test:tools
```

`test:ci` starts with `skills:check`: the skill linter over `skills/`, the shared report-viewer check, and the skill script tests. Run it alone with `dev.mjs skills:check` after editing a skill.

npm publishing, Homebrew tap updates, and binary uploads are manual; see the
[release guide](../../skills-dev/octocode-dev/docs/RELEASE.md).
