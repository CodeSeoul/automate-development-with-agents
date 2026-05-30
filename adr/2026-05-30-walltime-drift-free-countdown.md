---
title: Wall-clock-derived countdown instead of accumulated ticks
date: 2026-05-30
status: Accepted
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
