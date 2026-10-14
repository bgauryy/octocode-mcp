use super::{ProviderError, ProviderErrorKind};
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct ContentsEntry {
    pub name: String,
    pub path: String,
    #[serde(rename = "type")]
    pub kind: String,
    #[serde(default)]
    pub size: Option<u64>,
    #[serde(default)]
    pub sha: Option<String>,
    /// The entry's git object URL: a submodule, which a listing types `file`
    /// with size 0, points at the other repository's tree.
    #[serde(default)]
    pub git_url: Option<String>,
}

impl ContentsEntry {
    /// A submodule: the listing types it `file`, but its object is a tree of
    /// another repository, or, for a gitlink `.gitmodules` does not name, it
    /// is empty with no object URL at all (every blob has one).
    #[must_use]
    pub fn is_submodule(&self) -> bool {
        self.kind == "submodule"
            || (self.kind == "file"
                && match self.git_url.as_deref() {
                    Some(url) => url.contains("/git/trees/"),
                    None => self.size == Some(0),
                })
    }
}

#[derive(Clone, Debug)]
pub struct ContentsListing {
    pub entries: Vec<ContentsEntry>,
    pub raw_entry_count: usize,
}

/// A contents response: an array listing, or one entry for a file path.
pub(super) fn parse_contents_listing(body: &[u8]) -> Result<ContentsListing, ProviderError> {
    let value: serde_json::Value = serde_json::from_slice(body).map_err(|_| {
        ProviderError::new(
            ProviderErrorKind::Decode,
            "invalid GitHub repository contents response",
        )
    })?;
    let raw_entry_count = value.as_array().map_or(1, Vec::len);
    let raw_entries = match value {
        serde_json::Value::Array(entries) => entries,
        entry @ serde_json::Value::Object(_) => vec![entry],
        _ => {
            return Err(ProviderError::new(
                ProviderErrorKind::Decode,
                "invalid GitHub repository contents response",
            ));
        }
    };
    let entries = raw_entries
        .into_iter()
        .map(serde_json::from_value)
        .collect::<Result<Vec<_>, _>>()
        .map_err(|_| {
            ProviderError::new(
                ProviderErrorKind::Decode,
                "invalid GitHub repository contents entry",
            )
        })?;
    Ok(ContentsListing {
        entries,
        raw_entry_count,
    })
}

#[cfg(test)]
mod submodule_tests {
    use super::ContentsEntry;

    fn entry(value: serde_json::Value) -> ContentsEntry {
        serde_json::from_value(value).expect("entry")
    }

    /// A gitlink with no `.gitmodules` entry is listed as an empty `file`
    /// with no object URL at all; a real blob, even an empty one, always
    /// has its `/git/blobs/` URL.
    #[test]
    fn a_file_entry_without_an_object_url_is_a_submodule() {
        let gitlink = entry(serde_json::json!({
            "name":"vendored","path":"vendored","type":"file","size":0,"git_url":null
        }));
        assert!(gitlink.is_submodule());
        let empty_blob = entry(serde_json::json!({
            "name":".keep","path":".keep","type":"file","size":0,
            "git_url":"https://api.github.com/repos/o/r/git/blobs/e69de29"
        }));
        assert!(!empty_blob.is_submodule());
        let linked = entry(serde_json::json!({
            "name":"m","path":"m","type":"file","size":0,
            "git_url":"https://api.github.com/repos/x/y/git/trees/abc"
        }));
        assert!(linked.is_submodule());
    }
}
