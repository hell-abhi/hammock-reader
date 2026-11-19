// Loader shim: Chrome MV3 service worker. All logic lives in the Rust Wasm worker.
// Top-level await would block service worker registration, so the module is
// initialised lazily and every handler awaits the same promise.

import init, { parse_mhtml } from "./pkg/hammock_reader_bg.js";

const ready = init();

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "save") return;
  save(message.url).then(sendResponse, (error) => sendResponse({ error: String(error) }));
  return true;
});

async function save(preferredUrl) {
  await ready;
  const tabs = await chrome.tabs.query({});
  const tab = tabs.find((t) => t.url === preferredUrl)
    || tabs.find((t) => /^https?:/.test(t.url || ""));
  if (!tab) throw new Error("no page tab to save");

  const blob = await chrome.pageCapture.saveAsMHTML({ tabId: tab.id });
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const parsed = JSON.parse(parse_mhtml(bytes));

  const root = await navigator.storage.getDirectory();
  const dir = await root.getDirectoryHandle("articles", { create: true });
  const name = `${crypto.randomUUID()}.mhtml`;
  const file = await dir.getFileHandle(name, { create: true });
  const writable = await file.createWritable();
  await writable.write(bytes);
  await writable.close();

  return { url: tab.url, bytes: bytes.length, parts: parsed.length, name };
}
