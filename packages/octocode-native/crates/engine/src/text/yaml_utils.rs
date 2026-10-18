use serde_json::{Map, Value};

/// YAML text as a JSON value: the one YAML reader. Only `true` and `false`
/// are booleans (YAML 1.2), so `y`, `no` or `on` stay strings as keys and as
/// values, exactly what `json_to_yaml_string_inner` writes plain.
///
/// # Errors
/// The parser's message when `text` is not valid YAML or not representable
/// as JSON.
pub fn yaml_to_json(text: &str) -> Result<Value, String> {
    serde_saphyr::from_str_with_options(text, serde_saphyr::options! { strict_booleans: true })
        .map_err(|error| error.to_string())
}

/// Convert a `serde_json::Value` into a YAML string.
///
/// Options:
///   - Keys can be sorted alphabetically (`sort_keys`)
///   - Priority keys appear first (`keys_priority`)
///   - Multiline strings → YAML block scalars (handled automatically by the serializer)
pub fn json_to_yaml_string_inner(json: Value, sort_keys: bool, priority_keys: &[String]) -> String {
    let ordered = order_keys(json, sort_keys, priority_keys);
    // `yaml_12` without the `%YAML` header keeps `yes`/`no`/dates plain, as
    // every response has always shown them. An unbounded fold width keeps long
    // single-line strings (paths, URLs, code lines) on one plain line; only a
    // newline selects a `|` block scalar.
    let options = serde_saphyr::ser_options! {
        yaml_12: true,
        no_lang_directive: true,
        folded_wrap_chars: usize::MAX,
    };
    match serde_saphyr::to_string_with_options(&ordered, options) {
        Ok(s) => s,
        Err(_) => "# YAML conversion failed\n".to_owned(),
    }
}

/// Reorder every object's keys. `serde_json` is built with `preserve_order`
/// (workspace manifest), so the order set here is the emitted order.
fn order_keys(json: Value, sort_keys: bool, priority: &[String]) -> Value {
    match json {
        Value::Object(map) => {
            let mut entries: Vec<(String, Value)> = map.into_iter().collect();
            if sort_keys || !priority.is_empty() {
                entries.sort_by(|(a, _), (b, _)| {
                    let ai = priority.iter().position(|k| k == a);
                    let bi = priority.iter().position(|k| k == b);
                    match (ai, bi) {
                        (Some(x), Some(y)) => x.cmp(&y),
                        (Some(_), None) => std::cmp::Ordering::Less,
                        (None, Some(_)) => std::cmp::Ordering::Greater,
                        (None, None) => {
                            if sort_keys {
                                a.cmp(b)
                            } else {
                                std::cmp::Ordering::Equal
                            }
                        }
                    }
                });
            }
            Value::Object(
                entries
                    .into_iter()
                    .map(|(key, val)| (key, order_keys(val, sort_keys, priority)))
                    .collect::<Map<_, _>>(),
            )
        }
        Value::Array(arr) => Value::Array(
            arr.into_iter()
                .map(|v| order_keys(v, sort_keys, priority))
                .collect(),
        ),
        scalar => scalar,
    }
}

