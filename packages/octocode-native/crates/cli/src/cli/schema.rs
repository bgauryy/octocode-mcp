//! `schema` and the input section of `<tool> --help`, served from the
//! embedded CLI presentation (`octocode-config` projects it from the same
//! core contract MCP uses). Only runtime availability is joined here: the
//! catalog lists enabled tools, a tool's clasify handoff joins its
//! description when clasify is enabled, clasify uses the rendering for the
//! enabled context tools, and per-tool views carry `availability` and `run`.
use serde_json::{Value, json};

/// A usage error (exit 2) or an execution error (exit 5).
#[derive(Debug)]
pub(super) struct SchemaError {
    pub message: String,
    pub exit: u8,
}

fn usage(message: impl Into<String>) -> SchemaError {
    SchemaError {
        message: message.into(),
        exit: 2,
    }
}

fn presentation() -> Result<&'static Value, SchemaError> {
    octocode_native::contracts::cli_presentation().map_err(|error| SchemaError {
        message: format!("Embedded CLI presentation is invalid: {error}"),
        exit: 5,
    })
}

fn tools(presentation: &Value) -> impl Iterator<Item = &Value> {
    presentation["tools"].as_array().into_iter().flatten()
}

fn machine_entry<'a>(machine: &'a Value, name: &str) -> Option<&'a Value> {
    machine["tools"]
        .as_array()?
        .iter()
        .find(|tool| tool["name"] == name)
}

fn enabled(machine: &Value, name: &str) -> bool {
    machine_entry(machine, name).is_some_and(|tool| tool["availability"]["enabled"] == true)
}

/// `octocode schema`: instructions, the grammar inventory, and every enabled
/// tool with its compact field list.
pub(super) fn catalog(machine: &Value) -> Result<Value, SchemaError> {
    let presentation = presentation()?;
    let listed: Vec<Value> = tools(presentation)
        .filter_map(|tool| {
            let name = tool["name"].as_str()?;
            let entry = machine_entry(machine, name).filter(|_| enabled(machine, name))?;
            Some(json!({
                "name": name,
                "description": tool["shortDescription"],
                "fields": entry.get("fields").cloned().unwrap_or_else(|| json!("[]")),
            }))
        })
        .collect();
    let mut value = json!({
        "kind": "octocode.toolCatalog",
        "version": 1,
        "toolCount": listed.len(),
        "commands": {
            "run": "octocode <tool> '<json>' (or --input FILE|-)",
            "query": "octocode schema <tool> --view query [--select FIELD=VALUE]",
            "variants": "octocode schema <tool> --view variants",
            "full": "octocode schema <tool>",
            // First-run setup an agent cannot discover from the tool list.
            "setup": {
                "auth": "octocode auth status (login: octocode auth login)",
                "mcp": "octocode install --ide <id> (ids: octocode install --list)",
                "skills": "octocode skill install --all --platform <claude|codex|cursor|...> --global",
                "graph": "octocode graph --help",
            },
        },
        "instructions": presentation["instructions"],
    });
    if let Some(grammars) = grammar_instruction(&machine["grammarCapabilities"]) {
        value["grammars"] = Value::String(grammars);
    }
    value["tools"] = Value::Array(listed);
    Ok(value)
}

/// `octocode schema <tool> [--view] [--select]`.
pub(super) fn tool_view(
    machine: &Value,
    name: &str,
    view: Option<&str>,
    select: Option<&str>,
) -> Result<Value, SchemaError> {
    let presentation = presentation()?;
    let Some(tool) = tools(presentation).find(|tool| tool["name"] == name) else {
        let known = tools(presentation)
            .filter_map(|tool| tool["name"].as_str())
            .filter(|tool| enabled(machine, tool))
            .collect::<Vec<_>>()
            .join(", ");
        return Err(usage(format!("Unknown tool: {name}. Known tools: {known}")));
    };
    let view = view.unwrap_or("full");
    let (source, narrow) = rendering(presentation, tool, machine);
    let mut value = match select {
        None => source["views"][view].clone(),
        Some(_) if view != "query" => {
            return Err(usage("--select requires --view query and a tool name"));
        }
        Some(selection) => selected(tool, source, selection)?.clone(),
    };
    if let Some(enabled_tools) = narrow {
        narrow_tool_enums(&mut value, &enabled_tools);
    }
    if let (true, Some(handoff), Some(description)) = (
        enabled(machine, "clasify"),
        tool["handoff"].as_str(),
        value["description"].as_str(),
    ) {
        value["description"] = Value::String(format!("{description} {handoff}"));
    }
    value["availability"] = machine_entry(machine, name)
        .map(|entry| entry["availability"].clone())
        .unwrap_or_else(|| json!({ "enabled": false }));
    value["run"] = Value::String(format!("octocode {name} '<json>'"));
    Ok(value)
}

