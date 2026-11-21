// Renderer that rebuilds a captured page from its MHTML parts.
//
// The page is untrusted: scripts and inline handlers are removed, every resource
// is replaced by a blob URL, and the result is shown in a sandboxed iframe. CSS is
// rewritten first so `url(...)` and `@import` inside stylesheets also resolve to
// blobs. The logic mirrors what the Week 0 spike proved.

const BLOCKED = /<script\b[\s\S]*?<\/script>/gi;
const HANDLER_DQ = /\son[a-z]+\s*=\s*"[^"]*"/gi;
const HANDLER_SQ = /\son[a-z]+\s*=\s*'[^']*'/gi;
const HANDLER_BARE = /\son[a-z]+\s*=\s*[^\s>]+/gi;
const UNQUOTED = /\s(src|href|poster)=([^\s>"']+)/gi;
const CSS_URL = /url\(\s*['"]?([^'")]+)['"]?\s*\)/gi;
const CSS_IMPORT = /@import\s+['"]([^'"]+)['"]/gi;

/**
 * @param {{kind: string, contentType: string, contentId: string, contentLocation: string, bytes: Uint8Array}[]} parts
 * @returns {{htmlUrl: string, objectUrls: Map<string, string>, documentUrl: string}}
 */
export function render(parts) {
  const html = parts.find((part) => part.kind === "html");
  if (!html) throw new Error("capture has no HTML part");
  const documentUrl = html.contentLocation || "";

  // Pass 1: blobs for resources that CSS itself does not reference.
  const keys = new Map();
  const created = new Map();
  for (const part of parts) {
    if (part.kind === "html" || part.kind === "style") continue;
    const blob = new Blob([part.bytes], { type: mimeOf(part) });
    register(keys, created, part, blob);
  }

  // Pass 2: rewrite stylesheets against pass 1, then create their blobs.
  for (const part of parts) {
    if (part.kind !== "style") continue;
    const text = new TextDecoder().decode(part.bytes);
    const rewritten = text
      .replace(CSS_IMPORT, (all, url) => (keys.has(url) ? `@import "${keys.get(url)}"` : all))
      .replace(CSS_URL, (all, url) => (keys.has(url) ? `url("${keys.get(url)}")` : all));
    const blob = new Blob([rewritten], { type: "text/css" });
    register(keys, created, part, blob);
  }

  // Pass 3: the document. Longest keys first so a prefix is not replaced first.
  let body = new TextDecoder()
    .decode(html.bytes)
    .replace(BLOCKED, "")
    .replace(HANDLER_DQ, "")
    .replace(HANDLER_SQ, "")
    .replace(HANDLER_BARE, "")
    .replace(UNQUOTED, (all, attr, url) => (keys.has(url) ? ` ${attr}="${keys.get(url)}"` : all));

  for (const key of [...keys.keys()].sort((a, b) => b.length - a.length)) {
    if (body.includes(key)) body = body.split(key).join(keys.get(key));
  }

  if (documentUrl && !/<base\b/i.test(body)) {
    body = body.replace(/<head([^>]*)>/i, `<head$1><base href="${documentUrl}">`);
  }
  const htmlUrl = URL.createObjectURL(new Blob([body], { type: "text/html" }));
  return { htmlUrl, objectUrls: created, documentUrl };
}

/** Chrome keeps an image's absolute URL and gives stylesheets a `cid:`. Both are mapped. */
function register(keys, created, part, blob) {
  const url = URL.createObjectURL(blob);
  created.set(url, url);
  if (part.contentId) keys.set(`cid:${part.contentId}`, url);
  if (part.contentLocation) keys.set(part.contentLocation, url);
}

function mimeOf(part) {
  return (part.contentType || "application/octet-stream").split(";")[0];
}

/** Blob URLs are kept until the reader unloads; revoking earlier breaks images. */
export function release(rendered) {
  for (const url of rendered.objectUrls.values()) URL.revokeObjectURL(url);
  URL.revokeObjectURL(rendered.htmlUrl);
}
