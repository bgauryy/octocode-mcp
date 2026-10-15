//! Classification provider abstraction.
//!
//! `clasify` sends evidence to a classification vendor for a typed
//! judgment. Each vendor's built-in defaults (API host, model, endpoint path,
//! wire format) and response contract live behind [`ClassificationProvider`].
//! One provider is built in ([`provider`]); no setting selects it.
//!
//! Transport, batch scheduling, context capture, and the clasify engine are
//! vendor-agnostic: a second vendor needs only another impl and a setting to
//! choose between them.
pub mod jev;

pub(crate) mod gate;

use serde_json::Value;

/// Vendor-neutral response-contract violation reported by
/// [`ClassificationProvider::validate_response`]. Vendors map their own
/// validator errors into this so vendor names never reach public error codes.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ProviderContractError {
    /// `true` when the request (not the vendor response) broke the contract.
    pub request: bool,
    pub message: String,
}

impl ProviderContractError {
    /// Stable public error code for this violation.
    #[must_use]
    pub fn code(&self) -> &'static str {
        if self.request {
            "invalidClassificationRequest"
        } else {
            "invalidClassificationResponse"
        }
    }
}

/// A classification vendor: its built-in defaults, wire format, and response
/// contract. Every method is called from the generic clasify engine; vendor
/// logic stays exclusively inside the impl.
pub trait ClassificationProvider: Send + Sync {
    /// Default API root used when `OCTOCODE_CLASSIFICATION_API_HOST` is unset.
    fn default_host(&self) -> &'static str;

    /// Model used when neither the query nor configuration selects one.
    fn default_model(&self) -> &'static str;

    /// Path joined onto the API root to reach the vendor's endpoint.
    fn endpoint_path(&self) -> &'static str;

    /// Read-only model catalog on the same configured API root.
    fn models_path(&self) -> &'static str;

    /// Provider capability opt-ins required by the prepared request.
    fn request_headers(&self, images: bool, long_context: bool) -> reqwest::header::HeaderMap;

    /// Link to vendor setup docs; shown in `missingConfiguration` errors.
    fn docs_url(&self) -> &'static str;

    /// Build the JSON body sent for a **single-question** request.
    /// The engine calls this once per state × question cell; the shape is
    /// entirely vendor-defined.
    fn build_request(
        &self,
        state: &Value,
        question: &Value,
        model: &str,
        assets: Option<&Value>,
    ) -> Value;

    /// Build the JSON body for a **multi-question batch** over the same state.
    /// `questions` is a slice of `(original_index, &question_value)` pairs;
    /// the index is available for key naming (e.g. `answer_0`, `answer_1`).
    fn build_batch_request(
        &self,
        state: &Value,
        questions: &[(usize, &Value)],
        model: &str,
        assets: Option<&Value>,
    ) -> Value;

    /// Extract the single answer object from a **non-batch** vendor response.
    /// Returns `None` when the response does not contain the expected answer,
    /// which the engine treats as an `invalidClassificationResponse` error.
    fn extract_answer<'a>(&self, response: &'a Value) -> Option<&'a Value>;

    /// Return the answer key used for question at `index` inside a batch
    /// request/response (e.g. `"answer_0"` for Jev).
    fn batch_answer_key(&self, index: usize) -> String;

    /// Validate the vendor's answer shape against the requested rubric.
    fn validate_response(
        &self,
        request: &Value,
        response: &Value,
    ) -> Result<(), ProviderContractError>;

    /// Validate model metadata without interpreting model names or dates.
    fn validate_models(&self, response: &Value) -> Result<(), ProviderContractError>;
}

/// The built-in classification provider.
#[must_use]
pub fn provider() -> &'static dyn ClassificationProvider {
    &jev::JEV
}

#[cfg(test)]
mod tests {
    #[test]
    fn the_built_in_provider_needs_no_setting() {
        assert!(
            crate::config::CONFIG_FIELDS
                .iter()
                .all(|field| !field.path.starts_with("classification.type")),
            "no setting selects the provider"
        );
        assert!(!super::provider().default_host().is_empty());
    }
}
