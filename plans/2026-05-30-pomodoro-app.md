---
title: Implementation plan — Pomodoro timer web app (zero-dependency, vanilla)
date: 2026-05-30
spec: specs/2026-05-30-pomodoro-app.md
branch: feat/pomodoro-app
---

# 2026-05-30 — Pomodoro timer web app (implementation plan)

## Overview

Build a self-contained Pomodoro timer that runs by opening a single HTML file via
`file://` or any static server. Vanilla HTML/CSS/JS, **zero build tooling, zero runtime
dependencies, no CDN/external assets**. The app cycles Work (25:00) → Short Break (5:00) /
Long Break (15:00, every 4th work), with Start/Pause/Resume, Reset, and Skip controls, a
completed-Pomodoro counter, a drift-free wall-clock countdown, and an end-of-interval cue
(synthesized Web Audio beep + visual flash). No persistence, no Notification API, no
network requests at runtime.

**In scope:** the full feature set in the spec's functional requirements 1–14 and all
acceptance criteria.

**Out of scope:** settings/customization UI, persistence, theming, i18n, mobile-specific
layout work beyond basic responsiveness, browser-tab-title countdown (low-impact nice-to-have).

**Branch:** `feat/pomodoro-app`

## Architecture & Design

### File layout

The `file://` hard requirement rules out cross-file ES-module `import` (browsers block
module fetches under `file://` via CORS). To keep concerns separated while staying within
that constraint, ship **three sibling files loaded with relative paths** — a same-origin
`<link rel="stylesheet">` and a **classic (non-module) `<script src>`** both load fine
under `file://`:

- `index.html` — document structure, controls, ARIA live regions. Loads `styles.css` via
  `<link href="styles.css">` and `app.js` via `<script src="app.js" defer></script>`
  (classic script, **no `type="module"`**).
- `styles.css` — all styling; interval-type theming via a `data-interval` attribute on a
  container element (no color-only signaling — also a text label).
- `app.js` — all behavior in one classic script using an IIFE (or top-level `const`s) to
  avoid leaking globals. No `import`/`export`.

No `package.json`, no `node_modules`, no bundler config. (A tiny `package.json` with only
a `scripts` block and **no `dependencies`/`devDependencies`** MAY be added solely to wire
the lint step in the quality gate; if added it MUST declare zero dependencies. Default:
omit it and run the linter via `npx` one-off so the project tree stays dependency-free —
see Implementation Steps step 7.)

### Core model (in `app.js`)

A single in-memory state object drives render; no framework. Shape:

```
state = {
  intervalType: 'work' | 'shortBreak' | 'longBreak',
  status: 'ready' | 'running' | 'paused',   // 'ready' = full duration, not started
  remainingMs: number,                       // ms left in current interval
  endAtMs: number | null,                    // wall-clock target while running (Date.now()+remainingMs)
  completedWorkCount: number,                // total completed Pomodoros this session
  workSinceLongBreak: number,                // 0..3, resets to 0 when a long break STARTS
  rafId / tickId: number | null,             // active ticker handle
}
```

Fixed config constant:

```
const DURATIONS_MS = { work: 25*60*1000, shortBreak: 5*60*1000, longBreak: 15*60*1000 };
const WORK_INTERVALS_PER_LONG_BREAK = 4;
```

### Drift-free countdown (FR timing-accuracy, edge case "no cumulative drift")

Do **not** decrement a counter by 1000 each tick. On Start/Resume, compute
`endAtMs = Date.now() + remainingMs`. The ticker (use `setInterval` at ~250 ms, or
`requestAnimationFrame`) each tick computes `remainingMs = max(0, endAtMs - Date.now())`
and re-renders `MM:SS` derived from that. Display value = `Math.ceil(remainingMs/1000)` so
it shows `25:00` at start and only reaches `00:00` at true zero. When `remainingMs <= 0`,
fire `completeInterval()`. This keeps accuracy even when background tabs throttle the
timer, because the value is recomputed from wall clock, not accumulated.

On Pause: clear ticker, set `remainingMs = max(0, endAtMs - Date.now())`, set
`endAtMs = null`, `status = 'paused'`. Resume re-derives `endAtMs`.

### Control semantics (functions in `app.js`)

- `start()` — only acts when `status !== 'running'`; sets `endAtMs`, starts ticker,
  `status='running'`. Idempotent guard satisfies "Start while running = no-op". Also
  resumes a suspended `AudioContext` here (user-gesture audio unlock).
