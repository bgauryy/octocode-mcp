//! Page windows over a result set held whole: by a character budget (the
//! default, so a page fills the response window like localSearch and
//! structureSearch) or by a caller's explicit item count.
//!
//! The result set is the same on every page of a walk (a snapshot pins it),
//! so the cut is a pure function of the item sizes and the budget: page `n`
//! starts where page `n - 1` ended, every item lands on exactly one page, and
//! the page count is the same however the walk is entered.

use std::ops::Range;

/// How a result set is cut into pages.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum Paging {
    /// `n` items per page: the caller's explicit `pageSize`.
    Count(usize),
    /// As many items as fit the character budget; at least one, so a walk
    /// always moves.
    Chars(usize),
}

impl Paging {
    /// The cut a request asks for: its explicit count, else the budget.
    pub(crate) fn of(count: Option<usize>, budget: usize) -> Self {
        count.map_or(Self::Chars(budget.max(1)), |count| {
            Self::Count(count.max(1))
        })
    }

    /// Every page's item range over `sizes` (each item's characters).
    pub(crate) fn windows(self, sizes: &[usize]) -> Vec<Range<usize>> {
        let mut windows = Vec::new();
        let mut start = 0;
        while start < sizes.len() {
            let end = match self {
                Self::Count(count) => start.saturating_add(count).min(sizes.len()),
                Self::Chars(budget) => {
                    let mut used = 0usize;
                    let mut end = start;
                    while let Some(size) = sizes.get(end) {
                        if end > start && used.saturating_add(*size) > budget {
                            break;
                        }
                        used = used.saturating_add(*size);
                        end += 1;
                    }
                    end
                }
            };
            windows.push(start..end);
            start = end;
        }
        windows
    }
}

/// Characters one page of a row may spend on its items: the response window
/// less the row around them, which re-states the query in each continuation.
pub(crate) fn page_budget(response_window: Option<usize>, query: &serde_json::Value) -> usize {
    crate::tools::stream_page::page_chars(
        response_window,
        crate::tools::stream_page::reserve_chars(query, 2),
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_character_budget_fills_each_page_and_never_exceeds_it() {
        let sizes = [400, 400, 400, 900, 100, 100, 5_000, 10];
        let windows = Paging::Chars(1_000).windows(&sizes);
        assert_eq!(windows, vec![0..2, 2..3, 3..5, 5..6, 6..7, 7..8]);
        for window in &windows {
            let used: usize = sizes[window.clone()].iter().sum();
            // Only a single item larger than the budget overflows it.
            assert!(used <= 1_000 || window.len() == 1, "{window:?} {used}");
        }
    }

    #[test]
    fn every_item_lands_on_exactly_one_page_for_any_budget_or_count() {
        let sizes = (0..257)
            .map(|index| 1 + (index * 37) % 211)
            .collect::<Vec<_>>();
        for paging in [
            Paging::Chars(1),
            Paging::Chars(500),
            Paging::Chars(16_384),
            Paging::Chars(usize::MAX),
            Paging::Count(1),
            Paging::Count(20),
            Paging::Count(1_000),
        ] {
            let mut seen = vec![0u8; sizes.len()];
            let windows = paging.windows(&sizes);
            for window in &windows {
                assert!(!window.is_empty(), "{paging:?}");
                for item in window.clone() {
                    seen[item] += 1;
                }
            }
            assert!(seen.iter().all(|count| *count == 1), "{paging:?}");
            // Each page starts where the one before ended.
            assert!(windows.windows(2).all(|pair| pair[0].end == pair[1].start));
        }
    }

    #[test]
    fn a_set_that_fits_is_one_page_and_an_empty_set_has_none() {
        assert_eq!(Paging::Chars(100).windows(&[10, 10]), vec![0..2]);
        assert!(Paging::Chars(100).windows(&[]).is_empty());
    }

    #[test]
    fn an_explicit_count_overrides_the_budget() {
        assert_eq!(Paging::of(Some(3), 16_000), Paging::Count(3));
        assert_eq!(Paging::of(None, 16_000), Paging::Chars(16_000));
        assert_eq!(Paging::of(Some(0), 16_000), Paging::Count(1));
    }

    #[test]
    fn the_budget_leaves_the_row_room_inside_the_window() {
        let query = serde_json::json!({"operation": "symbols", "path": "src"});
        let budget = page_budget(Some(20_000), &query);
        assert!((10_000..20_000).contains(&budget), "{budget}");
        assert_eq!(
            page_budget(None, &query),
            crate::tools::stream_page::MAX_PAGE_CHARS
        );
    }
}
