//! Serialized JSON sizes without allocating the rendered document.
use serde::Serialize;
use std::io::{self, Write};

struct Counter {
    size: usize,
    utf16: bool,
}

impl Write for Counter {
    fn write(&mut self, bytes: &[u8]) -> io::Result<usize> {
        self.size += if self.utf16 {
            bytes
                .iter()
                .map(|&byte| usize::from(byte & 0xc0 != 0x80) + usize::from(byte >= 0xf0))
                .sum::<usize>()
        } else {
            bytes.len()
        };
        Ok(bytes.len())
    }
    fn flush(&mut self) -> io::Result<()> {
        Ok(())
    }
}

fn count(value: &(impl Serialize + ?Sized), utf16: bool) -> Option<usize> {
    let mut counter = Counter { size: 0, utf16 };
    serde_json::to_writer(&mut counter, value).ok()?;
    Some(counter.size)
}

/// JSON bytes, or `None` if serialization failed; a partial document has no size.
pub fn bytes(value: &(impl Serialize + ?Sized)) -> Option<usize> {
    count(value, false)
}

/// JSON UTF-16 units, including escaping, or `None` if serialization failed.
pub fn utf16_units(value: &(impl Serialize + ?Sized)) -> Option<usize> {
    count(value, true)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn json_size_matches_rendered_bytes_and_utf16() {
        for value in [
            serde_json::json!(null),
            serde_json::json!("quote \" tab \t é 中文 😀"),
            serde_json::json!({"nested": [1, true, "\n"]}),
            serde_json::json!({"message": "héllo \"quoted\"", "items": [1, 2.5, null, {"k": "v"}]}),
        ] {
            let rendered = serde_json::to_string(&value).unwrap();
            assert_eq!(bytes(&value), Some(rendered.len()));
            assert_eq!(utf16_units(&value), Some(rendered.encode_utf16().count()));
        }
        let invalid = std::collections::BTreeMap::from([((1, 2), "value")]);
        assert_eq!(bytes(&invalid), None);
        assert_eq!(utf16_units(&invalid), None);
    }
}