- `pause()` — only acts when `status === 'running'`; freezes time. No-op otherwise.
- `togglePlay()` — the single Start/Pause/Resume button calls `start()` or `pause()`
  based on current `status`. (FR3 allows one toggle.)
- `reset()` — stops ticker, `remainingMs = DURATIONS_MS[intervalType]`, `status='ready'`,
  `endAtMs=null`. Does **not** change `completedWorkCount` or `workSinceLongBreak`, does
  **not** advance interval (FR4, acceptance: count unchanged).
- `skip()` — stops ticker, advances cycle via `advance({ countCompletion:false })`.
  Skipping work does NOT increment `completedWorkCount` (edge case + acceptance).
- `completeInterval()` — fires the end-of-interval cue (beep + visual flash), then
  `advance({ countCompletion: true })`. Only this path (countdown reaching 0) increments
  the Pomodoro count when the completed interval was work.
- `advance({ countCompletion })` — pure-ish transition that:
  1. If leaving a `work` interval and `countCompletion`, increment `completedWorkCount`
     and increment `workSinceLongBreak`.
  2. Choose next interval:
     - leaving work → if `workSinceLongBreak >= WORK_INTERVALS_PER_LONG_BREAK` →
       `longBreak` (and on the long break *starting*, reset `workSinceLongBreak = 0`);
       else `shortBreak`.
     - leaving any break → `work`.
     - **Skip nuance:** when skipping a work interval (`countCompletion=false`),
       `workSinceLongBreak` is NOT incremented, so a skipped work does not push toward the
       long break (consistent with "only completed work counts"). Document this explicitly
       in code comments so the long-break-cadence wrap (edge case 3) is unambiguous.
  3. Set `remainingMs = DURATIONS_MS[next]`, `status='ready'`, `endAtMs=null`,
     `intervalType=next`. **Does not auto-start** (FR11): next interval waits for Start.

  Note on `workSinceLongBreak` reset timing: reset it to 0 at the moment a long break is
  selected as the next interval, so that the four-work counter restarts cleanly and the
  cycle wraps correctly (edge case 3: Long Break → Work resets the toward-long-break
  counter appropriately).

- `render()` — single function that writes derived UI from `state`: `MM:SS` text, interval
  label ("Work" / "Short Break" / "Long Break"), `data-interval` attribute for theming,
  completed count, and button label/`aria-pressed` (Start vs Pause). Called after every
  state mutation and on each tick.

### Audio (FR8, edge case: blocked autoplay)

Lazily create one `AudioContext` on first user gesture (inside `start()` / any control
handler). `beep()` creates an `OscillatorNode` + `GainNode`, plays a short tone
(~440–880 Hz, ~150–250 ms) with a quick gain ramp to avoid clicks, then stops. Wrap the
whole audio path in `try/catch` and guard on `AudioContext` existence so that if audio is
unavailable or suppressed, **the visual cue still fires** (edge case). `beep()` is called
only from `completeInterval()`, never from skip/reset.

### Visual end-of-interval cue (FR8)

Add/remove a CSS class (e.g. `flash`) on a container for a brief animation, and update the
ARIA live region text so assistive tech announces the transition. Use a timeout to remove
the class. The visual cue is independent of audio success.

### Accessibility (NFR)

- All controls are real `<button>` elements with visible text and/or `aria-label`.
- The countdown sits in an element with `aria-live="polite"` /
  `role="timer"`-style semantics; interval-type changes announced via a live region.
  Avoid announcing every second too aggressively — announce interval/status changes and
  let the visible countdown be the primary readout (document the chosen approach in code).
- Interval type conveyed by **text label AND** color (color never the sole signal).
- Buttons keyboard-operable by default; ensure visible focus styles in `styles.css`.

### Control-flow summary

`User click → handler (start/pause/reset/skip) → mutate state → (start/stop ticker) →
render()`. `Ticker tick → recompute remainingMs from wall clock → render() →
if remainingMs<=0: completeInterval() → beep + visual cue → advance() → render()`.

## Architecture Decisions (ADRs)

### ADR to add — `adr/2026-05-30-vanilla-single-page-no-build.md` (status: Proposed)

