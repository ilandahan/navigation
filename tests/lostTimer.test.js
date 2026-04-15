// Offline regression tests for lostTimer.js — pure helpers behind
// receiver.html's "lost connection" timer.
// Run with: node tests/lostTimer.test.js

const fs = require('fs');
const path = require('path');

const win = {};
function loadInto(win, file) {
  const src = fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
  new Function('window', 'global', src)(win, win);
}
loadInto(win, 'lostTimer.js');

let pass = 0, fail = 0;
function eq(actual, expected, name) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) { pass++; console.log(`  PASS: ${name}`); }
  else { fail++; console.log(`  FAIL: ${name}\n    got:  ${a}\n    want: ${e}`); }
}

const { formatLostTime, isLostCritical } = win.LostTimer;

console.log('\nLostTimer — module export shape:');
eq(typeof win.LostTimer,  'object',   'window.LostTimer is an object');
eq(typeof formatLostTime,  'function', 'formatLostTime is a function');
eq(typeof isLostCritical,  'function', 'isLostCritical is a function');

console.log('\nformatLostTime — boundaries:');
eq(formatLostTime(0),         '00:00', '0 ms → "00:00"');
eq(formatLostTime(999),       '00:00', 'sub-1s → "00:00" (Math.floor)');
eq(formatLostTime(1000),      '00:01', 'exactly 1 s');
eq(formatLostTime(1500),      '00:01', '1.5 s → "00:01" (floored)');
eq(formatLostTime(59000),     '00:59', '59 s');
eq(formatLostTime(59999),     '00:59', '59.999 s → "00:59" (floored)');
eq(formatLostTime(60000),     '01:00', 'exactly 1 minute');
eq(formatLostTime(60500),     '01:00', '60.5 s');
eq(formatLostTime(125000),    '02:05', '2 min 5 s');
eq(formatLostTime(599000),    '09:59', '9 min 59 s');
eq(formatLostTime(600000),    '10:00', '10 min — exactly the critical threshold');
eq(formatLostTime(3599000),   '59:59', '59 min 59 s');
eq(formatLostTime(3600000),   '60:00', '60 min — minutes not capped at 60');
eq(formatLostTime(7325000),   '122:05', '2h 2m 5s — minutes can exceed 99 (no overflow handling)');

console.log('\nformatLostTime — defensive (clock skew / bad input):');
eq(formatLostTime(-1000),     '00:00', 'negative elapsed → clamped to 0 (defensive against future lostSince)');
eq(formatLostTime(NaN),       '00:00', 'NaN → clamped to 0');
eq(formatLostTime(Infinity),  '00:00', 'Infinity → clamped to 0');
eq(formatLostTime(null),      '00:00', 'null → clamped to 0');
eq(formatLostTime(undefined), '00:00', 'undefined → clamped to 0');
eq(formatLostTime('60000'),   '00:00', 'string → clamped to 0 (no coercion)');

console.log('\nisLostCritical — strict greater-than threshold:');
eq(isLostCritical(0,           600000), false, '0 ms is not critical');
eq(isLostCritical(599999,      600000), false, '1 ms below threshold: not critical');
eq(isLostCritical(600000,      600000), false, 'EXACTLY at threshold: NOT critical (strict >)');
eq(isLostCritical(600001,      600000), true,  '1 ms above threshold: critical');
eq(isLostCritical(3600000,     600000), true,  '1 hour: critical');

console.log('\nisLostCritical — defensive (bad input):');
eq(isLostCritical(NaN,         600000), false, 'NaN elapsed → not critical');
eq(isLostCritical(Infinity,    600000), false, 'Infinity elapsed → not critical (not finite)');
eq(isLostCritical(700000,      NaN),    false, 'NaN threshold → not critical');
eq(isLostCritical(700000,      Infinity), false, 'Infinity threshold → not critical');
eq(isLostCritical(null,        600000), false, 'null elapsed');
eq(isLostCritical(700000,      null),   false, 'null threshold');
eq(isLostCritical('700000',    600000), false, 'string elapsed → not critical (no coercion)');

console.log(`\n${pass}/${pass + fail} tests passed`);
if (fail > 0) process.exit(1);
