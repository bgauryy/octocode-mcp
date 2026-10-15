mod block;
pub(crate) use block::BLOCK_MAX_LINES;
pub(crate) use pagination::LINE_PAGE_BYTES;
mod executor;
mod output;
pub(crate) use output::Output;
mod extraction;
mod large_source;
mod pagination;
mod pattern_repair;
mod selection;
mod types;
pub(crate) use executor::unanchored_first_read;
pub use executor::{execute_local_fetch, process_fetched_content};
pub(crate) use executor::{execute_local_fetch_selected, process_fetched_content_selected};
pub use types::*;

#[cfg(test)]
mod tests;
