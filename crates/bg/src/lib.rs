//! Background worker entry points. Runs in the extension service worker on Chrome
//! and the background page on Firefox. Only this crate writes stored state.

use wasm_bindgen::prelude::*;

/// Parse an MHTML capture and return its parts as JSON for the offscreen renderer.
#[wasm_bindgen]
pub fn parse_mhtml(bytes: &[u8]) -> Result<String, JsValue> {
    let parts =
        hammock_reader_core::parse(bytes).map_err(|error| JsValue::from_str(&error.to_string()))?;
    serde_json::to_string(&parts).map_err(|error| JsValue::from_str(&error.to_string()))
}

#[wasm_bindgen]
pub fn version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}
