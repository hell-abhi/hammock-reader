//! Domain logic for Hammock Reader. Pure Rust: no browser APIs, native tests.

pub mod article;
pub mod compose;
pub mod error;
pub mod id;
pub mod mhtml;
pub mod title;

pub use article::{Article, ArticleId};
pub use compose::{Resource, compose};
pub use error::CoreError;
pub use id::make_id;
pub use mhtml::{MhtmlPart, PartKind, parse};
pub use title::title_of;
