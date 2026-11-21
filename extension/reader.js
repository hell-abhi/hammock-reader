// Opens one saved article. The page itself is rendered sandboxed: no scripts, no
// network, resources served from blob URLs built from the stored capture.

import { render } from "./render.js";

const id = new URLSearchParams(location.search).get("id");

async function open() {
  if (!id) throw new Error("no article id");
  const reply = await chrome.runtime.sendMessage({ type: "get", id });
  if (reply?.error) throw new Error(reply.error);

  const { article, parts } = reply;
  document.title = article.title || "Reader";
  document.getElementById("title").textContent = article.title || article.url;
  document.getElementById("source").href = article.url;

  const rendered = render(parts.map((part) => ({
    ...part,
    bytes: Uint8Array.from(atob(part.bytes), (c) => c.charCodeAt(0)),
  })));
  document.getElementById("page").src = rendered.htmlUrl;
}

open().catch((error) => {
  document.getElementById("title").textContent = `Could not open: ${error.message}`;
});
