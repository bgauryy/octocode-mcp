//! JSON size measurement shared by the paging owners and the response
//! pager. Sizes are serialized JSON chars in UTF-16 units, the unit the
//! response pager measures, so escaping and non-ASCII text count as they
//! render.

/// Counts the UTF-16 units of UTF-8 written to it.
struct Utf16Counter(usize);

impl std::io::Write for Utf16Counter {
    fn write(&mut self, bytes: &[u8]) -> std::io::Result<usize> {
        for &byte in bytes {
            // One unit per scalar value (each non-continuation byte); a
            // four-byte sequence is a surrogate pair, two units.
            if byte & 0xC0 != 0x80 {
                self.0 += 1;
            }
            if byte >= 0xF0 {
                self.0 += 1;
            }
        }
        Ok(bytes.len())
    }

    fn flush(&mut self) -> std::io::Result<()> {
        Ok(())
    }
}

/// Serialized JSON length of `value` in UTF-16 units, without building the
/// string.
pub fn json_chars(value: &impl serde::Serialize) -> usize {
    let mut counter = Utf16Counter(0);
    match serde_json::to_writer(&mut counter, value) {
        Ok(()) => counter.0,
        Err(_) => 0,
    }
}

/// Serialized length of `text` as a JSON string body: escaped, unquoted.
pub fn json_text_chars(text: &str) -> usize {
    json_chars(&text).saturating_sub(2)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn json_chars_count_escapes_and_utf16_units_as_rendered() {
        for value in [
            json!("plain"),
            json!("quote \" backslash \\ tab \t newline \n bell \u{7}"),
            json!("é 中文 \u{1F600}"),
            json!({"line": 12, "value": "a\"b", "nested": [1, null, true]}),
        ] {
            let rendered = value.to_string().encode_utf16().count();
            assert_eq!(json_chars(&value), rendered, "{value}");
        }
        assert_eq!(json_text_chars("a\"b\u{1F600}"), 6);
    }
}
