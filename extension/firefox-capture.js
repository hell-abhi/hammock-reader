// Firefox capture. There is no `pageCapture` API, so: collect the DOM and resource
// URLs in the page, fetch the bytes from the worker (the Firefox build carries the
// host permission), and compose the same MHTML shape Chrome produces.
//
// Each function must be self-contained: it is injected or bundled, not imported.

/** Injected into the page. Must not reference module scope. */
export function collectPage() {
  const doc = document.cloneNode(true);
  const base = document.baseURI;

  doc.querySelectorAll("script, noscript, iframe").forEach((node) => node.remove());
  for (const node of doc.querySelectorAll("*")) {
    for (const attr of [...node.attributes]) {
      if (/^on/i.test(attr.name)) node.removeAttribute(attr.name);
    }
  }

  const absolute = (value) => {
    try {
      return new URL(value, base).href;
    } catch {
      return "";
    }
  };

  const urls = new Set();
  const add = (value) => {
    const full = absolute(value);
    if (/^https?:/.test(full)) urls.add(full);
    return full;
  };

  const stylesheets = [];
  for (const node of doc.querySelectorAll("link[rel~='stylesheet'][href], link[rel~='icon'][href], link[rel='apple-touch-icon'][href]")) {
    const href = add(node.getAttribute("href") || "");
    if (!href) continue;
    if (/stylesheet/i.test(node.getAttribute("rel") || "")) stylesheets.push(href);
    node.setAttribute("href", href);
  }

  for (const node of doc.querySelectorAll("[src], [poster]")) {
    const attr = node.hasAttribute("src") ? "src" : "poster";
    const value = add(node.getAttribute(attr) || "");
    if (value) node.setAttribute(attr, value);
  }

  for (const node of doc.querySelectorAll("[srcset]")) {
    node.setAttribute("srcset", (node.getAttribute("srcset") || "")
      .split(",")
      .map((entry) => {
        const [url, descriptor] = entry.trim().split(/\s+/, 2);
        const full = add(url) || url;
        return descriptor ? `${full} ${descriptor}` : full;
      })
      .join(", "));
  }

  for (const match of doc.documentElement.outerHTML.matchAll(/url\(\s*['"]?([^'")]+)['"]?\s*\)/g)) {
    add(match[1]);
  }

  return { html: doc.documentElement.outerHTML, urls: [...urls], stylesheets };
}

/**
 * Fetch URLs and return them ready for `compose_mhtml`: base64 bytes and the
 * content type. Failures and oversized resources are dropped; a missing image
 * must not lose the article.
 */
export async function fetchResources(urls, { timeoutMs = 10000, limit = 8 * 1024 * 1024 } = {}) {
  const resources = [];
  for (const url of urls) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      const response = await fetch(url, { credentials: "omit", signal: controller.signal });
      clearTimeout(timer);
      if (!response.ok) continue;
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (bytes.length === 0 || bytes.length > limit) continue;
      resources.push({
        url,
        contentType: (response.headers.get("content-type") || "application/octet-stream").split(";")[0],
        base64: toBase64(bytes),
      });
    } catch {
      // Dropped on purpose.
    }
  }
  return resources;
}

function toBase64(bytes) {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

/** Replace stylesheet links with inline styles whose URLs are absolute. */
export function inlineStyles(html, sheets) {
  let out = html;
  for (const sheet of sheets) {
    const escaped = sheet.url.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const link = new RegExp(`<link[^>]+href=["']${escaped}["'][^>]*>`, "i");
    if (!link.test(out)) continue;
    const css = rewriteCssUrls(sheet.css, sheet.url);
    out = out.replace(link, `<style>${css.replace(/<\/style/gi, "<\\/style")}</style>`);
  }
  return out;
}

/** Make every `url(...)` and `@import` absolute against the stylesheet URL. */
export function rewriteCssUrls(css, base) {
  const resolve = (value) => {
    try {
      return new URL(value, base).href;
    } catch {
      return value;
    }
  };
  return css
    .replace(/@import\s+(?:url\()?['"]?([^'")]+)['"]?\)?/gi,
      (all, url) => (url.startsWith("data:") ? all : `@import url("${resolve(url)}")`))
    .replace(/url\(\s*['"]?([^'")]+)['"]?\s*\)/gi,
      (all, url) => (url.startsWith("data:") ? all : `url("${resolve(url)}")`));
}
