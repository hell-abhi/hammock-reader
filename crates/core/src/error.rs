use thiserror::Error;

#[derive(Debug, Error, PartialEq, Eq)]
pub enum CoreError {
    #[error("MHTML has no MIME boundary")]
    MissingBoundary,
    #[error("MHTML has no HTML part")]
    MissingHtml,
}
