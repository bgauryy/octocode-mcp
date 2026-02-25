## Summary

<!-- What does this PR do? Keep it to 1-3 sentences. -->
<!-- Use Conventional Commits format for the PR title (set in the GitHub UI above). -->
<!-- For provider-specific changes, include prefix: [GitHub], [GitLab], or [GitHub][GitLab] in the title. -->

## Type of Change

- [ ] Bug fix (non-breaking change that fixes an issue)
- [ ] New feature (non-breaking change that adds functionality)
- [ ] Breaking change (fix or feature that would cause existing functionality to change)
- [ ] Refactoring (no functional changes)
- [ ] Documentation update
- [ ] CI/Build/Tooling
- [ ] Other: <!-- describe -->

## Provider Scope

<!-- Which Git provider does this change affect? -->
<!-- If provider-specific, also include [GitHub]/[GitLab]/[GitHub][GitLab] in the PR title. -->

- [ ] GitHub
- [ ] GitLab
- [ ] Both
- [ ] N/A (not provider-specific)

## Related Issues

<!-- Link related issues. Use "Fixes #123" to auto-close. -->

Fixes #

## How Was This Tested?

<!-- Describe how you validated the change. Include test commands, manual steps, or screenshots. -->

- [ ] Unit tests added/updated
- [ ] Integration tests added/updated
- [ ] Manual testing performed
- [ ] N/A (docs-only or internal refactor)

**Test commands run:**
```bash
yarn test
```

**Manual validation steps:**
<!-- List steps you took to manually verify the change works. -->

1. ...

## Configuration

<!-- If this introduces a new feature, describe the configuration gate. -->
<!-- Both env var AND .octocoderc support are required. See existing gates: ENABLE_LOCAL, ENABLE_CLONE, ENABLE_TOOLS, etc. -->

- **Env variable**: <!-- e.g. ENABLE_MY_FEATURE -->
- **`.octocoderc` field**: <!-- e.g. tools.enableMyFeature -->
- **Default value**: <!-- e.g. `false` (opt-in) -->
- **How to enable**: <!-- e.g. Set `ENABLE_MY_FEATURE=true` or `{ "tools": { "enableMyFeature": true } }` in .octocoderc -->

> Skip this section if N/A (bug fix, internal refactor with no user-visible change, docs-only).

## Pre-Submit Checklist

- [ ] My commits follow the [Conventional Commits](https://github.com/bgauryy/octocode-mcp/blob/main/CONTRIBUTING.md#commit-conventions) format
- [ ] I have **self-reviewed** my own diff
- [ ] Branch is up to date with `main` (`git rebase main`)
- [ ] `yarn lint` passes
- [ ] `yarn build` succeeds
- [ ] `yarn test` passes with required coverage
- [ ] I added tests that prove my fix/feature works (or N/A for docs-only; for refactors, existing tests pass)
- [ ] Documentation is updated where required (APIs, config, README, CLI docs) in the same PR
- [ ] New features are behind a configuration gate — env var + `.octocoderc` (or N/A)
- [ ] Provider scope is indicated above and in PR title prefix (if touching provider-specific code)
- [ ] Both providers are tested if touching provider-shared code
- [ ] PR description is complete (all relevant template sections filled)
- [ ] No debug logs, commented-out code, or untracked TODOs

## Screenshots / Logs

<!-- If applicable, add screenshots or relevant log output. -->

## Additional Context

<!-- Anything else reviewers should know? -->
