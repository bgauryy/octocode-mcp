use super::octo::{match_deadline, parse_tree_with_deadline};
use crate::signatures::{MAX_PARSE_SIZE, languages};

/// Count ERROR and MISSING nodes with the selected grammar and parse deadline.
pub fn count_syntax_errors(content: &str, selector: &str) -> Result<u32, String> {
    if content.len() > MAX_PARSE_SIZE {
        return Err(format!(
            "[structural.content.tooLarge] syntax input exceeds {MAX_PARSE_SIZE} byte limit"
        ));
    }
    let entry = languages::select(selector)
        .next()
        .ok_or_else(|| format!("[structural.language.unsupported] {selector} is not supported"))?;
    let tree = parse_tree_with_deadline(&entry.language, content, match_deadline(content))
        .map_err(|error| format!("[{}] {}", error.code, error.message))?;
    let mut count = 0u32;
    let mut cursor = tree.walk();
    loop {
        let node = cursor.node();
        if node.is_error() || node.is_missing() {
            count = count.saturating_add(1);
        }
        if cursor.goto_first_child() {
            continue;
        }
        while !cursor.goto_next_sibling() {
            if !cursor.goto_parent() {
                return Ok(count);
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn syntax_checks_distinguish_valid_and_broken_source() {
        for (language, clean, broken) in [
            ("typescript", "const n = 1;", "const n = ;"),
            ("rust", "fn main() {}", "fn main( {}"),
            ("python", "def run():\n    return 1\n", "def run(:\n"),
        ] {
            assert_eq!(count_syntax_errors(clean, language), Ok(0), "{language}");
            assert!(
                count_syntax_errors(broken, language).is_ok_and(|count| count > 0),
                "{language}"
            );
        }
    }

    #[test]
    fn unsupported_and_oversized_inputs_fail_explicitly() {
        assert!(count_syntax_errors("text", "unknown-language").is_err());
        assert!(count_syntax_errors(&"x".repeat(MAX_PARSE_SIZE + 1), "rust").is_err());
    }
}
