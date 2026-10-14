# TODO

Parked work and open decisions. Remove an entry when it is done or dropped.

## Parked tools

- **astRewrite (beta, disabled).** Disabled on MCP and the CLI, even with `OCTOCODE_BETA`, through the core tool policy `disabled: true` (`octocode-core` `TOOL_POLICIES`). The code and its module tests stay. Before re-enabling:
  - Decide the field naming: `rewrite` (pattern form) and `fix` (rule form) are two names for one purpose.
  - Decide whether `constraints`/`utils`/`transform` stay valid both at the top level and inside `rule`.
  - Re-run the astRewrite review lane (preview → apply on a scratch copy, CRLF, identity rewrites, `selectedMatchIds`) and the e2e driver.

## Deferred decisions

- **clasify:** no changes for now. Open items: the `maxChars` minimum (native tests use small values), the `next.clasify` continuation shape (bare `{queries}` vs `{tool, query}`), and whether direct-read leads and search-candidate leads should both pin a snapshot.
- **ghStructure `languages`:** accepts `page` silently. Left as is by decision.
- **Release:** rebuild and publish the five stale platform artifacts (`build:publish`, `check-outputs`, publish, `brew:formula`).
