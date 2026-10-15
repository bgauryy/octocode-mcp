//! Leaf fields a response hoists into `shared` when every row entry holds
//! the same value.
//!
//! `shared` holds two kinds of keys: entry keys (hoisted from every object
//! entry of every array under `data`) and [`ROW_FIELDS`] (stated once for
//! every row, such as the checked-out head). A field an entry schema of the
//! responding tool requires is never hoisted, so the returned JSON validates
//! as it is: the output contract checks exactly what a client receives.
use crate::tools::id::ToolId;
use serde_json::{Map, Value};
use std::collections::{BTreeSet, HashMap};

/// Row-level fields a response may state once in `shared`. They are never
/// hoisted from entries, so a shared key has exactly one origin.
pub(crate) const ROW_FIELDS: &[&str] = &["commitSha"];

fn can_share_field(tool: ToolId, key: &str, value: &Value) -> bool {
    const EXCLUDED: &[&str] = &[
        "path",
        // A row's file, like its path, says what the row is about: it stays
        // on every row so no row is read against a trailing `shared` map.
        "file",
        "dir",
        "uri",
        "absolutePath",
        "owner",
        "repo",
        "name",
        // A declaration's name is its lspSearch anchor: every symbols row
        // keeps it.
        "symbolName",
        "id",
        "type",
        "kind",
        "reason",
        "isPartial",
        "number",
        "title",
        "state",
        "author",
        "labels",
        "createdAt",
        "mergedAt",
        "commentsCount",
        "startLine",
        "endLine",
        "start",
        "end",
        "startColumn",
        "endColumn",
        "startByte",
        "endByte",
        "line",
        "column",
        "character",
        "parentId",
        "parent",
        "named",
        "exported",
        // Per-entry match-row accounting must stay on each entry: hoisting it
        // whenever the values happen to coincide (typical on page 1) makes the
        // row shape depend on the data, so identical queries drift between
        // pages and between CLI and MCP consumers.
        "totalMatchRows",
        "returnedMatchRows",
        // Per-file counts are the count views' evidence: equal counts on a
        // page (common on later pages) must not move into `shared`.
        "matchCount",
        "matchedLineCount",
    ];
    !EXCLUDED.contains(&key)
        && !ROW_FIELDS.contains(&key)
        && !required_entry_fields(tool).contains(key)
        && (value.is_number()
            || value.is_boolean()
            || value.as_str().is_some_and(|s| !s.is_empty()))
}

/// Every field some array-entry schema of `tool`'s output contract
/// requires: hoisting one would remove it from entries whose schema demands
/// it. Derived once per tool from the embedded contract.
fn required_entry_fields(tool: ToolId) -> &'static BTreeSet<String> {
    static REQUIRED: std::sync::OnceLock<HashMap<ToolId, BTreeSet<String>>> =
        std::sync::OnceLock::new();
    static NONE: BTreeSet<String> = BTreeSet::new();
    REQUIRED
        .get_or_init(|| {
            ToolId::ALL
                .into_iter()
                .filter_map(|id| {
                    let schema = &super::tool_contract(id).ok()?["outputSchema"];
                    let mut required = BTreeSet::new();
                    let mut walk = EntryWalk {
                        defs: &schema["$defs"],
                        seen: std::collections::HashSet::new(),
                        required: &mut required,
                    };
                    walk.visit(schema, false);
                    Some((id, required))
                })
                .collect()
        })
        .get(&tool)
        .unwrap_or(&NONE)
}

/// One output schema's walk: inside an array's `items` (through references
/// and union branches) it collects each object's `required` names. Each
/// schema node is visited once per context, so recursive definitions end.
struct EntryWalk<'a, 'b> {
    defs: &'a Value,
    seen: std::collections::HashSet<(*const Value, bool)>,
    required: &'b mut BTreeSet<String>,
}

impl<'a> EntryWalk<'a, '_> {
    fn visit(&mut self, schema: &'a Value, entry: bool) {
        let schema = super::resolve_ref(schema, self.defs);
        if !self.seen.insert((std::ptr::from_ref(schema), entry)) {
            return;
        }
        let Some(object) = schema.as_object() else {
            return;
        };
        if entry {
            self.required.extend(
                object
                    .get("required")
                    .and_then(Value::as_array)
                    .into_iter()
                    .flatten()
                    .filter_map(Value::as_str)
                    .map(str::to_owned),
            );
        }
        for (key, value) in object {
            match key.as_str() {
                "items" => self.visit(value, true),
                "oneOf" | "anyOf" | "allOf" => {
                    for branch in value.as_array().into_iter().flatten() {
                        self.visit(branch, entry);
                    }
                }
                "properties" | "patternProperties" => {
                    for property in value.as_object().into_iter().flat_map(|map| map.values()) {
                        self.visit(property, false);
                    }
                }
                "additionalProperties" => self.visit(value, false),
                _ => {}
            }
        }
    }
}

