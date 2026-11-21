// Loader shim: Chrome MV3 service worker. All logic lives in the Rust Wasm worker.
// Top-level await would block service worker registration, so the module is
// initialised lazily and every handler awaits the same promise.

import init, { parse_mhtml, article_id, capture_title, compose_mhtml } from "./pkg/hammock_reader_bg.js";
import { collectPage, fetchResources, inlineStyles } from "./firefox-capture.js";

const ready = init();
const ARTICLES = "articles";
const hasPageCapture = typeof chrome.pageCapture?.saveAsMHTML === "function";

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  const handlers = { save, list, get };
  const handler = handlers[message?.type];
  if (!handler) return;
  handler(message).then(sendResponse, (error) => sendResponse({ error: String(error) }));
  return true;
});

async function save(preferredUrl) {
  await ready;
  const tabs = await chrome.tabs.query({});
  const tab = tabs.find((t) => t.url === preferredUrl)
    || tabs.find((t) => /^https?:/.test(t.url || ""));
  if (!tab) throw new Error("no page tab to save");

  const bytes = hasPageCapture ? await captureChrome(tab) : await captureFirefox(tab);
  const parts = JSON.parse(parse_mhtml(bytes));
  const title = capture_title(bytes) || tab.title || tab.url;

  const savedAt = Date.now();
  const id = article_id(tab.url, savedAt);
  await write(id, bytes);

  const { [ARTICLES]: articles = [] } = await chrome.storage.local.get(ARTICLES);
  articles.unshift({ id, url: tab.url, title, savedAt, bytes: bytes.length, parts: parts.length });
  await chrome.storage.local.set({ [ARTICLES]: articles });
  return { id, title, bytes: bytes.length, parts: parts.length };
}

async function captureChrome(tab) {
  const blob = await chrome.pageCapture.saveAsMHTML({ tabId: tab.id });
  return new Uint8Array(await blob.arrayBuffer());
}

/// Firefox: collect the page, fetch its resources, compose the same MHTML shape.
async function captureFirefox(tab) {
  const [{ result } = {}] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: collectPage,
  });
  if (!result?.html) throw new Error("page could not be collected");

  const resources = await fetchResources(result.urls);
  const sheets = [];
  for (const sheet of result.stylesheets) {
    const fetched = resources.find((resource) => resource.url === sheet);
    if (!fetched) continue;
    sheets.push({ url: fetched.url, css: new TextDecoder().decode(base64ToBytes(fetched.base64)) });
  }
  // Stylesheets are inlined, so only the remaining resources belong in the capture.
  const embedded = resources.filter((resource) => !result.stylesheets.includes(resource.url));
  const html = inlineStyles(result.html, sheets);
  const mhtml = compose_mhtml(tab.url, html, JSON.stringify(embedded));
  return new TextEncoder().encode(mhtml);
}

function base64ToBytes(base64) {
  return Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
}

async function list() {
  const { [ARTICLES]: articles = [] } = await chrome.storage.local.get(ARTICLES);
  return { articles };
}

async function get({ id }) {
  await ready;
  const { [ARTICLES]: articles = [] } = await chrome.storage.local.get(ARTICLES);
  const article = articles.find((entry) => entry.id === id);
  if (!article) throw new Error("article not found");
  const bytes = await read(id);
  if (!bytes) throw new Error("capture missing from storage");
  return { article, parts: JSON.parse(parse_mhtml(bytes)) };
}

async function root() {
  return navigator.storage.getDirectory();
}

async function write(id, bytes) {
  const dir = await (await root()).getDirectoryHandle("articles", { create: true });
  const file = await dir.getFileHandle(`${id}.mhtml`, { create: true });
  const writable = await file.createWritable();
  await writable.write(bytes);
  await writable.close();
}

async function read(id) {
  const dir = await (await root()).getDirectoryHandle("articles", { create: true });
  try {
    const file = await dir.getFileHandle(`${id}.mhtml`);
    return new Uint8Array(await (await file.getFile()).arrayBuffer());
  } catch {
    return null;
  }
}
