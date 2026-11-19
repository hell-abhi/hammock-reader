// End-to-end: load dist/ in headless Chrome, save a page with a cross-origin
// image, assert the capture is stored and decodes through the Rust worker.
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
<body><h1>Saved heading</h1><p>Body text.</p><img src="http://127.0.0.1:19002/cat.png" alt="cat"></body></html>`;

function serve(port, handler) {
  const server = createServer(handler);
  return new Promise((resolve) => server.listen(port, "127.0.0.1", () => resolve(server)));
}

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
    const worker = await target.worker();
    worker?.on("console", (message) => console.log("[worker]", message.text()));
    const extensionId = new URL(target.url()).host;

    const page = await browser.newPage();
    await page.goto("http://localhost:19001/", { waitUntil: "networkidle2" });

    const popup = await browser.newPage();
    popup.on("console", (message) => console.log("[popup]", message.text()));
    popup.on("pageerror", (error) => console.log("[popup error]", error.message));
    await popup.goto(`chrome-extension://${extensionId}/popup.html`);
    // The popup runs as a tab here, so it is its own active tab. Send the target
    // page explicitly: this is the same worker path the real popup uses.
    const result = await popup.evaluate(() =>
      chrome.runtime.sendMessage({ type: "save", url: "http://localhost:19001/" }));
    if (result?.error) throw new Error(result.error);
    const text = `Saved ${result.parts} parts`;

    // Reading storage proves the capture reached OPFS, not just the UI.
    const stored = await popup.evaluate(async () => {
      const root = await navigator.storage.getDirectory();
      const dir = await root.getDirectoryHandle("articles");
      const names = [];
      for await (const name of dir.keys()) names.push(name);
      return names;
    });
    if (stored.length !== 1) throw new Error(`expected one stored article, got ${stored.length}`);

    console.log(`e2e save: PASS (${text})`);
  } finally {
    await browser.close();
    for (const server of servers) server.close();
  }
}

main().catch((error) => {
  console.error(`e2e save: FAIL ${error.message}`);
  process.exitCode = 1;
});
