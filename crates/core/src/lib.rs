//! Domain logic for Hammock Reader. Pure Rust: no browser APIs, native tests.

pub mod article;
pub mod error;
pub mod mhtml;

pub use article::{Article, ArticleId};
pub use error::CoreError;
pub use mhtml::{MhtmlPart, PartKind, parse};
