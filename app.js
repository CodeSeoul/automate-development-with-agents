// Pomodoro timer — all state and logic lives here; the server only serves this file.
// Design: wall-clock anchor (endsAt = Date.now() + remaining) so background-tab
// throttling only slows UI refresh, it never accumulates timing drift.

(function () {
  'use strict';

  // --- Constants ---
  var WORK_MS       = 25 * 60 * 1000;
  var SHORT_MS      =  5 * 60 * 1000;
  var LONG_MS       = 15 * 60 * 1000;
  var WORK_PER_LONG = 4;

  // Overridable clock — tests inject a fake `now` function to advance time
  // without waiting for real wall-clock ticks.
  var _now = Date.now.bind(Date);
  function setNow(fn) { _now = fn; }

  // --- Pure helpers ---

  // Returns remaining time as "MM:SS", clamped to "00:00" for negative values.
  function formatMMSS(ms) {
    var totalSec = Math.max(0, Math.ceil(ms / 1000));
    var minutes  = Math.floor(totalSec / 60);
    var seconds  = totalSec % 60;
    return (minutes < 10 ? '0' : '') + minutes + ':' + (seconds < 10 ? '0' : '') + seconds;
  }

  // Pure cycle-advance function: given the interval that just finished, return
  // the descriptor of the next interval. workCount is the number of work
  // intervals completed-or-in-progress in the current cycle (already incremented
  // on work-interval entry, so finishing work N means workCount === N here).
  function nextInterval(intervalKind, workCount) {
    if (intervalKind === 'work') {
      if (workCount >= WORK_PER_LONG) {
        return { intervalKind: 'long-break', workCount: workCount, durationMs: LONG_MS };
      }
      return { intervalKind: 'short-break', workCount: workCount, durationMs: SHORT_MS };
    }
    if (intervalKind === 'short-break') {
      var next = workCount + 1;
      return { intervalKind: 'work', workCount: next, durationMs: WORK_MS };
    }
    // long-break → fresh cycle
    return { intervalKind: 'work', workCount: 1, durationMs: WORK_MS };
  }

  // --- State ---
  // phase:        'idle' | 'running' | 'paused'
  // intervalKind: 'work' | 'short-break' | 'long-break'
  // workCount:    1..WORK_PER_LONG  (work interval currently active or about to start)
  // durationMs:   full length of current interval
  // endsAt:       wall-clock deadline while running; null otherwise
  // remainingMs:  authoritative remaining time; frozen while paused/idle
  var state = {
    phase:        'idle',
    intervalKind: 'work',
    workCount:    1,
    durationMs:   WORK_MS,
    endsAt:       null,
    remainingMs:  WORK_MS
  };

  // --- Control functions ---
  // Each enforces valid-phase no-ops so out-of-order or repeated calls are harmless.

  function start() {
    if (state.phase !== 'idle') { return; }
    state.endsAt = _now() + state.remainingMs;
    state.phase  = 'running';
    render();
  }

  function pause() {
    if (state.phase !== 'running') { return; }
    state.remainingMs = Math.max(0, state.endsAt - _now());
    state.endsAt      = null;
    state.phase       = 'paused';
    render();
  }

  function resume() {
    if (state.phase !== 'paused') { return; }
    state.endsAt = _now() + state.remainingMs;
    state.phase  = 'running';
    render();
  }

  // skip() reuses the same nextInterval path as natural completion, so a skipped
  // Work interval still advances workCount (FR-11). Guard flag prevents double-fire
  // from rapid input within the same JS task.
  var _skipInProgress = false;
  function skip() {
    if (state.phase === 'idle') { return; }
    if (_skipInProgress) { return; }
    _skipInProgress = true;
    completeInterval();
    _skipInProgress = false;
  }

  function reset() {
    state.phase        = 'idle';
    state.intervalKind = 'work';
    state.workCount    = 1;
    state.durationMs   = WORK_MS;
    state.endsAt       = null;
    state.remainingMs  = WORK_MS;
    render();
  }

  // Advance to the next interval in a waiting (idle-like) state.
  // Called by tick() when the timer reaches zero, and by skip().
  // Flips phase to 'idle' immediately so a concurrent tick cannot re-fire.
  function completeInterval() {
    var prev  = state.phase;
    state.phase = 'idle'; // prevent re-entry from a racing tick

    signalTransition();

    var next = nextInterval(state.intervalKind, state.workCount);
    state.intervalKind = next.intervalKind;
    state.workCount    = next.workCount;
    state.durationMs   = next.durationMs;
    state.endsAt       = null;
    state.remainingMs  = next.durationMs;
    // phase stays 'idle' — user must press Start for the next interval (FR-10)

    render();
  }

  // --- Wall-clock render loop ---

  // tick() is called every 250 ms by setInterval and immediately on visibilitychange.
  // It recomputes remainingMs from the wall-clock anchor rather than decrementing,
  // so background-tab throttling only reduces display refresh rate, not accuracy.
  function tick() {
    if (state.phase !== 'running') { return; }
    var remaining = state.endsAt - _now();
    if (remaining <= 0) {
      state.remainingMs = 0;
      completeInterval();
      return;
    }
    state.remainingMs = remaining;
    render();
  }

  setInterval(tick, 250);

  // Immediate tick on tab refocus corrects the display without waiting up to 250 ms.
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden) { tick(); }
  });

  // --- Transition signal ---
  // Visual: swap #app[data-interval] → CSS re-themes instantly.
  // Audio: short beep via AudioContext oscillator; best-effort, never required.
  // Accessible: aria-live region on #interval-type + assertive announce region.
  function signalTransition() {
    var next  = nextInterval(state.intervalKind, state.workCount);
    var label = intervalLabel(next.intervalKind);
    var announceEl = document.getElementById('status-announce');
    if (announceEl) {
      announceEl.textContent = label + ' — interval complete. ' + label + ' starting next.';
    }
    playBeep();
  }

  function playBeep() {
    try {
      var ctx  = new (window.AudioContext || window.webkitAudioContext)();
      var osc  = ctx.createOscillator();
      var gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type      = 'sine';
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.6);
      osc.onended = function () { ctx.close(); };
    } catch (e) {
      // Audio autoplay may be blocked — the visual + aria signal is authoritative.
    }
  }

  // --- Render ---
  // Pure view function over state; queries DOM IDs that are stable per the plan.

  function intervalLabel(kind) {
    if (kind === 'work')        { return 'Work'; }
    if (kind === 'short-break') { return 'Short Break'; }
    return 'Long Break';
  }

  function render() {
    var appEl      = document.getElementById('app');
    var timeEl     = document.getElementById('time-remaining');
    var typeEl     = document.getElementById('interval-type');
    var progressEl = document.getElementById('cycle-progress');
    var btnStart   = document.getElementById('btn-start');
    var btnPause   = document.getElementById('btn-pause');
    var btnSkip    = document.getElementById('btn-skip');
    var btnReset   = document.getElementById('btn-reset');

    if (!appEl) { return; } // guard for unit test environment without DOM

    // Per-interval colour theming via CSS attribute selector
    appEl.setAttribute('data-interval', state.intervalKind);

    timeEl.textContent = formatMMSS(state.remainingMs);
    typeEl.textContent = intervalLabel(state.intervalKind);

    // Cycle progress: fill dots for completed + current work interval
    var dots = progressEl.querySelectorAll('.dot');
    for (var i = 0; i < dots.length; i++) {
      var dotIndex = i + 1; // 1-based
      if (state.intervalKind === 'work') {
        dots[i].classList.toggle('active',    dotIndex === state.workCount);
        dots[i].classList.toggle('completed', dotIndex < state.workCount);
      } else {
        // During a break, all work intervals up to and including workCount are done
        dots[i].classList.toggle('active',    false);
        dots[i].classList.toggle('completed', dotIndex <= state.workCount);
      }
    }

    // Button states: Start/Resume label + enabled/disabled per phase
    if (state.phase === 'idle') {
      btnStart.textContent = 'Start';
      btnStart.disabled    = false;
      btnPause.disabled    = true;
      btnSkip.disabled     = true;
    } else if (state.phase === 'running') {
      btnStart.textContent = 'Start';
      btnStart.disabled    = true;
      btnPause.disabled    = false;
      btnSkip.disabled     = false;
    } else { // paused
      btnStart.textContent = 'Resume';
      btnStart.disabled    = false;
      btnPause.disabled    = true;
      btnSkip.disabled     = false;
    }

    btnReset.disabled = false; // always available
  }

  // --- DOM wiring ---
  document.addEventListener('DOMContentLoaded', function () {
    var btnStart = document.getElementById('btn-start');
    var btnPause = document.getElementById('btn-pause');
    var btnSkip  = document.getElementById('btn-skip');
    var btnReset = document.getElementById('btn-reset');

    btnStart.addEventListener('click', function () {
      if (state.phase === 'paused') { resume(); } else { start(); }
    });
    btnPause.addEventListener('click', pause);
    btnSkip.addEventListener('click',  skip);
    btnReset.addEventListener('click', reset);

    render(); // set initial idle Work 1 / 25:00 view
  });

  // Expose pure functions and state on window.Pomodoro so the test harness
  // can call them without a module bundler (plan Interface section).
  window.Pomodoro = {
    formatMMSS:   formatMMSS,
    nextInterval: nextInterval,
    getState:     function () { return state; },
    setNow:       setNow,
    start:        start,
    pause:        pause,
    resume:       resume,
    skip:         skip,
    reset:        reset,
    tick:         tick,
    completeInterval: completeInterval,
    // Constants exposed so tests can reference them without duplication
    WORK_MS:       WORK_MS,
    SHORT_MS:      SHORT_MS,
    LONG_MS:       LONG_MS,
    WORK_PER_LONG: WORK_PER_LONG
  };

}());
