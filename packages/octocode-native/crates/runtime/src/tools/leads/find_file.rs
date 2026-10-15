//! The structureSearch lead for a file a caller named that is not where it said.
use crate::tools::id::ToolId;
use crate::tools::result::Continuation;
use serde_json::{Value, json};
use std::path::Path;

/// A listing of files named like `requested` from `root`: its stem (the name
/// without its extension) under any extension, at any depth, so a moved file
/// or a changed extension shows. Never every name merely containing the
/// stem. A name without an extension is matched as written.
pub(crate) fn find_file(root: &str, requested: &str) -> Option<Value> {
    let name = Path::new(requested).file_name()?.to_string_lossy();
    let include = match name.split_once('.') {
        Some((stem, _)) if !stem.is_empty() => format!("{}.*", escape_glob(stem)),
        _ => name.to_string(),
    };
    (!include.is_empty()).then(|| {
        Continuation::new(
            ToolId::StructureSearch,
            json!({"operation": "files", "path": root, "include": [include]}),
        )
        .build()
    })
}

/// `text` as a glob that matches only itself.
fn escape_glob(text: &str) -> String {
    text.chars()
        .flat_map(|c| match c {
            '*' | '?' | '[' | ']' | '{' | '}' => vec!['[', c, ']'],
            _ => vec![c],
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_stem_matches_under_any_extension() {
        let lead = find_file("pkg", "src/a/blok.rs").expect("lead");
        let row = &lead["query"]["queries"][0];
        assert_eq!(lead["tool"], "structureSearch", "{lead}");
        assert_eq!(row["operation"], "files", "{lead}");
        assert_eq!(row["path"], "pkg", "{lead}");
        assert_eq!(row["include"], json!(["blok.*"]), "{lead}");
    }

    #[test]
    fn a_name_without_an_extension_and_glob_characters_match_only_themselves() {
        let row = &find_file(".", "Makefile").expect("lead")["query"]["queries"][0];
        assert_eq!(row["include"], json!(["Makefile"]));
        let row = &find_file(".", "[id].tsx").expect("lead")["query"]["queries"][0];
        assert_eq!(row["include"], json!(["[[]id[]].*"]));
    }
}
