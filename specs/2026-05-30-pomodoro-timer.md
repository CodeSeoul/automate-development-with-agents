---
title: Pomodoro timer application
date: 2026-05-30
status: Delivered
---

# 2026-05-30 — Pomodoro timer application

## Objective
Knowledge workers and students lose focus to context-switching and open-ended work
sessions. The Pomodoro technique addresses this by structuring work into fixed focus
intervals separated by short breaks, with a longer break after several intervals. This
application gives a user a reliable timer that runs the classic Pomodoro cycle, signals
transitions clearly, and lets the user start/pause/resume/skip/reset intervals — so they
can sustain focus without manually watching a clock.

This is a **web application** built for a **live workshop demo**. The overriding
constraint is that it must be **as simple as possible to run and demonstrate**: pretty and
functional, but deliberately not feature-heavy. Scope is the classic 25/5/15 cycle with 4
work intervals per long break — no tweaks beyond the canonical technique.

## User stories
- As a focused worker, I want to start a 25-minute work interval so that I can commit to a
  single task for a bounded time.
- As a user, I want an automatic short break after each work interval so that I rest
  without having to decide when.
- As a user, I want a longer break after a set number of work intervals so that I recover
  over longer sessions.
- As a user, I want to pause and resume the running timer so that I can handle a brief
  interruption without losing my place.
- As a user, I want to skip the current interval or reset the cycle so that I stay in
  control when plans change.
- As a user, I want a clear signal when an interval ends so that I know to switch
  activities without staring at the timer.
- As a user, I want to see how much time remains in the current interval so that I can
  pace my work.

## Functional requirements
1. The system must support three interval types: **Work**, **Short Break**, and
   **Long Break**, with durations of 25, 5, and 15 minutes respectively (the classic
   Pomodoro values).
2. The system must run a repeating cycle: Work → Short Break, repeated 4 times, with the
   4th Short Break replaced by a Long Break, then the cycle restarts (4 work intervals per
   long-break cycle).
3. The system must let the user **start** a timer from a stopped/idle state.
4. The system must let the user **pause** a running timer and **resume** it from the exact
   point it was paused.
5. The system must let the user **skip** the current interval, advancing to the next
   interval in the cycle.
6. The system must let the user **reset**, returning to the start of the cycle (idle, work
   interval 1, full duration).
7. The system must display the **remaining time** of the current interval and the
   **current interval type** in the browser.
8. The system must indicate the user's **progress within the cycle** (which work interval
   of 4 the user is on).
9. The system must **signal** each interval transition (end of work, end of break) to the
   user within the browser.
10. When a non-final interval completes, the system must transition to the next interval.
    The next interval **waits for the user to start it** rather than auto-starting
    (keeps the demo predictable and the implementation minimal).
11. A **skipped** Work interval still counts toward the 4-interval long-break trigger, so
    skipping does not desynchronise the cycle count.

## Edge cases
- User presses pause when no timer is running, or start when one is already running — the
  system must ignore or no-op rather than corrupt state.
- User skips during a break — the system must advance correctly to the next work interval
  and preserve the cycle count.
- User skips a work interval — it counts toward the 4-interval long-break trigger (FR-11).
- Timer reaches zero exactly — transition must fire exactly once, not zero or twice.
- The browser tab is backgrounded, throttled, or the machine sleeps mid-interval — the
  remaining time shown on return must reflect real elapsed wall-clock time, not accumulated
  throttled tick counts. (Browsers throttle `setInterval` in background tabs, so the
  countdown must be derived from a wall-clock reference, not by decrementing a counter per
  tick.)
- Browser tab/window is closed mid-interval — an in-progress interval is not guaranteed to
  survive a reload (see Persistence in NFRs); reset to idle is acceptable.
- Rapid repeated input (e.g. double-click skip) must not advance two intervals.
- Long-running accuracy: a 25-minute interval must end within an acceptable tolerance of
  real elapsed time despite browser timer jitter and throttling.

## Acceptance criteria
- **Given** the app is idle at Work interval 1, **when** the user starts the timer, **then**
  the remaining time counts down from 25:00 and the interval type shows "Work".
- **Given** a Work interval is running at 12:34, **when** the user pauses, **then** the
  remaining time freezes at 12:34 and stops decreasing.
