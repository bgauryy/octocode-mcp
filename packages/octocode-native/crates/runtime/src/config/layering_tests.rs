//! Global + workspace `.octocoderc` layering.
//!
//! Precedence, per field:
//! process env > workspace `.env` > global `.env` > workspace `.octocoderc`
//! > global `.octocoderc` > generated default.
use super::*;
use std::fs;
use std::path::PathBuf;

const HOME: &str = "/synthetic/.octocode";
const WORKSPACE_RC: &str = "/synthetic/cwd/.octocode/.octocoderc";
const GLOBAL_RC: &str = "/synthetic/.octocode/.octocoderc";

/// Sets `field_path` in `root`, creating missing sections.
fn insert_path(root: &mut serde_json::Value, field_path: &str, value: serde_json::Value) {
    let mut current = root;
    let mut parts = field_path.split('.').peekable();
    while let Some(part) = parts.next() {
        let object = current.as_object_mut().expect("object path");
        if parts.peek().is_none() {
            object.insert(part.to_owned(), value);
            return;
        }
        current = object.entry(part).or_insert_with(|| serde_json::json!({}));
    }
}

fn file(path: &str, text: Option<&str>) -> FileInput {
    match text {
        Some(text) => FileInput::Read {
            path: path.into(),
            text: text.into(),
        },
        None => FileInput::Missing { path: path.into() },
    }
}

struct Layers<'a> {
    env: &'a [(&'a str, &'a str)],
    global_env: Option<&'a str>,
    project_env: Option<&'a str>,
    global_rc: Option<&'a str>,
    project_rc: Option<&'a str>,
}

const NONE: Layers<'static> = Layers {
    env: &[],
    global_env: None,
    project_env: None,
    global_rc: None,
    project_rc: None,
};

fn input(layers: Layers<'_>) -> ConfigInput {
    ConfigInput {
        env: layers
            .env
            .iter()
            .map(|(k, v)| ((*k).to_owned(), (*v).to_owned()))
            .collect(),
        cwd: "/synthetic/cwd".into(),
        os_home: "/synthetic".into(),
        global_env: file("/synthetic/.octocode/.env", layers.global_env),
        project_env: file("/synthetic/cwd/.octocode/.env", layers.project_env),
        config_file: file(GLOBAL_RC, layers.global_rc),
        project_config_file: file(WORKSPACE_RC, layers.project_rc),
        runtime_surface: RuntimeSurface::Cli,
    }
}

fn resolve(layers: Layers<'_>) -> ConfigOutput {
    resolve_config(&input(layers))
}

