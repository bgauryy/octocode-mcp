# Deferred autoresearch ideas

- Build a dedicated **R4-only** micro-harness if we want to keep working after the `matchLine` win; the remaining variance is now concentrated in PR archaeology rather than library-usage search.
- Revisit a `search-prs --path-prefix` client-side filter only inside that R4 micro-harness. It seems directionally useful but was too noisy to justify on the full subset.
- If more confidence is needed on the current best (`342dd98`), create an explicit rerun harness with a longer outer timeout rather than relying on ad-hoc full-subset reruns that can stall mid-batch.
