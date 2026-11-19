//! The saved article record. Metadata is small and lives in the index; the page
//! itself lives as MHTML in storage.

pub type ArticleId = String;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Article {
    pub id: ArticleId,
    pub url: String,
    pub title: String,
    pub saved_at: i64,
    pub tags: Vec<String>,
    pub archived: bool,
    pub favourite: bool,
    /// Size of the stored MHTML in bytes, for the storage budget.
    pub bytes: u64,
}

impl Article {
    pub fn new(
        id: impl Into<ArticleId>,
        url: impl Into<String>,
        title: impl Into<String>,
        saved_at: i64,
    ) -> Self {
        Self {
            id: id.into(),
            url: url.into(),
            title: title.into(),
            saved_at,
            tags: Vec::new(),
            archived: false,
            favourite: false,
            bytes: 0,
        }
    }
}
