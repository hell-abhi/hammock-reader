// Week 0 spike worker for Hammock Reader. Throwaway.
// Answers: can pageCapture save a page with cross-origin images, can the MHTML be
// decoded, and does the result render in a sandboxed iframe without scripts?
// Service workers have no URL.createObjectURL, so rendering goes to an offscreen document.

const S = { steps: {} };

function record(step, value) {
  S.steps[step] = value;
  chrome.storage.local.set({ spike: S.steps });
  return value;
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "reset") return;
  S.steps = {};
  chrome.storage.local.set({ spike: {} });
  capture(message.url).catch((error) => record("fatal", String(error)));
  sendResponse({ started: true });
});

async function capture(url) {
  const tabs = await chrome.tabs.query({});
  const tab = tabs.find((t) => t.url === url);
  if (!tab) return record("tab", `not found for ${url}`);
  record("url", tab.url);
  await chrome.tabs.update(tab.id, { active: true });
  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: async () => {
        // Lazy images must be requested before capture. decode() can hang on pages
        // with never-loading images, so this waits briefly instead.
        for (const img of document.images) {
          if (!img.src && img.dataset?.src) img.src = img.dataset.src;
        }
        await new Promise((r) => setTimeout(r, 800));
      },
    });
  } catch (error) {
    record("decodeImages", String(error));
  }

  const blob = await chrome.pageCapture.saveAsMHTML({ tabId: tab.id });
  const mhtml = await blob.text();
  record("s5", { bytes: mhtml.length, parts: (mhtml.match(/^Content-Type:/gm) || []).length });

  await ensureOffscreen();
  const report = await chrome.runtime.sendMessage({ type: "render", mhtml });
  record("s3", report);
  record("done", true);
}

async function ensureOffscreen() {
  const url = chrome.runtime.getURL("offscreen.html");
  const contexts = await chrome.runtime.getContexts({
    contextTypes: ["OFFSCREEN_DOCUMENT"],
  });
  if (contexts.some((c) => c.documentUrl === url)) return;
  await chrome.offscreen.createDocument({
    url,
    reasons: ["BLOBS"],
    justification: "Render captured MHTML with blob URLs.",
  });
}
