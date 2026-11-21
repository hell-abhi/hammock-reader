// Firefox capture logic, exercised in a real page. Chrome can run the same injected
// collector, so the Firefox-specific code is covered without a Firefox driver.
// Usage: node e2e/collector.mjs
import { createServer } from "node:http";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import puppeteer from "puppeteer-core";
import { collectPage, inlineStyles, rewriteCssUrls } from "../extension/firefox-capture.js";

const chrome = process.env.CHROME_PATH
  || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

const PAGE = `<!doctype html><html><head><title>Collector</title>
<link rel="stylesheet" href="/site.css">
<script>window.bad = 1</script></head>
<body onload="window.bad=2"><h1>Heading</h1>
<img src="/a.png"><img srcset="/b.png 1x, /c.png 2x">
<p style="background-image:url('/d.png')">text</p>
<iframe src="/frame"></iframe></body></html>`;

function serve() {
  const server = createServer((req, res) => {
    if (req.url === "/site.css") {
      res.writeHead(200, { "content-type": "text/css" });
      res.end('h1{color:red;background:url("bg.png")}');
      return;
    }
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(PAGE);
  });
  return new Promise((resolve) => server.listen(19003, "127.0.0.1", () => resolve(server)));
}

async function main() {
  const server = await serve();
  const browser = await puppeteer.launch({
    executablePath: chrome,
    headless: true,
    pipe: true,
    userDataDir: await mkdtemp(join(tmpdir(), "hammock-collector-")),
    args: ["--no-first-run"],
  });
  try {
    const page = await browser.newPage();
    await page.goto("http://localhost:19003/", { waitUntil: "networkidle2" });
    const result = await page.evaluate(collectPage);
    const html = result.html;

    const checks = [
      ["no scripts", !/<script/i.test(html)],
      ["no inline handlers", !/\son[a-z]+\s*=/i.test(html)],
      ["no iframes", !/<iframe/i.test(html)],
      ["absolute image URLs", html.includes("http://localhost:19003/a.png")],
      ["absolute srcset entries", html.includes("http://localhost:19003/b.png 1x")],
      ["stylesheet listed", result.stylesheets.includes("http://localhost:19003/site.css")],
      ["style url collected", result.urls.includes("http://localhost:19003/d.png")],
      ["title kept", html.includes("<title>Collector</title>")],
      ["css rewritten relative to stylesheet", rewriteCssUrls('a{background:url("bg.png")}', "http://localhost:19003/site.css")
        === 'a{background:url("http://localhost:19003/bg.png")}'],
      ["stylesheet inlined", inlineStyles(html, [{ url: "http://localhost:19003/site.css", css: "h1{color:red}" }])
        .includes("<style>h1{color:red}</style>")],
    ];

    const failed = checks.filter(([, ok]) => !ok).map(([name]) => name);
    if (failed.length) throw new Error(`collector checks failed: ${failed.join(", ")}`);
    console.log(`e2e collector: PASS (${checks.length} checks, ${result.urls.length} resources found)`);
  } finally {
    await browser.close();
    server.close();
  }
}

main().catch((error) => {
  console.error(`e2e collector: FAIL ${error.message}`);
  process.exitCode = 1;
});
