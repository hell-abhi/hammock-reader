// Minimal MHTML decode for the Week 0 spikes. The same functions are inlined in
// ext/offscreen.js because the extension page cannot import this file.
// Self-check: node lib/mhtml.mjs

export function header(body) {
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

export function decodeQuotedPrintable(input) {
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

export function transfer(headers, body) {
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

export function parse(mhtml) {
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

export function mimeOf(contentType) {
  if (/^text\/html/i.test(contentType)) return "text/html";
  return (contentType.split(";")[0] || "application/octet-stream").trim();
}

export function stripScripts(html) {
  return html
    .replace(/<script\b[\s\S]*?<\/script>/gi, "")
    .replace(/\son[a-z]+\s*=\s*"[^"]*"/gi, "")
    .replace(/\son[a-z]+\s*=\s*'[^']*'/gi, "");
}

export function absolutize(html, base) {
  return html.replace(/\s(src|href|poster)="([^"#]+)"/gi, (all, attr, url) => {
    if (/^(data:|blob:|cid:|https?:|about:)/i.test(url)) return all;
    try {
      return ` ${attr}="${new URL(url, base).href}"`;
    } catch {
      return all;
    }
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const cases = [
    ["=3D", "="],
    ["a=3Db", "a=b"],
    ["line=\r\nbreak", "linebreak"],
    ["caf=C3=A9", "café"],
    ["100=25", "100%"],
    ["plain text", "plain text"],
    ["=ZZ", "=ZZ"],
  ];
  for (const [input, expected] of cases) {
    const got = new TextDecoder().decode(decodeQuotedPrintable(input));
    if (got !== expected) {
      console.error(`FAIL ${JSON.stringify(input)} -> ${JSON.stringify(got)} (want ${JSON.stringify(expected)})`);
      process.exit(1);
    }
  }
  console.log(`mhtml self-check passed (${cases.length} cases)`);
}
