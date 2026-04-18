# Deferred autoresearch ideas

- Build a dedicated **R2-only** micro-harness (new experiment target/config) so high-variance ideas can be tested cheaply before revalidating against the full R2/R4/R5 subset.
- Add a tiny CLI affordance for research agents to get exact match line numbers directly from `search-code` results, so R2-style tasks do not have to infer line numbers from snippets and then fall back to `gh`/curl.
- If revisiting CLI wording/help, do it only inside the R2 micro-harness first; the full subset is too expensive and noisy for blind help-text experiments.
