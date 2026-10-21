//! Leads one tool offers into another: the follow-up query a row carries, built
//! here so no tool imports the target tool's internals.

pub(crate) mod find_file;
pub(crate) mod lsp;

/// Run an optional probe that only adds a lead or a note. A panic in it (an
/// engine bug on pathological input) yields `None`, so the row keeps the
/// primary result it already has instead of failing as a whole.
pub(crate) fn best_effort<T>(probe: impl FnOnce() -> T) -> Option<T> {
    std::panic::catch_unwind(std::panic::AssertUnwindSafe(probe)).ok()
}

#[cfg(test)]
mod best_effort_tests {
    #[test]
    fn a_panicking_probe_is_absent_and_a_finished_one_is_kept() {
        assert_eq!(super::best_effort(|| 7), Some(7));
        let finishes = std::hint::black_box(false);
        assert_eq!(super::best_effort(|| assert!(finishes, "probe bug")), None);
    }
}