fn shared_leaves_mut(rows: &mut [Value]) -> impl Iterator<Item = &mut Map<String, Value>> {
    rows.iter_mut()
        .filter_map(|row| row["data"].as_object_mut())
        .flat_map(|data| data.values_mut().filter_map(Value::as_array_mut))
        .flatten()
        .filter_map(Value::as_object_mut)
}

/// Hoist leaf fields every row entry of `tool`'s response shares into one
/// `shared` map.
pub(crate) fn hoist(tool: ToolId, rows: &mut [Value]) -> Option<Map<String, Value>> {
    let leaves: Vec<&Map<String, Value>> = rows
        .iter()
        .filter_map(|row| row["data"].as_object())
        .flat_map(|data| data.values().filter_map(Value::as_array))
        .flatten()
        .filter_map(Value::as_object)
        .collect();
    if leaves.len() < 2 {
        return None;
    }
    let shared: Map<String, Value> = leaves[0]
        .iter()
        .filter(|(key, value)| {
            can_share_field(tool, key, value)
                && leaves.iter().all(|leaf| leaf.get(*key) == Some(*value))
        })
        .map(|(key, value)| (key.clone(), value.clone()))
        .collect();
    if shared.is_empty() {
        return None;
    }
    for leaf in shared_leaves_mut(rows) {
        for key in shared.keys() {
            // `remove` swaps the last key into the gap; the entry keeps the
            // order the tool wrote.
            leaf.shift_remove(key);
        }
    }
    Some(shared)
}

#[cfg(test)]
mod tests {
    use crate::contracts::validate_output;
    use crate::tools::id::ToolId;
    use serde_json::json;

    /// A count is per-file evidence: equal counts on one page stay on each
    /// row, so a count view reads the same on every page (no `shared` lookup).
    #[test]
    fn per_file_counts_are_never_hoisted() {
        let mut rows = vec![json!({"index":0,"data":{"files":[
            {"path":"a.rs","matchCount":9,"matchedLineCount":9,"note":"same"},
            {"path":"b.rs","matchCount":9,"matchedLineCount":9,"note":"same"}
        ]}})];
        let shared = super::hoist(ToolId::LocalSearch, &mut rows)
            .expect("an identical non-count field still hoists");
        assert!(!shared.contains_key("matchCount") && !shared.contains_key("matchedLineCount"));
        assert_eq!(rows[0]["data"]["files"][1]["matchCount"], 9);
        assert_eq!(rows[0]["data"]["files"][0]["matchedLineCount"], 9);
    }

    /// A row's `file` is the identity of what it names, like `path` and
    /// `name`: rows of one page that all sit in the same file (a dead-code
    /// page of one module, a callers page) each keep it, so no row has to be
    /// read against a trailing `shared` map to know which file it is in.
    #[test]
    fn a_rows_file_is_never_hoisted() {
        let mut rows = vec![json!({"index":0,"data":{"nodes":[
            {"file":"a.ts","name":"one","distance":1},
            {"file":"a.ts","name":"two","distance":1}
        ]}})];
        let shared = super::hoist(ToolId::AstTopology, &mut rows)
            .expect("an identical non-identity field still hoists");
        assert!(!shared.contains_key("file"), "{shared:?}");
        assert_eq!(shared["distance"], 1);
        assert_eq!(rows[0]["data"]["nodes"][0]["file"], "a.ts");
        assert_eq!(rows[0]["data"]["nodes"][1]["file"], "a.ts");
    }

    /// The checked-out head is a row field stated once in `shared`; it never
    /// belongs on nested entries such as localFetch `blocks`.
    #[test]
    fn local_fetch_blocks_validate_with_a_shared_head() {
        let output = json!({"shared":{"commitSha":"abc123"},"results":[{"index":0,"data":{
            "path":"src/a.ts","content":"1\tfunction a() {}\n","totalLines":1,
            "blocks":[{"symbolName":"a","line":1,"endLine":1}]
        }}]});
        validate_output("localFetch", &output).expect("shared head validates on row data");
    }

