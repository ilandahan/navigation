// Live-tab auth gate decision — extracted from index.html so the logic
// is unit-testable without a browser (LIVE-AUTH-GATE-001 follow-up).
// Callers: updateLiveSharedVisibility() in index.html — the returned
// boolean drives element.hidden on #directions-panel and .share-row.

(function (global) {
  'use strict';

  // Returns true when Live mode is active AND there is no signed-in user.
  // In every other combination (Sim mode, or Live with a signed-in user)
  // returns false. "No user" is any falsy value — null, undefined, 0, '' —
  // so the caller can pass Firebase's `auth.currentUser` directly.
  //
  // mode:  string       — 'live' | 'simulation' | anything else (non-'live' treated as not-locked)
  // user:  object|null  — Firebase User or null/undefined when signed out
  function computeLiveLocked(mode, user) {
    return mode === 'live' && !user;
  }

  global.AuthGate = { computeLiveLocked };
})(typeof window !== 'undefined' ? window : globalThis);
