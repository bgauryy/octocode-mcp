# Deferred autoresearch ideas

- If more confidence is needed on the current broad best (`d7b94f8`), create an explicit rerun harness with a longer outer timeout rather than relying on ad-hoc full-subset reruns that can stall mid-batch.
- If we continue chasing remaining variance, look for a fresh structural idea unrelated to PR path filtering; both the `--path-prefix` flag and automatic path-aware query filtering were rejected after broader validation.