// ── Tests ────────────────────────────────────────────────────────────────────
#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn emit(v: serde_json::Value) -> String {
        json_to_yaml_string_inner(v, false, &[])
    }

    #[test]
    fn keys_sorted_when_sort_keys_enabled() {
        let out = json_to_yaml_string_inner(json!({"z": 1, "a": 2}), true, &[]);
        let a = out.find("a:").expect("a key present");
        let z = out.find("z:").expect("z key present");
        assert!(a < z);
    }

    #[test]
    fn priority_keys_emitted_first() {
        let out = json_to_yaml_string_inner(
            json!({"c": 3, "a": 1, "b": 2}),
            false,
            &["b".to_owned(), "c".to_owned()],
        );
        let b = out.find("b:").expect("b present");
        let c = out.find("c:").expect("c present");
        let a = out.find("a:").expect("a present");
        assert!(b < c && c < a);
    }

    #[test]
    fn multiline_strings_use_block_scalars_with_sorted_keys() {
        let out = json_to_yaml_string_inner(
            json!({"z": "last", "a": "first\nsecond line", "b": 42, "c": true}),
            true,
            &[],
        );
        let a = out.find("a:").expect("a");
        let b = out.find("b:").expect("b");
        let c = out.find("c:").expect("c");
        let z = out.find("z:").expect("z");
        assert!(a < b && b < c && c < z, "keys not sorted: {out}");
        assert!(
            out.contains("|-"),
            "multiline must use a block scalar: {out}"
        );
    }

    /// Emission contract of every MCP tool response, first captured from
    /// serde_yaml 0.9. Plain scalars, block scalars, indentation, sequence
    /// layout and number formats are byte-identical to that output. The one
    /// difference is the quote style of strings that need quoting: serde-saphyr
    /// has no single-quote choice, so it writes `"true"` where serde_yaml wrote
    /// `'true'`. Both decode to the same string, and the round-trip check below
    /// proves every quoted case.
    #[test]
    fn emission_contract_locked_across_serializer_changes() {
        assert_eq!(emit(json!({"v": "no"})), "v: no\n");
        assert_eq!(emit(json!({"v": "true"})), "v: \"true\"\n");
        assert_eq!(emit(json!({"v": "123"})), "v: \"123\"\n");
        assert_eq!(emit(json!({"v": "null"})), "v: \"null\"\n");
        assert_eq!(emit(json!({"v": ""})), "v: \"\"\n");
        assert_eq!(emit(json!({"v": "a: b"})), "v: \"a: b\"\n");
        assert_eq!(emit(json!({"v": "- item"})), "v: \"- item\"\n");
        assert_eq!(emit(json!({"v": "#comment"})), "v: \"#comment\"\n");
        assert_eq!(
            emit(json!({"v": "line1\nline2"})),
            "v: |-\n  line1\n  line2\n"
        );
        assert_eq!(
            emit(json!({"v": "line1\nline2\n"})),
            "v: |\n  line1\n  line2\n"
        );
        assert_eq!(
            emit(json!({"v": "café ünïcode 中文"})),
            "v: café ünïcode 中文\n"
        );
        assert_eq!(emit(json!({"n": 1.5})), "n: 1.5\n");
        assert_eq!(emit(json!({"n": 0})), "n: 0\n");
        assert_eq!(
            emit(json!({"a": [1, "x"], "b": {"c": null}})),
            "a:\n- 1\n- x\nb:\n  c: null\n"
        );
        assert_eq!(emit(json!({"a": [], "b": {}})), "a: []\nb: {}\n");
    }

    /// A long single-line string stays on one plain line (no `>` folding), so
    /// paths, URLs and code lines are never re-wrapped.
    #[test]
    fn long_single_line_strings_are_not_folded() {
        let long = format!("/very/long/path with spaces/{}", "segment".repeat(30));
        assert_eq!(emit(json!({"v": long.clone()})), format!("v: {long}\n"));
        let multi = format!("{long}\nsecond");
        assert_eq!(
            emit(json!({"v": multi})),
            format!("v: |-\n  {long}\n  second\n")
        );
    }

    /// YAML 1.1 boolean words are strings, as mapping keys and as values;
    /// only `true`/`false` are booleans.
    #[test]
    fn yaml_1_1_boolean_words_read_as_strings() {
        let value =
            yaml_to_json("y: 1\nno: 2\non: x\nenabled: yes\nflag: true\n").expect("valid yaml");
        assert_eq!(
            value,
            json!({"y": 1, "no": 2, "on": "x", "enabled": "yes", "flag": true})
        );
    }

    /// Whatever the quoting, the emitted YAML decodes to the input value.
    #[test]
    fn emitted_yaml_round_trips_to_the_input() {
        let samples = [
            "true",
            "123",
            "null",
            "",
            "a: b",
            "- item",
            "#comment",
            "~",
            "0x1F",
            "1e3",
            ".5",
            "@at",
            "trailing ",
            " leading",
            "a #b",
            "a:",
            "?",
            "---",
            "[x]",
            "{x}",
            "*a",
            "&a",
            "!t",
            "|x",
            ">x",
            "%x",
            "'single'",
            "say \"hi\"",
            "back\\slash",
            "tab\there",
            "line1\nline2",
            "line1\n\n",
            "  lead\nx",
            "\u{2028}x",
            "é 中文 😀",
            "no",
            "y",
            "yes",
            "on",
            "Off",
        ];
        for sample in samples {
            let value = json!({"k": sample, "l": [sample], sample: 1});
            let yaml = json_to_yaml_string_inner(value.clone(), false, &[]);
            let back = yaml_to_json(&yaml).unwrap_or_else(|e| panic!("{sample:?}: {e}\n{yaml}"));
            assert_eq!(back, value, "{sample:?} via\n{yaml}");
        }
    }
}
