# Deferred autoresearch ideas

- Add a tiny CLI affordance for research agents to get exact match line numbers directly from `search-code` results, so R2-style tasks do not have to infer line numbers from snippets and then fall back to `gh`/curl.
- Add a small machine-friendly example or one-line reminder to CLI help/specs that `search-code` returns snippets only, while `get-file --match-string` returns `startLine`; this may teach the model the handoff without more SKILL.md prose.
- If skill-only work stalls, create an R2-only micro-harness to iterate faster on the library-usage loop before revalidating against the full R2/R4/R5 subset.
