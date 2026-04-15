// Pure helpers for the "lost connection" timer in receiver.html.
// Used to display the elapsed time since the last shared-location ping
// and to decide when the UI should escalate to the "Extended silence"
// critical state.

(function (global) {
  'use strict';

  // Elapsed milliseconds → "MM:SS" with zero padding on both fields.
  // Minutes can exceed 99 (no upper cap) — the receiver page shows this
  // even past 1 hour because the critical-state messaging is the user
  // signal, not the timer wraparound.
  // Negative or non-finite input is clamped to 0 to keep the display
  // stable even if a clock skew produces a future "lostSince" timestamp.
  function formatLostTime(elapsedMs) {
    const safe = (typeof elapsedMs === 'number' && isFinite(elapsedMs) && elapsedMs > 0)
      ? elapsedMs
      : 0;
    const totalSeconds = Math.floor(safe / 1000);
    const mm = String(Math.floor(totalSeconds / 60)).padStart(2, '0');
    const ss = String(totalSeconds % 60).padStart(2, '0');
    return `${mm}:${ss}`;
  }

  // True when the elapsed silence has STRICTLY EXCEEDED the threshold.
  // Strict-greater-than mirrors the original inline `elapsed > CRITICAL_THRESHOLD_MS`
  // — the moment we cross 600,000 ms (10 min), not the 600,000th millisecond.
  // Non-finite inputs return false (keep the UI calm if data is bad).
  function isLostCritical(elapsedMs, thresholdMs) {
    if (typeof elapsedMs !== 'number' || !isFinite(elapsedMs)) return false;
    if (typeof thresholdMs !== 'number' || !isFinite(thresholdMs)) return false;
    return elapsedMs > thresholdMs;
  }

  global.LostTimer = { formatLostTime, isLostCritical };
})(typeof window !== 'undefined' ? window : globalThis);
