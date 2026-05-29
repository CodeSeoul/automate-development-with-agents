# Plan — Pomodoro timer application

Implements: `specs/2026-05-30-pomodoro-timer.md` (Ratified)
Branch: `feat/pomodoro`

## Overview

Build a single-page Pomodoro timer web app for a live workshop demo. The overriding goal
is **trivial to run and demonstrate**: `python3 server.py`, open the printed URL, use the
app. All timer logic lives client-side in vanilla JS; the Python server only serves three
static files from the standard library.

**In scope** (from spec FR-1..11): the classic 25/5/15 cycle, 4 work intervals per long
break; start / pause / resume / skip / reset; wall-clock-accurate countdown that survives
background-tab throttling; remaining-time + interval-type display; cycle progress (work N
of 4); a visual + audio transition signal; manual-start (non-auto-start) on interval
completion; skipped Work still advances the long-break counter.

**Out of scope**: configurable durations/cycle length (fixed per spec), multiple parallel
timers, accounts, server-side timer state, persistence across reload (in-memory only — see
Data/Migration Notes), any build step, framework, package, CDN library, DB, or Docker.

## Architecture & Design

Four files at the worktree root. No subpackages, no dependencies — keep the demo flat and
greppable.

### `server.py` — static file server (Python stdlib only)
Responsibility: serve the static assets and print a ready-to-click URL. Nothing else —
no timer state, no API.
- Use `http.server.ThreadingHTTPServer` + a subclass of `SimpleHTTPRequestHandler`.
- Subclass `PomodoroHandler(SimpleHTTPRequestHandler)`:
  - Pass `directory=` of the script's own folder to `super().__init__` so the server
    works regardless of the caller's CWD. Compute it from `os.path.dirname(os.path.abspath(__file__))`.
  - Override `end_headers` to add `Cache-Control: no-store` so the demonstrator never
    sees a stale asset after an edit during the workshop.
  - Keep the default `do_GET`; `SimpleHTTPRequestHandler` already maps `/` → `index.html`.
- `main()`: read `PORT` from env (default `8000`); bind `127.0.0.1`; print
  `Serving Pomodoro at http://127.0.0.1:<port>/ (Ctrl+C to stop)`; `serve_forever()` in a
  `try/except KeyboardInterrupt` that prints a clean shutdown line and returns (no
  traceback on Ctrl+C — AGENTS.md: don't surface noise, but here it's an expected exit).
- Guard with `if __name__ == "__main__": main()`.
- Standard-library imports only: `http.server`, `os`, `sys` (and nothing else).

### `index.html` — single page / DOM contract
Responsibility: structure + element IDs that `app.js` binds to. Defines the observable
DOM contract the test strategy asserts against.
- `<link rel="stylesheet" href="styles.css">` and `<script src="app.js" defer>`.
- Elements with stable IDs (the contract — do not rename without updating `app.js` and tests):
  - `#time-remaining` — `MM:SS` text (the countdown).
  - `#interval-type` — text: `Work` | `Short Break` | `Long Break`.
  - `#cycle-progress` — text/markers for "work N of 4" (e.g. four dots, the active/done
    ones filled).
  - `#btn-start` (label toggles Start/Resume), `#btn-pause`, `#btn-skip`, `#btn-reset`.
  - `#app` root element carrying a `data-interval` attribute (`work`/`short-break`/`long-break`)
    so CSS drives the per-interval colour and the visual transition signal.
  - `aria-live="polite"` on `#interval-type` (and/or a visually-hidden status region) so
    the transition is announced — satisfies the "not sound-only" accessibility NFR.

### `app.js` — all timer logic (vanilla JS, ES modules not required; plain script)
Responsibility: the state machine, the wall-clock countdown, rendering, and control
handlers. This is where every functional requirement is realised. Structure it as small
named functions over a single `state` object — no classes/abstractions needed at this size.

