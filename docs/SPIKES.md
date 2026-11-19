# Week 0 spikes

Gate for phase 1. Each spike records a measured result, not an opinion. Re-run with
`npm run spike` in `spike/`.

| ID | Spike | Pass criterion | Status |
|----|-------|----------------|--------|
| S1 | dom_smoothie builds for `wasm32-unknown-unknown` | Builds; size recorded | **PASS**: builds; 1.0 MB unoptimised release Wasm |
| S2 | OPFS writes from a dedicated worker | 5 MB write succeeds; time recorded; blocks service worker | **PASS** (5 MB write/read 39 ms, quota 10.7 GB) |
| S3 | MHTML capture and sandboxed rendering | Page captured, images rendered in iframe, no script execution | **PASS** on 4/4 check pages; 30-page run below |
| S4 | Firefox resource fetch with optional host permission | Cross-origin image fetched as bytes | Manual: puppeteer-core does not drive Firefox |
| S5 | Real-page MHTML size | Median size for 30 saved pages recorded | **PASS** (median 0.87 MB, p90 4.4 MB, max 18 MB) |
| S6 | Library folder via Chrome picker (Drive for Desktop) | Folder picked, write, survives reload | Manual: needs a real folder picker click |
| S7 | Local TTS voices | `localService` voices listed on macOS and Windows | **PARTIAL** macOS: 180/180 local; Windows pending |
| S8 | Uninstall clears storage | Storage absent after add-on removal | Manual |
| S9 | `CLAUDE.md` read by OpenCode | Rules visible without an explicit config entry | **PASS**: `AGENTS.md` loads into the session automatically |

## Findings (design-changing)

1. **Service workers cannot create blob URLs.** `URL.createObjectURL` is absent in an MV3 service worker, so decode and render must run in an offscreen document (Chrome) or the background page (Firefox). Confirmed by the first run failing with `TypeError: URL.createObjectURL is not a function`.
2. **Images are referenced by `cid:`, not by URL.** Chrome stores cross-origin resources as MHTML parts and rewrites references to `cid:<Content-ID>`. A renderer must map both `Content-ID` and `Content-Location` to blob URLs, or images silently fail. Wikipedia: 19 `cid:` references, 18 image parts.
3. **Quoted-printable decoding is the most likely bug.** A naive decoder turned a 367 KB Wikipedia article into 34 MB. `spike/lib/mhtml.mjs` has a 7-case self-check that the runner runs before every capture.
4. **Big pages are big.** 31 pages: median 0.87 MB, p90 3.66 MB, max 18 MB. At the median, 10,000 articles need about 9.1 GB. The 10.7 GB quota on this machine fits the median but not p90. Two outliers (Wired 18 MB, Daring Fireball 12 MB) show full-page storage needs a size cap, a compression pass, and an eviction policy before the "10,000 articles" claim is published. RAM stays low because the index holds reader text only.
5. **Some components cannot be captured fully.** 16 of 31 pages still referenced external resources after capture (Guardian 111, Verge 150, NPR 111), mostly lazy-loaded images, tracking pixels and iframes. 22 of 26 pages loaded every image they had. To avoid network access after save, the saved copy keeps the page as rendered with its images and layout; scripts, embeds and video do not run, and resources that never loaded are not included. Pre-capture loading (`img.dataset.src`, `loading=eager`) reduces the gap but does not close it for lazy carousels.
6. **Chrome 157 no longer installs extensions from `--load-extension` in headless mode.** Use Puppeteer `enableExtensions`, as Hammock's `e2e/lib/launch.mjs` already does.
7. **Capture hangs without a timeout.** Waiting for `img.decode()` on a real page never resolves. Use a bounded wait, not `Promise.all`.
8. **Top-level `await` blocks service worker registration.** A worker whose module awaits at top level never appears as a target, so messages are lost with no error. Initialise the Wasm lazily and await the same promise inside each handler.
9. **`chrome.tabs.query` returns no URLs without the `tabs` permission.** The popup must pass the page URL to the worker, which is why `tabs` is in the frozen list.
10. **Chrome's image references are mixed.** In the captured fixture, stylesheets are rewritten to `cid:<Content-ID>` while images keep their absolute `Content-Location` URL. The renderer must rewrite both.

## Results

Written by the spike runner; it replaces the previous run. Do not edit by hand.

## Run 2026-11-19T08:40:13.173Z (headless Chrome, installed build)

