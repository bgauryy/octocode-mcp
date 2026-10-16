pub(crate) mod diff_parser;
pub(crate) mod file_extension;
pub(crate) mod source;
pub mod test_paths;
pub(crate) mod utf8_offsets;
pub(crate) mod yaml_utils;

/// The one extension helper, JS/TS extension set, line index, bounded source
/// read, regular-file open, and binary sniff.
pub use file_extension::{JS_TS_EXTENSIONS, extension_of};
pub use source::{
    BinaryVerdict, Decoded, ReadError, Source, decode, open_regular, read_source, sniff,
};
pub use utf8_offsets::{LineIndex, line_at, line_starts};
