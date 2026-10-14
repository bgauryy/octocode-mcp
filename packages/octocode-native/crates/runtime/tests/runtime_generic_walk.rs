//! Every local page channel, walked generically ([`support::walk`]): each page
//! satisfies the output contract and offers only contract-valid leads, every
//! page lead is followed verbatim, no call repeats, and every row arrives
//! exactly once with the union equal to the unpaged rows.
#![allow(clippy::panic)]

use crate::support::{self, ALL_EXTRAS, Workspace};
use serde_json::{Value, json};

fn fixture(workspace: &Workspace) {
    for index in 0..6 {
        workspace.write(
            &format!("src/mod{index}.rs"),
            format!("pub fn helper{index}() -> u32 {{\n    {index}\n}}\n\npub fn caller{index}() -> u32 {{\n    helper{index}()\n}}\n"),
        );
    }
}

/// The first result row's data, without its leads.
fn data(output: &Value) -> Value {
    let mut data = output["results"][0]["data"].clone();
    if let Some(map) = data.as_object_mut() {
        map.remove("next");
        map.remove("hints");
    }
    data
}

/// `path:line` of every match of a localSearch page.
fn search_rows(output: &Value) -> Vec<String> {
    data(output)["files"]
        .as_array()
        .into_iter()
        .flatten()
        .flat_map(|file| {
            let path = file["path"].as_str().expect("file path").to_owned();
            file["matches"]
                .as_array()
                .into_iter()
                .flatten()
                .map(move |hit| format!("{path}:{}", hit["line"]))
        })
        .collect()
}

/// Every `path` a page lists (structureSearch files).
fn listed_rows(output: &Value) -> Vec<String> {
    support::checks::paths_in(&data(output))
}

#[tokio::test]
async fn local_page_channels_walk_exactly_once() {
    let workspace = Workspace::new();
    fixture(&workspace);
    let runtime = workspace.runtime(&[]);
    let cases: [(&str, Value, fn(&Value) -> Vec<String>); 2] = [
        (
            "localSearch",
            json!({"path":"src","matchString":"helper","pageSize":1}),
            search_rows,
        ),
        (
            "structureSearch",
            json!({"operation":"files","path":"src","pageSize":2}),
            listed_rows,
        ),
    ];
    for (tool, seed, rows) in cases {
        let mut unpaged = seed.clone();
        unpaged.as_object_mut().expect("seed").remove("pageSize");
        let whole = support::run(&runtime, tool, unpaged, &ALL_EXTRAS).await;
        let mut expected = rows(&whole.structured_content);
        expected.sort();
        assert!(expected.len() >= 6, "{tool}: {}", &whole.structured_content);
        let walk = support::walk(&runtime, tool, support::envelope(seed), rows).await;
        assert!(walk.queries.len() >= 3, "{tool} pages: {:?}", walk.queries);
        let mut walked = walk.rows;
        walked.sort();
        assert_eq!(walked, expected, "{tool}");
    }
    runtime.close().await;
}
