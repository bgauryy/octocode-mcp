# GitHub Actions workflows

| Workflow | Trigger | Purpose |
|---|---|---|
| `ci.yml` | Pull requests and pushes to `main` | Lint and test; Rust checks; native script tests; end-to-end tool health and native Node tests |

CI publishes nothing: no release builds, platform packages, or uploaded
binaries. Only the `e2e` job builds the packages, a throwaway debug build
(`build:dev`) that `test:tools` drives through the CLI and MCP server and the
native package's Node tests load; it runs after the `native` job passes. The
`native-scripts` job runs the native package's script tests without a build,
and the `native` job also regenerates the tool and config contracts (pinned
`cargo-typify` 0.8.0) and fails when a checked-in copy differs. Release builds stay local (`build:target <platform>`, `build:all`,
or `dev.mjs build:publish`).

Run the same checks locally:

```bash
node skills-dev/octocode-dev/scripts/dev.mjs lint:ci
node skills-dev/octocode-dev/scripts/dev.mjs test:ci
node skills-dev/octocode-dev/scripts/dev.mjs build:dev && node skills-dev/octocode-dev/scripts/dev.mjs test:tools
yarn workspace @octocodeai/octocode-native test:node
yarn workspace @octocodeai/octocode-native test:scripts && node --test packages/octocode-native/tests/audit-native.test.mjs
# needs cargo-typify 0.8.0 (cargo install cargo-typify --version 0.8.0 --locked)
yarn workspace @octocodeai/config check:tool-contract && yarn workspace @octocodeai/config check:config-contract
```

`test:ci` starts with `skills:check`: the skill linter over `skills/`, the shared report-viewer check, and the skill script tests. Run it alone with `dev.mjs skills:check` after editing a skill.

npm publishing, Homebrew tap updates, and binary uploads are manual; see the
[release guide](../../skills-dev/octocode-dev/docs/RELEASE.md).