/// The views and selections to serve. clasify carries one rendering per
/// pre-rendered set of context tools: an exact match is served as is; any
/// other set uses the smallest superset, narrowed to the enabled tools.
fn rendering<'a>(
    presentation: &'a Value,
    tool: &'a Value,
    machine: &Value,
) -> (&'a Value, Option<Vec<&'a str>>) {
    let Some(renderings) = tool["renderings"].as_array() else {
        return (tool, None);
    };
    let enabled_tools: Vec<&str> = presentation["clasifyContextTools"]
        .as_array()
        .into_iter()
        .flatten()
        .filter_map(Value::as_str)
        .filter(|name| enabled(machine, name))
        .collect();
    let tools_of = |candidate: &'a Value| -> Vec<&'a str> {
        candidate["contextTools"]
            .as_array()
            .into_iter()
            .flatten()
            .filter_map(Value::as_str)
            .collect()
    };
    if let Some(exact) = renderings
        .iter()
        .find(|candidate| tools_of(candidate) == enabled_tools)
    {
        return (exact, None);
    }
    let superset = renderings
        .iter()
        .filter(|candidate| {
            let tools = tools_of(candidate);
            enabled_tools.iter().all(|name| tools.contains(name))
        })
        .min_by_key(|candidate| tools_of(candidate).len())
        .or_else(|| renderings.last())
        .unwrap_or(tool);
    (superset, Some(enabled_tools))
}

/// Keep only enabled tools in every `tool` enum that names context tools.
fn narrow_tool_enums(value: &mut Value, enabled_tools: &[&str]) {
    match value {
        Value::Object(map) => {
            for (key, child) in map.iter_mut() {
                if key == "tool"
                    && let Some(items) = child.get_mut("enum").and_then(Value::as_array_mut)
                {
                    items.retain(|item| {
                        item.as_str()
                            .is_some_and(|name| enabled_tools.contains(&name))
                    });
                    continue;
                }
                narrow_tool_enums(child, enabled_tools);
            }
        }
        Value::Array(items) => {
            for item in items {
                narrow_tool_enums(item, enabled_tools);
            }
        }
        _ => {}
    }
}

/// The rendered `--select FIELD=VALUE` view, keyed like the generator: a
/// string value bare, any other JSON value as JSON text.
fn selected<'a>(
    tool: &Value,
    source: &'a Value,
    selection: &str,
) -> Result<&'a Value, SchemaError> {
    let (field, raw) = selection.split_once('=').unwrap_or(("", ""));
    if field.trim().is_empty() || raw.trim().is_empty() {
        return Err(usage("--select expects FIELD=VALUE, e.g. operation=code"));
    }
    let value =
        serde_json::from_str::<Value>(raw).unwrap_or_else(|_| Value::String(raw.to_owned()));
    let key = match &value {
        Value::String(text) => format!("{field}={text}"),
        other => format!("{field}={other}"),
    };
    let variants: Vec<&str> = tool["variantNames"]
        .as_array()
        .into_iter()
        .flatten()
        .filter_map(Value::as_str)
        .collect();
    if field == "variant" && !value.as_str().is_some_and(|name| variants.contains(&name)) {
        let shown = value
            .as_str()
            .map_or_else(|| value.to_string(), str::to_owned);
        return Err(usage(format!(
            "Unknown variant: {shown}. Known variants: {}",
            variants.join(", ")
        )));
    }
    source["selections"].get(&key).ok_or_else(|| {
        usage(format!(
            "--select \"{selection}\" matched 0 top-level oneOf/anyOf branches; choose a variant name or const/enum field value identifying a branch in --view query."
        ))
    })
}

