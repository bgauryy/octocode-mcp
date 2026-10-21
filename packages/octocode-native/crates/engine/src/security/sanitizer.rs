use super::detector;
use super::detector::{CONTENT_SIZE_LIMIT_PLACEHOLDER, MAX_CONTENT_SIZE, Scope};
use super::types::SanitizationResult;

pub fn sanitize_content(
    content: &str,
    file_path: Option<&str>,
) -> crate::error::Result<SanitizationResult> {
    sanitize_in(content, file_path.map_or(Scope::Pathless, Scope::File))
}

/// [`sanitize_content`] for one string leaf of a tool result about the file at
/// `source_path` (see [`Scope::Leaf`]).
pub fn sanitize_leaf(content: &str, source_path: &str) -> crate::error::Result<SanitizationResult> {
    sanitize_in(content, Scope::Leaf(source_path))
}

fn sanitize_in(content: &str, scope: Scope<'_>) -> crate::error::Result<SanitizationResult> {
    std::panic::catch_unwind(|| {
        // Redact oversized content before running any pattern detector.
        if content.len() > MAX_CONTENT_SIZE {
            return SanitizationResult {
                content: CONTENT_SIZE_LIMIT_PLACEHOLDER.to_string(),
                has_secrets: true,
                secrets_detected: vec!["content-size-exceeded".to_string()],
                warnings: vec![format!(
                    "Content exceeds {} byte limit — redacted for safety",
                    MAX_CONTENT_SIZE
                )],
            };
        }

        let result = detector::detect_in(content, scope);

        let warnings = if result.secrets_detected.is_empty() {
            vec![]
        } else {
            vec![format!(
                "{} secret(s) redacted",
                result.secrets_detected.len()
            )]
        };

        SanitizationResult {
            content: result.sanitized,
            has_secrets: !result.secrets_detected.is_empty(),
            secrets_detected: result.secrets_detected,
            warnings,
        }
    })
    .map_err(|_| crate::error::Error::new("content sanitization failed on pathological input"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sanitize_content_redacts_oversized_content() {
        let content = "a".repeat(MAX_CONTENT_SIZE + 1);
        let result = sanitize_content(&content, None).expect("sanitized");

        assert_eq!(result.content, "[CONTENT-REDACTED-SIZE-LIMIT]");
        assert!(result.has_secrets);
        assert_eq!(result.secrets_detected, vec!["content-size-exceeded"]);
        assert_eq!(result.warnings.len(), 1);
    }

    #[test]
    fn sanitize_content_returns_no_warnings_for_clean_content() {
        let result = sanitize_content("plain text", None).expect("sanitized");

        assert_eq!(result.content, "plain text");
        assert!(!result.has_secrets);
        assert!(result.secrets_detected.is_empty());
        assert!(result.warnings.is_empty());
    }

    /// An assignment keeps its identifier and quotes: only the value is a
    /// secret, and redacted source must still parse as the same statement.
    #[test]
    fn env_var_secret_redaction_keeps_the_identifier() {
        let result = sanitize_content(
            "export const API_TOKEN = \"abcdefghijklmnopqrstuvwx\";\n",
            None,
        )
        .expect("sanitized");
        assert_eq!(
            result.content,
            "export const API_TOKEN = \"[REDACTED-ENVVARSECRETS]\";\n"
        );
        assert_eq!(result.secrets_detected, vec!["envVarSecrets"]);
    }

    #[test]
    fn sanitize_content_adds_warning_when_secret_is_redacted() {
        let result = sanitize_content("token: ghp_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", None)
            .expect("sanitized");

        assert!(result.has_secrets);
        assert_eq!(result.warnings, vec!["1 secret(s) redacted"]);
    }
}
