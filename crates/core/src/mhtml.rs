//! MHTML decode. Chrome's `pageCapture.saveAsMHTML` output, and the Firefox
//! snapshot we build, both use this shape: a multipart/related container whose
//! resources are referenced as `cid:<Content-ID>` rather than by URL.

use crate::error::CoreError;
use serde::Serialize;
/// What a part is, decided from its Content-Type so callers can pick a MIME type
/// without re-parsing.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum PartKind {
    Html,
    Image,
    Style,
    Font,
    Other,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct MhtmlPart {
    pub content_id: String,
    pub content_location: String,
    pub content_type: String,
    pub kind: PartKind,
    /// Decoded bytes, including the HTML part (latin-1 bytes, not UTF-8).
    pub bytes: Vec<u8>,
}

impl MhtmlPart {
    pub fn kind_of(content_type: &str) -> PartKind {
        let mime = content_type.split(';').next().unwrap_or("").trim();
        if mime.eq_ignore_ascii_case("text/html") {
            PartKind::Html
        } else if mime.starts_with("image/") {
            PartKind::Image
        } else if mime.eq_ignore_ascii_case("text/css") {
            PartKind::Style
        } else if mime.starts_with("font/") || mime == "application/font-woff" {
            PartKind::Font
        } else {
            PartKind::Other
        }
    }
}

/// Split an MHTML container into decoded parts.
pub fn parse(bytes: &[u8]) -> Result<Vec<MhtmlPart>, CoreError> {
    let text = String::from_utf8_lossy(bytes);
    let boundary = boundary_of(&text).ok_or(CoreError::MissingBoundary)?;
    let marker = format!("--{boundary}");
    let mut parts = Vec::new();
    for raw in text.split(&marker) {
        let Some(part) = parse_part(raw) else {
            continue;
        };
        parts.push(part);
    }
    if !parts.iter().any(|p| p.kind == PartKind::Html) {
        return Err(CoreError::MissingHtml);
    }
    Ok(parts)
}

fn boundary_of(text: &str) -> Option<String> {
    let head = text.split("\r\n\r\n").next().unwrap_or(text);
    let start = head.to_ascii_lowercase().find("boundary=")?;
    let rest = &head[start + "boundary=".len()..];
    let rest = rest.trim_start();
    let (quote, rest) = match rest.chars().next()? {
        '"' => ('"', &rest[1..]),
        '\'' => ('\'', &rest[1..]),
        _ => ('\0', rest),
    };
    let end = if quote == '\0' {
        rest.find([';', '\r', '\n', ' ', '\t'])
            .unwrap_or(rest.len())
    } else {
        rest.find(quote)?
    };
    Some(rest[..end].to_string())
}

fn parse_part(raw: &str) -> Option<MhtmlPart> {
    let head_end = raw.find("\r\n\r\n").or_else(|| raw.find("\n\n"))?;
    let head = &raw[..head_end];
    let body = &raw[head_end..].trim_start_matches(['\r', '\n']);
    let content_type = header(head, "content-type")?;
    let content_id = header(head, "content-id")
        .unwrap_or_default()
        .trim_start_matches('<')
        .trim_end_matches('>')
        .to_string();
    let content_location = header(head, "content-location").unwrap_or_default();
    let bytes = match header(head, "content-transfer-encoding").as_deref() {
        Some("base64") => decode_base64(body).unwrap_or_default(),
        Some("quoted-printable") => decode_quoted_printable(body),
        _ => body.as_bytes().to_vec(),
    };
    let kind = MhtmlPart::kind_of(&content_type);
    Some(MhtmlPart {
        content_id,
        content_location,
        content_type,
        kind,
        bytes,
    })
}

fn header(head: &str, name: &str) -> Option<String> {
    head.lines().find_map(|line| {
        let (key, value) = line.split_once(':')?;
        key.trim()
            .eq_ignore_ascii_case(name)
            .then(|| value.trim().to_string())
    })
}

/// Base64 with whitespace, standard alphabet, optional padding.
fn decode_base64(input: &str) -> Option<Vec<u8>> {
    let mut out = Vec::with_capacity(input.len() / 4 * 3);
    let mut acc = 0u32;
    let mut bits = 0u8;
    for byte in input.bytes() {
        let value = match byte {
            b'A'..=b'Z' => byte - b'A',
            b'a'..=b'z' => byte - b'a' + 26,
            b'0'..=b'9' => byte - b'0' + 52,
            b'+' => 62,
            b'/' => 63,
            b'=' => break,
            b' ' | b'\t' | b'\r' | b'\n' => continue,
            _ => return None,
        };
        acc = (acc << 6) | u32::from(value);
        bits += 6;
        if bits >= 8 {
            bits -= 8;
            out.push((acc >> bits) as u8);
            acc &= (1 << bits) - 1;
        }
    }
    Some(out)
}

/// Quoted-printable: `=XX` hex, `=` soft line break. A `=` not followed by hex or
/// a line break is copied through, which is what Chrome emits for stray equals.
fn decode_quoted_printable(input: &str) -> Vec<u8> {
    let bytes = input.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'=' {
            match bytes.get(i + 1) {
                Some(b'\r') if bytes.get(i + 2) == Some(&b'\n') => {
                    i += 3;
                    continue;
                }
                Some(b'\n') => {
                    i += 2;
                    continue;
                }
                Some(hi) if hi.is_ascii_hexdigit() => {
                    if let Some(lo) = bytes.get(i + 2).filter(|b| b.is_ascii_hexdigit()) {
                        out.push((hex(hi) << 4) | hex(lo));
                        i += 3;
                        continue;
                    }
                }
                _ => {}
            }
        }
        out.push(bytes[i]);
        i += 1;
    }
    out
}

fn hex(byte: &u8) -> u8 {
    match byte {
        b'0'..=b'9' => byte - b'0',
        b'a'..=b'f' => byte - b'a' + 10,
        b'A'..=b'F' => byte - b'A' + 10,
        _ => 0,
    }
}