/// The input section printed after clap's help for `<tool> --help`.
pub(super) fn tool_help(name: &str) -> Option<&'static str> {
    let presentation = octocode_native::contracts::cli_presentation().ok()?;
    tools(presentation)
        .find(|tool| tool["name"] == name)?
        .get("help")?
        .as_str()
}

/// The runtime grammar inventory line, stating the common feature set once.
fn grammar_instruction(capabilities: &Value) -> Option<String> {
    let structural: Vec<&Value> = capabilities
        .as_array()?
        .iter()
        .filter(|capability| {
            capability["structuralSearch"] == true
                && capability["extensions"]
                    .as_array()
                    .is_some_and(|extensions| !extensions.is_empty())
        })
        .collect();
    if structural.is_empty() {
        return None;
    }
    let features_of = |capability: &Value| {
        let mut features = vec!["structural"];
        if capability["signatureOutline"] == true {
            features.push("outline");
        }
        if capability["graphFacts"] == true {
            features.push("graph");
        }
        features.join("+")
    };
    // Most common feature set; the first one seen wins a tie.
    let mut counts: Vec<(String, usize)> = Vec::new();
    for capability in &structural {
        let features = features_of(capability);
        match counts.iter_mut().find(|(seen, _)| *seen == features) {
            Some((_, count)) => *count += 1,
            None => counts.push((features, 1)),
        }
    }
    let mut common = &counts[0];
    for entry in &counts {
        if entry.1 > common.1 {
            common = entry;
        }
    }
    let common = common.0.clone();
    let strings = |value: &Value| -> Vec<String> {
        value
            .as_array()
            .into_iter()
            .flatten()
            .filter_map(Value::as_str)
            .map(str::to_owned)
            .collect()
    };
    let inventory = structural
        .iter()
        .map(|capability| {
            let mut ids: Vec<String> = capability["languageId"]
                .as_str()
                .filter(|id| !id.is_empty())
                .map(str::to_owned)
                .into_iter()
                .collect();
            ids.extend(strings(&capability["selectorAliases"]));
            let ids = ids.join(",");
            let extensions = strings(&capability["extensions"])
                .iter()
                .map(|extension| format!(".{extension}"))
                .collect::<Vec<_>>()
                .join(" ");
            let features = features_of(capability);
            let tag = if features == common {
                String::new()
            } else {
                format!("; {features}")
            };
            let ids = if ids.is_empty() {
                String::new()
            } else {
                format!("{ids}: ")
            };
            format!(
                "{} ({ids}{extensions}{tag})",
                capability["language"].as_str().unwrap_or_default()
            )
        })
        .collect::<Vec<_>>()
        .join("; ");
    Some(format!(
        "Runtime grammar inventory ({common} unless noted): {inventory}. Parser availability does not imply an installed language server or complete cross-file linking."
    ))
}

#[cfg(test)]
mod tests {
    use super::{catalog, grammar_instruction, narrow_tool_enums, tool_view};
    use serde_json::{Value, json};

    /// A machine catalog with every presentation tool enabled except `off`.
    fn machine(off: &[&str]) -> Value {
        let presentation = octocode_native::contracts::cli_presentation().expect("presentation");
        let tools: Vec<Value> = presentation["tools"]
            .as_array()
            .expect("tools")
            .iter()
            .map(|tool| {
                let name = tool["name"].as_str().expect("name");
                json!({ "name": name, "fields": "[]", "availability": { "enabled": !off.contains(&name) } })
            })
            .collect();
        json!({ "fingerprint": "f", "grammarCapabilities": [], "tools": tools })
    }

    fn message(result: Result<Value, super::SchemaError>) -> String {
        result.expect_err("an error").message
    }

    #[test]
    fn catalog_lists_only_enabled_tools() {
        let value = catalog(&machine(&["astRewrite", "clasify"])).expect("catalog");
        let names: Vec<&str> = value["tools"]
            .as_array()
            .expect("tools")
            .iter()
            .filter_map(|tool| tool["name"].as_str())
            .collect();
        assert!(names.contains(&"localSearch"));
        assert!(!names.contains(&"astRewrite") && !names.contains(&"clasify"));
        assert_eq!(value["toolCount"], names.len());
        assert!(
            value.get("grammars").is_none(),
            "no structural grammars, no line"
        );
    }

