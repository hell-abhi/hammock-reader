//! Article identity. URLs are not unique (same page saved twice is a different
//! capture), so the id is a hash of the URL plus save time.

use crate::article::ArticleId;

/// Stable 64-bit FNV-1a over `url` and `saved_at`, hex encoded. Not security
/// relevant: ids only name storage entries.
pub fn make_id(url: &str, saved_at: i64) -> ArticleId {
    let mut hash = 0xcbf2_9ce4_8422_2325u64;
    for byte in url.as_bytes().iter().chain(saved_at.to_le_bytes().iter()) {
        hash ^= u64::from(*byte);
        hash = hash.wrapping_mul(0x0000_0100_0000_01b3);
    }
    format!("{hash:016x}")
}

#[cfg(test)]
mod tests {
    use super::make_id;

    #[test]
    fn is_stable_and_time_sensitive() {
        assert_eq!(
            make_id("https://example.com/", 1),
            make_id("https://example.com/", 1)
        );
        assert_ne!(
            make_id("https://example.com/", 1),
            make_id("https://example.com/", 2)
        );
        assert_eq!(make_id("https://a/", 1).len(), 16);
    }
}
