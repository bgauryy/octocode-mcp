//! The time budget of an unbounded file scan.
//!
//! A scan with no caller-chosen `max_files` covers its whole scope when it
//! can, and otherwise stops at a chunk boundary past [`SCAN_TIME_BUDGET`]
//! with the walk-order index to resume from, so a huge tree is read in a few
//! resumable windows rather than cut at a fixed file count.

/// Wall time an unbounded scan spends evaluating candidates before it
/// returns a resumable partial result.
pub const SCAN_TIME_BUDGET: std::time::Duration = std::time::Duration::from_secs(10);

/// Candidates evaluated between time checks.
pub(crate) const SCAN_CHUNK_FILES: usize = 512;

/// The most candidates one unbounded scan walks.
pub const SCAN_WALK_FILES: usize = 100_000;

/// The walk-order index a cut scan resumes from, `None` when the cut is the
/// walk ceiling itself: a resumed scan walks the same first
/// [`SCAN_WALK_FILES`] candidates and skips the evaluated ones, so a resume
/// at the ceiling skips the whole walk and reaches nothing new. Files past
/// the ceiling are reachable only by narrowing the scope.
#[must_use]
pub fn resume_offset(resume: u32) -> Option<u32> {
    ((resume as usize) < SCAN_WALK_FILES).then_some(resume)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_resume_at_the_walk_ceiling_is_terminal() {
        assert_eq!(resume_offset(1), Some(1));
        assert_eq!(
            resume_offset(SCAN_WALK_FILES as u32 - 1),
            Some(SCAN_WALK_FILES as u32 - 1)
        );
        assert_eq!(resume_offset(SCAN_WALK_FILES as u32), None);
        assert_eq!(resume_offset(u32::MAX), None);
    }
}
