# Adding a clasify vendor

The `clasify` tool's transport, batch scheduler, context capture, and paging
engine are all vendor-agnostic. Adding a new classification API is exactly
**four steps** — no changes to those layers.

Reference implementation: [`jev.rs`](../crates/runtime/src/providers/classification/jev.rs)

---

## 1 — Create the vendor file

```
crates/runtime/src/providers/classification/<vendor>.rs
```

Implement `ClassificationProvider` for your vendor.
Every method is documented in [`mod.rs`](../crates/runtime/src/providers/classification/mod.rs).

```rust
// crates/runtime/src/providers/classification/myvendor.rs
use super::{ClassificationProvider, ProviderContractError};
use serde_json::{Value, json};

pub struct MyVendor;
pub static MY_VENDOR: MyVendor = MyVendor;

impl ClassificationProvider for MyVendor {
    fn default_host(&self) -> &'static str { "https://api.myvendor.ai" }
    fn default_model(&self) -> &'static str { "myvendor-v1" }
    fn endpoint_path(&self) -> &'static str { "v1/classify" }
    fn docs_url(&self) -> &'static str { "https://docs.myvendor.ai/getting-started" }

    // ── Wire format ──────────────────────────────────────────────────────────
    // Shape the JSON body however your API expects.

    fn build_request(&self, state: &Value, question: &Value, model: &str) -> Value {
        json!({ "model": model, "context": state, "query": question })
    }

    fn build_batch_request(
        &self,
        state: &Value,
        questions: &[(usize, &Value)],
        model: &str,
    ) -> Value {
        let qs: serde_json::Map<String, Value> = questions
            .iter()
            .map(|(i, q)| (format!("q{i}"), (*q).clone()))
            .collect();
        json!({ "model": model, "context": state, "queries": qs })
    }

    // ── Response extraction ──────────────────────────────────────────────────
    // Tell the engine where to find the answer in the vendor's response body.

    fn extract_answer<'a>(&self, response: &'a Value) -> Option<&'a Value> {
        response.get("result")
    }

    fn batch_answer_key(&self, index: usize) -> String {
        format!("q{index}")
    }

    // ── Validation ───────────────────────────────────────────────────────────
    // Reject malformed or request-incompatible responses. `request: true`
    // marks a request-side violation; vendor names never reach error codes.

    fn validate_response(
        &self,
        _request: &Value,
        response: &Value,
    ) -> Result<(), ProviderContractError> {
        if response.get("result").is_some() {
            Ok(())
        } else {
            Err(ProviderContractError {
                request: false,
                message: "response.result is missing".to_owned(),
            })
        }
    }
}
```

---

## 2 — Register the module

In `crates/runtime/src/providers/classification/mod.rs`, add:

```rust
pub mod myvendor;
```

---

## 3 — Add an arm to `provider_for`

In the same file:

```rust
pub fn provider_for(vendor: &str) -> Option<&'static dyn ClassificationProvider> {
    match vendor {
        "jev" => Some(&jev::JEV),
        "myvendor" => Some(&myvendor::MY_VENDOR), // ← add this
        _ => None,
    }
}
```

An unknown id is `None`, never a default vendor. `ToolRuntime::new` resolves the
provider once and fails with `invalidConfiguration` for an id no arm matches, so a
new vendor that is missing its arm is reported at startup. Add a case to the
`provider_for_resolves_only_registered_vendors` test.

---

## 4 — Extend the config contract

The `classification.type` enum is generated into the config contract
(`packages/octocode-config`, see `src/config/contract.generated.ts`). Add `"myvendor"`
to the enum where the contract declares it, then regenerate:

```bash
yarn contracts:regen   # repo root: regenerates packages/octocode-config/contract/
```

---

## Done — what you get for free

| Layer | File | What it does |
|---|---|---|
| Transport | `tools/clasify/transport.rs` | HTTP POST, retries, budget, error codes |
| Single call | `tools/clasify/mod.rs` | Preflight → `build_request` → `extract_answer` → project |
| Batching | `tools/clasify/batch.rs` | Groups questions → `build_batch_request` → `batch_answer_key` |
| Paging | `tools/clasify/run/mod.rs` | Resource-major paging, concurrency semaphore |
| Context | `tools/clasify/context.rs` | Context capture, receipt, continuation logic |

None of those files need touching.  The only vendor-specific code lives in your
new `providers/classification/myvendor.rs`.

---

## Checklist

- [ ] `crates/runtime/src/providers/classification/myvendor.rs` created
- [ ] `pub mod myvendor;` added to `mod.rs`
- [ ] `"myvendor"` arm added to `provider_for()` (no default arm)
- [ ] `"myvendor"` added to the `classification.type` enum in the config contract
- [ ] `yarn contracts:regen` run; `packages/octocode-config/contract/` changes committed
- [ ] At least one integration test exercises `clasify` with a mock of your API
      (see `crates/runtime/tests/runtime_clasify.rs` for the existing Jev fixture pattern)
