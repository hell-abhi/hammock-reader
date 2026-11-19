# AGENTS.md

Behaviour rules for every agent working in this repo. Base: the four rules in
`CLAUDE.md`; the sections below add the project constraints. When in doubt, the
later, more specific rule wins.

**Tradeoff:** bias toward caution over speed. For trivial tasks, use judgment.

## 1. Think Before Coding

- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them; don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop, name it, and ask.

## 2. Simplicity First

- Minimum code that solves the task. No features, options, config or "for later" code nobody asked for.
- No abstraction for single-use code.
- If you write 200 lines and it could be 50, rewrite it.

## 3. Surgical Changes

- Touch only what the task needs. Don't reformat or "improve" adjacent code.
- Match the existing style and structure, even if you'd do it differently.
- Remove only orphans your change created. Mention pre-existing dead code; don't delete it.
- Every changed line must trace to the request.

## 4. Goal-Driven Execution

- Turn each task into a checkable goal. State the plan as `step → verify`, then loop until it passes.
- "Make it work" is not a success criterion. Name the test, the run, or the measured number.

## Project rules (Hammock Reader)

- **Read before writing.** `docs/PLAN.md` (scope and phases) and `docs/SPIKES.md` (Week 0 gate). Do not build past an unpassed spike.
- **No network.** Extension code must never call `fetch`, `XMLHttpRequest`, `WebSocket`, `EventSource` or `navigator.sendBeacon`. The only permitted browser API that downloads is the save-time page capture. `spike/` is excluded.
- **Frozen permissions.** The manifest permission list is fixed: `activeTab`, `tabs`, `scripting`, `storage`, `unlimitedStorage`, `pageCapture`, `offscreen`, `downloads`. `tabs` is needed because the popup must hand the worker the URL of the page it is saving. `optional_host_permissions` for Firefox full-page saving is the only user-granted exception. Changing this list needs the owner's approval in writing.
- **One writer.** Only the background worker writes stored state. Pages read and send typed messages.
- **Sanitize untrusted HTML.** Captured pages are untrusted. Render in a sandboxed iframe without `allow-scripts`; never inject captured HTML into an extension page.
- **Full pages, not text.** Saved articles keep their images and components. A text-only fallback is not an acceptable substitute.
- **One canonical rule file.** This file is it. Subagents start with fresh context, so every delegated prompt must restate these rules; an agent that never reads this file cannot follow it.
- **Gates.** `cargo xtask check` and the e2e suite must pass before a change is called done. A spike result is recorded in `docs/SPIKES.md` with the measured number, not an opinion.

**The rules are working if:** diffs are small, nothing speculative appears, and questions come before mistakes.
