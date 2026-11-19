// Offscreen document: decodes MHTML, rewrites resources to blob URLs, renders it
// sandboxed. Service workers have no URL.createObjectURL, which is why this is here.
// Functions mirror lib/mhtml.mjs (self-checked by the runner).
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "render") return;
  render(message.mhtml).then(sendResponse, (error) => sendResponse({ error: String(error) }));
  return true;
});

function header(body) {
  const split = body.search(/\r?\n\r?\n/);
  const head = split < 0 ? body : body.slice(0, split);
  const data = split < 0 ? "" : body.slice(split).replace(/^\r?\n\r?\n/, "");
  const map = new Map();
  for (const line of head.split(/\r?\n/)) {
    const found = /^([\w-]+):\s*(.*)$/.exec(line);
    if (found) map.set(found[1].toLowerCase(), found[2].trim());
  }
  return { map, data };
}

function decodeQuotedPrintable(input) {
  const bytes = [];
  for (let i = 0; i < input.length; i += 1) {
    const ch = input.codePointAt(i);
    if (ch > 0xffff) i += 1;
    if (ch === 0x3d) {
      const next = input.slice(i + 1, i + 3);
      if (/^[0-9A-Fa-f]{2}$/.test(next)) {
        bytes.push(parseInt(next, 16));
        i += 2;
        continue;
      }
      if (/^\r?\n/.test(input.slice(i + 1, i + 3))) {
        i += input[i + 1] === "\r" ? 2 : 1;
        continue;
      }
    }
    bytes.push(...new TextEncoder().encode(String.fromCodePoint(ch)));
  }
  return new Uint8Array(bytes);
}

function transfer(headers, body) {
  const encoding = (headers.get("content-transfer-encoding") || "").toLowerCase();
  if (encoding === "base64") {
    const raw = atob(body.replace(/\s+/g, ""));
    const bytes = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i);
    return bytes;
  }
  if (encoding === "quoted-printable") return decodeQuotedPrintable(body);
  return new TextEncoder().encode(body);
}

function parse(mhtml) {
  const boundary = /boundary="?([^";\r\n]+)"?/i.exec(mhtml)?.[1];
  if (!boundary) throw new Error("no boundary");
  const parts = [];
  for (const raw of mhtml.split(`--${boundary}`)) {
    if (!/content-type:/i.test(raw)) continue;
    const { map, data } = header(raw);
    parts.push({
      id: (map.get("content-id") || "").replace(/^<|>$/g, ""),
      location: map.get("content-location") || "",
      contentType: map.get("content-type") || "",
      bytes: transfer(map, data),
    });
  }
  return parts;
}

function mimeOf(contentType) {
  if (/^text\/html/i.test(contentType)) return "text/html";
  return (contentType.split(";")[0] || "application/octet-stream").trim();
}

function stripScripts(html) {
  return html
    .replace(/<script\b[\s\S]*?<\/script>/gi, "")
    .replace(/\son[a-z]+\s*=\s*"[^"]*"/gi, "")
    .replace(/\son[a-z]+\s*=\s*'[^']*'/gi, "");
}

function absolutize(html, base) {
  return html.replace(/\s(src|href|poster)="([^"#]+)"/gi, (all, attr, url) => {
    if (/^(data:|blob:|cid:|https?:|about:)/i.test(url)) return all;
    try {
      return ` ${attr}="${new URL(url, base).href}"`;
    } catch {
      return all;
    }
  });
}

// Cross-origin stylesheets and images are stored as MHTML parts and referenced as
// cid:<Content-ID>, so both the cid and the Content-Location need rewriting.
function rewrite(body, parts) {
  const urls = new Map();
  let blobs = 0;
  for (const part of parts) {
    if (part.contentType.startsWith("text/html")) continue;
    const blob = new Blob([part.bytes], { type: mimeOf(part.contentType) });
    const url = URL.createObjectURL(blob);
    blobs += 1;
    if (part.id) urls.set(`cid:${part.id}`, url);
    if (part.location) urls.set(part.location, url);
  }
  let out = body;
  for (const [key, url] of urls) out = out.split(key).join(url);
  return { out, blobs, resources: urls.size };
}

async function render(mhtml) {
  const parts = parse(mhtml);
  const htmlPart = parts.find((p) => p.contentType.startsWith("text/html"));
  if (!htmlPart) throw new Error("no html part");

  const base = htmlPart.location || "https://example.com/";
  let body = stripScripts(new TextDecoder().decode(htmlPart.bytes));
  body = absolutize(body, base);
  const rewritten = rewrite(body, parts);
  body = rewritten.out;
  if (!/<base\b/i.test(body)) {
    body = body.replace(/<head([^>]*)>/i, `<head$1><base href="${base}">`);
  }

  const iframe = document.createElement("iframe");
  iframe.setAttribute("sandbox", "allow-same-origin");
  iframe.style.cssText = "position:absolute;left:-9999px;width:900px;height:700px";
  document.documentElement.append(iframe);
  await new Promise((resolve) => {
    iframe.onload = resolve;
    iframe.srcdoc = body;
    setTimeout(resolve, 10000);
  });
  await new Promise((r) => setTimeout(r, 2000));

  const doc = iframe.contentDocument;
  const images = [...(doc?.images || [])];
  const loaded = images.filter((img) => img.complete && img.naturalWidth > 0);
  const failedUrls = images
    .filter((img) => !(img.complete && img.naturalWidth > 0))
    .map((img) => img.currentSrc || img.src)
    .slice(0, 5);
  const report = {
    htmlBytes: body.length,
    parts: parts.length,
    blobs: rewritten.blobs,
    resources: rewritten.resources,
    images: images.length,
    imagesLoaded: loaded.length,
    externalLeft: images.filter((img) => /^https?:/.test(img.currentSrc || img.src)).length,
    failedSample: failedUrls,
    scriptsBlocked: typeof doc?.defaultView?.__spikeRan === "undefined",
    inlineHandlersLeft: (body.match(/\son[a-z]+\s*=/gi) || []).length,
    scriptTagsLeft: (body.match(/<script\b/gi) || []).length,
  };
  iframe.remove();
  return report;
}