- **Given** a paused timer at 12:34, **when** the user resumes, **then** the remaining time
  continues counting down from 12:34.
- **Given** a Work interval, **when** its remaining time reaches 00:00, **then** the system
  signals the transition exactly once and the next interval becomes a Short Break of 5:00
  in a waiting (not auto-started) state.
- **Given** the user has completed 3 prior Work intervals in the cycle, **when** the 4th
  Work interval completes, **then** the next break is a Long Break of 15:00 (not a Short
  Break).
- **Given** a Long Break completes, **when** the cycle continues, **then** the next interval
  is Work interval 1 of a fresh cycle.
- **Given** any running interval, **when** the user skips, **then** the current interval
  ends immediately and the system advances to the next interval in the cycle; if the
  skipped interval was Work, the long-break counter still advances.
- **Given** any state, **when** the user resets, **then** the system returns to idle at Work
  interval 1 with 25:00 shown.
- **Given** a 25-minute Work interval that has been running while the tab was backgrounded,
  **when** the user returns to the tab, **then** the displayed remaining time matches real
  elapsed wall-clock time (within tolerance, see NFRs), not a throttled tick count.
- **Given** the app is served, **when** a demonstrator runs `python3 server.py` and opens
  the served URL in a browser, **then** the app loads and is fully usable with no build
  step, package install, or external service.

## Non-functional requirements
- **Runtime simplicity (hard constraint)**: the entire application must run with a single
  command on a Linux machine with Python pre-installed — e.g. `python3 server.py` — plus a
  web browser. No additional setup steps.
- **Backend stack (hard constraint)**: backend is **Python using only the standard
  library** (e.g. `http.server`). **No database, no Docker, no npm, no external/3rd-party
  packages, no build step (no webpack/vite/etc.).**
- **Frontend stack (hard constraint)**: frontend is **vanilla HTML/CSS/JavaScript only** —
  no frameworks and no CDN-loaded libraries that require a build or bundling. Served as
  static assets by the Python backend.
- **Timing accuracy**: the displayed countdown and the transition trigger must stay within
  an acceptable tolerance of wall-clock time (target ≤ 1s drift over a 25-minute interval),
  achieved by computing remaining time from a wall-clock reference rather than counting
  ticks, so background-tab throttling does not accumulate error.
  `[ASSUMPTION | MEDIUM]` the 1s tolerance figure — reasonable for a demo; confirm if
  stricter accuracy is wanted.
- **Responsiveness**: control actions (start/pause/resume/skip/reset) must take visible
  effect within 100 ms.
- **Reliability**: no state corruption from out-of-order or repeated control input.
- **Persistence (low priority, optional)**: persistence is the implementer's choice between
  **none (in-memory)** and a **simple filesystem store (e.g. a single JSON file)**. It must
  not add meaningful complexity to the demo. No database. Losing in-progress state on
  reload is acceptable. `[ASSUMPTION | LOW]` default to in-memory / no persistence unless a
  JSON file is trivially cheap to add.
- **Accessibility**: the end-of-interval transition signal should not rely on sound alone —
  a clear visual change (e.g. interval label/colour change) must accompany any audio cue,
  since browser tabs may be muted.
- **Presentation**: the UI must be visually clean and presentable for a live demo, but
  without adding feature scope beyond the requirements above.

## Assumptions & open questions
All HIGH-impact items have been resolved by the user; none remain open. Remaining items are
MEDIUM/LOW and do not block ratification.

- `[ASSUMPTION | MEDIUM]` Timing tolerance is ≤ 1s drift over a 25-minute interval. Confirm
  if stricter accuracy is required.
- `[ASSUMPTION | MEDIUM]` On non-final interval completion, the next interval waits for the
  user to start it (FR-10) rather than auto-starting — chosen for demo predictability.
- `[ASSUMPTION | LOW]` Persistence defaults to in-memory / none unless a single JSON file
  is trivially cheap (NFR persistence).
- `[ASSUMPTION | LOW]` Configuration of durations/cycle length is out of scope for this
  demo; the classic 25/5/15 with 4 intervals is fixed (per the "minimal scope" decision).
- `[OPEN QUESTION | LOW]` Single concurrent timer assumed (no multiple parallel timers).
