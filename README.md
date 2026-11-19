# Hammock Reader

Private, offline read-later extension for Chrome, Edge and Firefox. Free, no account, no server.
Reference codebase for reuse: `../hammock`.

Status: **Week 0 spikes complete**. Product code has not started.

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

1. Install Rust (`rustup`, `wasm32-unknown-unknown`, `wasm-bindgen-cli 0.2.129`) and run spike S1.
2. Manual spikes S4 (Firefox fetch), S6 (Library folder via Drive for Desktop), S7 on Windows, S8 (uninstall).
3. Start phase 1: workspace, capture and storage on both browsers.