- S2 OPFS dedicated worker: PASS (5242880 bytes, 34 ms, quota 10742663570)
- S7 voices: 180 total, 180 local
- S3/S5 http://localhost:19001/: PASS | mhtml 1778 B, parts 4 | images 1/1 | blobs 3 | scripts blocked: true | capture 3029 ms
- S3/S5 https://example.com/: CHECK | mhtml 5446 B, parts 4 | images 0/0 | blobs 3 | scripts blocked: true | capture 3031 ms
- S3/S5 https://en.wikipedia.org/wiki/Readability: PASS | mhtml 1005310 B, parts 41 | images 11/11, 7 still external | blobs 40 | scripts blocked: true | capture 4346 ms
- S3/S5 https://www.bbc.com/news: PASS | mhtml 442120 B, parts 30 | images 33/33, 13 still external | blobs 19 | scripts blocked: true | capture 3678 ms
- S3/S5 https://news.ycombinator.com/: PASS | mhtml 53867 B, parts 6 | images 2/2 | blobs 5 | scripts blocked: true | capture 3030 ms
- S3/S5 https://www.theguardian.com/international: PASS | mhtml 1803928 B, parts 57 | images 111/111, 111 still external | blobs 54 | scripts blocked: true | capture 5042 ms
- S3/S5 https://www.nytimes.com/: CHECK | mhtml 79230 B, parts 7 | images 0/0 | blobs 5 | scripts blocked: true | capture 3027 ms
- S3/S5 https://arstechnica.com/: PASS | mhtml 10733 B, parts 5 | images 3/3 | blobs 4 | scripts blocked: true | capture 3033 ms
- S3/S5 https://www.theverge.com/: PASS | mhtml 1383772 B, parts 119 | images 152/152, 150 still external | blobs 106 | scripts blocked: true | capture 5329 ms
- S3/S5 https://www.wired.com/: CHECK | mhtml 18872610 B, parts 115 | images 56/57, 24 still external | blobs 84 | scripts blocked: true | capture 5230 ms
- S3/S5 https://www.nature.com/: PASS | mhtml 1033155 B, parts 34 | images 35/35, 9 still external | blobs 33 | scripts blocked: true | capture 4250 ms
- S3/S5 https://www.science.org/: CHECK | mhtml 108331 B, parts 7 | images 0/1, 1 still external | blobs 5 | scripts blocked: true | capture 3544 ms
- S3/S5 https://medium.com/: PASS | mhtml 115520 B, parts 8 | images 1/1 | blobs 6 | scripts blocked: true | capture 3028 ms
- S3/S5 https://substack.com/: PASS | mhtml 1545356 B, parts 48 | images 21/21, 1 still external | blobs 46 | scripts blocked: true | capture 4822 ms
- S3/S5 https://www.newyorker.com/: CHECK | mhtml 3546424 B, parts 89 | images 87/88, 73 still external | blobs 56 | scripts blocked: true | capture 9071 ms
- S3/S5 https://www.theatlantic.com/: PASS | mhtml 464542 B, parts 3 | images 1/1 | blobs 2 | scripts blocked: true | capture 3402 ms
- S3/S5 https://www.economist.com/: PASS | mhtml 117312 B, parts 8 | images 1/1 | blobs 6 | scripts blocked: true | capture 3032 ms
- S3/S5 https://www.reuters.com/: CHECK | mhtml 10436 B, parts 7 | images 0/0 | blobs 5 | scripts blocked: true | capture 3037 ms
- S3/S5 https://apnews.com/: PASS | mhtml 110028 B, parts 8 | images 1/1 | blobs 6 | scripts blocked: true | capture 3029 ms
- S3/S5 https://www.npr.org/: CHECK | mhtml 3968390 B, parts 96 | images 131/134, 109 still external | blobs 61 | scripts blocked: true | capture 8246 ms
- S3/S5 https://www.aljazeera.com/: PASS | mhtml 1989439 B, parts 251 | images 32/32, 32 still external | blobs 184 | scripts blocked: true | capture 4720 ms
- S3/S5 https://www.smashingmagazine.com/: PASS | mhtml 788418 B, parts 18 | images 26/26, 7 still external | blobs 17 | scripts blocked: true | capture 4649 ms
- S3/S5 https://css-tricks.com/: PASS | mhtml 1888849 B, parts 67 | images 70/70, 17 still external | blobs 63 | scripts blocked: true | capture 4969 ms
- S3/S5 https://developer.mozilla.org/en-US/docs/Web/API/File_System_API: CHECK | mhtml 1222830 B, parts 33 | images 0/0 | blobs 32 | scripts blocked: true | capture 4395 ms
- S3/S5 https://doc.rust-lang.org/book/: CHECK | mhtml 91109 B, parts 12 | images 0/0 | blobs 11 | scripts blocked: true | capture 3039 ms
- S3/S5 https://github.com/anonymousAAK/hammock: PASS | mhtml 4418564 B, parts 34 | images 10/10 | blobs 33 | scripts blocked: true | capture 8109 ms
- S3/S5 https://www.figma.com/blog/: PASS | mhtml 908954 B, parts 67 | images 38/38, 20 still external | blobs 58 | scripts blocked: true | capture 4190 ms
- S3/S5 https://stripe.com/blog: PASS | mhtml 831213 B, parts 108 | images 68/68, 68 still external | blobs 105 | scripts blocked: true | capture 4645 ms
- S3/S5 https://www.anthropic.com/news: PASS | mhtml 1725260 B, parts 20 | images 10/10, 9 still external | blobs 19 | scripts blocked: true | capture 4954 ms
- S3/S5 https://simonwillison.net/: PASS | mhtml 3538906 B, parts 29 | images 31/31, 10 still external | blobs 28 | scripts blocked: true | capture 4640 ms
- S3/S5 https://daringfireball.net/: PASS | mhtml 12055588 B, parts 30 | images 11/11 | blobs 27 | scripts blocked: true | capture 4104 ms
