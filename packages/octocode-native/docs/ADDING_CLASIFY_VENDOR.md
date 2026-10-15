# Adding a clasify vendor

The classification transport, batching, cache, endpoint gate, and source capture are vendor-agnostic. One provider (Jev) is built in and no setting selects it. A second vendor needs one new trait implementation and a setting that chooses between the two; nothing else changes.

Reference implementation: [`jev.rs`](../crates/runtime/src/providers/classification/jev.rs). The trait and each method's contract: [`mod.rs`](../crates/runtime/src/providers/classification/mod.rs).

## 1. Implement the provider

Create `crates/runtime/src/providers/classification/<vendor>.rs` with a static value that implements `ClassificationProvider`:

| Method | Supplies |
|---|---|
| `default_host`, `default_model`, `endpoint_path`, `models_path`, `docs_url` | Built-in defaults: API root (used when `OCTOCODE_CLASSIFICATION_API_HOST` is unset), model, classify and model-catalog paths, and the setup link shown in `missingConfiguration` errors |
| `request_headers` | Capability opt-ins for image input and long context |
| `build_request`, `build_batch_request` | The JSON body for one question, or for several questions over the same state (with optional image assets) |
| `extract_answer`, `batch_answer_key` | Where the answer sits in a single or batch response |
| `validate_response`, `validate_models` | Shape checks that return `ProviderContractError`; `request: true` marks a request-side violation, and vendor names never reach the public error codes |

Register it with `pub mod <vendor>;` in `providers/classification/mod.rs`.

## 2. Add a selection setting

`provider()` in `mod.rs` returns the one built-in provider. Declare an `enum` field (for example `classification.vendor`) with both vendor ids in `packages/octocode-config/config-contract.json`, then run `yarn workspace @octocodeai/config generate:config-contract`. The native build generates a Rust enum for it; `provider()` matches on that enum with no default arm, so an unknown value is impossible by construction. Don't reuse `classification.type`: it stays under `removed` in the contract. Adding a setting: [ADDING_CONFIG.md](../../../skills-dev/octocode-dev/docs/ADDING_CONFIG.md).

## 3. Test it

Add an integration test that runs `clasify` against a mock of the vendor API; `crates/runtime/tests/runtime_clasify.rs` shows the Jev fixture pattern.

## What stays unchanged

| Layer | Code |
|---|---|
| HTTP transport, retries, budget, error codes | `tools/judgment/transport.rs` |
| Question batching | `tools/judgment/batch.rs` |
| Judgment cache | `tools/judgment/cache.rs` |
| Per-endpoint concurrency gate | `providers/classification/gate.rs` |
| Source capture (files, GitHub, URLs, images) | `tools/source_capture/` |
| The `clasify` tool | `tools/clasify/mod.rs` |
