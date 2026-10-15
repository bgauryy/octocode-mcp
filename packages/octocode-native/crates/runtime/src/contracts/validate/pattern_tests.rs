use super::schema::{validate_input_schema, validate_schema};
use serde_json::{Value, json};

fn accepts_in_both_directions(schema: &Value, value: &Value, expected: bool) {
    for input in [true, false] {
        let mut candidate = value.clone();
        let before = serde_json::to_vec(&candidate).expect("JSON bytes");
        let result = if input {
            validate_input_schema(schema, schema, &mut candidate, &mut Vec::new())
        } else {
            validate_schema(schema, schema, &mut candidate, &mut Vec::new())
        };
        assert_eq!(
            result.is_ok(),
            expected,
            "input={input}, {value}: {result:?}"
        );
        assert_eq!(serde_json::to_vec(&candidate).expect("JSON bytes"), before);
    }
}

#[test]
fn canonical_word_classes_are_ecmascript_in_both_directions() {
    let schema = json!({"type":"string","pattern":r"^[\w.][\w.-]*$"});
    for owner in ["owner", "Owner_12", "a.b-c", ".owner"] {
        accepts_in_both_directions(&schema, &json!(owner), true);
    }
    for owner in ["é", "owneré", "Ω", "中", "𝒜", "😀", "１２"] {
        accepts_in_both_directions(&schema, &json!(owner), false);
    }
}

#[test]
fn canonical_whitespace_classes_distinguish_nel_from_bom() {
    for (pattern, whitespace) in [(r"^\s$", true), (r"^\S$", false)] {
        let schema = json!({"type":"string","pattern":pattern});
        for (text, is_space) in [
            (" ", true),
            ("\t", true),
            ("\n", true),
            ("\r", true),
            ("\u{a0}", true),
            ("\u{feff}", true),
            ("\u{85}", false),
            ("\u{200b}", false),
            ("x", false),
        ] {
            accepts_in_both_directions(&schema, &json!(text), is_space == whitespace);
        }
    }
}

#[test]
fn property_names_obey_the_same_ecmascript_pattern_contract() {
    let schema = json!({
        "type":"object",
        "propertyNames":{"type":"string","pattern":r"^\w+$"},
        "additionalProperties":{"type":"string"}
    });
    accepts_in_both_directions(&schema, &json!({"owner_1":"value"}), true);
    for key in ["é", "Ω", "中", "𝒜", "１２"] {
        accepts_in_both_directions(&schema, &json!({key:"value"}), false);
    }
}

#[test]
fn continuation_queries_reject_non_ecmascript_owners_without_mutating_output() {
    for (owner, accepted) in [("valid_owner", true), ("owneré", false), ("中", false)] {
        let mut output = json!({"results":[{"index":0,"data":{
            "path":"a.ts", "content":"x", "totalLines":1,
            "next":{"browse":{"tool":"ghStructure","query":{"queries":[{"owner":owner,"repo":"repo"}]}}}
        }}]});
        let before = serde_json::to_vec(&output).expect("wire bytes");
        let result = super::validate_output_in_place("localFetch", &mut output);
        assert_eq!(result.is_ok(), accepted, "{owner}: {result:?}");
        assert_eq!(serde_json::to_vec(&output).expect("wire bytes"), before);
    }
}
