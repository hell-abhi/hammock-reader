// End-to-end: load dist/ in headless Chrome, save a page with a cross-origin
// image, then reopen it in the reader and check it rendered offline with images.
// Usage: node e2e/save.mjs [--headed]
import { createServer } from "node:http";
import { readFile, mkdtemp, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "dist");
const chrome = process.env.CHROME_PATH
  || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);
const PAGE = `<!doctype html><html><head><title>E2E page</title></head>
<body><h1>Saved heading</h1><p>Body text.</p><img id="cat" src="http://127.0.0.1:19002/cat.png" alt="cat"></body></html>`;

function serve(port, handler) {
  const server = createServer(handler);
  return new Promise((resolve) => server.listen(port, "127.0.0.1", () => resolve(server)));
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  await mkdir(dist, { recursive: true });
  const manifest = JSON.parse(await readFile(join(dist, "manifest.json"), "utf8"));
  if (!manifest.permissions?.includes("pageCapture")) {
    throw new Error(`no build at ${dist}; run cargo xtask build`);
  }

  const servers = [
    await serve(19001, (_req, res) => {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end(PAGE);
    }),
    await serve(19002, (_req, res) => {
      res.writeHead(200, { "content-type": "image/png" });
      res.end(PNG);
    }),
  ];

  const browser = await puppeteer.launch({
    executablePath: chrome,
    headless: !process.argv.includes("--headed"),
    pipe: true,
    userDataDir: await mkdtemp(join(tmpdir(), "hammock-reader-e2e-")),
    args: ["--no-first-run", "--no-default-browser-check"],
    enableExtensions: [dist],
  });

  try {
    const target = await browser.waitForTarget(
      (t) => t.type() === "service_worker" && t.url().startsWith("chrome-extension://"),
      { timeout: 15000 },
    );
    const extensionId = new URL(target.url()).host;

    const page = await browser.newPage();
    await page.goto("http://localhost:19001/", { waitUntil: "networkidle2" });

    const popup = await browser.newPage();
    popup.on("pageerror", (error) => console.log("[popup error]", error.message));
    await popup.goto(`chrome-extension://${extensionId}/popup.html`);

    // The popup is a tab in this run, so it is its own active tab. Send the page URL
    // explicitly: the worker path and the real popup call are otherwise identical.
    const saved = await popup.evaluate(() =>
      chrome.runtime.sendMessage({ type: "save", url: "http://localhost:19001/" }));
    if (saved?.error) throw new Error(saved.error);

    const listed = await popup.evaluate(() => chrome.runtime.sendMessage({ type: "list" }));
    if (listed.articles.length !== 1) throw new Error(`expected one article, got ${listed.articles.length}`);
    if (listed.articles[0].title !== "E2E page") {
      throw new Error(`bad title: ${listed.articles[0].title}`);
    }

    // Original servers go away now: everything below must come from the capture.
    for (const server of servers) server.close();

    // Reader: rendered sandboxed, no scripts, images present.
    const reader = await browser.newPage();
    reader.on("pageerror", (error) => console.log("[reader error]", error.message));
    await reader.goto(`chrome-extension://${extensionId}/reader.html?id=${saved.id}`);
    await reader.waitForFunction(() => document.getElementById("page")?.src?.startsWith("blob:"),
      { timeout: 15000 });
    await sleep(1500);

    const state = await reader.evaluate(() => {
      const frame = document.getElementById("page").contentDocument;
      return {
        heading: frame?.querySelector("h1")?.textContent || "",
        images: frame ? [...frame.images].map((img) => ({ ok: img.complete && img.naturalWidth > 0, src: img.src.slice(0, 5) })) : [],
        scripts: frame?.querySelectorAll("script").length ?? -1,
      };
    });
    if (state.heading !== "Saved heading") throw new Error(`heading not rendered: ${JSON.stringify(state)}`);
    if (state.scripts !== 0) throw new Error(`scripts survived: ${state.scripts}`);
    if (!state.images.length || state.images.some((img) => !img.ok || img.src !== "blob:")) {
      throw new Error(`images not served from blobs: ${JSON.stringify(state.images)}`);
    }

    console.log(`e2e save: PASS (${saved.parts} parts, reader rendered ${state.images.length} image(s), no scripts)`);
  } finally {
    await browser.close();
    for (const server of servers) server.close();
  }
}

main().catch((error) => {
  console.error(`e2e save: FAIL ${error.message}`);
  process.exitCode = 1;
});