    /// One representative response per tool, with the nested arrays each
    /// tool emits (localFetch/ghGetFileContent `blocks`, lspSearch
    /// `builtinLib`, ghStructure ref maps, gh rows `lines`, history rows),
    /// compacted as the response stage does (entry hoist, plus the shared
    /// checked-out head on local reads), validates after restore.
    #[test]
    fn compacted_representative_responses_validate_for_every_tool() {
        let sha = "0123456789abcdef0123456789abcdef01234567";
        let block = json!([{"symbolName":"a","line":1,"endLine":3},{"symbolName":"b","line":5,"endLine":9}]);
        let cases = [
            (
                "localSearch",
                true,
                json!({"files":[
                    {"path":"a.rs","matches":[{"line":3,"value":"fn restore()"}]},
                    {"path":"b.rs","matches":[{"line":4,"value":"fn restore()"}]}
                ]}),
            ),
            (
                "localFetch",
                true,
                json!({"path":"a.ts","content":"1\tx\n","totalLines":9,"blocks":block}),
            ),
            (
                "structureSearch",
                true,
                json!({"path":"src","files":[{"dir":"src","files":["a.rs (1)"]},{"dir":"src/d","files":["b.rs (2)"]}]}),
            ),
            (
                "lspSearch",
                false,
                json!({"path":"a.ts","kind":"callees","files":[
                {"path":"a.ts","matches":[{"symbolName":"b","kind":"function","line":4,"endLine":6,"sites":[{"line":2,"column":1}]}]}
            ],"builtinLib":["map","filter"],
                "hints":{"findSimilar":{"tool":"lspSearch","query":{"queries":[{"path":"a.ts","symbolName":"a","line":2,"operation":"callees"}]}}}}),
            ),
            (
                "astSearch",
                false,
                json!({"files":[
                    {"path":"a.ts","matches":[{"line":1,"column":1,"endLine":2,"value":"f(x)"}]},{"path":"b.ts","matches":[{"line":3,"column":1,"endLine":4,"value":"f(y)"}]}
                ]}),
            ),
            (
                "ghSearchCode",
                false,
                json!({"files":[
                    {"path":"a.js","lines":["5\tvar a = 1;"],"commitSha":sha},
                    {"path":"b.js","lines":["6\tvar b = 2;"],"commitSha":sha}
                ]}),
            ),
            (
                "ghGetFileContent",
                false,
                json!({"path":"lib/a.js","content":"1\tx\n","totalLines":9,"commitSha":sha,"blocks":block}),
            ),
            (
                "ghStructure",
                false,
                json!({"defaultBranch":"main","commitSha":sha,"branches":{"main":sha,"dev":sha},"tags":["v1"]}),
            ),
            (
                "ghStructure",
                false,
                json!({"files":[{"dir":"lib","files":["a.js","b.js"]},{"dir":"lib/x","files":["c.js"]}],"commitSha":sha}),
            ),
            (
                "ghSearchHistory",
                false,
                json!({"commits":[
                    {"commitSha":sha,"date":"2026-10-06T21:16:14Z","messageHeadline":"a (#1)","author":"x"},
                    {"commitSha":"abc","date":"2026-10-06T21:16:14Z","messageHeadline":"b (#2)","author":"x"}
                ]}),
            ),
            (
                "ghGetHistoryItem",
                false,
                json!({"pullRequests":[{"number":1,"title":"t","state":"merged","author":"x","createdAt":"2026-10-06T21:16:14Z",
                "baseBranch":"main","headBranch":"f","headSha":sha,"baseSha":sha,"mergeCommitSha":sha,
                "commitsCount":1,"changedFilesCount":2,"additions":2,"deletions":2}]}),
            ),
            (
                "ghSearchRepo",
                false,
                json!({"repositories":[
                    {"owner":"o","repo":"a","stars":1,"language":"JavaScript","topics":["x"]},
                    {"owner":"o","repo":"b","stars":2,"language":"JavaScript","topics":["y"]}
                ]}),
            ),
        ];
        for (tool, local, data) in cases {
            let rows = vec![
                json!({"index":0,"data":data.clone()}),
                json!({"index":1,"data":data}),
            ];
            let id = ToolId::from_name(tool).expect("known tool");
            let mut output = crate::response::rows::envelope(id, rows);
            if local {
                output["shared"]["commitSha"] = json!(sha);
            }
            if let Err(error) = validate_output(tool, &output) {
                panic!("{tool}: {:?}\n{output}", error.issues);
            }
        }
    }

