// Offline regression tests for pikudClient.js — classify, normalize, diff, dedup.
// Run with: node tests/pikudClient.test.js

const fs = require('fs');
const path = require('path');

const win = {};
function loadInto(w, file) {
  const src = fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
  new Function('window', 'global', 'fetch', 'setTimeout', 'clearTimeout', src)(w, w, function(){}, function(){}, function(){});
}
loadInto(win, 'pikudClient.js');

let pass = 0, fail = 0;
function eq(actual, expected, name) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) { pass++; console.log('  PASS: ' + name); }
  else { fail++; console.log('  FAIL: ' + name + '\n    got:  ' + a + '\n    want: ' + e); }
}

const { _classify: classify, _normalize: normalize, _diff: diff } = win.PikudClient;

// ── classify ─────────────────────────────────────────────────────────

console.log('\nClassify — UAV override:');
eq(classify(2, 130), 'purple',   'catId 2 (UAV, priority 130) → purple');
eq(classify(2, 0),   'purple',   'catId 2 even with priority 0 → purple (override)');
eq(classify(2, 999), 'purple',   'catId 2 with absurd priority → purple');

console.log('\nClassify — critical tier (160-199):');
eq(classify(3, 180),  'critical', 'nonconventional p180 → critical');
eq(classify(9, 170),  'critical', 'cbrne p170 → critical');
eq(classify(10, 160), 'critical', 'terrorattack p160 → critical');

console.log('\nClassify — red tier (120-159):');
eq(classify(1, 120),  'red', 'missilealert p120 → red');
eq(classify(4, 140),  'red', 'warning p140 → red');
eq(classify(12, 150), 'red', 'hazmat p150 → red');

console.log('\nClassify — yellow tier (51-119):');
eq(classify(7, 90),   'yellow', 'earthquakealert1 p90 → yellow');
eq(classify(8, 110),  'yellow', 'earthquakealert2 p110 → yellow');
eq(classify(11, 100), 'yellow', 'tsunami p100 → yellow');

console.log('\nClassify — boundary cases:');
eq(classify(99, 160), 'critical', 'priority 160 boundary → critical');
eq(classify(99, 159), 'red',      'priority 159 boundary → red');
eq(classify(99, 120), 'red',      'priority 120 boundary → red');
eq(classify(99, 119), 'yellow',   'priority 119 boundary → yellow');
eq(classify(99, 51),  'yellow',   'priority 51 boundary → yellow');
eq(classify(99, 50),  'yellow',   'priority 50 → yellow (1-50 catch)');
eq(classify(99, 1),   'yellow',   'priority 1 → yellow');

console.log('\nClassify — drop tier (priority 0):');
eq(classify(13, 0), 'drop', 'update p0 → drop');
eq(classify(14, 0), 'drop', 'flash p0 → drop');
eq(classify(5, 0),  'drop', 'memorialday1 p0 → drop');

console.log('\nClassify — unknown catId default:');
eq(classify(999, 120), 'red', 'unknown catId with p120 → red (fail-safe)');

// ── normalize ────────────────────────────────────────────────────────

console.log('\nNormalize — happy path:');
const n1 = normalize({
  rid: 100, id: 'abc', catId: 1, category: 'missilealert',
  categoryHe: 'ירי רקטות', priority: 120,
  cities: ['תל אביב'], timestamp: '2026-04-15T12:00:00Z',
});
eq(n1.colorState, 'red',    'missile → red');
eq(n1.type,       'טיל',    'missilealert display → טיל');
eq(n1.rid,        100,       'rid preserved');
eq(n1._durationMs, 90000,   'default duration 90s');
eq(n1.cities[0],  'תל אביב', 'city preserved');

console.log('\nNormalize — UAV:');
const n2 = normalize({ rid: 200, catId: 2, category: 'uav', categoryHe: 'כטב"ם', priority: 130, cities: ['חיפה'] });
eq(n2.colorState, 'purple', 'UAV → purple');
eq(n2.type,       'כטב״ם',  'uav display');

console.log('\nNormalize — drop returns null:');
const n3 = normalize({ rid: 300, catId: 13, category: 'update', priority: 0, cities: [] });
eq(n3, null, 'update (p0) → null (dropped)');

console.log('\nNormalize — unknown category display fallback:');
const n4 = normalize({ rid: 400, catId: 99, category: 'future_cat', categoryHe: 'חדש', priority: 120, cities: ['באר שבע'] });
eq(n4.type, 'חדש', 'falls back to categoryHe');

console.log('\nNormalize — missing categoryHe fallback:');
const n5 = normalize({ rid: 500, catId: 99, category: 'future_cat', priority: 120, cities: [] });
eq(n5.type, 'התרעה', 'falls back to generic התרעה');

// ── diff ─────────────────────────────────────────────────────────────

console.log('\nDiff — new rid added to map:');
const map1 = new Map();
const d1 = diff(map1, [{ rid: 1, cities: ['A'] }], 10000);
eq(d1.length, 0,         'no clears on first poll');
eq(map1.has(1), true,    'rid 1 tracked');

console.log('\nDiff — rid still present → no clear:');
diff(map1, [{ rid: 1, cities: ['A'] }], 11000);
eq(map1.size, 1, 'still one entry');

console.log('\nDiff — rid absent but < 5s → no clear yet:');
var d3 = diff(map1, [], 14000);  // 14000 - 11000 = 3s < 5s
eq(d3.length, 0, 'within grace period, no clear');
eq(map1.has(1), true, 'rid 1 still tracked (grace)');

console.log('\nDiff — rid absent > 5s → clear emitted:');
var d4 = diff(map1, [], 20000);  // 20000 - 11000 = 9s > 5s
eq(d4.length, 1,     'one clear emitted');
eq(d4[0].rid, 1,     'clear for rid 1');
eq(d4[0].cities[0], 'A', 'clear carries cities');
eq(map1.has(1), false, 'rid 1 removed from map');

console.log('\nDiff — multiple rids, partial clear:');
const map2 = new Map();
map2.set(10, { cities: ['X'], lastSeenMs: 1000 });
map2.set(20, { cities: ['Y'], lastSeenMs: 1000 });
var d5 = diff(map2, [{ rid: 20, cities: ['Y'] }], 10000);
eq(d5.length, 1,     'rid 10 cleared');
eq(d5[0].rid, 10,    'correct rid cleared');
eq(map2.has(20), true, 'rid 20 survives');

// ── Module shape ─────────────────────────────────────────────────────

console.log('\nModule shape:');
eq(typeof win.PikudClient.start,      'function', 'start is function');
eq(typeof win.PikudClient.stop,       'function', 'stop is function');
eq(typeof win.PikudClient._normalize, 'function', '_normalize is function');
eq(typeof win.PikudClient._classify,  'function', '_classify is function');
eq(typeof win.PikudClient._diff,      'function', '_diff is function');
eq(typeof win.PikudClient._state,     'object',   '_state is object');

// ── Summary ──────────────────────────────────────────────────────────

console.log('\n' + (pass + fail) + ' tests: ' + pass + ' passed, ' + fail + ' failed');
if (fail > 0) process.exit(1);
console.log('\n' + pass + '/' + pass + ' tests passed');
