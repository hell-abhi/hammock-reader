use hammock_reader_core::{CoreError, PartKind, parse};

const FIXTURE: &[u8] = include_bytes!("fixtures/fixture.mhtml");

#[test]
fn parses_the_captured_fixture() {
    let parts = parse(FIXTURE).expect("fixture must parse");
    assert_eq!(
        parts.len(),
        3,
        "html, image and stylesheet; the container is not a part"
    );
    let html = parts
        .iter()
        .find(|p| p.kind == PartKind::Html)
        .expect("html part");
    assert_eq!(html.content_location, "http://localhost:19001/");
    assert!(html.content_type.starts_with("text/html"));
    let text = String::from_utf8_lossy(&html.bytes);
    assert!(
        text.contains("Spike fixture heading"),
        "quoted-printable must decode"
    );
    assert!(
        text.contains("cid:"),
        "fixture references resources by content id"
    );
}

#[test]
fn keeps_the_cross_origin_image_as_a_separate_part() {
    let parts = parse(FIXTURE).expect("fixture must parse");
    let image = parts
        .iter()
        .find(|p| p.kind == PartKind::Image)
        .expect("image part");
    assert_eq!(image.content_location, "http://127.0.0.1:19002/cat.png");
    assert!(
        image.content_id.is_empty(),
        "Chrome keeps the URL for images, not a content id"
    );
    assert!(
        image.bytes.starts_with(b"\x89PNG"),
        "base64 must decode to PNG bytes"
    );
}

#[test]
fn stylesheets_are_referenced_by_content_id() {
    // Images keep their absolute URL in the HTML; stylesheets are rewritten to cid:.
    let parts = parse(FIXTURE).expect("fixture must parse");
    let style = parts
        .iter()
        .find(|p| p.kind == PartKind::Style)
        .expect("style part");
    assert!(style.content_location.starts_with("cid:css-"));
    let html = parts
        .iter()
        .find(|p| p.kind == PartKind::Html)
        .expect("html part");
    let text = String::from_utf8_lossy(&html.bytes);
    assert!(text.contains("http://127.0.0.1:19002/cat.png"));
    assert!(text.contains("cid:css-"));
}

#[test]
fn rejects_a_container_without_a_boundary() {
    assert_eq!(parse(b"not mhtml").unwrap_err(), CoreError::MissingBoundary);
}

#[test]
fn rejects_a_container_without_html() {
    let only_image = b"Content-Type: multipart/related; boundary=\"b\"\r\n\r\n--b\r\nContent-Type: image/png\r\n\r\nxx\r\n--b--";
    assert_eq!(parse(only_image).unwrap_err(), CoreError::MissingHtml);
}
