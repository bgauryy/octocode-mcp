# Deferred autoresearch ideas

- If local-tool startup still matters after runtime-init pruning, inspect whether `executeToolCommand()` can avoid some generic payload/validation work for known-good local flows without changing semantics.
- If the local-tool benchmark flattens out, start a separate target for networked GitHub/package commands instead of mixing noisy remote latency into this workload.