    #[test]
    fn handoff_joins_the_description_only_when_clasify_is_enabled() {
        let with = tool_view(&machine(&[]), "localSearch", Some("query"), None).expect("view");
        let without =
            tool_view(&machine(&["clasify"]), "localSearch", Some("query"), None).expect("view");
        let with = with["description"].as_str().expect("description");
        let without = without["description"].as_str().expect("description");
        assert!(with.starts_with(without) && with.len() > without.len());
        assert!(with.contains("clasify") && !without.contains("clasify"));
    }

    #[test]
    fn clasify_uses_the_rendering_for_the_enabled_context_tools() {
        let tool_enum = |off: &[&str]| -> Vec<String> {
            let view = tool_view(&machine(off), "clasify", Some("query"), None).expect("view");
            view["querySchema"]["properties"]["resources"]["items"]["anyOf"][1]["properties"]
                ["tool"]["enum"]
                .as_array()
                .expect("tool enum")
                .iter()
                .filter_map(Value::as_str)
                .map(str::to_owned)
                .collect()
        };
        // Exact renderings: beta off (default) and beta on.
        assert!(!tool_enum(&["astTopology", "astRewrite"]).contains(&"astTopology".to_owned()));
        assert!(tool_enum(&[]).contains(&"astTopology".to_owned()));
        // Any other set narrows the smallest superset rendering.
        let narrowed = tool_enum(&["astTopology", "astRewrite", "ghSearchCode"]);
        assert!(
            !narrowed.contains(&"ghSearchCode".to_owned())
                && narrowed.contains(&"localSearch".to_owned())
        );
    }

    #[test]
    fn selection_errors_match_core() {
        let m = machine(&[]);
        assert!(
            message(tool_view(&m, "lspSearch", Some("query"), Some("x")))
                .starts_with("--select expects FIELD=VALUE")
        );
        assert!(
            message(tool_view(
                &m,
                "lspSearch",
                Some("query"),
                Some("variant=nope")
            ))
            .starts_with("Unknown variant: nope. Known variants: anchored")
        );
        assert!(
            message(tool_view(
                &m,
                "lspSearch",
                Some("query"),
                Some("operation=nope")
            ))
            .contains("matched 0 top-level")
        );
        assert_eq!(
            message(tool_view(&m, "lspSearch", None, Some("operation=callers"))),
            "--select requires --view query and a tool name"
        );
        // A JSON-quoted string selects the same branch as the bare value.
        let bare =
            tool_view(&m, "astSearch", Some("query"), Some("operation=symbols")).expect("bare");
        let quoted = tool_view(
            &m,
            "astSearch",
            Some("query"),
            Some("operation=\"symbols\""),
        )
        .expect("quoted");
        assert_eq!(bare, quoted);
    }

    #[test]
    fn narrowing_keeps_only_enabled_tools_in_tool_enums() {
        let mut value =
            json!({ "a": { "tool": { "enum": ["x", "y", "z"] } }, "tool": { "type": "string" } });
        narrow_tool_enums(&mut value, &["x", "z"]);
        assert_eq!(value["a"]["tool"]["enum"], json!(["x", "z"]));
        assert_eq!(value["tool"], json!({ "type": "string" }));
    }

    #[test]
    fn grammar_line_states_the_common_feature_set_once() {
        let capabilities = json!([
            { "language": "TypeScript", "languageId": "typescript", "selectorAliases": [], "extensions": ["ts"], "structuralSearch": true, "signatureOutline": true, "graphFacts": true },
            { "language": "Go", "languageId": "go", "selectorAliases": [], "extensions": ["go"], "structuralSearch": true, "signatureOutline": true, "graphFacts": true },
            { "language": "Asm", "languageId": "asm", "selectorAliases": ["s"], "extensions": ["asm", "s"], "structuralSearch": true, "signatureOutline": false, "graphFacts": false },
            { "language": "Plain", "languageId": "plain", "selectorAliases": [], "extensions": [], "structuralSearch": true },
        ]);
        assert_eq!(
            grammar_instruction(&capabilities).expect("line"),
            "Runtime grammar inventory (structural+outline+graph unless noted): TypeScript (typescript: .ts); Go (go: .go); Asm (asm,s: .asm .s; structural). Parser availability does not imply an installed language server or complete cross-file linking."
        );
        assert!(grammar_instruction(&json!([])).is_none());
    }
}
