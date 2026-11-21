//! Title and text helpers over a decoded capture.

use crate::mhtml::{self, PartKind};

/// The HTML `<title>`, decoded from the capture's HTML part. Empty when missing.
pub fn title_of(bytes: &[u8]) -> String {
    let Ok(parts) = mhtml::parse(bytes) else {
        return String::new();
    };
    let Some(html) = parts.iter().find(|part| part.kind == PartKind::Html) else {
        return String::new();
    };
    let text = String::from_utf8_lossy(&html.bytes);
    let lower = text.to_ascii_lowercase();
    let Some(start) = lower.find("<title") else {
        return String::new();
    };
    let Some(open) = text[start..].find('>') else {
        return String::new();
    };
    let rest = &text[start + open + 1..];
    let end = rest.to_ascii_lowercase().find("</title>");
    let raw = end.map_or(rest, |end| &rest[..end]);
    decode_entities(raw.trim())
}

fn decode_entities(text: &str) -> String {
    text.replace("&amp;", "&")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", "\"")
        .replace("&#39;", "'")
        .replace("&nbsp;", " ")
}

#[cfg(test)]
mod tests {
    use super::title_of;

    const FIXTURE: &[u8] = include_bytes!("../tests/fixtures/fixture.mhtml");

    #[test]
    fn reads_the_captured_title() {
        assert_eq!(title_of(FIXTURE), "Spike fixture");
    }

    #[test]
    fn returns_empty_for_junk() {
        assert_eq!(title_of(b"not a capture"), "");
    }
}
