---
title: Pomodoro timer web app (zero-dependency, vanilla)
date: 2026-05-30
status: Delivered       # Draft | Ratified | Delivered
---

# 2026-05-30 — Pomodoro timer web app (zero-dependency, vanilla)

## Objective
A user practicing the Pomodoro Technique needs a simple, reliable timer that
alternates focused work intervals with short and long breaks, so they can manage
attention without reaching for a paid app or installing anything. The deliverable is a
self-contained web app built with vanilla HTML/CSS/JS that runs by opening a single file
(or serving it statically), with **zero build tooling and zero runtime dependencies** —
no npm packages, no bundlers, no external libraries, fonts, or CDNs.

## User stories
- As a focused worker, I want to start a 25-minute work timer so that I can commit to a
  single block of concentrated effort.
- As a user, I want the timer to automatically guide me through work → short break →
  work → … → long break cycles so that I follow the technique without tracking counts
  myself.
- As a user, I want to pause, resume, and reset the current interval so that I can handle
  interruptions.
- As a user, I want a clear visual and audible signal when an interval ends so that I
  know to switch between work and break without staring at the screen.
- As a user, I want to skip the current interval so that I can move on early when needed.
- As a user, I want the app to open and work with no installation, no internet, and no
  build step so that I can use it anywhere, including offline.

## Functional requirements
1. The app MUST present three interval types: **Work**, **Short Break**, and **Long
   Break**, with fixed durations of 25, 5, and 15 minutes respectively. There is no
   settings UI to change durations or cadence. `[ASSUMPTION | accepted-by-user]` fixed
   25/5/15 defaults, no customization in v1.
2. The app MUST display the remaining time of the current interval as `MM:SS`, counting
   down once per second.
3. The app MUST provide a **Start** control that begins the countdown of the current
   interval, a **Pause** control that halts it while preserving remaining time, and a
   **Resume** control (which MAY be the same toggle as Start/Pause) that continues from
   the preserved time.
4. The app MUST provide a **Reset** control that returns the current interval to its full
   duration without advancing the cycle.
5. The app MUST provide a **Skip** control that ends the current interval immediately and
   advances to the next interval in the cycle.
6. The app MUST automatically advance through the Pomodoro cycle: after each completed
   Work interval, a break begins; after every **4th** completed Work interval, the break
   is a Long Break instead of a Short Break; after any break, a Work interval begins.
   `[ASSUMPTION | accepted-by-user]` long-break cadence = every 4 completed work intervals.
7. The app MUST visually indicate the current interval type (e.g., a label and/or color
   change) so the user can tell Work from Break at a glance.
8. The app MUST signal the end of every interval with both an audible cue and a visual
   change. The audible cue MUST be a short synthesized beep generated in-browser via the
   Web Audio API (no external or embedded audio asset). `[ASSUMPTION | accepted-by-user]`
   synthesized Web Audio beep plus visual cue.
9. The app MUST display a count of completed Work intervals (Pomodoros) for the current
   session.
10. When an interval's countdown reaches `00:00`, the app MUST register that interval as
    completed and transition to the next interval per requirement 6.
11. After an interval ends, the next interval does NOT auto-start; it loads ready and
    waits for the user to press Start. `[ASSUMPTION | accepted-by-user]` wait for Start, no
    auto-start.
12. The app MUST run entirely client-side from static assets with no network requests at
    runtime (no CDN, web font, analytics, or API calls).
13. The app MUST NOT persist any state. Session state (completed-Pomodoro count, current
    interval, remaining time) resets when the page is reloaded or closed. No `localStorage`
    or other storage is used. `[ASSUMPTION | accepted-by-user]` no persistence; resets on
    reload.
14. The app MUST NOT use the browser Notification API. End-of-interval alerts are delivered
    only as in-page visual and audio cues. `[ASSUMPTION | accepted-by-user]` in-page cues
    only, no Notification API / permission prompt.

## Edge cases
- Pressing Start when already running, or Pause when already paused, MUST be a no-op (no
  double-speed countdown, no negative time).
- Reset while running MUST stop the countdown and restore the full duration.
- Skip on the final state of the cycle MUST wrap correctly back into the cycle (e.g.,
  Long Break → Work, resetting the toward-long-break counter appropriately).
- Skipping a Work interval MUST NOT increment the completed-Pomodoro count; only a Work
  interval that reaches `00:00` counts as a completed Pomodoro.
  `[ASSUMPTION | accepted-by-user]` skipping a Work interval does not count as completed.
- The timer MUST remain accurate (no cumulative drift) even if the browser throttles
  background tabs; elapsed time SHOULD be derived from a wall-clock reference rather than
  by assuming each tick is exactly 1000 ms.
- Rapid repeated clicks on any control MUST NOT corrupt state (e.g., spawn multiple
  concurrent timers).
- `00:00` MUST never display as negative or roll past zero.
- Browsers that block autoplaying audio until a user gesture MUST still function; the
  visual cue MUST always fire even if the audio cue is suppressed by the browser.

