//! How many threads one query's parallel work runs on: the one core-count
//! rule every per-row fan-out sizes itself by, so concurrent rows split the
//! cores the batch budget gave them instead of each taking every core.

use crate::tools::num::usize_of;

/// The host's cores; one when the count is unknown, so an unproven host
/// never runs more threads than it can.
pub(crate) fn host_cores() -> usize {
    std::thread::available_parallelism().map_or(1, usize::from)
}

/// Threads for `items` independent jobs of one query: its share of the
/// cores (`walk_threads`, set by the batch budget when several queries run
/// at once; `None` = every core), at most `cap` (a workload's own ceiling,
/// with its rationale beside it) and `items`, at least one.
pub(crate) fn workers(walk_threads: Option<u32>, items: usize, cap: Option<usize>) -> usize {
    walk_threads
        .map_or_else(host_cores, usize_of)
        .min(cap.unwrap_or(usize::MAX))
        .min(items)
        .max(1)
}

#[cfg(test)]
mod tests {
    use super::*;

    /// A query's share of the cores bounds its fan-out, as do its cap and its
    /// items; there is always one worker.
    #[test]
    fn a_fan_out_takes_its_share_its_cap_and_its_items() {
        assert_eq!(workers(Some(2), 10, None), 2);
        assert_eq!(workers(Some(8), 10, Some(4)), 4);
        assert_eq!(workers(Some(8), 3, None), 3);
        assert_eq!(workers(Some(0), 3, None), 1);
        assert_eq!(workers(Some(3), 0, None), 1);
        assert_eq!(workers(None, usize::MAX, None), host_cores());
        assert_eq!(workers(None, usize::MAX, Some(1)), 1);
    }
}
