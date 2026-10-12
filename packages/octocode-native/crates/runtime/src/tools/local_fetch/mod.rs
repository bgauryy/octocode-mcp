mod block;
pub(crate) use block::{BLOCK_MAX_LINES, declaration_spans};
pub(crate) use pagination::LINE_PAGE_BYTES;
mod executor;
mod output;
pub(crate) use output::Output;
mod extraction;
mod large_source;
mod pagination;
mod pattern_repair;
mod types;
mod validation;
pub use executor::{execute_local_fetch, process_fetched_content};
pub(crate) use executor::{insensitive_match_count, no_match_hints, unanchored_first_read};
pub use types::*;

#[cfg(test)]
mod tests;
