// Self-check for the Firefox capture helpers. Run: node extension/firefox-capture.test.mjs
import assert from "node:assert/strict";
import { inlineStyles, rewriteCssUrls } from "./firefox-capture.js";

const base = "https://cdn.test/css/site.css";

assert.equal(
  rewriteCssUrls('body{background:url("/img/a.png")}', base),
  'body{background:url("https://cdn.test/img/a.png")}',
);
assert.equal(
  rewriteCssUrls("p{background:url(../i/b.png)}", base),
  'p{background:url("https://cdn.test/i/b.png")}',
);
assert.equal(
  rewriteCssUrls('a{background:url("data:image/png;base64,AA==")}', base),
  'a{background:url("data:image/png;base64,AA==")}',
);
assert.equal(
  rewriteCssUrls('@import url("more.css");', base),
  '@import url("https://cdn.test/css/more.css");',
);

const html = '<head><link rel="stylesheet" href="https://cdn.test/a.css"></head><body>x</body>';
const inlined = inlineStyles(html, [{ url: "https://cdn.test/a.css", css: "h1{color:red}" }]);
assert.ok(inlined.includes("<style>h1{color:red}</style>"), inlined);
assert.ok(!inlined.includes("<link"), inlined);

// A stylesheet that does not match must be left alone.
assert.equal(inlineStyles(html, [{ url: "https://other.test/b.css", css: "x{}" }]), html);

console.log("firefox-capture self-check passed (6 cases)");