State model (single object, in-memory):
```
state = {
  phase: 'idle' | 'running' | 'paused',
  intervalKind: 'work' | 'short-break' | 'long-break',
  workCount: 0..4,           // completed-or-in-progress work intervals in the current cycle
  durationMs: number,        // full length of current interval
  endsAt: number | null,     // Date.now()-based deadline while running (wall-clock anchor)
  remainingMs: number,       // authoritative remaining; frozen value while paused/idle
}
```
Key design points (each maps to a spec requirement / edge case):
- **Wall-clock countdown (NFR timing, edge: background throttling).** While `running`,
  store `endsAt = Date.now() + remainingMs` at the moment of start/resume. The render
  loop computes `remainingMs = endsAt - Date.now()` every tick — it never decrements a
  counter. Use `setInterval(tick, 250)` purely to *refresh the display*; accuracy comes
  from `Date.now()`, so throttling the interval only makes the UI update less often, not
  drift. Also bind `document.visibilitychange` to force an immediate `tick()` on tab
  refocus so the displayed time corrects instantly (acceptance: backgrounded-tab case).
- **Transition fires exactly once (edge: reaches zero exactly).** In `tick()`, when
  `remainingMs <= 0` and `phase === 'running'`, call `completeInterval()` and immediately
  flip `phase` out of `running` so a later tick can't re-fire. `completeInterval` advances
  the cycle and enters a *waiting* (`idle`-like, not auto-started) state for the next
  interval (FR-10).
- **Cycle advance (FR-2, FR-5, FR-11, acceptance: long break on 4th, fresh cycle after
  long break).** A pure `nextInterval(intervalKind, workCount)` helper returns the next
  `{intervalKind, workCount, durationMs}`:
  - from `work`: increment is already counted on entry (see below); if the just-finished
    work was the 4th → `long-break`, else `short-break`.
  - from `short-break` → `work` (start of next work; increment `workCount`).
  - from `long-break` → `work` with `workCount` reset to 1 (fresh cycle).
  - Make `nextInterval` a **pure function** of its inputs so it is unit-testable in
    isolation (see Test Strategy). Skip (FR-5) calls the same `nextInterval` path, which
    is why a skipped Work still advances the counter (FR-11) — there is one transition
    path, used by both natural completion and skip.
- **Controls (FR-3..6, edge: no-op on invalid input, edge: double-click).**
  - `start()`: only valid from `idle`/waiting → `running`; sets `endsAt`. No-op otherwise.
  - `pause()`: only from `running` → `paused`; freezes `remainingMs = endsAt - Date.now()`,
    clears `endsAt`. No-op otherwise.
  - `resume()`: from `paused` → `running` (the Start button serves as Resume when paused).
  - `skip()`: from any non-idle state → run the transition path immediately. Guard against
    rapid double-fire by checking/locking on the current interval identity (e.g. ignore if
    a transition already ran this tick) — see Risk section.
  - `reset()`: from any state → idle, `intervalKind='work'`, `workCount=1`,
    `remainingMs=25:00`, `endsAt=null`.
  - Disable buttons that are invalid in the current phase (e.g. Pause disabled when not
    running) as the primary guard; the state-machine no-op is the backstop.
- **Signal (FR-9, NFR accessibility).** On every transition: (a) update `#app[data-interval]`
  → CSS colour change (visual), (b) update `aria-live` text, (c) play a short beep via
  `AudioContext` oscillator (no audio file/asset, no CDN). Audio is best-effort and never
  required for correctness; wrap in try/catch since autoplay may be blocked.
- **Render (`render(state)`):** formats `MM:SS` (clamp at `00:00`), sets interval label,
  paints cycle progress, toggles button enabled/disabled + Start/Resume label. Pure
  view function of `state` — easy to reason about and to assert in tests.

### `styles.css` — presentation (NFR presentation)
Responsibility: a clean, demo-presentable look; per-interval colour theming driven by
`#app[data-interval]`; large legible timer; responsive enough for a projector. No external
fonts/CDNs (system font stack). Visual state change *is* part of the accessibility signal.

No new runtime dependencies. No version pins needed (no package manifest exists or is added).

## Architecture Decisions (ADRs)

