# Claude Code v2.1.86 - Mythos/Model Rules Research

## Executive Summary

- Target bundle: `node_modules/@anthropic-ai/claude-code/cli.js` (~12.9M chars, bundled/minified JS).
- Searched for `mythos` and close variants across the package; no matches found.
- Model-related rules found are focused on:
  - deprecation warnings for specific legacy Claude model IDs
  - a special deprecation warning for `claude-opus-4-6` when `thinking.type="enabled"`
  - fallback-model CLI guard (`fallback model != main model`)
  - runtime request model composition via `Vcq(...)`

## Key Findings

- **No Mythos model/rules present**  
  `node_modules/@anthropic-ai/claude-code/cli.js:0-12967859`  
  Full-package search returned no `mythos`/`myth` matches.

- **Deprecated model map (beta messages path)**  
  `node_modules/@anthropic-ai/claude-code/cli.js:96844-96862` and nearby block around `93000-102000`  
  `B$7` map defines deprecated model IDs and dates; `Z55=["claude-opus-4-6"]` triggers a warning when thinking mode is explicitly enabled.

- **Deprecated model map (non-beta messages path)**  
  `node_modules/@anthropic-ai/claude-code/cli.js:111732-111750` and nearby block around `107000-116000`  
  `i$7` map (non-beta path) mirrors deprecation logic and includes additional `claude-3-5-haiku-*` entries; `N55=["claude-opus-4-6"]` special-case also present.

- **Prompt-layer model override section present**  
  `node_modules/@anthropic-ai/claude-code/cli.js:11458758-11458772`  
  System prompt composition includes `MQ("ant_model_override",()=>tkz())`, meaning model override context is injected into prompt assembly.

- **Request model selection/composition pipeline**  
  `node_modules/@anthropic-ai/claude-code/cli.js:11481449-11481462`  
  Request pipeline computes `t=Vcq(A.model,e,V,C)` and then applies additional model-aware logic (thinking, betas, output config, max tokens, speed).

- **CLI fallback-model validity rule**  
  `node_modules/@anthropic-ai/claude-code/cli.js:12921180-12921194`  
  Hard check: fallback model cannot be identical to main model.

## Feature Map

- Model deprecations -> `overview.md#model-rule-surface`
- Request model assembly -> `flows.md#model-selection-flow`
- Model/environment strings -> `strings.md#high-signal-model-strings`
- Rule entities and tables -> `entities.md#model-rule-entities`
- Traversal log and reflections -> `paths.md#research-steps`

## References

- `overview.md#bundle-identification`
- `overview.md#model-rule-surface`
- `flows.md#model-selection-flow`
- `strings.md#high-signal-model-strings`
- `entities.md#model-rule-entities`
- `paths.md#step-log`
