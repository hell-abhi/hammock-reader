// Week 0 spike runner. Drives headless Chrome against an unpacked throwaway
// extension, captures fixtures as MHTML, rewrites resources, renders sandboxed.
// Usage: npm install && npm run spike
import { createServer } from "node:http";
import { mkdir, writeFile, readFile, mkdtemp } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";

const here = dirname(fileURLToPath(import.meta.url));
const ext = join(here, "ext");
const evidenceDir = join(here, "evidence");
const chromePath = process.env.CHROME_PATH
  || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

const FIXTURE = { title: "Spike fixture", origin: "http://localhost:19001", image: "http://127.0.0.1:19002/cat.png" };
const REAL_PAGES = (process.env.SPIKE_URLS || [
  "https://example.com/",
  "https://en.wikipedia.org/wiki/Readability",
  "https://www.bbc.com/news",
  "https://news.ycombinator.com/",
  "https://www.theguardian.com/international",
  "https://www.nytimes.com/",
  "https://arstechnica.com/",
  "https://www.theverge.com/",
  "https://www.wired.com/",
  "https://www.nature.com/",
  "https://www.science.org/",
  "https://medium.com/",
  "https://substack.com/",
  "https://www.newyorker.com/",
  "https://www.theatlantic.com/",
  "https://www.economist.com/",
  "https://www.reuters.com/",
  "https://apnews.com/",
  "https://www.npr.org/",
  "https://www.aljazeera.com/",
  "https://www.smashingmagazine.com/",
  "https://css-tricks.com/",
  "https://developer.mozilla.org/en-US/docs/Web/API/File_System_API",
  "https://doc.rust-lang.org/book/",
  "https://github.com/anonymousAAK/hammock",
  "https://www.figma.com/blog/",
  "https://stripe.com/blog",
  "https://www.anthropic.com/news",
  "https://simonwillison.net/",
  "https://daringfireball.net/",
].join(",")).split(",").filter(Boolean);

const PAGE_HTML = `<!doctype html><html><head><meta charset="utf-8">
<title>${FIXTURE.title}</title>
<style>body{font-family:Georgia,serif;margin:2rem}h1{color:#123}img{max-width:320px}</style>
</head><body onload="window.__loaded=1">
<h1>Spike fixture heading</h1>
<p>Body text for the capture spike. The image below is cross-origin.</p>
<img src="${FIXTURE.image}" alt="cat">
<p id="progress">static</p>
<script>document.getElementById('progress').textContent='script-ran'; window.__spikeRan=true;</script>
<button onclick="window.__clicked=1">Button</button>
</body></html>`;

// 1x1 PNG
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

function serve(port, handler) {
  const server = createServer(handler);
  return new Promise((resolve) => server.listen(port, "127.0.0.1", () => resolve(server)));
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  await mkdir(evidenceDir, { recursive: true });
  const selfCheck = await import("node:child_process").then(({ execFileSync }) =>
    execFileSync(process.execPath, [join(here, "lib/mhtml.mjs")], { encoding: "utf8" }).trim());
  console.log(selfCheck);
  const servers = [
    await serve(19001, (req, res) => {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end(PAGE_HTML);
    }),
    await serve(19002, (req, res) => {
      res.writeHead(200, { "content-type": "image/png" });
      res.end(PNG);
    }),
  ];

  const profileRoot = join(evidenceDir, "profiles");
  await mkdir(profileRoot, { recursive: true });
  const profile = await mkdtemp(join(profileRoot, "profile-"));
  const browser = await puppeteer.launch({
    executablePath: chromePath,
    headless: true,
    pipe: true,
    userDataDir: profile,
    args: ["--no-first-run", "--no-default-browser-check"],
    enableExtensions: [ext],
  });

  const results = { opfs: null, voices: null, pages: [] };
  try {
    await sleep(1500);
    await browser.newPage().then((page) => page.goto("chrome://version/")).catch(() => {});

    const proxy = await browser.newPage();
    await proxy.goto("about:blank");
    let workerTarget = browser.targets().find((t) => t.type() === "service_worker");
    for (let i = 0; i < 20 && !workerTarget; i += 1) {
      await sleep(250);
      workerTarget = browser.targets().find((t) => t.type() === "service_worker");
    }
    if (!workerTarget) throw new Error("extension service worker never started");
    const worker = await workerTarget.worker();
    worker?.on("console", (message) => console.log("[sw]", message.text()));
    const extensionId = new URL(workerTarget.url()).host;
    await proxy.goto(`chrome-extension://${extensionId}/proxy.html`);
    results.opfs = await retry(() => runOpfs(proxy));
    results.voices = await retry(() => runVoices(proxy));

    const page = await browser.newPage();
    await page.goto(`${FIXTURE.origin}/`, { waitUntil: "networkidle2" });

    for (const url of [FIXTURE.origin, ...REAL_PAGES]) {
      if (url !== FIXTURE.origin) {
        await page.goto(url, { waitUntil: "networkidle2", timeout: 30000 })
          .catch(() => page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 }))
          .catch(() => {});
      }
      const after = await page.evaluate(() => location.href);
      await proxy.evaluate(() => chrome.storage.local.clear());
      const started = await proxy.evaluate((current) =>
        chrome.runtime.sendMessage({ type: "reset", url: current }), after);
      console.log("reset", after, JSON.stringify(started));

      const begin = Date.now();
      const data = await waitForResult(proxy, Number(process.env.SPIKE_TIMEOUT_MS || 120000));
      results.pages.push({ url: after, ms: Date.now() - begin, ...data });
      console.log(`captured ${after}`, JSON.stringify(data).slice(0, 240));
      if (!data.done) break;
    }

    await appendReport(results);
  } finally {
    await browser.close();
    for (const server of servers) server.close();
  }
}

