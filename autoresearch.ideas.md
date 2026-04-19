# Deferred autoresearch ideas

- Confidence reruns on the current best branch (`e26780e`) are now low-priority. The harness shows heavy-tailed noise even with longer outer timeouts, so do not spend much more budget on pure remeasurement.
- If pursuing R2 again, avoid **all search-code output-shape changes**, most extra JSON-field reminder text, and simple search-code limit clamps for now. Bigger payloads, path-hint metadata, a text-match alias, a `.value` reminder, a path-finder-only rule, and a `--limit` clamp to 20 all failed to unlock a new win. Only revisit R2 with a different narrow ergonomics idea outside search-code result shaping and simple prompt polish.
- Treat additional R4 instruction/help wording churn as low leverage too; recent “stop after first matching merged-history query” and command-spec discoverability tweaks were safe but non-winning.
- Do not revisit PR path-filtering ideas. That family was explored already and failed broader validation.
