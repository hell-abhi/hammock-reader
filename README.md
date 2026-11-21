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