### ADR to add — `adr/2026-05-30-client-side-timer-static-server.md` (status: Proposed)

This is a genuine architectural decision: it fixes where timer state lives (client, not
server) and reduces the backend to a static file server, which shapes every other choice
(no API, no DB, no persistence). Full content for the implementer to create the file:

```
---
title: Client-side timer logic, Python stdlib serves static files only
date: 2026-05-30
status: Proposed
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
```

### Relevant existing ADRs for the implementer
None — the ADR index (`adr/README.md`) is empty. This branch introduces the first ADR.

## Implementation Steps (ordered)

Each step is mechanical and traceable to the spec. Build the pure logic first so it can be
tested before any UI exists.

1. **Create `index.html`** with the DOM contract above (all listed IDs, `data-interval` on
   `#app`, `aria-live` region, `<link>`/`<script defer>`). Traces: FR-7, FR-8, FR-9,
   accessibility NFR.
2. **Create `app.js` — pure cycle logic first.** Implement `nextInterval(intervalKind,
   workCount)` and a `formatMMSS(ms)` helper as pure functions with no DOM access. Define
   the `state` object and the constants (`WORK_MS=25*60_000`, `SHORT_MS=5*60_000`,
   `LONG_MS=15*60_000`, `WORK_PER_LONG=4`). Traces: FR-1, FR-2, FR-11.
3. **Add control functions** `start/pause/resume/skip/reset` and `completeInterval` over
   `state`, each enforcing valid-phase no-ops. Traces: FR-3, FR-4, FR-5, FR-6, FR-10,
   edge: invalid/repeated input.
4. **Add the wall-clock render loop**: `tick()` (recompute `remainingMs` from `endsAt`,
   detect `<=0` → `completeInterval` once), `setInterval(tick,250)`, `render(state)`,
   `visibilitychange` → immediate `tick()`. Traces: timing NFR, background-tab edge,
   exactly-once transition edge, responsiveness NFR.
5. **Wire DOM**: query the IDs, attach click handlers to the four buttons, set initial
   render to idle Work 1 / 25:00. Add the transition signal (data-interval swap, aria-live
   text, best-effort `AudioContext` beep in try/catch). Traces: FR-9, accessibility NFR.
6. **Create `styles.css`**: clean layout, large timer, per-interval colour via
   `#app[data-interval]`, system font stack, projector-friendly sizing. Traces:
   presentation NFR, visual transition signal.
7. **Create `server.py`** per the design above (stdlib `ThreadingHTTPServer`,
   directory-anchored handler, `no-store`, env `PORT`, clean Ctrl+C). Traces: runtime/
   backend NFRs, the `python3 server.py` acceptance criterion.
8. **Create `tests/test_cycle.html`** (browser-run, no npm) — see Test Strategy.
9. **Update `README.md`** with a "Run" section: `python3 server.py`, open the URL,
   controls overview. (README is at the worktree root — editing existing file.)
10. **Run the quality gate.** This repo has no language toolchain/linter configured (no
    package manifest, no CI config) and AGENTS.md defines the gate as "the relevant build,
    tests, and linter." Concretely: (a) `python3 -m py_compile server.py` must pass;
    (b) `python3 server.py` starts and serves `index.html` (manual smoke: `curl -fsS
    http://127.0.0.1:8000/ | head`); (c) open `tests/test_cycle.html` and the live app and
    confirm all scenarios in Test Strategy pass. Report results honestly per AGENTS.md.

## Interface & Compatibility

This is greenfield — no existing contracts to preserve. The contracts this plan *creates*
and that tests depend on:
- The DOM IDs in `index.html` (`#time-remaining`, `#interval-type`, `#cycle-progress`,
  `#btn-start/pause/skip/reset`, `#app[data-interval]`).
- The pure functions `nextInterval` and `formatMMSS` exported/exposed on `window` (or a
  global namespace object, e.g. `window.Pomodoro`) so the test harness can call them
  without a module bundler. Decide one approach and keep it consistent.