## Acceptance criteria
- **Given** the app is freshly opened, **when** it loads, **then** it displays `25:00`,
  a "Work" indicator, a completed-Pomodoro count of 0, and is in a stopped/ready state.
- **Given** a ready Work interval, **when** the user presses Start, **then** the display
  counts down once per second from `25:00`.
- **Given** a running interval, **when** the user presses Pause, **then** the countdown
  stops and the displayed time stops changing; **when** the user presses Resume,
  **then** the countdown continues from the preserved time.
- **Given** a running interval, **when** the user presses Reset, **then** the display
  returns to the interval's full duration and the timer is stopped, and the
  completed-Pomodoro count is unchanged.
- **Given** a running Work interval, **when** the user presses Skip, **then** the app
  advances to a Short Break (or Long Break if it was the 4th work interval) without
  incrementing the completed-Pomodoro count.
- **Given** a Work interval reaches `00:00`, **when** it completes, **then** the
  completed-Pomodoro count increments by 1, an audible synthesized beep and a visual
  end-of-interval cue fire, and the next interval (Short or Long Break per the cycle) is
  loaded in a ready (not auto-started) state.
- **Given** 3 Work intervals have completed in the session, **when** the 4th Work
  interval completes, **then** the next interval loaded is a Long Break (15:00).
- **Given** any interval has ended and the next is loaded, **when** no Start is pressed,
  **then** the next interval remains paused at its full duration and does not count down.
- **Given** the app is in any state, **when** the page is reloaded, **then** the app
  returns to the fresh-open state (`25:00`, Work, count 0) with no restored session data.
- **Given** the device has no network connection, **when** the user opens the app file,
  **then** all functionality works with no failed network requests.
- **Given** the app is opened directly via `file://`, **when** it loads, **then** all
  functionality (timer, cycle advance, audio, visual cues) works without a static server.
- **Given** the project directory, **when** inspected, **then** it contains no
  `package.json` dependency tree, no bundler config, no `node_modules`, and no references
  to external URLs (CDN/font/script/style).

## Non-functional requirements
- **Zero dependencies / zero build:** vanilla HTML, CSS, and JavaScript only. No npm
  packages, bundlers (webpack/vite/rollup/esbuild), transpilers, CSS frameworks, icon
  fonts, or CDN/external assets. The app MUST run by opening the HTML file directly via
  `file://` and also when served by any static file server. `[ASSUMPTION | accepted-by-user]`
  the `file://` open path is a hard requirement (rules out ES-module `import` across files,
  which many browsers block under `file://`; JS MUST be inlined or loaded via classic
  non-module `<script>`).
- **Browser support:** current evergreen desktop browsers (latest Chrome, Firefox, Edge,
  Safari). `[ASSUMPTION | LOW]` mobile/responsive support is desirable but not a hard
  requirement.
- **Accessibility:** controls MUST be keyboard-operable and have accessible names; the
  countdown and interval-type changes SHOULD be announced to assistive tech (e.g., ARIA
  live region); color MUST NOT be the sole signal of interval type.
- **Timing accuracy:** displayed time MUST be accurate within ±1 second over a full
  interval and MUST NOT drift cumulatively across a multi-interval session.
- **Performance:** loads and is interactive effectively instantly (single small static
  page); no perceptible CPU cost while idle.
- **No telemetry / privacy:** the app MUST NOT make any outbound network request and MUST
  NOT collect or transmit user data.

## Assumptions & open questions
All previously open questions have been resolved by the user via "accept all defaults."
No open questions remain. The spec is `Ratified`.

Resolved decisions (accepted by user):
- `[ASSUMPTION | accepted-by-user]` **Customization:** fixed 25/5/15 durations, no
  settings UI in v1.
- `[ASSUMPTION | accepted-by-user]` **Persistence:** none; all session state resets on
  reload/close (no `localStorage`).
- `[ASSUMPTION | accepted-by-user]` **`file://` support:** opening the single HTML file via
  `file://` is a hard requirement; no cross-file ES-module imports.
- `[ASSUMPTION | accepted-by-user]` **Audio:** short synthesized beep via Web Audio API
  plus a visual cue; no external/embedded audio asset.
- `[ASSUMPTION | accepted-by-user]` **Auto-start:** the next interval waits for Start; it
  does not auto-start.
- `[ASSUMPTION | accepted-by-user]` **Long-break cadence:** Long Break occurs after every
  4 completed Work intervals.
- `[ASSUMPTION | accepted-by-user]` **Notifications:** in-page visual + audio cues only;
  no browser Notification API / permission prompt.
- `[ASSUMPTION | accepted-by-user]` **Skip semantics:** skipping a Work interval does NOT
  count it as a completed Pomodoro.

Remaining low-impact assumptions (unchanged, not requiring user decision):
- `[ASSUMPTION | LOW]` Mobile/responsive support is desirable but not a hard requirement.
- `[ASSUMPTION | LOW]` No light/dark theme toggle required; a single default theme is
  acceptable for v1.
- `[ASSUMPTION | LOW]` No multi-language / i18n requirement for v1 (English UI).
- `[ASSUMPTION | LOW]` Page title (browser tab) reflecting remaining time is a
  nice-to-have, not required.
