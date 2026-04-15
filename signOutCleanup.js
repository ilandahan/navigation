// Pure orchestrators that decide WHICH cleanup steps to run, and in
// WHAT ORDER, when a Live-tab session ends. Two distinct paths:
//
//   1. User-initiated sign-out (clicked the Sign-out button).
//      Order matters: stop sharing FIRST while the auth token is still
//      valid (writing endedAt to Firestore needs it), then stop the
//      local navigation/GPS, then call signOut.
//
//   2. Auth-state listener cleanup (cross-tab sign-out, token expiry,
//      any reactive teardown). The token is already gone or about to
//      be — best-effort: stop nav (local, no auth), stop sharing (may
//      fail, fine), then clearRoute() to wipe the previous user's
//      route + From/To inputs (LIVE-AUTH-GATE-001).
//
// Both functions return an ORDERED list of step names. The caller maps
// each name to the actual side-effecting handler. Pure and testable.

(function (global) {
  'use strict';

  // state: { isDriving: boolean, hasShare: boolean }
  // returns: string[] — subset of ['stopSharing', 'stopNavigation', 'signOut']
  //   in user-initiated sign-out order.
  function getUserSignOutSteps(state) {
    const s = state || {};
    const steps = [];
    if (s.hasShare)  steps.push('stopSharing');
    if (s.isDriving) steps.push('stopNavigation');
    steps.push('signOut');
    return steps;
  }

  // state: { isDriving: boolean, hasShare: boolean }
  // returns: string[] — subset of ['stopNavigation', 'stopSharing'] followed
  //   by always 'clearRoute', in auth-listener cleanup order.
  function getAuthCleanupSteps(state) {
    const s = state || {};
    const steps = [];
    if (s.isDriving) steps.push('stopNavigation');
    if (s.hasShare)  steps.push('stopSharing');
    steps.push('clearRoute');
    return steps;
  }

  global.SignOutCleanup = { getUserSignOutSteps, getAuthCleanupSteps };
})(typeof window !== 'undefined' ? window : globalThis);
