//! Background worker entry points. Runs in the extension service worker on Chrome
//! and the background page on Firefox. Only this crate writes stored state.

use wasm_bindgen::prelude::*;

/// Parse an MHTML capture and return its parts as JSON for the renderer. Bytes are
/// base64 encoded because structured clone cannot carry `Vec<u8>` back to JS.
#[wasm_bindgen]
pub fn parse_mhtml(bytes: &[u8]) -> Result<String, JsValue> {
    let parts =
        hammock_reader_core::parse(bytes).map_err(|error| JsValue::from_str(&error.to_string()))?;
    let encoded: Vec<EncodedPart> = parts
        .into_iter()
        .map(|part| EncodedPart {
            kind: part.kind,
            content_type: part.content_type,
            content_id: part.content_id,
            content_location: part.content_location,
            bytes: base64(&part.bytes),
        })
        .collect();
    serde_json::to_string(&encoded).map_err(|error| JsValue::from_str(&error.to_string()))
}

/// Id for a new article.
#[wasm_bindgen]
pub fn article_id(url: &str, saved_at: f64) -> String {
    hammock_reader_core::make_id(url, saved_at as i64)
}

/// HTML `<title>` from a capture, so the list and reader have a name.
#[wasm_bindgen]
pub fn capture_title(bytes: &[u8]) -> String {
    hammock_reader_core::title_of(bytes)
}

/// Compose a page snapshot into MHTML (the Firefox path). Resources arrive as
/// `[{url, contentType, base64}]`; the result is the same shape Chrome captures.
#[wasm_bindgen]
pub fn compose_mhtml(page_url: &str, html: &str, resources_json: &str) -> Result<String, JsValue> {
    #[derive(serde::Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct Input {
        url: String,
        content_type: String,
        base64: String,
    }

    let input: Vec<Input> = serde_json::from_str(resources_json)
        .map_err(|error| JsValue::from_str(&error.to_string()))?;
    let mut resources = Vec::with_capacity(input.len());
    for resource in input {
        let bytes = decode_base64(&resource.base64)
            .ok_or_else(|| JsValue::from_str("resource is not valid base64"))?;
        resources.push(hammock_reader_core::Resource {
            url: resource.url,
            content_type: resource.content_type,
            bytes,
        });
    }
    Ok(hammock_reader_core::compose(page_url, html, &resources))
}

fn decode_base64(input: &str) -> Option<Vec<u8>> {
    let mut out = Vec::with_capacity(input.len() * 3 / 4);
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

/// Base64 for bytes crossing the JS boundary. 76-column wrapped is still decoded
/// by the renderer, and keeps the message small against the JSON overhead.
pub fn base64(bytes: &[u8]) -> String {
    const ALPHABET: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut out = String::with_capacity(bytes.len().div_ceil(3) * 4);
    for chunk in bytes.chunks(3) {
        let b = [
            chunk[0],
            *chunk.get(1).unwrap_or(&0),
            *chunk.get(2).unwrap_or(&0),
        ];
        let n = (u32::from(b[0]) << 16) | (u32::from(b[1]) << 8) | u32::from(b[2]);
        out.push(ALPHABET[(n >> 18) as usize & 63] as char);
        out.push(ALPHABET[(n >> 12) as usize & 63] as char);
        out.push(if chunk.len() > 1 {
            ALPHABET[(n >> 6) as usize & 63] as char
        } else {
            '='
        });
        out.push(if chunk.len() > 2 {
            ALPHABET[n as usize & 63] as char
        } else {
            '='
        });
    }
    out
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct EncodedPart {
    kind: hammock_reader_core::PartKind,
    content_type: String,
    content_id: String,
    content_location: String,
    bytes: String,
}

#[wasm_bindgen]
pub fn version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}
