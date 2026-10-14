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
mod ranking;
mod types;
pub(crate) use executor::unanchored_first_read;
pub use executor::{execute_local_fetch, process_fetched_content};
pub(crate) use executor::{execute_local_fetch_ranked, process_fetched_content_ranked};
pub use types::*;

#[cfg(test)]
mod tests;
