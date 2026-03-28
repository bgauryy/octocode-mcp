# Overview

## Bundle Identification

- Path: `node_modules/@anthropic-ai/claude-code/cli.js`
- Package version: `@anthropic-ai/claude-code@2.1.86`
- Bundle style: large bundled/minified JS (single file with many inlined modules).

## Execution Model

- Top-level bundled runtime with many module initializers (`var X=y(()=>{...})` style).
- Entrypoint and CLI option parsing appear near tail-end of bundle.
- Model rule checks appear in API client/message helper modules and request construction logic.

## Model Rule Surface

- **Deprecation maps**
  - `B$7` (beta messages path): `node_modules/@anthropic-ai/claude-code/cli.js:96844-96862`
  - `i$7` (non-beta messages path): `node_modules/@anthropic-ai/claude-code/cli.js:111732-111750`
- **Special-case model/thinking rule**
  - `Z55` and `N55` contain `claude-opus-4-6` and warn on `thinking.type="enabled"`.
- **Prompt-injected model override context**
  - `MQ("ant_model_override",()=>tkz())` in prompt section:
    `node_modules/@anthropic-ai/claude-code/cli.js:11458758-11458772`
- **Request model composition**
  - `t=Vcq(A.model,e,V,C)`:
    `node_modules/@anthropic-ai/claude-code/cli.js:11481449-11481462`
- **CLI fallback model guard**
  - Error if fallback equals main:
    `node_modules/@anthropic-ai/claude-code/cli.js:12921180-12921194`

## High-Signal Strings

- `"model-deprecations"` docs URL appears in deprecation warning blocks.
- `"Fallback model cannot be the same as the main model"` appears in CLI argument validation.

## Obfuscation/Minification Notes

- No heavy string-decoder obfuscation found for model rules.
- Symbol names are shortened/mangled in places (`B$7`, `N55`, `Vcq`, `tkz`) but readable enough for targeted tracing.
