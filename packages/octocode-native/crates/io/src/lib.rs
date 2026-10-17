#![cfg_attr(test, allow(clippy::expect_used, clippy::unwrap_used, clippy::panic))]

//! The single owner of cross-crate primitives: owner-only atomic file
//! replacement ([`atomic`]), bounded advisory file locks ([`lock`]), lossy
//! environment reads ([`env`](mod@env)), HTTP client construction
//! ([`http`]), the in-process [`memo`] and keyed single [`flight`], and
//! stderr [`notice`]s.
//! GitHub, runtime and CLI all use them, so they live in this leaf below
//! all three. The engine is a leaf too and keeps its own two moka caches
//! (graph facts, LSP responses).

pub mod atomic;
pub mod env;
pub mod flight;
pub mod http;
pub mod lock;
pub mod memo;
pub mod notice;
