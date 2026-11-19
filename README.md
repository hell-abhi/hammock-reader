# Hammock Reader

Private, offline read-later extension for Chrome, Edge and Firefox. Free, no account, no server.
Reference codebase for reuse: `../hammock`.

Repository: <https://github.com/hell-abhi/hammock-reader>

License: MIT (see `LICENSE`).

Status: **Week 0 gate passed, phase 1 in progress.** Capture, Rust MHTML decode and
Offscreen-proof storage work end to end in Chrome.

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
2. Manual spikes S4 (Firefox fetch), S6 (Library folder via Drive for Desktop), S7 on Windows, S8 (uninstall).
3. Phase 1 gate: save a real page in **both** browsers and reopen it offline. Chrome save
   passes end to end; Firefox capture, the sandboxed reader view, and restore-after-reinstall
   are still to do.
