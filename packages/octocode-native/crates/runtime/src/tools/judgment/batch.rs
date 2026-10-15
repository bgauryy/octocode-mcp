//! One evaluation's provider requests. Every question over the state goes in
//! one request when each question alone and the whole group fit the
//! serialized headroom; otherwise each question is its own request. Every
//! answer is validated against its question before use, and an evaluation
//! succeeds only when every question has a valid answer.
use super::transport::{
    ClassificationError, ReportedUsage, check_budget, check_key, endpoint, post,
};
use super::{EvaluationInput, Judged};
use crate::providers::classification::ClassificationProvider;
use crate::providers::classification::gate::GateLease;
use futures_util::{StreamExt as _, stream};
use octocode_github::RequestBudget;
use secrecy::SecretString;
use serde_json::Value;

// Conservative serialized-byte headroom for shared-state requests. This is
// not a token estimate or a guarantee that a provider accepts the request.
const MAX_STATE_AND_QUESTION_BYTES: usize = 72 * 1024;
const MAX_GROUP_BYTES: usize = 120 * 1024;
const MAX_TEXT_REQUEST_BYTES: usize = 4 * 1024 * 1024;

fn max_request_bytes(input: EvaluationInput<'_>) -> usize {
    if input.assets.is_some() {
        // Base64 expansion, per-image padding and the existing text allowance.
        crate::tools::id::clasify_policy::MAX_TOTAL_IMAGE_BYTES.div_ceil(3) * 4
            + crate::tools::id::clasify_policy::MAX_IMAGE_ASSETS * 4
            + MAX_TEXT_REQUEST_BYTES
    } else {
        MAX_TEXT_REQUEST_BYTES
    }
}

/// Where and how one evaluation's requests are sent.
pub(crate) struct Connection<'a> {
    pub key: &'a SecretString,
    pub base_url: &'a str,
    pub endpoint_path: &'a str,
    pub provider: &'static dyn ClassificationProvider,
    pub retries: u32,
}

/// One provider response: its answers in question order, model and usage.
struct Response {
    answers: Vec<Value>,
    model: String,
    input_tokens: u64,
    output_tokens: u64,
}

fn request_error(message: &str) -> ClassificationError {
    ClassificationError::new(
        "invalidClassificationRequest",
        message,
        "Inspect the current clasify query schema.",
    )
}

/// The questions as one grouped request body, when it fits the headroom.
fn grouped(
    input: EvaluationInput<'_>,
    model: &str,
    provider: &dyn ClassificationProvider,
) -> Option<(Value, bytes::Bytes)> {
    let indexed: Vec<(usize, &Value)> = input.questions.iter().enumerate().collect();
    let each_fits = indexed.iter().all(|question| {
        crate::cache::json_len(&provider.build_batch_request(
            input.state,
            std::slice::from_ref(question),
            model,
            None,
        )) <= if input.long_context {
            MAX_TEXT_REQUEST_BYTES
        } else {
            MAX_STATE_AND_QUESTION_BYTES
        }
    });
    if !each_fits {
        return None;
    }
    let text_request = provider.build_batch_request(input.state, &indexed, model, None);
    if crate::cache::json_len(&text_request)
        > if input.long_context {
            MAX_TEXT_REQUEST_BYTES
        } else {
            MAX_GROUP_BYTES
        }
    {
        return None;
    }
    let request = provider.build_batch_request(input.state, &indexed, model, input.assets);
    let body = serde_json::to_vec(&request).ok()?;
    (body.len() <= max_request_bytes(input)).then(|| (request, body.into()))
}

