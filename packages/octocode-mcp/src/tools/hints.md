### the goal of hints is to retrive data to LLM with hint for better research and AI driven instructions!

# No Results Hints Per Tool

## Code Search
- Improve filters or keywords; try to find semantic patterns that relate to the research goal.
- Use `extension`, `filename`, `path`, and `match: "path"` to target directories and file names.
- Look in tests: `tests/`, `__tests__/`, `*.test.*`, `*.spec.*` to discover real usage.
- After discovery, add `owner`/`repo` to narrow scope; set `limit` to cap results.
- Prefer 2–3 focused queries over one broad query.

## Repo Search
- Improve filters or keywords; look for semantic patterns relevant to the research goal.
- Combine `match: ["readme","description"]` to surface documented repos; validate against code.
- Use `sort: "stars"` or `sort: "updated"` plus `limit` to prioritize.
- Apply freshness filters like `updated: ">=YYYY-MM-DD"`; use `size:` to avoid huge monorepos when not needed.
- Try using repository topics with `topicsToSearch` in addition to `keywordsToSearch`.

## File Fetching / Structure View
- Validate the file path using code search with matching patterns.
- If fetching content 404s, try branch fallbacks: `main`, `master`, `develop` or omit branch to use default.
- Prefer partial reads: use `matchString` or `startLine`/`endLine` instead of `fullContent`.
- Keep payload small: `minified: true`; adjust `matchStringContextLines` as needed (e.g., 10–20).
- For structure view in monorepos, try `path: "packages"`, `"apps"`, or `"services"` and set `depth: 2`.

---

# Extra Research (When Results Are Found)

## Code Search
- Determine if deeper research is needed; consider additional focused queries tied to the goal.
- Search documentation by filtering for `.md` files (always validate claims against implementation).
- Use function/class names or error strings as keywords to find definitions and usages.
- Derive `matchString` for file fetches from code search `text_matches` to extract precise context.
- Scope away from noise directories by setting `path` to `src/`, `packages/*/src`, or a concrete package (e.g., `packages/react/src`) to avoid `fixtures/` results.
- Use precise symbols for patterns (e.g., `getDerivedStateFromError`, `componentDidCatch` for ErrorBoundary) rather than generic names.

## Repo Search
- Validate results based on repository topics and descriptions; ensure alignment with goals.
- Prioritize via `sort` and analyze the top 3–5 repositories in depth.
- After selection, run structure view first, then scoped code search in promising paths.
- Avoid curated list repos by using implementation-oriented keywords like `library`, `sdk`, `client`, `api` alongside the core concept.

## File Fetching
- Ensure results provide good context; prefer partial reads for token efficiency.
- When readability matters (e.g., JSON/Markdown), consider `minified: false`.
- Use `matchString` from code search `text_matches` and increase `matchStringContextLines` if needed.
- If content is missing, try default branch by omitting `branch`, or confirm via structure view.
- If `matchString` is not found, consider a short `startLine`/`endLine` range or a one-off `fullContent: true` for small docs.

## Structure View
- Fetch files that might be relevant to the research; explore `src/` or `packages/` first.
- Use `depth: 2` to surface key files/folders quickly.
- Build targeted code searches from discovered `path` and `filename` patterns.
- In monorepos, scope to a concrete package (e.g., `path: "packages/react"`) before running code search.

## Pull Requests
- Pull implementation diffs with `withContent: true`; add `withComments: true` to understand decisions.
- Filter with `state`, `label`, `author`, `merged: true`, `draft: false` for higher signal.
- Use time filters `created`/`updated` and branch filters `base`/`head` to scope.
- After finding a PR, fetch changed files by `filename` from `file_changes` for deeper analysis.
- Use `label` filters to narrow domain (e.g., `type: bug`, `area: docs`) and cut noise.

## Cross-Tool Chaining
- Repositories → Structure → Code Search (scoped) → File Fetch (partial).
- Compare top 3–5 repos; verify README claims against code; confirm usage via tests.
- If code search returns many `fixtures/` matches, pivot to real packages via structure then re-scope searches.

## Error Recovery Quick Tips
- Rate limit: Lower `limit`, add `owner`/`repo` filters, or wait for reset.
- Not found: Omit `branch` to use default or detect default via structure view.
- Network: Retry with smaller `limit`; check VPN/proxy.