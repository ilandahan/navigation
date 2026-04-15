// Offline regression tests for authGate.js — the pure decision behind
// updateLiveSharedVisibility() in index.html.
// Run with: node tests/authGate.test.js

const fs = require('fs');
const path = require('path');

// Minimal fake-window: AuthGate doesn't touch any browser APIs, only
// exports onto its `global` parameter (which is `window` in browser).
const win = {};
function loadInto(win, file) {
  const src = fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
  new Function('window', 'global', src)(win, win);
}
loadInto(win, 'authGate.js');

// ---- test runner (matches existing test files) ----
let pass = 0, fail = 0;
function eq(actual, expected, name) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) { pass++; console.log(`  PASS: ${name}`); }
  else { fail++; console.log(`  FAIL: ${name}\n    got:  ${a}\n    want: ${e}`); }
}

const { computeLiveLocked } = win.AuthGate;

console.log('\nAuthGate.computeLiveLocked — module export shape:');
eq(typeof computeLiveLocked, 'function', 'computeLiveLocked is a function');
eq(typeof win.AuthGate, 'object', 'window.AuthGate is an object');

// Realistic Firebase user shape — only fields the gate could plausibly inspect.
const fakeUser = { uid: 'abc-123', email: 'driver@example.test', displayName: 'Driver' };

console.log('\nAuthGate.computeLiveLocked — full 4-case matrix:');
eq(computeLiveLocked('simulation', null),     false, 'sim + signed-out: NOT locked');
eq(computeLiveLocked('simulation', fakeUser), false, 'sim + signed-in: NOT locked (sim never gates)');
eq(computeLiveLocked('live',       null),     true,  'live + signed-out: LOCKED (the auth-gate scenario)');
eq(computeLiveLocked('live',       fakeUser), false, 'live + signed-in: NOT locked');

console.log('\nAuthGate.computeLiveLocked — falsy-user variants (live mode):');
eq(computeLiveLocked('live', undefined), true, 'live + undefined user: LOCKED');
eq(computeLiveLocked('live', 0),         true, 'live + numeric 0: LOCKED (defensive against accidental zero)');
eq(computeLiveLocked('live', ''),        true, "live + empty string: LOCKED (defensive)");
eq(computeLiveLocked('live', false),     true, 'live + boolean false: LOCKED');

console.log('\nAuthGate.computeLiveLocked — non-canonical mode strings:');
eq(computeLiveLocked('LIVE', null),  false, 'mode is case-sensitive: "LIVE" is not locked');
eq(computeLiveLocked('Live', null),  false, 'mode is case-sensitive: "Live" is not locked');
eq(computeLiveLocked('demo', null),  false, 'unknown mode: not locked (defaults to "not live")');
eq(computeLiveLocked('',     null),  false, 'empty mode: not locked');
eq(computeLiveLocked(null,   null),  false, 'null mode: not locked');
eq(computeLiveLocked(undefined, null), false, 'undefined mode: not locked');

console.log('\nAuthGate.computeLiveLocked — truthy-user variants (live mode, NOT locked):');
eq(computeLiveLocked('live', { uid: 'x' }),       false, 'minimal Firebase user shape');
eq(computeLiveLocked('live', { uid: '', email: 'a@b.test' }), false, 'user object with empty uid still truthy');
eq(computeLiveLocked('live', 'whatever'),          false, 'truthy non-object user (string)');
eq(computeLiveLocked('live', 1),                   false, 'truthy number 1');

console.log(`\n${pass}/${pass + fail} tests passed`);
if (fail > 0) process.exit(1);
