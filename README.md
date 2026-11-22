# Hammock Reader

Private, offline read-later extension for Chrome, Edge and Firefox. Free, no account, no server.
Reference codebase for reuse: `../hammock`.

Repository: <https://github.com/hell-abhi/hammock-reader>

License: MIT (see `LICENSE`).

Status: **phase 1**. Chrome save → offline sandboxed reader → library list works end
to end. Firefox is built and lints clean; its capture path is covered by the
collector test but has not been smoke-tested in a real Firefox yet.

## Version control

- `main` is protected by hooks: `.githooks/pre-commit` runs the gate without tests;
  `.githooks/pre-push` runs the full gate, builds `dist/` and runs the e2e save.
- Enable once per clone: `git config core.hooksPath .githooks`.
- The gate itself is `cargo xtask check`: fmt, clippy (native and wasm32), tests, a
  network-call scan, and the frozen-permission check.

## Read first

| File | Contents |
|------|----------|
| `AGENTS.md` | Binding rules for every agent. Based on the four Karpathy guidelines in `CLAUDE.md`, plus project constraints (no network, frozen permissions, full pages) |
| `CLAUDE.md` | The base behavioural guidelines |
| `docs/PLAN.md` | Decisions, architecture, phases, timeline |
| `docs/SPIKES.md` | Week 0 gate: results and the design changes they force |

## Running the spikes

```sh
cd spike
npm install
npm run spike
```

Results are written to `docs/SPIKES.md` and `spike/evidence/`. See `spike/README.md`.

## Remaining before phase 1

1. ~~Install Rust and run spike S1.~~ Done: dom_smoothie builds for wasm32 at 1.0 MB.
2. ~~Chrome save and offline reader.~~ Done: `e2e save` stops the servers before reopening.
3. Manual spikes S4 (Firefox fetch), S6 (Library folder via Drive for Desktop), S7 on Windows, S8 (uninstall).
4. Phase 1 gate: a manual save in Firefox. The collector and composer are tested; nothing has
   run inside Firefox itself yet.

## Run the checks

```sh
cargo xtask check                  # fmt, clippy, tests, rule scan, permissions
cargo xtask build                  # Chrome into dist/
cargo xtask build --browser firefox
node extension/firefox-capture.test.mjs   # CSS rewrite + inline self-check
(cd e2e && node save.mjs)          # save, stop servers, reopen offline in the reader
(cd e2e && node collector.mjs)     # Firefox capture logic in a real page
```

`git push` runs all of the above through `.githooks/pre-push`.

## Load it in a browser

`dist/` holds one browser at a time. Build for the browser you are about to load.

### Chrome / Edge

```sh
cargo xtask build
```

1. Open `chrome://extensions` (or `edge://extensions`) and turn on **Developer mode**.
2. **Load unpacked** → select this repo's `dist/`.
3. Open an article, click the Hammock Reader icon, then **Save this page**.
4. It reports parts and size, and the article appears in the list under the button.
5. Click the article: the reader opens.

After code changes, run `cargo xtask build` and press **Reload** on the extension card.

### Firefox

```sh
cargo xtask build --browser firefox
cd e2e && npx web-ext run --source-dir ../dist
```

That opens Firefox with a temporary profile, so your normal profile is untouched.
Alternatively: `about:debugging#/runtime/this-firefox` → **Load Temporary Add-on** →
pick `dist/manifest.json`.

Firefox installs with a broad host permission. That is deliberate: Firefox has no
`pageCapture`, so the extension fetches the page's own images and stylesheets at save time.

### Prove it is offline

1. Save an article.
2. Turn off Wi-Fi (or use DevTools → Network → Offline).
3. Open the article from the popup. It still renders with images.
4. In the reader, the frame's console should be silent: scripts are stripped.

### If something looks wrong

- Popup: right-click it → **Inspect** (Chrome), or `about:debugging` → **Inspect** (Firefox).
- Empty list, save fails: check the worker's console; the `save` message should return an id.
- Missing images: some pages lazy-load images that were never requested. Turn off Wi-Fi and
  check whether the article's text and layout are still there.