/// Answer every question over `state`.
pub(crate) async fn answer(
    input: EvaluationInput<'_>,
    model: &str,
    connection: &Connection<'_>,
    budget: &RequestBudget,
    gate: &GateLease,
) -> Result<Judged, ClassificationError> {
    let questions = input.questions;
    if questions.is_empty() {
        return Err(request_error("An evaluation needs at least one question."));
    }
    check_budget(budget)?;
    check_key(connection.key)?;
    let provider = connection.provider;
    // One question is one plain request; several share one when they fit.
    if questions.len() > 1
        && let Some((request, body)) = grouped(input, model, provider)
    {
        let (response, calls) = send(&request, body, input, connection, budget, gate).await?;
        let answers = (0..questions.len())
            .map(|index| response["answers"][provider.batch_answer_key(index).as_str()].clone())
            .collect();
        return judged(vec![(parse(&response, answers), calls)]);
    }
    // One request per question, concurrently; the gate bounds them.
    let singles = stream::iter(questions.iter())
        .map(|question| async move {
            let assets = input.assets.and_then(Value::as_object).and_then(|assets| {
                let referenced = crate::tools::source_capture::assets::referenced;
                let selected = assets
                    .iter()
                    .filter(|(key, _)| referenced(input.state, key) || referenced(question, key))
                    .map(|(key, value)| (key.clone(), value.clone()))
                    .collect::<serde_json::Map<String, Value>>();
                (!selected.is_empty()).then_some(Value::Object(selected))
            });
            let single = EvaluationInput {
                questions: std::slice::from_ref(question),
                assets: assets.as_ref(),
                ..input
            };
            let request = provider.build_request(single.state, question, model, single.assets);
            let body = serde_json::to_vec(&request)
                .map_err(|_| request_error("Classification request could not be serialized."))?;
            if body.len() > max_request_bytes(single) {
                return Err(ClassificationError::new(
                    "classificationStateTooLarge",
                    "One classification request exceeded the configured serialized body limit.",
                    "Narrow the state, reduce image bytes, or shorten the questions.",
                ));
            }
            let (response, calls) =
                send(&request, body.into(), single, connection, budget, gate).await?;
            let answer =
                provider
                    .extract_answer(&response)
                    .cloned()
                    .ok_or_else(|| ClassificationError {
                        provider_calls: calls,
                        ..ClassificationError::invalid_response(
                            "Classification provider response is missing the expected answer.",
                        )
                    })?;
            Ok::<_, ClassificationError>((parse(&response, vec![answer]), calls))
        })
        .buffered(questions.len())
        .collect::<Vec<_>>()
        .await;
    let mut parts = Vec::with_capacity(singles.len());
    let mut calls = 0_u64;
    let mut input_tokens = 0_u64;
    let mut output_tokens = 0_u64;
    let mut known_usage_calls = 0_u64;
    let mut failure = None;
    for single in singles {
        match single {
            Ok((part, part_calls)) => {
                calls = calls.saturating_add(part_calls);
                input_tokens = input_tokens.saturating_add(part.input_tokens);
                output_tokens = output_tokens.saturating_add(part.output_tokens);
                known_usage_calls = known_usage_calls.saturating_add(1);
                parts.push((part, part_calls));
            }
            Err(error) => {
                let usage = error.usage();
                calls = calls.saturating_add(error.provider_calls);
                input_tokens = input_tokens.saturating_add(usage.input_tokens);
                output_tokens = output_tokens.saturating_add(usage.output_tokens);
                known_usage_calls = known_usage_calls.saturating_add(usage.known_usage_calls);
                failure.get_or_insert(error);
            }
        }
    }
    match failure {
        Some(error) => Err(ClassificationError {
            provider_calls: calls,
            reported_usage: Some(Box::new(ReportedUsage {
                input_tokens,
                output_tokens,
                known_usage_calls,
            })),
            ..error
        }),
        None => judged(parts),
    }
}

/// POST one request and validate the whole response against it.
async fn send(
    request: &Value,
    body: bytes::Bytes,
    input: EvaluationInput<'_>,
    connection: &Connection<'_>,
    budget: &RequestBudget,
    gate: &GateLease,
) -> Result<(Value, u64), ClassificationError> {
    let (response, calls) = post(
        body,
        connection
            .provider
            .request_headers(input.images(), input.long_context),
        connection.key,
        endpoint(connection.base_url, connection.endpoint_path)?,
        budget,
        connection.retries,
        gate,
    )
    .await?;
    connection
        .provider
        .validate_response(request, &response)
        .map_err(|error| ClassificationError {
            code: error.code().into(),
            provider_calls: calls,
            reported_usage: Some(Box::new(ReportedUsage {
                input_tokens: response["usage"]["input_tokens"].as_u64().unwrap_or(0),
                output_tokens: response["usage"]["output_tokens"].as_u64().unwrap_or(0),
                known_usage_calls: u64::from(
                    response["usage"]["input_tokens"].as_u64().is_some()
                        && response["usage"]["output_tokens"].as_u64().is_some(),
                ),
            })),
            ..ClassificationError::invalid_response(error.message)
        })?;
    Ok((response, calls))
}

fn parse(response: &Value, answers: Vec<Value>) -> Response {
    let tokens = |key: &str| response["usage"][key].as_u64().unwrap_or(0);
    Response {
        answers,
        model: response["model"].as_str().unwrap_or_default().to_owned(),
        input_tokens: tokens("input_tokens"),
        output_tokens: tokens("output_tokens"),
    }
}