#[test]
fn workspace_file_alone_applies() {
    let out = resolve(Layers {
        project_rc: Some(r#"{"network":{"timeout":7000}}"#),
        ..NONE
    });
    assert_eq!(out.resolved.network.timeout, 7000);
    assert_eq!(out.source, ConfigSource::File);
    assert_eq!(out.config_path, None);
    assert_eq!(out.project_config_path, Some(WORKSPACE_RC.into()));
    assert!(out.diagnostics.is_empty(), "{:?}", out.diagnostics);
}

#[test]
fn global_file_alone_still_applies() {
    let out = resolve(Layers {
        global_rc: Some(r#"{"network":{"timeout":6000}}"#),
        ..NONE
    });
    assert_eq!(out.resolved.network.timeout, 6000);
    assert_eq!(out.config_path, Some(GLOBAL_RC.into()));
    assert_eq!(out.project_config_path, None);
}

#[test]
fn workspace_overrides_global_per_field_and_global_fills_the_rest() {
    let out = resolve(Layers {
        global_rc: Some(
            r#"{"network":{"timeout":7000,"maxRetries":1},"output":{"format":"json"}}"#,
        ),
        project_rc: Some(r#"{"network":{"timeout":6000}}"#),
        ..NONE
    });
    assert_eq!(out.resolved.network.timeout, 6000, "workspace wins");
    assert_eq!(
        out.resolved.network.max_retries, 1,
        "sibling field in the same section still comes from global"
    );
    assert_eq!(
        out.resolved.output.format,
        OutputFormat::Json,
        "untouched section from global"
    );
}

#[test]
fn every_environment_source_beats_both_files() {
    let rc = r#"{"network":{"timeout":7000}}"#;
    for (label, layers) in [
        (
            "process env",
            Layers {
                env: &[("REQUEST_TIMEOUT", "9000")],
                ..NONE
            },
        ),
        (
            "workspace .env",
            Layers {
                project_env: Some("REQUEST_TIMEOUT=9000"),
                ..NONE
            },
        ),
        (
            "global .env",
            Layers {
                global_env: Some("REQUEST_TIMEOUT=9000"),
                ..NONE
            },
        ),
    ] {
        let out = resolve(Layers {
            global_rc: Some(rc),
            project_rc: Some(rc),
            ..layers
        });
        assert_eq!(out.resolved.network.timeout, 9000, "{label} must win");
        assert_eq!(out.source, ConfigSource::Mixed, "{label}");
    }
}

/// The contract's rule: `null` means "use the next source or the generated
/// default" — a workspace `null` does not reset a global list.
#[test]
fn workspace_null_falls_through_to_the_global_value() {
    let out = resolve(Layers {
        global_rc: Some(r#"{"tools":{"enabled":["localSearch"]}}"#),
        project_rc: Some(r#"{"tools":{"enabled":null}}"#),
        ..NONE
    });
    assert_eq!(
        out.resolved.tools.enabled,
        Some(vec!["localSearch".to_owned()])
    );
}

/// `null` for any setting of any kind falls through to its generated
/// default, never breaks resolution, and never touches another setting.
#[test]
fn null_falls_through_for_every_config_kind() {
    for field in CONFIG_FIELDS
        .iter()
        .filter(|field| field.file && field.resolved)
    {
        let mut doc = serde_json::json!({"network": {"timeout": 9000}});
        insert_path(&mut doc, field.path, serde_json::Value::Null);
        let text = doc.to_string();
        let out = resolve(Layers {
            global_rc: Some(&text),
            ..NONE
        });
        let default: serde_json::Value =
            serde_json::from_str(field.default_json).expect("generated default");
        let resolved =
            super::get_config_value(&out.resolved, field.path).unwrap_or(serde_json::Value::Null);
        assert_eq!(resolved, default, "{}", field.path);
        if field.path != "network.timeout" {
            assert_eq!(out.resolved.network.timeout, 9000, "{}", field.path);
        }
        assert!(
            out.diagnostics.is_empty(),
            "{}: {:?}",
            field.path,
            out.diagnostics
        );
    }
}

/// A null list in a disabled-local config once broke resolution and
/// replaced every setting with zero values (an empty provider type).
#[test]
fn a_null_list_keeps_every_other_setting() {
    let out = resolve(Layers {
        global_rc: Some(
            r#"{"local":{"enabled":false,"allowedPaths":null},"network":{"timeout":9000}}"#,
        ),
        ..NONE
    });
    assert!(!out.resolved.local.enabled);
    assert!(out.resolved.local.allowed_paths.is_empty());
    assert_eq!(out.resolved.network.timeout, 9000);
    assert!(out.diagnostics.is_empty(), "{:?}", out.diagnostics);
}

#[test]
fn workspace_array_replaces_instead_of_concatenating() {
    let out = resolve(Layers {
        global_rc: Some(r#"{"tools":{"disabled":["ghSearchCode","astSearch"]}}"#),
        project_rc: Some(r#"{"tools":{"disabled":["lspSearch"]}}"#),
        ..NONE
    });
    assert_eq!(
        out.resolved.tools.disabled,
        Some(vec!["lspSearch".to_owned()])
    );
}

fn protected_storage_diagnostics(out: &ConfigOutput, path: &str) -> usize {
    out.diagnostics
        .iter()
        .filter(|d| d.code == "workspace_config_protected" && d.field_path.as_deref() == Some(path))
        .count()
}

#[test]
fn workspace_cannot_widen_storage_persistence_through_rc_or_env() {
    let out = resolve(Layers {
        global_rc: Some(r#"{"storage":{"mode":"memory"}}"#),
        project_rc: Some(r#"{"storage":{"mode":"persistent"}}"#),
        project_env: Some("OCTOCODE_STORAGE_MODE=persistent"),
        ..NONE
    });
    assert!(!is_persistent_storage_enabled(&out.resolved));
    assert_eq!(protected_storage_diagnostics(&out, "storage.mode"), 1);
    assert!(
        out.dotenv
            .skipped_protected
            .iter()
            .any(|k| k == "OCTOCODE_STORAGE_MODE")
    );
    assert_eq!(out.env_value("OCTOCODE_STORAGE_MODE"), None);
}

#[test]
fn workspace_may_still_opt_out_of_storage_persistence() {
    let rc = resolve(Layers {
        global_rc: Some(r#"{"storage":{"mode":"persistent"}}"#),
        project_rc: Some(r#"{"storage":{"mode":"memory"}}"#),
        ..NONE
    });
    assert!(!is_persistent_storage_enabled(&rc.resolved));
    assert_eq!(protected_storage_diagnostics(&rc, "storage.mode"), 0);

    let env = resolve(Layers {
        global_env: Some("OCTOCODE_STORAGE_MODE=persistent"),
        project_env: Some("OCTOCODE_STORAGE_MODE= Memory "),
        ..NONE
    });
    assert!(!is_persistent_storage_enabled(&env.resolved));
    assert!(env.dotenv.skipped_protected.is_empty());
}

#[test]
fn classification_budgets_use_one_configuration_section() {
    let out = resolve(Layers {
        global_rc: Some(
            r#"{"classification":{"maxCandidates":20,"maxChars":8000,"timeoutMs":5000}}"#,
        ),
        project_rc: Some(r#"{"classification":{"maxCandidates":12}}"#),
        env: &[("OCTOCODE_CLASSIFICATION_MAX_CHARS", "9000")],
        ..NONE
    });
    assert_eq!(out.resolved.classification.max_candidates, 12);
    assert_eq!(out.resolved.classification.max_chars, 9000);
    assert_eq!(out.resolved.classification.timeout_ms, 5000);
}

#[test]
fn global_layers_still_set_storage_persistence() {
    let out = resolve(Layers {
        global_env: Some("OCTOCODE_STORAGE_MODE=memory"),
        global_rc: Some(r#"{"storage":{"mode":"persistent"}}"#),
        ..NONE
    });
    assert!(!is_persistent_storage_enabled(&out.resolved));
    assert!(out.dotenv.skipped_protected.is_empty());
    assert_eq!(protected_storage_diagnostics(&out, "storage.mode"), 0);
}

#[test]
fn unparseable_workspace_file_is_skipped_with_a_warning_and_global_applies() {
    for (label, text) in [("parse error", "{not json"), ("not an object", "[1,2]")] {
        let out = resolve(Layers {
            global_rc: Some(r#"{"network":{"timeout":6000}}"#),
            project_rc: Some(text),
            ..NONE
        });
        assert_eq!(out.resolved.network.timeout, 6000, "{label}");
        assert_eq!(out.source, ConfigSource::Invalid, "{label}");
        assert_eq!(
            out.project_config_path,
            Some(WORKSPACE_RC.into()),
            "{label}"
        );
        let warning = out
            .diagnostics
            .iter()
            .find(|d| d.code == "config_load_error")
            .unwrap_or_else(|| panic!("{label}: {:?}", out.diagnostics));
        assert_eq!(warning.severity, Severity::Warning, "{label}");
        let line = warning.to_string();
        assert!(line.contains(WORKSPACE_RC), "{label}: {line}");
        assert!(line.contains("whole file is ignored"), "{label}: {line}");
    }
}

#[test]
fn schema_error_drops_only_the_bad_field_and_keeps_the_rest_of_the_file() {
    let out = resolve(Layers {
        global_rc: Some(r#"{"local":{"allowedPaths":["/global"]}}"#),
        project_rc: Some(
            r#"{"network":{"timeout":7000,"maxRetries":"many"},"local":{"allowedPaths":["relative"]}}"#,
        ),
        ..NONE
    });
    assert_eq!(out.resolved.network.timeout, 7000, "valid sibling kept");
    assert_eq!(out.resolved.network.max_retries, 3, "bad field → default");
    assert_eq!(
        out.resolved.local.allowed_paths,
        vec!["/global".to_owned()],
        "bad workspace field falls through to the global file"
    );
    assert_eq!(out.source, ConfigSource::File);
    let fields: Vec<_> = out
        .diagnostics
        .iter()
        .filter(|d| d.code == "invalid_config")
        .map(|d| {
            assert_eq!(d.severity, Severity::Warning);
            assert_eq!(
                d.source_path.as_deref(),
                Some(std::path::Path::new(WORKSPACE_RC))
            );
            d.field_path.clone().unwrap_or_default()
        })
        .collect();
    let mut fields = fields;
    fields.sort();
    assert_eq!(fields, vec!["local.allowedPaths", "network.maxRetries"]);
    let line = out.diagnostics[0].to_string();
    assert!(
        line.starts_with("octocode: config warning: /synthetic/cwd/.octocode/.octocoderc: "),
        "{line}"
    );
    assert!(line.contains("value ignored"), "{line}");
}

#[test]
fn non_object_section_drops_that_section_only() {
    let out = resolve(Layers {
        project_rc: Some(r#"{"network":5,"output":{"format":"json"}}"#),
        ..NONE
    });
    assert_eq!(out.resolved.output.format, OutputFormat::Json);
    assert_eq!(out.resolved.network.timeout, 30000);
    assert!(
        out.diagnostics
            .iter()
            .any(|d| d.field_path.as_deref() == Some("network"))
    );
}

/// A number outside its contract range is clamped; the clamp is reported, so
/// a `REQUEST_TIMEOUT` below the floor is never silently raised.
#[test]
fn a_clamped_number_is_reported_with_its_given_and_used_values() {
    let out = resolve(Layers {
        env: &[("REQUEST_TIMEOUT", "2000"), ("MAX_RETRIES", "99")],
        ..NONE
    });
    assert_eq!(out.resolved.network.timeout, 5000);
    let clamp = |path: &str| {
        out.diagnostics
            .iter()
            .find(|d| d.code == "value_clamped" && d.field_path.as_deref() == Some(path))
            .unwrap_or_else(|| panic!("{path}: {:?}", out.diagnostics))
    };
    let timeout = clamp("network.timeout");
    assert_eq!(timeout.severity, Severity::Warning);
    assert!(
        timeout
            .message
            .contains("REQUEST_TIMEOUT 2000 is below the minimum 5000; using 5000"),
        "{}",
        timeout.message
    );
    assert!(
        clamp("network.maxRetries")
            .message
            .contains("above the maximum"),
    );
    // An in-range value reports nothing.
    let ok = resolve(Layers {
        env: &[("REQUEST_TIMEOUT", "6000")],
        ..NONE
    });
    assert!(ok.diagnostics.iter().all(|d| d.code != "value_clamped"));
}

/// `2e9` or `30s` is not a number a setting can take: it is reported and the
/// setting keeps its default, instead of reading as `2` or `30` and clamping.
#[test]
fn a_number_with_trailing_text_is_invalid_not_truncated() {
    let out = resolve(Layers {
        env: &[("REQUEST_TIMEOUT", "30s"), ("MAX_RETRIES", "2e9")],
        ..NONE
    });
    assert_eq!(out.resolved.network.timeout, 30000);
    assert_eq!(out.resolved.network.max_retries, 3);
    for path in ["network.timeout", "network.maxRetries"] {
        assert!(
            out.diagnostics
                .iter()
                .any(|d| d.code == "invalid_env_value" && d.field_path.as_deref() == Some(path)),
            "{path}: {:?}",
            out.diagnostics
        );
    }
    assert!(out.diagnostics.iter().all(|d| d.code != "value_clamped"));
}

#[test]
fn invalid_environment_values_warn_with_their_source_and_never_the_value() {
    let out = resolve(Layers {
        env: &[("REQUEST_TIMEOUT", "private-abc")],
        project_env: Some("OCTOCODE_GITHUB_GRAPHQL=private-maybe"),
        global_env: Some("OCTOCODE_OUTPUT_FORMAT=private-xml"),
        global_rc: Some(r#"{"network":{"timeout":6000}}"#),
        ..NONE
    });
    assert_eq!(
        out.resolved.network.timeout, 6000,
        "invalid env falls to file"
    );
    let by_field = |path: &str| {
        out.diagnostics
            .iter()
            .find(|d| d.code == "invalid_env_value" && d.field_path.as_deref() == Some(path))
            .unwrap_or_else(|| panic!("{path}: {:?}", out.diagnostics))
    };
    let timeout = by_field("network.timeout");
    assert_eq!(timeout.source_path, None);
    assert!(
        timeout
            .message
            .contains("REQUEST_TIMEOUT (process environment)")
    );
    assert!(timeout.message.contains("integer"));
    assert_eq!(
        by_field("github.graphqlEnabled").source_path,
        Some("/synthetic/cwd/.octocode/.env".into())
    );
    assert_eq!(
        by_field("output.format").source_path,
        Some("/synthetic/.octocode/.env".into())
    );
    for d in &out.diagnostics {
        assert_eq!(d.severity, Severity::Warning);
        assert!(!d.to_string().contains("private-"), "value leaked: {d}");
    }
}

#[test]
fn blank_environment_values_fall_back_silently() {
    let out = resolve(Layers {
        env: &[("REQUEST_TIMEOUT", "  ")],
        ..NONE
    });
    assert!(out.diagnostics.is_empty(), "{:?}", out.diagnostics);
}

#[test]
fn diagnostics_are_never_errors_for_any_file_misconfiguration() {
    for text in [
        "{",
        "[]",
        "null",
        r#"{"version":"x"}"#,
        r#"{"network":{"timeout":1.5}}"#,
        r#"{"storage":{"mode":"disk"}}"#,
    ] {
        for out in [
            resolve(Layers {
                project_rc: Some(text),
                ..NONE
            }),
            resolve(Layers {
                global_rc: Some(text),
                ..NONE
            }),
        ] {
            assert!(
                out.diagnostics
                    .iter()
                    .all(|d| d.severity == Severity::Warning),
                "{text}: {:?}",
                out.diagnostics
            );
            assert!(!out.diagnostics.is_empty(), "{text} must be reported");
        }
    }
}

#[test]
fn invalid_global_file_does_not_discard_a_valid_workspace_file() {
    let out = resolve(Layers {
        global_rc: Some("{broken"),
        project_rc: Some(r#"{"network":{"timeout":7000}}"#),
        ..NONE
    });
    assert_eq!(out.resolved.network.timeout, 7000);
    assert_eq!(out.source, ConfigSource::Invalid);
    assert!(
        out.diagnostics
            .iter()
            .any(|d| d.source_path.as_deref() == Some(std::path::Path::new(GLOBAL_RC)))
    );
}

#[test]
fn unreadable_workspace_file_reports_its_path() {
    let mut i = input(NONE);
    i.project_config_file = FileInput::Unreadable {
        path: WORKSPACE_RC.into(),
        kind: "permission denied".into(),
    };
    let out = resolve_config(&i);
    assert_eq!(out.source, ConfigSource::Invalid);
    assert_eq!(out.project_config_path, Some(WORKSPACE_RC.into()));
    assert!(out.diagnostics.iter().any(|d| d.code == "config_load_error"
        && d.severity == Severity::Warning
        && d.source_path.as_deref() == Some(std::path::Path::new(WORKSPACE_RC))));
}

#[test]
fn empty_workspace_file_is_valid_and_transparent() {
    let out = resolve(Layers {
        global_rc: Some(r#"{"network":{"timeout":6000}}"#),
        project_rc: Some("  \n"),
        ..NONE
    });
    assert_eq!(out.resolved.network.timeout, 6000);
    assert_eq!(out.source, ConfigSource::File);
    assert!(out.diagnostics.is_empty());
}

#[test]
fn unknown_keys_in_workspace_file_warn_with_its_path() {
    let out = resolve(Layers {
        project_rc: Some(r#"{"surprise":true}"#),
        ..NONE
    });
    assert!(
        out.diagnostics
            .iter()
            .any(|d| d.severity == Severity::Warning
                && d.source_path.as_deref() == Some(std::path::Path::new(WORKSPACE_RC)))
    );
}

#[test]
fn workspace_credential_beats_global_file_but_not_any_dotenv() {
    let global_rc = r#"{"classification":{"api":"from-global-rc"}}"#;
    let project_rc = r#"{"classification":{"api":"from-workspace-rc"}}"#;
    let out = resolve(Layers {
        global_rc: Some(global_rc),
        project_rc: Some(project_rc),
        ..NONE
    });
    assert_eq!(
        out.env_value("OCTOCODE_CLASSIFICATION_API"),
        Some("from-workspace-rc")
    );
    let out = resolve(Layers {
        global_rc: Some(global_rc),
        project_rc: Some(project_rc),
        global_env: Some("OCTOCODE_CLASSIFICATION_API=from-dotenv"),
        ..NONE
    });
    assert_ne!(
        out.env_value("OCTOCODE_CLASSIFICATION_API"),
        Some("from-workspace-rc"),
        "the global .env must beat the workspace file"
    );
    // Blank credential in the workspace file falls through to the global file.
    let out = resolve(Layers {
        global_rc: Some(global_rc),
        project_rc: Some(r#"{"classification":{"api":"  "}}"#),
        ..NONE
    });
    assert_eq!(
        out.env_value("OCTOCODE_CLASSIFICATION_API"),
        Some("from-global-rc")
    );
}

#[test]
fn blank_process_kill_switch_ignores_workspace_credential() {
    let out = resolve(Layers {
        env: &[("OCTOCODE_CLASSIFICATION_API", "")],
        project_rc: Some(r#"{"classification":{"api":"from-workspace-rc"}}"#),
        ..NONE
    });
    assert_eq!(out.env_value("OCTOCODE_CLASSIFICATION_API"), Some(""));
}

#[test]
fn workspace_credential_never_enters_resolved_config_or_inspector() {
    let i = input(Layers {
        project_rc: Some(r#"{"classification":{"api":"private-workspace-key"}}"#),
        ..NONE
    });
    let out = resolve_config(&i);
    let view = inspector_data(&i, &out);
    assert!(!format!("{:?}", out.resolved).contains("private-"));
    assert!(!format!("{out:?}").contains("private-"));
    let printed = serde_json::to_string(&view).expect("inspector serializes");
    assert!(!printed.contains("private-"));
    assert_eq!(view.project_config_keys, vec!["classification"]);
}

#[test]
fn inspector_reports_both_files_by_name_only() {
    let i = input(Layers {
        global_rc: Some(r#"{"storage":{"mode":"memory"},"github":{}}"#),
        project_rc: Some(r#"{"output":{},"network":{}}"#),
        ..NONE
    });
    let view = inspector_data(&i, &resolve_config(&i));
    assert_eq!(view.home, PathBuf::from(HOME));
    assert_eq!(view.config_keys, vec!["github", "storage"]);
    assert_eq!(view.config_path, Some(GLOBAL_RC.into()));
    assert_eq!(view.project_config_file, PathBuf::from(WORKSPACE_RC));
    assert_eq!(view.project_config_path, Some(WORKSPACE_RC.into()));
    assert_eq!(view.project_config_keys, vec!["network", "output"]);

    let absent = input(NONE);
    let view = inspector_data(&absent, &resolve_config(&absent));
    assert_eq!(view.project_config_file, PathBuf::from(WORKSPACE_RC));
    assert_eq!(view.project_config_path, None);
    assert!(view.project_config_keys.is_empty());
}

#[test]
fn workspace_eligibility_follows_the_workspace_dotenv_boundary() {
    for field in CONFIG_FIELDS.iter().filter(|field| field.file) {
        assert_eq!(
            super::resolver::workspace_file_allowed(field),
            !field.env.is_some_and(|b| PROTECTED_KEYS.contains(&b.name)),
            "{}",
            field.path
        );
    }
    let protected = ConfigFieldSpec {
        env: Some(ConfigEnvBinding {
            name: "PATH",
            normalize: None,
        }),
        ..CONFIG_FIELDS[1]
    };
    assert!(!super::resolver::workspace_file_allowed(&protected));
}

/// A valid file value for any field kind; for a field a workspace may narrow,
/// a value that widens it.
fn sample(field: &ConfigFieldSpec) -> serde_json::Value {
    use serde_json::json;
    let narrows_to = |value: &str| {
        field
            .env
            .is_some_and(|binding| WORKSPACE_NARROW_ONLY.contains(&(binding.name, value)))
    };
    match field.kind {
        ConfigFieldKind::Boolean => json!(!narrows_to("true")),
        ConfigFieldKind::Number => json!(field.minimum.unwrap_or(1.0) as i64),
        ConfigFieldKind::Url => json!("https://workspace.example"),
        ConfigFieldKind::Path => json!("/workspace-path"),
        ConfigFieldKind::String => json!("workspace-value"),
        ConfigFieldKind::StringArray => json!(["/workspace-path"]),
        ConfigFieldKind::Enum => json!(field.values[0]),
    }
}

#[test]
fn every_protected_field_is_ignored_in_workspace_but_honored_globally() {
    // Vacuous until the contract marks a file field's env binding
    // dotenv:"home"/"never"; then it enforces the boundary for each one.
    for field in CONFIG_FIELDS
        .iter()
        .filter(|field| field.file && !super::resolver::workspace_file_allowed(field))
    {
        let mut doc = serde_json::json!({});
        insert_path(&mut doc, field.path, sample(field));
        let text = doc.to_string();
        let workspace = resolve(Layers {
            project_rc: Some(&text),
            ..NONE
        });
        assert!(
            workspace
                .diagnostics
                .iter()
                .any(|d| d.code == "workspace_config_protected"
                    && d.field_path.as_deref() == Some(field.path)
                    && d.severity == Severity::Warning),
            "{}: {:?}",
            field.path,
            workspace.diagnostics
        );
        let global = resolve(Layers {
            global_rc: Some(&text),
            ..NONE
        });
        assert!(
            global
                .diagnostics
                .iter()
                .all(|d| d.code != "workspace_config_protected"),
            "{} must stay settable globally",
            field.path
        );
    }
}

#[test]
fn workspace_cannot_redirect_credentials_widen_the_sandbox_or_pick_executables() {
    // Security boundary: an untrusted checkout must not steer where tokens go,
    // what paths are readable, or which LSP config/executable runs — neither
    // through its `.octocode/.env` nor through its `.octocode/.octocoderc`.
    let out = resolve(Layers {
        project_env: Some(
            "GITHUB_API_URL=https://evil.example/api\nOCTOCODE_LSP_CONFIG=/repo/evil.json\nALLOWED_PATHS=/\nOCTOCODE_CLASSIFICATION_API_HOST=https://evil.example",
        ),
        project_rc: Some(
            r#"{"github":{"apiUrl":"https://evil.example/api"},"lsp":{"configPath":"/repo/evil.json"},"local":{"allowedPaths":["/"],"workspaceRoot":"/"},"classification":{"apiHost":"https://evil.example"}}"#,
        ),
        ..NONE
    });
    for key in [
        "GITHUB_API_URL",
        "OCTOCODE_LSP_CONFIG",
        "ALLOWED_PATHS",
        "OCTOCODE_CLASSIFICATION_API_HOST",
    ] {
        assert!(
            out.dotenv.skipped_protected.iter().any(|k| k == key),
            "{key}"
        );
        assert_eq!(
            out.env_value(key),
            None,
            "{key} leaked into the effective env"
        );
    }
    assert_eq!(out.resolved.github.api_url, "https://api.github.com");
    assert_eq!(out.resolved.lsp.config_path, None);
    assert!(out.resolved.local.allowed_paths.is_empty());
    assert_eq!(out.resolved.local.workspace_root, None);
    for field in [
        "github.apiUrl",
        "lsp.configPath",
        "local.allowedPaths",
        "local.workspaceRoot",
        "classification.apiHost",
    ] {
        assert!(
            out.diagnostics
                .iter()
                .any(|d| d.code == "workspace_config_protected"
                    && d.field_path.as_deref() == Some(field)),
            "{field}: {:?}",
            out.diagnostics
        );
    }
    // The same values stay honored from the trusted home layers.
    let home = resolve(Layers {
        global_env: Some("GITHUB_API_URL=https://ghe.example/api/v3"),
        global_rc: Some(r#"{"local":{"allowedPaths":["/shared"]}}"#),
        ..NONE
    });
    assert_eq!(home.resolved.github.api_url, "https://ghe.example/api/v3");
    assert_eq!(
        home.resolved.local.allowed_paths,
        vec!["/shared".to_owned()]
    );
}

/// The astRewrite state directory holds the journals a later apply replays,
/// so a checkout's `.env` must not choose it; the home layers and the process
/// environment may.
#[test]
fn only_trusted_layers_choose_the_ast_rewrite_state_dir() {
    const KEY: &str = "OCTOCODE_AST_REWRITE_STATE_DIR";
    let workspace = resolve(Layers {
        project_env: Some("OCTOCODE_AST_REWRITE_STATE_DIR=/repo/state"),
        ..NONE
    });
    assert!(workspace.dotenv.skipped_protected.iter().any(|k| k == KEY));
    assert_eq!(workspace.env_value(KEY), None);
    let home = resolve(Layers {
        global_env: Some("OCTOCODE_AST_REWRITE_STATE_DIR=/home/state"),
        ..NONE
    });
    assert_eq!(home.env_value(KEY), Some("/home/state"));
    let process = resolve(Layers {
        env: &[(KEY, "/process/state")],
        ..NONE
    });
    assert_eq!(process.env_value(KEY), Some("/process/state"));
}

#[test]
fn remove_path_strips_nested_and_top_level_fields_only_when_present() {
    let mut value = serde_json::json!({"a":{"b":{"c":1,"d":2}},"top":3});
    assert!(super::resolver::remove_path(&mut value, "a.b.c"));
    assert!(super::resolver::remove_path(&mut value, "top"));
    assert!(!super::resolver::remove_path(&mut value, "a.b.missing"));
    assert!(!super::resolver::remove_path(&mut value, "x.y"));
    assert_eq!(value, serde_json::json!({"a":{"b":{"d":2}}}));
}

// ─── acquisition (real filesystem) ───────────────────────────────────────────

fn acquire(env: &[(&str, String)], cwd: PathBuf, os_home: PathBuf) -> ConfigInput {
    acquire_config_input(
        env.iter()
            .map(|(k, v)| ((*k).to_owned(), v.clone()))
            .collect(),
        cwd,
        os_home,
        RuntimeSurface::Cli,
    )
}

#[test]
fn acquisition_reads_workspace_file_from_cwd_dot_octocode() {
    let root = tempfile::tempdir().expect("create temp dir");
    let (os_home, cwd) = (root.path().join("user"), root.path().join("repo"));
    fs::create_dir_all(os_home.join(".octocode")).expect("home");
    fs::create_dir_all(cwd.join(".octocode")).expect("workspace");
    fs::write(
        os_home.join(".octocode/.octocoderc"),
        r#"{"network":{"timeout":7000,"maxRetries":1}}"#,
    )
    .expect("global rc");
    fs::write(
        cwd.join(".octocode/.octocoderc"),
        "{\n  // workspace override\n  \"network\": { \"timeout\": 6000, },\n}\n",
    )
    .expect("workspace rc");
    let i = acquire(&[], cwd.clone(), os_home);
    assert_eq!(
        i.project_config_file.path(),
        &cwd.join(".octocode/.octocoderc")
    );
    let out = resolve_config(&i);
    assert_eq!(out.resolved.network.timeout, 6000);
    assert_eq!(out.resolved.network.max_retries, 1);
}

#[test]
fn acquisition_never_reads_the_global_file_twice_when_cwd_is_home() {
    let root = tempfile::tempdir().expect("create temp dir");
    let os_home = root.path().join("user");
    fs::create_dir_all(os_home.join(".octocode")).expect("home");
    fs::write(os_home.join(".octocode/.octocoderc"), "{broken").expect("rc");
    // Default home: cwd = OS home makes <cwd>/.octocode the Octocode home.
    let i = acquire(&[], os_home.clone(), os_home.clone());
    assert!(matches!(i.project_config_file, FileInput::Missing { .. }));
    let out = resolve_config(&i);
    assert_eq!(
        out.diagnostics
            .iter()
            .filter(|d| d.code == "config_load_error")
            .count(),
        1,
        "one broken file must yield one error: {:?}",
        out.diagnostics
    );
    // OCTOCODE_HOME spelled differently but pointing at the same directory.
    let repo = root.path().join("repo");
    fs::create_dir_all(repo.join(".octocode")).expect("workspace");
    let i = acquire(
        &[(
            "OCTOCODE_HOME",
            repo.join("sub/../.octocode").to_string_lossy().into_owned(),
        )],
        repo,
        os_home,
    );
    assert!(matches!(i.project_config_file, FileInput::Missing { .. }));
}

// ─── 2026-10-14 config hardening (R03/R09/R19–R30, removed settings) ─────────

fn value_of(out: &ConfigOutput, path: &str) -> serde_json::Value {
    super::get_config_value(&out.resolved, path).unwrap_or(serde_json::Value::Null)
}

fn has_diagnostic(out: &ConfigOutput, code: &str, path: &str) -> bool {
    out.diagnostics
        .iter()
        .any(|d| d.code == code && d.field_path.as_deref() == Some(path))
}

/// `lsp.maxMemoryMb` is a non-negative integer: the same value means the same
/// thing from a file or the environment, `0` (cap disabled) is distinct from
/// unset (host-derived cap), and malformed values are reported, never coerced.
#[test]
fn lsp_memory_cap_is_a_typed_integer_from_file_and_env_alike() {
    use serde_json::json;
    let path = "lsp.maxMemoryMb";
    assert_eq!(value_of(&resolve(NONE), path), serde_json::Value::Null);
    for (raw, expected) in [("512", json!(512)), ("0", json!(0)), (" 7 ", json!(7))] {
        let env = resolve(Layers {
            global_env: Some(&format!("OCTOCODE_LSP_MAX_MEMORY_MB={raw}")),
            ..NONE
        });
        assert_eq!(value_of(&env, path), expected, "env {raw:?}");
        assert!(env.diagnostics.is_empty(), "{raw:?}: {:?}", env.diagnostics);
        let file = resolve(Layers {
            global_rc: Some(&format!(r#"{{"lsp":{{"maxMemoryMb":{}}}}}"#, raw.trim())),
            ..NONE
        });
        assert_eq!(value_of(&file, path), expected, "file {raw:?}");
        assert!(
            file.diagnostics.is_empty(),
            "{raw:?}: {:?}",
            file.diagnostics
        );
    }
    for raw in ["abc", "-5", "1.5", "99999999999999999999"] {
        let env = resolve(Layers {
            env: &[("OCTOCODE_LSP_MAX_MEMORY_MB", raw)],
            ..NONE
        });
        assert_eq!(value_of(&env, path), serde_json::Value::Null, "env {raw}");
        assert!(
            has_diagnostic(&env, "invalid_env_value", path),
            "env {raw}: {:?}",
            env.diagnostics
        );
    }
    for raw in [r#""abc""#, "-5", "1.5", "99999999999999999999"] {
        let file = resolve(Layers {
            global_rc: Some(&format!(r#"{{"lsp":{{"maxMemoryMb":{raw}}}}}"#)),
            ..NONE
        });
        assert_eq!(value_of(&file, path), serde_json::Value::Null, "file {raw}");
        assert!(
            has_diagnostic(&file, "invalid_config", path),
            "file {raw}: {:?}",
            file.diagnostics
        );
    }
}

/// A fractional number is not an integer setting, from either layer.
#[test]
fn fractional_numbers_are_rejected_in_files_like_in_the_environment() {
    let file = resolve(Layers {
        global_rc: Some(r#"{"network":{"maxRetries":2.5,"timeout":6000.0}}"#),
        ..NONE
    });
    assert_eq!(value_of(&file, "network.maxRetries"), serde_json::json!(3));
    assert_eq!(value_of(&file, "network.timeout"), serde_json::json!(6000));
    assert!(has_diagnostic(
        &file,
        "invalid_config",
        "network.maxRetries"
    ));
    assert!(!has_diagnostic(&file, "invalid_config", "network.timeout"));
}

/// A negative value is not a member of a non-negative integer setting: it is
/// reported and ignored, not clamped to the minimum.
#[test]
fn negative_environment_numbers_are_invalid_not_clamped() {
    let out = resolve(Layers {
        env: &[("MAX_RETRIES", "-1")],
        global_rc: Some(r#"{"network":{"maxRetries":2}}"#),
        ..NONE
    });
    assert_eq!(value_of(&out, "network.maxRetries"), serde_json::json!(2));
    assert!(has_diagnostic(
        &out,
        "invalid_env_value",
        "network.maxRetries"
    ));
    assert!(out.diagnostics.iter().all(|d| d.code != "value_clamped"));
}

/// `~` and `~/x` expand once, at resolution, against the OS home the path
/// policy uses — from the environment and from a file.
#[test]
fn home_relative_paths_expand_at_resolution() {
    use serde_json::json;
    let env = resolve(Layers {
        global_env: Some(
            "ALLOWED_PATHS=~/allowed,~\nWORKSPACE_ROOT=~/work\nOCTOCODE_LSP_CACHE_DIR=~/lsp\nOCTOCODE_LSP_CONFIG=~/servers.json",
        ),
        ..NONE
    });
    let file = resolve(Layers {
        global_rc: Some(
            r#"{"local":{"allowedPaths":["~/allowed","~"],"workspaceRoot":"~/work"},"lsp":{"cacheDir":"~/lsp","configPath":"~/servers.json"}}"#,
        ),
        ..NONE
    });
    for out in [&env, &file] {
        assert_eq!(
            value_of(out, "local.allowedPaths"),
            json!(["/synthetic/allowed", "/synthetic"])
        );
        assert_eq!(
            value_of(out, "local.workspaceRoot"),
            json!("/synthetic/work")
        );
        assert_eq!(value_of(out, "lsp.cacheDir"), json!("/synthetic/lsp"));
        assert_eq!(
            value_of(out, "lsp.configPath"),
            json!("/synthetic/servers.json")
        );
        assert!(out.diagnostics.is_empty(), "{:?}", out.diagnostics);
    }
}

/// `lsp.configPath` follows the path rules: a relative value is reported and
/// ignored instead of resolving against whatever the process cwd is.
#[test]
fn a_relative_lsp_config_path_is_rejected_with_a_diagnostic() {
    let env = resolve(Layers {
        global_env: Some("OCTOCODE_LSP_CONFIG=servers.json"),
        ..NONE
    });
    assert_eq!(value_of(&env, "lsp.configPath"), serde_json::Value::Null);
    assert!(has_diagnostic(&env, "invalid_env_value", "lsp.configPath"));
    let file = resolve(Layers {
        global_rc: Some(r#"{"lsp":{"configPath":"servers.json"}}"#),
        ..NONE
    });
    assert_eq!(value_of(&file, "lsp.configPath"), serde_json::Value::Null);
    assert!(has_diagnostic(&file, "invalid_config", "lsp.configPath"));
}

/// When cwd is the OS home, `<cwd>/.octocode` is the Octocode home: its
/// `.env` is the home layer only, never re-read as a workspace layer.
#[test]
fn acquisition_never_reads_the_home_dotenv_as_a_workspace_layer() {
    let root = tempfile::tempdir().expect("create temp dir");
    let os_home = root.path().join("user");
    fs::create_dir_all(os_home.join(".octocode")).expect("home");
    fs::write(
        os_home.join(".octocode/.env"),
        "GH_TOKEN=synthetic-home-token\nOCTOCODE_LSP_CACHE_DIR=/home-lsp\n",
    )
    .expect("env");
    let i = acquire(&[], os_home.clone(), os_home);
    assert!(matches!(i.project_env, FileInput::Missing { .. }));
    let out = resolve_config(&i);
    assert_eq!(
        out.dotenv.sources.get("GH_TOKEN").map(String::as_str),
        Some("global")
    );
    assert_eq!(out.env_value("OCTOCODE_LSP_CACHE_DIR"), Some("/home-lsp"));
    assert!(out.credential_env().contains_key("GH_TOKEN"));
    assert!(!inspector_data(&i, &out).project_env_exists);
}

/// The OAuth client a login or refresh uses is home-trusted: a checked-out
/// repository cannot choose it.
#[test]
fn a_workspace_dotenv_cannot_choose_the_github_oauth_client() {
    const KEY: &str = "OCTOCODE_GITHUB_CLIENT_ID";
    let workspace = resolve(Layers {
        project_env: Some("OCTOCODE_GITHUB_CLIENT_ID=Iv1.workspace"),
        ..NONE
    });
    assert!(workspace.dotenv.skipped_protected.iter().any(|k| k == KEY));
    assert_eq!(workspace.env_value(KEY), None);
    let home = resolve(Layers {
        global_env: Some("OCTOCODE_GITHUB_CLIENT_ID=Iv1.home"),
        project_env: Some("OCTOCODE_GITHUB_CLIENT_ID=Iv1.workspace"),
        ..NONE
    });
    assert_eq!(home.env_value(KEY), Some("Iv1.home"));
    assert_eq!(home.dotenv.skipped_workspace_protected, vec![KEY]);
}

/// A tool name no tool has is reported (non-fatal), naming the entry and the
/// nearest valid name; known names report nothing.
#[test]
fn unknown_tool_names_warn_with_the_nearest_valid_name() {
    let out = resolve(Layers {
        env: &[("TOOLS_TO_RUN", "localSerch,localFetch")],
        global_rc: Some(
            r#"{"tools":{"disabled":["ghSearchCod"]},"mcp":{"deferred":["zzzzzzzz"]}}"#,
        ),
        ..NONE
    });
    let warning = |path: &str| {
        out.diagnostics
            .iter()
            .find(|d| d.code == "unknown_tool_name" && d.field_path.as_deref() == Some(path))
            .unwrap_or_else(|| panic!("{path}: {:?}", out.diagnostics))
    };
    let enabled = warning("tools.enabled");
    assert_eq!(enabled.severity, Severity::Warning);
    assert!(
        enabled.message.contains("\"localSerch\""),
        "{}",
        enabled.message
    );
    assert!(
        enabled.message.contains("did you mean \"localSearch\""),
        "{}",
        enabled.message
    );
    assert!(
        !enabled.message.contains("localFetch"),
        "{}",
        enabled.message
    );
    assert!(
        warning("tools.disabled")
            .message
            .contains("did you mean \"ghSearchCode\"")
    );
    let deferred = warning("mcp.deferred");
    assert!(deferred.message.contains("\"zzzzzzzz\""));
    assert!(
        !deferred.message.contains("did you mean"),
        "{}",
        deferred.message
    );
    let clean = resolve(Layers {
        env: &[("TOOLS_TO_RUN", "localSearch,ghSearchCode")],
        ..NONE
    });
    assert!(clean.diagnostics.is_empty(), "{:?}", clean.diagnostics);
}

/// The classification API root from the environment is validated with the
/// configuration: an invalid value is reported and ignored (the file value,
/// if any, applies), never left for the first provider call to discover.
#[test]
fn an_invalid_classification_api_host_env_value_is_reported_and_skipped() {
    let out = resolve(Layers {
        env: &[("OCTOCODE_CLASSIFICATION_API_HOST", "not-a-url")],
        global_rc: Some(r#"{"classification":{"apiHost":"https://jev.example"}}"#),
        ..NONE
    });
    assert!(has_diagnostic(
        &out,
        "invalid_env_value",
        "classification.apiHost"
    ));
    assert_eq!(
        out.env_value("OCTOCODE_CLASSIFICATION_API_HOST"),
        Some("https://jev.example")
    );
    for d in &out.diagnostics {
        assert!(!d.to_string().contains("not-a-url"), "{d}");
    }
    let valid = resolve(Layers {
        env: &[("OCTOCODE_CLASSIFICATION_API_HOST", "https://ok.example")],
        ..NONE
    });
    assert!(valid.diagnostics.is_empty(), "{:?}", valid.diagnostics);
}

/// A workspace `.env` value for a protected key is reported as skipped even
/// when the home `.env` sets the same key.
#[test]
fn a_dropped_workspace_protected_key_is_reported_when_home_also_sets_it() {
    let out = resolve(Layers {
        global_env: Some("OCTOCODE_STORAGE_MODE=memory"),
        project_env: Some("OCTOCODE_STORAGE_MODE=persistent"),
        ..NONE
    });
    assert_eq!(
        out.dotenv.skipped_workspace_protected,
        vec!["OCTOCODE_STORAGE_MODE"],
        "{:?}",
        out.dotenv
    );
    assert_eq!(value_of(&out, "storage.mode"), serde_json::json!("memory"));
    let view = inspector_data(
        &input(Layers {
            global_env: Some("OCTOCODE_STORAGE_MODE=memory"),
            project_env: Some("OCTOCODE_STORAGE_MODE=persistent"),
            ..NONE
        }),
        &out,
    );
    assert!(
        view.skipped_protected
            .iter()
            .any(|skip| skip.key == "OCTOCODE_STORAGE_MODE"
                && skip.source_path == std::path::Path::new("/synthetic/cwd/.octocode/.env"))
    );
}

/// A blank or invalid `OCTOCODE_OUTPUT_FORMAT` falls through to the files like
/// every other setting; it no longer resets a file's `json` to the default.
#[test]
fn an_invalid_output_format_env_value_falls_through_to_the_file() {
    for raw in ["", "xml"] {
        let out = resolve(Layers {
            env: &[("OCTOCODE_OUTPUT_FORMAT", raw)],
            global_rc: Some(r#"{"output":{"format":"json"}}"#),
            ..NONE
        });
        assert_eq!(
            value_of(&out, "output.format"),
            serde_json::json!("json"),
            "{raw:?}"
        );
    }
}

/// A workspace may narrow, never widen, what the home layers set for local
/// tools and email redaction.
#[test]
fn a_workspace_cannot_widen_local_tools_or_email_redaction() {
    let widened = resolve(Layers {
        global_rc: Some(r#"{"local":{"enabled":false},"output":{"redactEmails":true}}"#),
        project_env: Some("OCTOCODE_ENABLE_LOCAL=true\nOCTOCODE_REDACT_EMAILS=false"),
        project_rc: Some(r#"{"local":{"enabled":true},"output":{"redactEmails":false}}"#),
        ..NONE
    });
    assert_eq!(
        value_of(&widened, "local.enabled"),
        serde_json::json!(false)
    );
    assert_eq!(
        value_of(&widened, "output.redactEmails"),
        serde_json::json!(true)
    );
    for key in ["OCTOCODE_ENABLE_LOCAL", "OCTOCODE_REDACT_EMAILS"] {
        assert!(
            widened.dotenv.skipped_protected.iter().any(|k| k == key),
            "{key}"
        );
    }
    for path in ["local.enabled", "output.redactEmails"] {
        assert!(
            has_diagnostic(&widened, "workspace_config_protected", path),
            "{path}"
        );
    }
    let narrowed = resolve(Layers {
        project_env: Some("OCTOCODE_ENABLE_LOCAL=false\nOCTOCODE_REDACT_EMAILS=true"),
        ..NONE
    });
    assert_eq!(
        value_of(&narrowed, "local.enabled"),
        serde_json::json!(false)
    );
    assert_eq!(
        value_of(&narrowed, "output.redactEmails"),
        serde_json::json!(true)
    );
    assert!(narrowed.dotenv.skipped_protected.is_empty());
}

/// Removed settings are named as removed: no alias, no silent acceptance.
#[test]
fn removed_settings_are_reported_as_removed() {
    let file = resolve(Layers {
        global_rc: Some(
            r#"{"version":1,"classification":{"type":"jev"},"network":{"timeout":6000}}"#,
        ),
        ..NONE
    });
    for path in ["version", "classification.type"] {
        let d = file
            .diagnostics
            .iter()
            .find(|d| d.code == "removed_setting" && d.field_path.as_deref() == Some(path))
            .unwrap_or_else(|| panic!("{path}: {:?}", file.diagnostics));
        assert_eq!(d.severity, Severity::Warning);
        assert!(d.message.contains("removed"), "{}", d.message);
    }
    assert!(
        file.diagnostics
            .iter()
            .all(|d| d.code != UNKNOWN_CONFIG_CODE),
        "{:?}",
        file.diagnostics
    );
    assert_eq!(value_of(&file, "network.timeout"), serde_json::json!(6000));
    assert_eq!(value_of(&file, "version"), serde_json::Value::Null);
    assert_eq!(
        value_of(&file, "classification.type"),
        serde_json::Value::Null
    );
    let env = resolve(Layers {
        env: &[("OCTOCODE_CLASSIFICATION_TYPE", "jev")],
        ..NONE
    });
    let d = env
        .diagnostics
        .iter()
        .find(|d| d.code == "removed_setting")
        .unwrap_or_else(|| panic!("{:?}", env.diagnostics));
    assert!(
        d.message.contains("OCTOCODE_CLASSIFICATION_TYPE"),
        "{}",
        d.message
    );
    assert!(!d.message.contains("jev\""), "{}", d.message);
}

/// Every numeric setting is a cap (time, retries, size, spend): a workspace
/// `.octocoderc` may lower what the home file sets (else the default), never
/// raise it. A raise is dropped with a warning and the home value stands.
#[test]
fn a_workspace_file_may_only_lower_numeric_caps() {
    let numeric = CONFIG_FIELDS.iter().filter(|field| {
        field.file
            && field.kind == ConfigFieldKind::Number
            && super::resolver::workspace_file_allowed(field)
    });
    let mut checked = 0;
    for field in numeric {
        let (Some(minimum), Some(maximum)) = (field.minimum, field.maximum) else {
            continue;
        };
        let rc = |value: f64| {
            let mut doc = serde_json::json!({});
            insert_path(&mut doc, field.path, serde_json::json!(value as i64));
            doc.to_string()
        };
        let default: f64 = serde_json::from_str(field.default_json).expect("default");
        let number = |out: &ConfigOutput| value_of(out, field.path).as_f64();
        let raises = "workspace_config_raises_limit";
        // Above the default: dropped, the default stands.
        if default < maximum {
            let text = rc(maximum);
            let out = resolve(Layers {
                project_rc: Some(&text),
                ..NONE
            });
            assert_eq!(number(&out), Some(default), "{}", field.path);
            assert!(has_diagnostic(&out, raises, field.path), "{}", field.path);
        }
        // Below the default: applied, no warning.
        if default > minimum {
            let text = rc(minimum);
            let out = resolve(Layers {
                project_rc: Some(&text),
                ..NONE
            });
            assert_eq!(number(&out), Some(minimum), "{}", field.path);
            assert!(!has_diagnostic(&out, raises, field.path), "{}", field.path);
        }
        // Above the home file's value: the home value stands.
        if minimum < maximum {
            let (home, workspace) = (rc(minimum), rc(maximum));
            let out = resolve(Layers {
                global_rc: Some(&home),
                project_rc: Some(&workspace),
                ..NONE
            });
            assert_eq!(number(&out), Some(minimum), "{}", field.path);
            assert!(has_diagnostic(&out, raises, field.path), "{}", field.path);
        }
        checked += 1;
    }
    assert!(checked > 5, "the contract has numeric caps: {checked}");
}