```
---
title: Vanilla single-page app, no build step, file:// compatible
date: 2026-05-30
status: Proposed
supersedes:
superseded-by:
---

# 2026-05-30 — Vanilla single-page app, no build step, file:// compatible

## Context
The Pomodoro app spec (specs/2026-05-30-pomodoro-app.md) mandates zero runtime
dependencies, zero build tooling, no CDN/external assets, and a hard requirement that the
app open and fully function via `file://` as well as from any static server. Browsers
block ES-module fetches and many cross-origin/`file://` fetches, which constrains how code
can be split across files.

## Decision
We will build the app as three sibling static files — `index.html`, `styles.css`,
`app.js` — loaded with relative paths via a same-origin `<link>` and a single **classic
(non-module) `<script defer>`**. We will use no `import`/`export`, no bundler, no
transpiler, and no package dependencies. All JavaScript lives in `app.js` wrapped to avoid
global leakage. State is a single in-memory object rendered by hand; no framework.

## Alternatives considered
- **ES modules (`type="module"` + `import`)** — cleaner separation, but browsers block
  module loading under `file://`, violating the hard `file://` requirement.
- **Single inlined HTML file (CSS + JS in `<style>`/`<script>`)** — guaranteed to work
  under `file://`, but harms readability, diffing, and editing; classic external scripts
  work under `file://` too, so the split is safe.
- **A framework/bundler (React/Vite/etc.)** — directly violates zero-dependency/zero-build.