fn judged(parts: Vec<(Response, u64)>) -> Result<Judged, ClassificationError> {
    let mut judged = Judged {
        answers: Vec::new(),
        model: String::new(),
        input_tokens: 0,
        output_tokens: 0,
        provider_calls: 0,
        known_usage_calls: 0,
        replayed: false,
    };
    let mut model_mismatch = false;
    for (part, calls) in parts {
        if judged.model.is_empty() {
            judged.model = part.model;
        } else if judged.model != part.model {
            model_mismatch = true;
        }
        judged.answers.extend(part.answers);
        judged.input_tokens = judged.input_tokens.saturating_add(part.input_tokens);
        judged.output_tokens = judged.output_tokens.saturating_add(part.output_tokens);
        judged.provider_calls = judged.provider_calls.saturating_add(calls);
        judged.known_usage_calls = judged.known_usage_calls.saturating_add(1);
    }
    if model_mismatch {
        Err(ClassificationError {
            provider_calls: judged.provider_calls,
            reported_usage: Some(Box::new(ReportedUsage {
                input_tokens: judged.input_tokens,
                output_tokens: judged.output_tokens,
                known_usage_calls: judged.known_usage_calls,
            })),
            ..ClassificationError::invalid_response(
                "Classification provider resolved one evaluation to different models across requests.",
            )
        })
    } else {
        Ok(judged)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn jev() -> &'static dyn ClassificationProvider {
        &crate::providers::classification::jev::JEV
    }

    fn text_input<'a>(state: &'a Value, questions: &'a [Value]) -> EvaluationInput<'a> {
        EvaluationInput {
            state,
            questions,
            assets: None,
            long_context: false,
        }
    }

    #[test]
    fn questions_group_only_within_the_headroom() {
        let questions = vec![json!({"type":"noul","instructions":"q"}); 3];
        assert!(grouped(text_input(&json!("small"), &questions), "m", jev()).is_some());
        let large = json!("x".repeat(MAX_STATE_AND_QUESTION_BYTES));
        assert!(grouped(text_input(&large, &questions), "m", jev()).is_none());
        // Each request alone fits; the five long questions together do not.
        let long = vec![json!({"type":"noul","instructions":"q".repeat(20 * 1024)}); 5];
        assert!(
            grouped(text_input(&json!("x".repeat(30 * 1024)), &long), "m", jev()).is_none(),
            "each fits alone but the group does not"
        );
    }

    #[test]
    fn images_share_one_request_without_counting_base64_as_text_context() {
        let state = json!("opaque");
        let questions = [json!({"type":"box"}), json!({"type":"noul"})];
        let assets = json!({"opaque":{"type":"image","format":"png","data_base64":"A".repeat(MAX_GROUP_BYTES + 1)}});
        let input = EvaluationInput {
            assets: Some(&assets),
            ..text_input(&state, &questions)
        };
        let (request, body) =
            grouped(input, "vision", jev()).expect("one image shared by both questions");
        assert_eq!(request["assets"], assets);
        assert!(body.len() > MAX_GROUP_BYTES);
        assert_eq!(request["questions"].as_object().unwrap().len(), 2);
        assert!(max_request_bytes(input) > MAX_TEXT_REQUEST_BYTES);
    }

    #[test]
    fn long_context_opt_in_keeps_questions_batched_over_large_text() {
        let state = json!("x".repeat(MAX_STATE_AND_QUESTION_BYTES + 1));
        let questions = [json!({"type":"noul"}), json!({"type":"noul"})];
        let input = text_input(&state, &questions);
        assert!(grouped(input, "m", jev()).is_none());
        assert!(
            grouped(
                EvaluationInput {
                    long_context: true,
                    ..input
                },
                "m",
                jev()
            )
            .is_some()
        );
    }

    #[test]
    fn a_split_evaluation_sums_usage_and_keeps_question_order() {
        let part = |answer: &str, tokens: u64| {
            (
                Response {
                    answers: vec![json!({"type":"noul","noul":answer})],
                    model: "jev-1.13.0".into(),
                    input_tokens: tokens,
                    output_tokens: 1,
                },
                1,
            )
        };
        let judged = judged(vec![part("a", 5), part("b", 7)]).unwrap();
        assert_eq!(judged.answers[0]["noul"], "a");
        assert_eq!(judged.answers[1]["noul"], "b");
        assert_eq!(
            (
                judged.input_tokens,
                judged.output_tokens,
                judged.provider_calls
            ),
            (12, 2, 2)
        );
        assert_eq!(judged.model, "jev-1.13.0");
    }

    #[test]
    fn different_resolved_models_do_not_get_labeled_as_one_model() {
        let parts = ["jev-a", "jev-b"]
            .into_iter()
            .map(|model| {
                (
                    Response {
                        answers: vec![json!({"type":"noul","noul":0.5})],
                        model: model.into(),
                        input_tokens: 3,
                        output_tokens: 1,
                    },
                    1,
                )
            })
            .collect();
        let error = judged(parts).unwrap_err();
        assert_eq!(error.code, "invalidClassificationResponse");
        assert_eq!(
            (
                error.provider_calls,
                error.usage().known_usage_calls,
                error.usage().input_tokens,
                error.usage().output_tokens
            ),
            (2, 2, 6, 2)
        );
    }
}
