mod capture;
pub(crate) use capture::capture_text;
pub(crate) use executor::MAX_SOURCE_BYTES;
mod block;
pub(crate) use block::BLOCK_MAX_LINES;
pub(crate) use pagination::LINE_PAGE_BYTES;
mod executor;
mod output;
pub(crate) use output::Output;
mod extraction;
mod key_outline;
mod large_source;
mod pagination;
mod pattern_repair;
mod selection;
mod types;
pub(crate) use executor::process_fetched_content_selected;
pub use executor::{execute_local_fetch, process_fetched_content};
pub use types::*;

#[cfg(test)]
mod tests;
