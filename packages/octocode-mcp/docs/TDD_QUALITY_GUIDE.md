# MCP TDD Quality Guide

This guide defines the blocking quality lanes for `octocode-mcp` and where new contract tests belong.

## Quality Lanes

| Lane | Command | Blocks shipping MCP health? | Use it when... |
|------|---------|-----------------------------|----------------|
| `mcp:package` | `yarn mcp:package` | Yes | You changed runtime code, tool wiring, startup, provider execution, or response formatting. |
| `mcp:contracts` | `yarn mcp:contracts` | Yes | You are iterating on deterministic product contracts and want the fast blocking suite. |
| `test:contracts:startup` | `yarn test:contracts:startup` | Yes via `mcp:package` | A change touches startup, config recovery, tool registration, or warning behavior. |
| `test:contracts:providers` | `yarn test:contracts:providers` | Yes via `mcp:package` | A change touches provider selection, auth propagation, or partial-failure handling. |
| `test:contracts:responses` | `yarn test:contracts:responses` | Yes via `mcp:package` | A change touches bulk envelopes, ordering, truncation, or error shapes. |
| `test:contracts:flows` | `yarn test:contracts:flows` | Yes via `mcp:package` | A change touches multi-tool handoffs such as local/LSP or remote search-to-fetch flows. |
| `mcp:evals` | `yarn mcp:evals` | No | You are working on eval harnesses or research comparisons and want that surface checked separately. |
| `verify:full` | `yarn verify:full` | No | You want the broad historical suite and full-project typecheck signal in one run. |

`typecheck` now targets `tsconfig.package.json`, which includes shipping code plus blocking contract tests. Eval-only type debt stays visible through `typecheck:evals` and `typecheck:full`, but it no longer marks the shipping package unhealthy by accident.

## Contract Families

| Contract family | Primary suites | Failure meaning |
|-----------------|----------------|-----------------|
| Configuration and startup | `tests/index.test.ts`, `tests/index.shutdown.test.ts`, `tests/serverConfig*.test.ts` | The MCP server can no longer boot, recover config, register tools, or keep startup warnings deterministic. |
| Provider selection and execution | `tests/tools/providerExecution.test.ts` plus provider-sensitive startup tests | The active provider, auth handoff, or partial-failure behavior regressed. |
| Response envelopes | `tests/utils/bulkOperations.test.ts` | Bulk result ordering, truncation, or error shaping regressed. |
| Local and remote handoff flows | `tests/flows/*.test.ts` and `tests/flows/catalog.ts` | A research flow regressed across tool boundaries, not just within a single tool. |

The flow catalog remains in `tests/flows/catalog.ts`. Add new flow IDs there when a user-visible research journey becomes a first-class contract.

## Writing New Contract Tests

1. Start with the lane that should fail first. If the bug is about startup or provider selection, add or extend a startup/provider contract before touching production code.
2. Prefer real handoff fields over top-level mocks. Contract tests should pass the same `id`, `path`, `uri`, `lineHint`, `owner`, `repo`, and pagination fields that runtime code uses.
3. Keep warnings deterministic. `test:contracts*` runs with `OCTOCODE_ENFORCE_WARNING_FREE_TESTS=1`, so unexpected `console.warn` or Node warnings fail the test. Startup stderr warnings must be asserted explicitly in the relevant suite.
4. Update the right family, not the biggest suite. Keep flow contracts in `tests/flows/`; keep provider and response contracts adjacent to the runtime seam they protect.
5. If a new behavior belongs only to evals or external research harnesses, keep it out of the blocking package lane and document it in the eval surface instead.

## Related References

- [Development Guide](https://github.com/bgauryy/octocode-mcp/blob/main/docs/DEVELOPMENT_GUIDE.md)
- [Local Tools Reference](https://github.com/bgauryy/octocode-mcp/blob/main/packages/octocode-mcp/docs/LOCAL_TOOLS_REFERENCE.md)
- [GitHub, GitLab & Bitbucket Tools Reference](https://github.com/bgauryy/octocode-mcp/blob/main/packages/octocode-mcp/docs/GITHUB_GITLAB_TOOLS_REFERENCE.md)