- `server.py` honours the `PORT` env var (default 8000) and serves the worktree-root files.

## Data / Migration Notes

No database, no schema, no migration. Persistence is **in-memory only** (justified in the
ADR and spec NFR: in-memory default, reload-loss acceptable, JSON file judged not
trivially-cheap enough to justify the I/O/error-handling for a demo). No storage is
touched.

## Test Strategy

No npm / no test framework, by constraint. Two complementary, zero-dependency layers:

1. **Pure-logic unit tests — `tests/test_cycle.html`.** A standalone HTML file that loads
   `../app.js` and runs assertions in a tiny inline harness (an `assert(name, cond)` that
   appends pass/fail rows to the page and console). Because `nextInterval`/`formatMMSS` are
   pure, these run instantly with no timing. Scenarios:
   - Full cycle sequence: Work1→ShortBreak→Work2→ShortBreak→Work3→ShortBreak→Work4→
     **LongBreak**→Work1(fresh) — asserts FR-2 and the "4th break is Long, then fresh cycle"
     acceptance criteria.
   - Skip from Work advances `workCount` (FR-11) — skipping all 4 works still lands on Long
     Break.
   - Skip from a break advances to the next Work without double-counting (edge case).
   - `formatMMSS`: 1500000→"25:00", 754000→"12:34", 0→"00:00", negative→"00:00" (clamp).
2. **Wall-clock / transition test — testable-clock seam.** Let `tick()` read time via an
   injectable `now()` (default `Date.now`) so a test can advance a fake clock. In the test
   harness: set a short `durationMs`, set `now` to `T`, start, advance `now` past `endsAt`,
   call `tick()` twice, and assert `completeInterval` fired **exactly once** and the phase
   left `running` (exactly-once edge). Assert that with `now` jumped forward by 5 minutes
   in a single step (simulated background throttle), the recomputed `remainingMs` equals
   wall-clock expectation within tolerance (timing NFR / background edge).
3. **Manual UI smoke checklist** (in the plan/README; for the live demo) — each maps to an
   acceptance criterion: start counts down from 25:00 / label "Work"; pause freezes;
   resume continues; on reaching 0 the colour + label change and a Short Break of 5:00
   waits (not auto-started); reset returns to idle Work1 25:00; double-click Skip advances
   only one interval; background the tab ~30s and confirm the time corrects on return.
4. **Server smoke**: `python3 -m py_compile server.py`; start server, `curl` the root and
   each asset returns 200; Ctrl+C exits cleanly without a traceback.

Rationale for no framework: the constraints forbid npm/build; a single self-running HTML
test file plus an injectable clock gives real regression coverage of the only complex
parts (cycle math, exactly-once transition, wall-clock recompute) at zero tooling cost.

## Risk & Sequencing

- **Step dependency**: build pure logic (steps 2–3) before the render loop (4) and UI (5),
  and before the test file (8) which imports `app.js`. `server.py` (7) is independent and
  can be done anytime, but is needed for the run/smoke gate (10).
- **Risk — transition double-fire** (edge: reaches-zero / double-click skip). Mitigation:
  flip `phase` out of `running` inside `completeInterval` before any further tick can run,
  and gate `skip()` on the current interval identity so two clicks in the same frame
  resolve to one advance. Covered by unit test (exactly-once) + manual double-click smoke.
- **Risk — background-tab drift** (timing NFR). Mitigation: wall-clock anchor + recompute
  on `visibilitychange`; `setInterval` is display-only. Covered by the fake-clock jump test
  and the manual background smoke.
- **Risk — audio autoplay blocked.** Mitigation: audio is best-effort in try/catch; the
  visual + aria-live change is the authoritative signal, so a muted/blocked tab still meets
  FR-9 and the accessibility NFR.
- **Risk — server CWD sensitivity.** Mitigation: anchor the handler `directory=` to the
  script's own folder so `python3 server.py` works from any directory.
- **Low risk — port already in use.** Default 8000 overridable via `PORT`; surface the
  bind error rather than suppressing it (AGENTS.md).