    /// A field an entry schema requires stays on every entry, so the wire a
    /// client receives validates as returned: two drift edges sharing their
    /// `from`, and repeated diagnostics, keep their required fields.
    #[test]
    fn required_entry_fields_stay_on_the_wire() {
        let original = json!({"results":[{"index":0,"data":{"nodes":[
            {"from":"a.ts","to":"b.ts"},
            {"from":"a.ts","to":"c.ts"}
        ]}}]});
        validate_output("astTopology", &original).expect("the original row is valid");
        let mut rows = original["results"].as_array().expect("rows").clone();
        let shared = super::hoist(ToolId::AstTopology, &mut rows);
        assert!(
            shared
                .as_ref()
                .is_none_or(|shared| !shared.contains_key("from")),
            "{shared:?}"
        );
        let mut wire = json!({"results": rows});
        if let Some(shared) = shared {
            wire["shared"] = serde_json::Value::Object(shared);
        }
        validate_output("astTopology", &wire).expect("the returned wire validates");
        for node in wire["results"][0]["data"]["nodes"]
            .as_array()
            .expect("nodes")
        {
            assert_eq!(node["from"], "a.ts", "{wire}");
        }
    }

    /// Validation checks exactly the JSON a client receives: a `shared` map
    /// never stands in for a required entry field.
    #[test]
    fn validation_never_restores_shared_fields() {
        let wire = json!({"shared":{"from":"a.ts"},"results":[{"index":0,"data":{"nodes":[
            {"to":"b.ts"},{"to":"c.ts"}
        ]}}]});
        assert!(validate_output("astTopology", &wire).is_err(), "{wire}");
    }

    /// Hoisting a shared key leaves every entry's other keys in the order
    /// the tool wrote them.
    #[test]
    fn hoisting_keeps_the_entry_key_order() {
        let mut rows = vec![json!({"index":0,"data":{"rows":[
            {"a":1,"same":"x","b":2,"c":3},
            {"a":4,"same":"x","b":5,"c":6}
        ]}})];
        let shared = super::hoist(ToolId::AstTopology, &mut rows).expect("the shared key hoists");
        assert_eq!(shared["same"], "x");
        for row in rows[0]["data"]["rows"].as_array().expect("rows") {
            let keys = row
                .as_object()
                .expect("entry")
                .keys()
                .map(String::as_str)
                .collect::<Vec<_>>();
            assert_eq!(keys, ["a", "b", "c"], "{row}");
        }
    }

    /// Outline rows keep their names even when every one shares it (a
    /// struct and two `impl Foo` blocks).
    #[test]
    fn outline_container_names_stay_on_their_rows() {
        let mut rows = vec![json!({"index":0,"data":{"symbols":[
            {"symbolName":"Foo","kind":"struct","line":1},
            {"symbolName":"Foo","kind":"impl","line":3,"endLine":5,"members":[{"symbolName":"a","kind":"function","line":4}]},
            {"symbolName":"Foo","kind":"impl","line":7,"endLine":9,"members":[{"symbolName":"b","kind":"function","line":8}]}
        ]}})];
        assert!(
            super::hoist(ToolId::AstSearch, &mut rows).is_none(),
            "{rows:?}"
        );
        for row in rows[0]["data"]["symbols"].as_array().expect("rows") {
            assert_eq!(row["symbolName"], "Foo", "{rows:?}");
        }
    }

    /// The guard is per tool: a field another tool's entries require still
    /// hoists from this tool's entries, and the tool that requires it keeps
    /// it on every entry.
    #[test]
    fn the_required_field_guard_is_the_responding_tools() {
        let required = |tool| super::required_entry_fields(tool).contains("value");
        assert!(required(ToolId::LspSearch) && !required(ToolId::AstTopology));
        let rows = || {
            vec![json!({"index":0,"data":{"nodes":[
                {"file":"a.ts","value":"same"},
                {"file":"b.ts","value":"same"}
            ]}})]
        };
        let mut hoisted = rows();
        let shared = super::hoist(ToolId::AstTopology, &mut hoisted).expect("value hoists");
        assert_eq!(shared["value"], "same");
        assert!(hoisted[0]["data"]["nodes"][0].get("value").is_none());
        let mut kept = rows();
        assert!(
            super::hoist(ToolId::LspSearch, &mut kept).is_none(),
            "{kept:?}"
        );
        assert_eq!(kept[0]["data"]["nodes"][1]["value"], "same");
    }
}
