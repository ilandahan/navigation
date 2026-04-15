// Offline regression tests for signOutCleanup.js — orchestrators that
// decide which cleanup steps to run, and in what order, when a Live-tab
// session ends. Two paths: user-initiated sign-out (button click) and
// reactive cleanup (auth-state listener for cross-tab / token expiry).
// Run with: node tests/signOutCleanup.test.js

const fs = require('fs');
const path = require('path');

const win = {};
function loadInto(win, file) {
  const src = fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
  new Function('window', 'global', src)(win, win);
}
loadInto(win, 'signOutCleanup.js');

let pass = 0, fail = 0;
function eq(actual, expected, name) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) { pass++; console.log(`  PASS: ${name}`); }
  else { fail++; console.log(`  FAIL: ${name}\n    got:  ${a}\n    want: ${e}`); }
}

const { getUserSignOutSteps, getAuthCleanupSteps } = win.SignOutCleanup;

console.log('\nSignOutCleanup — module export shape:');
eq(typeof win.SignOutCleanup,   'object',   'window.SignOutCleanup is an object');
eq(typeof getUserSignOutSteps,  'function', 'getUserSignOutSteps is a function');
eq(typeof getAuthCleanupSteps,  'function', 'getAuthCleanupSteps is a function');

console.log('\ngetUserSignOutSteps — full state matrix (sharing FIRST: needs valid token to write endedAt):');
eq(
  getUserSignOutSteps({ isDriving: true, hasShare: true }),
  ['stopSharing', 'stopNavigation', 'signOut'],
  'driving + sharing → all 3 in order: sharing first, nav second, signOut last'
);
eq(
  getUserSignOutSteps({ isDriving: false, hasShare: true }),
  ['stopSharing', 'signOut'],
  'sharing only (not driving) → stopSharing then signOut'
);
eq(
  getUserSignOutSteps({ isDriving: true, hasShare: false }),
  ['stopNavigation', 'signOut'],
  'driving only (not sharing) → stopNavigation then signOut'
);
eq(
  getUserSignOutSteps({ isDriving: false, hasShare: false }),
  ['signOut'],
  'idle → signOut only'
);

console.log('\ngetUserSignOutSteps — defensive on missing/empty state:');
eq(getUserSignOutSteps(),       ['signOut'], 'undefined state → signOut only (treat as idle)');
eq(getUserSignOutSteps(null),   ['signOut'], 'null state → signOut only');
eq(getUserSignOutSteps({}),     ['signOut'], 'empty state → signOut only');

console.log('\ngetAuthCleanupSteps — full state matrix (clearRoute ALWAYS last to wipe per-user data — LIVE-AUTH-GATE-001):');
eq(
  getAuthCleanupSteps({ isDriving: true, hasShare: true }),
  ['stopNavigation', 'stopSharing', 'clearRoute'],
  'driving + sharing → nav, sharing, clearRoute (LOCAL nav first since no token needed; sharing best-effort; route always wiped)'
);
eq(
  getAuthCleanupSteps({ isDriving: false, hasShare: true }),
  ['stopSharing', 'clearRoute'],
  'sharing only → stopSharing then clearRoute'
);
eq(
  getAuthCleanupSteps({ isDriving: true, hasShare: false }),
  ['stopNavigation', 'clearRoute'],
  'driving only → stopNavigation then clearRoute'
);
eq(
  getAuthCleanupSteps({ isDriving: false, hasShare: false }),
  ['clearRoute'],
  'idle → clearRoute only (clearRoute is unconditional)'
);

console.log('\ngetAuthCleanupSteps — defensive on missing/empty state:');
eq(getAuthCleanupSteps(),       ['clearRoute'], 'undefined state → clearRoute only');
eq(getAuthCleanupSteps(null),   ['clearRoute'], 'null state → clearRoute only');
eq(getAuthCleanupSteps({}),     ['clearRoute'], 'empty state → clearRoute only');

console.log('\nSignOutCleanup — pure: same input → same output:');
eq(
  getUserSignOutSteps({ isDriving: true, hasShare: true }),
  getUserSignOutSteps({ isDriving: true, hasShare: true }),
  'getUserSignOutSteps is referentially transparent'
);
eq(
  getAuthCleanupSteps({ isDriving: true, hasShare: true }),
  getAuthCleanupSteps({ isDriving: true, hasShare: true }),
  'getAuthCleanupSteps is referentially transparent'
);

// Confirm the two paths differ in ORDER for the dual-state case — this is
// the entire point of having two functions. If they ever return the same
// list, the design has collapsed.
console.log('\nThe two paths produce DIFFERENT step orders (design contract):');
const userSteps = getUserSignOutSteps({ isDriving: true, hasShare: true });
const authSteps = getAuthCleanupSteps({ isDriving: true, hasShare: true });
eq(JSON.stringify(userSteps) !== JSON.stringify(authSteps), true,
   'user-signout (sharing first) ≠ auth-cleanup (nav first) — different orderings preserved');
eq(userSteps[0],  'stopSharing',    'user-signout: stopSharing is first');
eq(authSteps[0],  'stopNavigation', 'auth-cleanup: stopNavigation is first');
eq(authSteps[authSteps.length - 1], 'clearRoute', 'auth-cleanup: clearRoute is always LAST');
eq(userSteps[userSteps.length - 1], 'signOut',    'user-signout: signOut is always LAST');

console.log(`\n${pass}/${pass + fail} tests passed`);
if (fail > 0) process.exit(1);