async function retry(fn, attempts = 3) {
  let last;
  for (let i = 0; i < attempts; i += 1) {
    try {
      const value = await fn();
      if (value) return value;
    } catch (error) {
      last = error;
    }
    await sleep(750);
  }
  return last ? { error: String(last) } : null;
}

async function waitForResult(proxy, timeout) {  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const data = await proxy.evaluate(async () => {
      const { spike } = await chrome.storage.local.get("spike");
      return spike || {};
    });
    if (data.done || data.fatal) return data;
    await sleep(500);
  }
  return { done: false, fatal: "timeout" };
}

async function runOpfs(proxy) {
  return proxy.evaluate(async () => {
    const started = performance.now();
    const worker = new Worker("opfs.worker.js", { type: "module" });
    const result = await new Promise((resolve) => {
      worker.onmessage = (event) => resolve(event.data);
      worker.onerror = (event) => resolve({ ok: false, error: String(event.message) });
      worker.postMessage({});
    });
    worker.terminate();
    const serviceWorkerSync = typeof self?.FileSystemSyncAccessHandle === "undefined";
    return { ...result, ms: Math.round(performance.now() - started), noSyncHandleInPage: serviceWorkerSync };
  });
}

async function runVoices(proxy) {
  return proxy.evaluate(async () => {
    const voices = () => speechSynthesis.getVoices().map((v) => ({
      name: v.name,
      lang: v.lang,
      local: v.localService,
    }));
    if (!voices().length) {
      await new Promise((resolve) => {
        speechSynthesis.onvoiceschanged = resolve;
        setTimeout(resolve, 3000);
      });
    }
    const all = voices();
    return { total: all.length, local: all.filter((v) => v.local).length, sample: all.slice(0, 6) };
  });
}

async function appendReport(results) {
  const stamp = new Date().toISOString();
  const lines = ["", `## Run ${stamp} (headless Chrome, installed build)`, ""];
  if (results.opfs) {
    lines.push(`- S2 OPFS dedicated worker: ${results.opfs.ok ? "PASS" : "FAIL"} ` +
      `(${results.opfs.size} bytes, ${results.opfs.ms} ms, quota ${results.opfs.quota})`);
  }
  if (results.voices) {
    lines.push(`- S7 voices: ${results.voices.total} total, ${results.voices.local} local`);
  }
  for (const page of results.pages) {
    const s5 = page.s5 || {};
    const s3 = page.s3 || {};
    const pass = s3.images > 0 && s3.imagesLoaded === s3.images && s3.scriptsBlocked
      && s3.scriptTagsLeft === 0;
    lines.push(`- S3/S5 ${page.url}: ${pass ? "PASS" : "CHECK"} | ` +
      `mhtml ${s5.bytes ?? "?"} B, parts ${s5.parts ?? "?"} | ` +
      `images ${s3.imagesLoaded ?? "?"}/${s3.images ?? "?"}` +
      `${s3.externalLeft ? `, ${s3.externalLeft} still external` : ""} | ` +
      `blobs ${s3.blobs ?? "?"} | scripts blocked: ${s3.scriptsBlocked} | ` +
      `capture ${page.ms} ms${page.fatal ? ` | ${page.fatal}` : ""}`);
  }
  const docPath = join(here, "..", "docs", "SPIKES.md");
  const current = await readFile(docPath, "utf8").catch(() => "# Week 0 spikes\n");
  const head = current.split("\n## Run ")[0].replace(/\n*$/, "\n");
  await mkdir(join(here, "..", "docs"), { recursive: true });
  await writeFile(docPath, head + lines.join("\n") + "\n");
  await writeFile(join(evidenceDir, "results.json"), JSON.stringify(results, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