## Consequences
Easier: instant load, trivial hosting, no toolchain to maintain, works offline and via
`file://`. Harder: no module encapsulation (mitigated by an IIFE and disciplined naming);
no automated test/build harness by default, so verification is largely manual plus a
lightweight no-dependency assertion approach (see the plan's Test Strategy). Adds a
follow-up convention: any future code-splitting must preserve the classic-script,
no-`import` constraint or supersede this ADR.
```

### ADR to add — `adr/2026-05-30-walltime-drift-free-countdown.md` (status: Proposed)

```
---
title: Wall-clock-derived countdown instead of accumulated ticks
date: 2026-05-30
status: Proposed
supersedes:
superseded-by:
---

# 2026-05-30 — Wall-clock-derived countdown instead of accumulated ticks

## Context
The spec requires the timer to stay accurate within ±1s over an interval and to avoid
cumulative drift across a multi-interval session, including when browsers throttle
background tabs. Decrementing a counter by an assumed 1000 ms per tick drifts because
timers fire late and are throttled when the tab is backgrounded.

## Decision
We will derive remaining time from a wall-clock reference. On Start/Resume we record
`endAtMs = Date.now() + remainingMs`; the ticker recomputes
`remainingMs = max(0, endAtMs - Date.now())` each tick and renders the ceil-seconds value,
firing completion at true zero. Pause snapshots `remainingMs` from the wall clock and
clears `endAtMs`.

## Alternatives considered
- **Decrement by 1000 per `setInterval` tick** — simplest, but accumulates drift and is
  wrong under background throttling; violates the accuracy requirement.
- **Web Worker timer** — more robust under throttling, but adds complexity and a second
  file/worker that complicates the `file://` constraint, for marginal benefit at this
  scale.

## Consequences
Easier: accurate, drift-free display regardless of tick jitter or tab throttling; pause/
resume is exact. Harder: rendering must always go through the recompute path (no caching a
naive seconds counter); slightly more care needed so the displayed value reaches `00:00`
exactly once and never shows negative time.
```

### Relevant existing ADRs for the implementer

None — `adr/README.md` index is empty (`_none yet_`). The implementer creates the two ADR
files above from this plan's content and sets their status to `Accepted` on the branch
(per `adr/README.md` lifecycle), then adds both rows to the `adr/README.md` index table.

## Implementation Steps (ordered)

1. **Create `index.html`** at the worktree root with: `<!doctype html>`, `lang="en"`,
   `<meta charset>` + `<meta name="viewport">`, `<title>Pomodoro</title>`,
   `<link rel="stylesheet" href="styles.css">`, and a body containing: a container with a
   `data-interval` attribute; an interval-type **text label**; the `MM:SS` countdown
   element with `role="timer"` and an `aria-live="polite"` region for announcements; the
   completed-Pomodoro count element; and four `<button>`s — Start/Pause toggle, Reset,
   Skip (the toggle's label flips between "Start"/"Pause"/"Resume"). End with
   `<script src="app.js" defer></script>` (classic script, **no `type="module"`**).
   Traceable to FR2,3,4,5,7,9; NFR accessibility. (Verify: opens via `file://`.)

2. **Create `styles.css`** with: layout, large monospace countdown, distinct visual
   treatment per interval via `[data-interval="work"|"shortBreak"|"longBreak"]` selectors
   (color **plus** the text label already in HTML — color not sole signal), a `flash`
   animation class for the end-of-interval visual cue, and visible `:focus-visible`
   styles on buttons. No external fonts/assets; system font stack only. Traceable to
   FR7,8; NFR accessibility, no-external-assets.

3. **Create `app.js` — state + render core.** Define `DURATIONS_MS`,
   `WORK_INTERVALS_PER_LONG_BREAK`, the `state` object initialized to
   `{ intervalType:'work', status:'ready', remainingMs:DURATIONS_MS.work, endAtMs:null,
   completedWorkCount:0, workSinceLongBreak:0, tickId:null }`, a `formatMMSS(ms)` helper
   (`Math.ceil(ms/1000)` → `MM:SS`, never negative), and `render()` that writes countdown
   text, interval label, `data-interval`, count, and toggle-button label/`aria` state.
   Wrap everything in an IIFE; no globals leaked; no `import`/`export`. Traceable to
   FR1,2,7,9; acceptance "fresh open shows 25:00 / Work / 0 / ready".

4. **Add the ticker + control functions** to `app.js`: `startTicker()`/`stopTicker()`
   (using `setInterval` ~250 ms), `start()`, `pause()`, `togglePlay()`, `reset()`,
   `skip()`, `completeInterval()`, and `advance({countCompletion})` exactly per the
   "Control semantics" and "advance" design above, including the idempotent guards (no-op
   on redundant Start/Pause; no concurrent tickers — always `stopTicker()` before
   `startTicker()`). Wire `click` listeners on the four buttons; on initial load call
   `render()`. Traceable to FR2,3,4,5,6,10,11; all edge cases (no double-speed, no
   negative time, rapid-click safety, cycle wrap, skip-not-counting).

5. **Add audio + visual cue** to `app.js`: lazy `AudioContext` created/resumed on first
   control gesture; `beep()` (oscillator+gain, short tone, `try/catch`, guarded so failure
   never throws); `flashVisualCue()` (add `flash` class + update live region, remove class
   on timeout). Call both only from `completeInterval()`; ensure the visual cue fires even
   if `beep()` throws/no-ops. Traceable to FR8; edge case "audio blocked → visual still
   fires"; FR14 (no Notification API), FR12 (no network).

6. **Manual verification pass against acceptance criteria** (see Test Strategy). Open
   `index.html` via `file://` in an evergreen browser; walk each acceptance bullet; confirm
   DevTools Network tab shows **zero** runtime requests beyond the three local files;
   confirm reload returns to fresh state; confirm no `localStorage` writes. Traceable to
   FR12,13; all acceptance criteria.

7. **Run the project quality gate.** There is no build/test framework. The gate for this
   change is: (a) `grep`/inspection assertions that the tree contains no `node_modules`, no
   bundler config, and **no external URL references** in `index.html`/`styles.css`/`app.js`
   (acceptance criterion: "no references to external URLs"); (b) run a no-install linter
   over the static files — e.g. `npx --yes eslint@latest --no-eslintrc --env browser,es2022
   --parser-options ecmaVersion:2022 app.js` or, if offline, a `node --check app.js` syntax
   check plus an HTML/CSS visual review. Record the actual command used and its output.
   **Do not add any runtime dependency or `node_modules` to satisfy this.** Traceable to
   the spec's zero-dependency acceptance criterion and AGENTS.md "verify your work".

## Interface & Compatibility

- **Observable contract:** the three filenames (`index.html`, `styles.css`, `app.js`) and
  their relative references must stay co-located so `file://` loading works. Button
  accessible names ("Start"/"Pause"/"Resume", "Reset", "Skip") are the keyboard/AT
  contract.
- This is a greenfield app; no existing interfaces to preserve. No external API surface.

## Data / Migration Notes

None. Per FR13 the app persists nothing — no `localStorage`, cookies, IndexedDB, or files.
All state is in-memory and resets on reload by construction. No schema, no migration.

## Test Strategy

No build/test framework exists, and adding one would violate the zero-dependency
constraint. Testing is **manual against the acceptance criteria**, supported by a
lightweight, dependency-free assertion approach using only the browser and system tools.

**Manual scenarios (one per acceptance criterion — happy path + edge):**
- *Fresh open*: load shows `25:00`, "Work", count 0, ready/stopped. (Happy path.)
- *Start counts down*: press Start → ticks once/sec from `25:00`. Use a stopwatch or a
  temporary fast-mode constant to verify ±1s accuracy over an interval (drift check).
- *Pause/Resume*: Pause freezes display; Resume continues from the same value. Press Start
  twice rapidly and Pause twice rapidly → no double-speed, no second ticker (rapid-click /
  concurrency edge).
- *Reset*: while running, Reset → full duration, stopped, count unchanged. (Validation of
  no side effects.)
- *Skip work*: Skip a work interval → advances to Short/Long break, count NOT incremented
  (skip-semantics edge).
- *Work completes*: let a work interval reach `00:00` (use fast-mode) → count +1, beep +
  visual cue fire, next break loaded **ready** (not auto-started).
- *Long-break cadence*: complete 4 work intervals → 4th completion loads Long Break
  (15:00); confirm the toward-long-break counter resets and the cycle wraps (Long Break →
  Work) correctly (edge case 3).
- *No auto-start*: after any interval ends, the next stays at full duration and does not
  count down until Start.
- *Reload resets*: from any state, reload → fresh state, no restored data (FR13).
- *Offline / file://*: open via `file://` with network disabled → all features work; check
  DevTools Network shows zero requests (FR12), and Application/Storage shows no
  `localStorage` entries (FR13).
- *Audio blocked*: in a browser that suppresses pre-gesture audio, confirm the **visual**
  cue still fires when an interval ends (audio-blocked edge).
- *`00:00` boundary*: confirm the display never shows negative time and reaches `00:00`
  exactly once per interval.

**Lightweight automatable checks (system tools only, no deps):**
- A short `assert.js` of **pure** functions (`formatMMSS`, and the `advance`/next-interval
  selection logic factored to take state in and return next state out) runnable with
  `node app-logic-test.js` *only if* those pure helpers are exported in a way that does not
  break the classic-script `file://` build (e.g. via a guarded
  `typeof module !== 'undefined' && (module.exports = ...)` at the bottom of `app.js`,
  which is inert in the browser). This is **optional**; if it complicates the single-script
  constraint, skip it and rely on manual testing — document the choice.
- `grep -rIn -E "https?://|//cdn|fonts\\.|unpkg|jsdelivr|cdnjs" index.html styles.css app.js`
  must return nothing (external-URL acceptance check).
- `test ! -e node_modules && test ! -e package-lock.json` and a check for absent bundler
  configs (no `webpack.config.*`, `vite.config.*`, `rollup.config.*`, `.babelrc`).

**Implementer aid:** add a clearly-commented `FAST_MODE` constant (e.g. durations in
seconds) used only during manual verification, then set it back to the real
25/5/15-minute values before finishing — and confirm the final values in the verification
pass. Do not ship a debug toggle.

## Risk & Sequencing

- **Step order:** 1→2→3 establish structure/markup/state before behavior; 4 adds the
  ticker/transitions that depend on the state shape from 3; 5 adds cues that depend on the
  `completeInterval` hook from 4; 6 verifies; 7 is the final quality gate. Steps 1 and 2
  are independent of each other; 3 depends on 1's element IDs/selectors.
- **Risk: `file://` breakage** if anyone reaches for ES modules or a fetch. *Mitigation:*
  ADR 1 + classic `<script defer>`; verify by actually opening via `file://` in step 6.
- **Risk: timer drift / double tickers.** *Mitigation:* wall-clock recompute (ADR 2) and a
  single `tickId` guarded by always stopping before starting.
- **Risk: audio autoplay policy** suppresses the beep. *Mitigation:* unlock `AudioContext`
  on first gesture and make the visual cue independent of audio success; tested explicitly.
- **Risk: long-break cadence off-by-one** at the cycle wrap. *Mitigation:* reset
  `workSinceLongBreak` when the long break is selected, only count completed (not skipped)
  work, and cover with the dedicated cadence + wrap test scenario.
- **Risk: quality gate pulls in a dependency.** *Mitigation:* use `npx --yes` one-off or
  `node --check`; never create `node_modules` or runtime deps (acceptance criterion).
