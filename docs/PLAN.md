# Hammock Reader: plan

Private, offline read-later extension for Chrome, Edge and Firefox. Free, no account, no server.
Reference codebase: `../../hammock` (Leptos UI, browser bindings, xtask, e2e, store pipeline).

## Decisions (owner-approved)

| ID | Decision |
|----|----------|
| R-001 | 10 weeks, Chrome/Edge and Firefox ship together. |
| R-002 | Firefox persistence is a rolling Downloads backup plus manual import. Accepted for now. |
| R-003 | Saved articles are full pages with images and components. Text-only fallbacks are not acceptable. |
| R-004 | Firefox full-page saving needs an optional all-sites permission, requested only when the user turns it on. Without it, Firefox gets reader view only. |
| R-005 | Omnivore importer is cut to v1.1. |
| R-006 | Records live in a user-chosen folder (Chrome/Edge) so they survive uninstall; Firefox uses backups. Nothing is stored on a server. |

## Architecture

- **Capture.** Chrome: `pageCapture.saveAsMHTML` (no host permission, captures cross-origin images). Firefox: injected script lists resources, background fetches them after the user grants the optional host permission.
- **Storage.** OPFS cache in a dedicated worker for speed; mirror to the user's Library folder (Chrome) or a Downloads backup (Firefox). Only the background worker writes.
- **Display.** MHTML or snapshot decoded in Wasm, resources rewritten to blob URLs, rendered in a sandboxed iframe without `allow-scripts`.
- **Reader view.** dom_smoothie (MIT Rust Readability port) on the captured HTML, then sanitize.
- **Search.** Inverted index over reader text, rebuilt from the folder on reinstall.
- **Import.** Pocket HTML, Raindrop HTML/CSV, Instapaper CSV. Omnivore to v1.1.
- **Export.** Markdown, plus the folder and backup paths above.
- **TTS.** `speechSynthesis`, local voices only.

## Permissions (frozen)

`activeTab`, `scripting`, `storage`, `unlimitedStorage`, `pageCapture`, `offscreen`, `downloads`.
Optional only: `optional_host_permissions` for the Firefox full-page path.

## Phases

| Phase | Work | Gate |
|-------|------|------|
| 0 | Spikes in `docs/SPIKES.md` | Every automatable spike passes; manual ones recorded |
| 1 (wk 1-2) | Storage, capture on both browsers, MHTML decode, Firefox permission flow | Save a real page in both browsers and reopen it offline |
| 2 (wk 3-4) | Reader view, sandboxed display, highlights, notes, tags, archive, favourites, search | e2e scenario suite |
| 3 (wk 5-6) | Pocket, Raindrop, Instapaper importers with fixtures | Import fixture and read offline |
| 4 (wk 7-8) | Markdown export, Library folder, Downloads backup, uninstall page, TTS | Restore after reinstall in Chrome |
| 5 (wk 9-10) | e2e, store listings, cross-links to Hammock | Published on both stores |

## Not in scope

Accounts, sync, a server, a web app, PDF import, Omnivore (v1.1), non-local TTS voices.
