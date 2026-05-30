/* Pomodoro timer — vanilla JS, classic non-module script.
   Wrapped in an IIFE so no names leak to the global scope.
   No import/export; required for file:// compatibility (see ADR). */
(function () {
  'use strict';

  // ── Config ────────────────────────────────────────────────────────────────
  var DURATIONS_MS = {
    work:       25 * 60 * 1000,
    shortBreak:  5 * 60 * 1000,
    longBreak:  15 * 60 * 1000
  };

  // A Long Break occurs after every 4 completed Work intervals.
  var WORK_INTERVALS_PER_LONG_BREAK = 4;

  // ── State ─────────────────────────────────────────────────────────────────
  // Single in-memory object; render() derives all UI from this.
  // No localStorage or other persistence — resets on every page load (FR13).
  var state = {
    intervalType:       'work',                  // 'work' | 'shortBreak' | 'longBreak'
    status:             'ready',                  // 'ready' | 'running' | 'paused'
    remainingMs:        DURATIONS_MS.work,
    endAtMs:            null,                     // wall-clock deadline while running
    completedWorkCount: 0,
    // Counts work intervals completed since the last long break.
    // Reset to 0 when a long break is selected as the next interval.
    workSinceLongBreak: 0,
    tickId:             null                      // setInterval handle
  };

  // ── Audio ─────────────────────────────────────────────────────────────────
  // AudioContext created lazily on the first user gesture so browsers that
  // block autoplay don't throw before any interaction.
  var audioCtx = null;

  function ensureAudioCtx() {
    if (!audioCtx) {
      try {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      } catch (_) {
        // Web Audio not available; visual cue will still fire.
      }
    }
    // Resume a context that was suspended by the browser's autoplay policy.
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
  }

  // Short synthesized beep — 880 Hz, ~200 ms, with a quick gain ramp to avoid
  // clicks. Entirely wrapped in try/catch; a failure here must never block the
  // visual cue that follows.
  function beep() {
    if (!audioCtx) return;
    try {
      var osc  = audioCtx.createOscillator();
      var gain = audioCtx.createGain();
      osc.connect(gain);
      gain.connect(audioCtx.destination);

      osc.frequency.value = 880;
      osc.type            = 'sine';

      var now = audioCtx.currentTime;
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(0.4, now + 0.01);   // fast attack
      gain.gain.linearRampToValueAtTime(0, now + 0.20);     // decay

      osc.start(now);
      osc.stop(now + 0.25);
    } catch (_) {
      // Ignore; the visual cue fires unconditionally after this call returns.
    }
  }

  // ── DOM references ────────────────────────────────────────────────────────
  var elContainer    = document.querySelector('.container');
  var elIntervalLabel = document.getElementById('interval-label');
  var elCountdown    = document.getElementById('countdown');
  var elCount        = document.getElementById('pomodoro-count');
  var elAnnounce     = document.getElementById('announce');
  var btnToggle      = document.getElementById('btn-toggle');
  var btnReset       = document.getElementById('btn-reset');
  var btnSkip        = document.getElementById('btn-skip');

  // ── Helpers ───────────────────────────────────────────────────────────────
  // Display ceil-seconds so 25:00 shows at the very start and 00:00 appears
  // only at true zero (never negative).
  function formatMMSS(ms) {
    var totalSec = Math.ceil(Math.max(0, ms) / 1000);
    var m = Math.floor(totalSec / 60);
    var s = totalSec % 60;
    return (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
  }

  var LABEL_TEXT = {
    work:       'Work',
    shortBreak: 'Short Break',
    longBreak:  'Long Break'
  };

  // ── Render ────────────────────────────────────────────────────────────────
  // Called after every state mutation and on each tick.
  function render() {
    elCountdown.textContent    = formatMMSS(state.remainingMs);
    elIntervalLabel.textContent = LABEL_TEXT[state.intervalType];
    elContainer.setAttribute('data-interval', state.intervalType);
    elCount.textContent        = String(state.completedWorkCount);

    // Toggle button label reflects current status.
    if (state.status === 'running') {
      btnToggle.textContent           = 'Pause';
      btnToggle.setAttribute('aria-pressed', 'true');
    } else if (state.status === 'paused') {
      btnToggle.textContent           = 'Resume';
      btnToggle.setAttribute('aria-pressed', 'false');
    } else {
      // 'ready'
      btnToggle.textContent           = 'Start';
      btnToggle.setAttribute('aria-pressed', 'false');
    }

    // Update the browser tab title as a nice-to-have readout.
    document.title = formatMMSS(state.remainingMs) + ' — ' + LABEL_TEXT[state.intervalType];
  }

  // ── Ticker ────────────────────────────────────────────────────────────────
  // Ticker runs at ~250 ms to keep the display responsive without wasting CPU.
  // Remaining time is always derived from the wall-clock endAtMs reference,
  // not accumulated from tick deltas — this prevents cumulative drift even
  // under background tab throttling (see ADR: wall-clock-derived-countdown).

  function tick() {
    state.remainingMs = Math.max(0, state.endAtMs - Date.now());
    render();
    if (state.remainingMs <= 0) {
      stopTicker();
      completeInterval();
    }
  }

  function stopTicker() {
    if (state.tickId !== null) {
      clearInterval(state.tickId);
      state.tickId = null;
    }
  }

  function startTicker() {
    // Always stop first to guarantee at most one concurrent ticker.
    stopTicker();
    state.tickId = setInterval(tick, 250);
  }

  // ── Controls ──────────────────────────────────────────────────────────────

  // start() and pause() each guard against the wrong state so that rapid or
  // redundant clicks are no-ops (cannot spawn multiple tickers or freeze time twice).

  function start() {
    if (state.status === 'running') return; // idempotent guard
    // Unlock AudioContext on this user gesture so the first beep can play.
    ensureAudioCtx();
    state.endAtMs = Date.now() + state.remainingMs;
    state.status  = 'running';
    startTicker();
    render();
  }

  function pause() {
    if (state.status !== 'running') return; // idempotent guard
    stopTicker();
    // Snapshot remaining time from the wall clock so Resume is exact.
    state.remainingMs = Math.max(0, state.endAtMs - Date.now());
    state.endAtMs     = null;
    state.status      = 'paused';
    render();
  }

  function togglePlay() {
    if (state.status === 'running') {
      pause();
    } else {
      start();
    }
  }

  function reset() {
    stopTicker();
    state.remainingMs = DURATIONS_MS[state.intervalType];
    state.endAtMs     = null;
    state.status      = 'ready';
    // Completed count and workSinceLongBreak are intentionally preserved —
    // Reset restores the current interval's duration without touching the cycle.
    render();
  }

  function skip() {
    ensureAudioCtx();
    stopTicker();
    // Skipping does NOT count as a completed interval (see spec edge-case +
    // acceptance criteria). Pass countCompletion:false.
    advance({ countCompletion: false });
  }

  // ── Interval transitions ──────────────────────────────────────────────────

  // Decides the next interval and resets the timer to ready.
  // countCompletion=true  → a work interval that reached 00:00; increments the counters.
  // countCompletion=false → a skipped interval; counters unchanged.
  function advance(opts) {
    var countCompletion = opts.countCompletion;
    var current         = state.intervalType;
    var next;

    if (current === 'work') {
      if (countCompletion) {
        state.completedWorkCount += 1;
        state.workSinceLongBreak += 1;
      }
      // A skipped work interval does NOT push toward the long-break cadence.
      if (state.workSinceLongBreak >= WORK_INTERVALS_PER_LONG_BREAK) {
        next = 'longBreak';
        // Reset the toward-long-break counter now so the cycle wraps cleanly
        // when this long break ends (edge case: Long Break → Work resets counter).
        state.workSinceLongBreak = 0;
      } else {
        next = 'shortBreak';
      }
    } else {
      // Any break → always back to work.
      next = 'work';
    }

    state.intervalType = next;
    state.remainingMs  = DURATIONS_MS[next];
    state.endAtMs      = null;
    // Next interval waits for Start — does not auto-start (FR11).
    state.status       = 'ready';

    render();
    // Announce the transition to screen readers via the polite live region.
    announce('Interval complete. Starting ' + LABEL_TEXT[next] + '.');
  }

  // ── End-of-interval cue ───────────────────────────────────────────────────

  // Visual and audio cues are decoupled: the flash always fires regardless of
  // whether the beep succeeds (audio may be suppressed by browser policy).
  function completeInterval() {
    beep();
    flashVisualCue();
    advance({ countCompletion: true });
  }

  function flashVisualCue() {
    // Remove then re-add so repeated completions each trigger the animation.
    elContainer.classList.remove('flash');
    // Trigger a reflow so removing+adding in the same frame is not collapsed.
    void elContainer.offsetWidth;
    elContainer.classList.add('flash');
    setTimeout(function () {
      elContainer.classList.remove('flash');
    }, 800);
  }

  // Updates the sr-only polite live region so assistive tech announces events
  // without reading every countdown tick.
  function announce(msg) {
    elAnnounce.textContent = '';
    // Force the DOM update so repeated identical messages are re-announced.
    setTimeout(function () {
      elAnnounce.textContent = msg;
    }, 50);
  }

  // ── Event listeners ───────────────────────────────────────────────────────
  btnToggle.addEventListener('click', togglePlay);
  btnReset.addEventListener('click',  reset);
  btnSkip.addEventListener('click',   skip);

  // ── Initial render ────────────────────────────────────────────────────────
  render();

}());
