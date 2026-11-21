//! Build an MHTML container from a page snapshot.
//!
//! Firefox has no `pageCapture`, so the extension collects the DOM and resource
//! URLs, fetches the bytes itself, and hands them here. The result is the same
//! shape Chrome produces, so storage and rendering have one path.

/// One fetched resource.
pub struct Resource {
    pub url: String,
    pub content_type: String,
    pub bytes: Vec<u8>,
}

/// Assemble a multipart/related MHTML document.
///
/// `html` must already reference resources by their absolute URL, which the
/// collector guarantees. The HTML part carries the page URL so links and forms
/// still resolve.
pub fn compose(page_url: &str, html: &str, resources: &[Resource]) -> String {
    let boundary = "----HammockReaderBoundary";
    let mut out = String::with_capacity(
        html.len()
            + resources
                .iter()
                .map(|r| r.bytes.len() * 4 / 3 + 256)
                .sum::<usize>(),
    );
    out.push_str("From: <Saved by Hammock Reader>\r\n");
    out.push_str(&format!("Snapshot-Content-Location: {page_url}\r\n"));
    out.push_str("MIME-Version: 1.0\r\n");
    out.push_str(&format!(
        "Content-Type: multipart/related; type=\"text/html\"; boundary=\"{boundary}\"\r\n\r\n"
    ));

    out.push_str(&format!("--{boundary}\r\n"));
    out.push_str("Content-Type: text/html; charset=utf-8\r\n");
    out.push_str("Content-Transfer-Encoding: base64\r\n");
    out.push_str(&format!("Content-Location: {page_url}\r\n\r\n"));
    out.push_str(&wrap(&base64(html.as_bytes())));
    out.push_str("\r\n");

    for resource in resources {
        out.push_str(&format!("--{boundary}\r\n"));
        out.push_str(&format!("Content-Type: {}\r\n", resource.content_type));
        out.push_str("Content-Transfer-Encoding: base64\r\n");
        out.push_str(&format!("Content-Location: {}\r\n\r\n", resource.url));
        out.push_str(&wrap(&base64(&resource.bytes)));
        out.push_str("\r\n");
    }
    out.push_str(&format!("--{boundary}--\r\n"));
    out
}

fn base64(bytes: &[u8]) -> String {
    let mut out = String::with_capacity(bytes.len().div_ceil(3) * 4);
    for chunk in bytes.chunks(3) {
        let b = [
            chunk[0],
            *chunk.get(1).unwrap_or(&0),
            *chunk.get(2).unwrap_or(&0),
        ];
        let n = (u32::from(b[0]) << 16) | (u32::from(b[1]) << 8) | u32::from(b[2]);
        out.push(char::from(B64[(n >> 18) as usize & 63]));
        out.push(char::from(B64[(n >> 12) as usize & 63]));
        out.push(if chunk.len() > 1 {
            char::from(B64[(n >> 6) as usize & 63])
        } else {
            '='
        });
        out.push(if chunk.len() > 2 {
            char::from(B64[n as usize & 63])
        } else {
            '='
        });
    }
    out
}

const B64: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

/// 76-column wrapping keeps lines inside the MIME limit.
fn wrap(text: &str) -> String {
    let mut out = String::with_capacity(text.len() + text.len() / 76);
    for (index, chunk) in text.as_bytes().chunks(76).enumerate() {
        if index > 0 {
            out.push_str("\r\n");
        }
        out.push_str(std::str::from_utf8(chunk).unwrap_or(""));
    }
    out
}

#[cfg(test)]
mod tests {
    use super::{Resource, compose};
    use crate::mhtml::{self, PartKind};

    #[test]
    fn round_trips_through_the_parser() {
        let html = "<html><head><title>Snap</title></head><body><img src=\"https://x.test/a.png\"></body></html>";
        let resource = Resource {
            url: "https://x.test/a.png".into(),
            content_type: "image/png".into(),
            bytes: b"\x89PNG\r\n\x1a\n".to_vec(),
        };
        let mhtml = compose("https://x.test/page", html, &[resource]);
        let parts = mhtml::parse(mhtml.as_bytes()).expect("composable output must parse");
        assert_eq!(parts.len(), 2);
        let page = parts
            .iter()
            .find(|p| p.kind == PartKind::Html)
            .expect("html");
        assert_eq!(String::from_utf8_lossy(&page.bytes), html);
        assert_eq!(page.content_location, "https://x.test/page");
        let image = parts
            .iter()
            .find(|p| p.kind == PartKind::Image)
            .expect("image");
        assert_eq!(image.content_location, "https://x.test/a.png");
        assert_eq!(image.bytes, b"\x89PNG\r\n\x1a\n");
    }

    #[test]
    fn survives_a_page_with_no_resources() {
        let mhtml = compose("https://x.test/", "<html><title>T</title></html>", &[]);
        let parts = mhtml::parse(mhtml.as_bytes()).expect("must parse");
        assert_eq!(parts.len(), 1);
    }
}
