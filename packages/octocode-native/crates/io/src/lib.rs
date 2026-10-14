#![cfg_attr(test, allow(clippy::expect_used, clippy::unwrap_used, clippy::panic))]

//! The single owner of cross-crate primitives: owner-only atomic file
//! replacement ([`atomic`]), HTTP client construction ([`http`]), and the
//! in-process [`memo`]. Engine and GitHub are leaves, so neither can own
//! them; every crate that writes state, talks HTTP, or memoizes depends on
//! this one instead.

pub mod atomic;
pub mod env;
pub mod http;
pub mod lock;
pub mod memo;
