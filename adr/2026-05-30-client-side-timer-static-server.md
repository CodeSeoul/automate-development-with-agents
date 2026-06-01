---
title: Client-side timer logic, Python stdlib serves static files only
date: 2026-05-30
status: Accepted
supersedes:
superseded-by:
---

# 2026-05-30 — Client-side timer logic, Python stdlib serves static files only

## Context
The Pomodoro app is a live-workshop demo whose hard constraints are: runs with one
command (`python3 server.py`) on a stock Python install, no external packages, no DB,
no Docker, no npm, no build step (spec NFRs "Runtime simplicity", "Backend stack",
"Frontend stack"). The timer must also stay within ~1s of wall-clock time over 25 min
despite browsers throttling timers in background tabs (spec edge cases / timing NFR).

## Decision
We will keep **all** timer state and logic in the browser (vanilla JS) and use the Python
**standard library only** (`http.server.SimpleHTTPRequestHandler`) to serve three static
files. The server holds no timer state and exposes no API. The countdown is computed from
a wall-clock anchor (`Date.now()`), not by decrementing a per-tick counter, so background
throttling reduces UI refresh rate without accumulating drift. State is in-memory only;
losing in-progress state on reload is acceptable per spec.

## Alternatives considered
- **Server-authoritative timer (state + ticking on the Python side, polled/streamed to
  the client)** — adds an API, a clock-sync concern, and far more code than a demo needs;
  rejected for complexity with no demo benefit.
- **A web framework (Flask/FastAPI) or front-end framework + bundler** — violates the
  no-external-package / no-build hard constraints; rejected outright.
- **Counter-decrement countdown (`remaining -= 1` per tick)** — simplest to write but
  drifts badly under background-tab throttling, failing the timing NFR; rejected.
- **Filesystem JSON persistence** — allowed by spec as optional but adds I/O, error
  handling, and concurrency questions for no demo value; rejected in favour of in-memory.

## Consequences
Easier: one-command run, tiny surface area, trivial to read and demo, accurate timing for
free from the system clock. Harder/accepted trade-offs: no cross-reload persistence (a
reload resets to idle — acceptable per spec); no multi-device/shared timer; audio cue is
best-effort (browser autoplay policies). If persistence or sync is ever wanted, a new ADR
supersedes this one.
