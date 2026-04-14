// Offline tests for dangerZone.js.
// Run with: node tests/dangerZone.test.js

'use strict';

const path = require('path');
const fs = require('fs');

const win = {};
function loadInto(win, file) {
  const src = fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
  new Function('window', 'global', src)(win, win);
}
loadInto(win, 'dangerZone.js');
const { check, countIntersections } = win.DangerZone;

let pass = 0, fail = 0;
function eq(actual, expected, name) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) { pass++; console.log('  PASS:', name); }
  else { fail++; console.log('  FAIL:', name, '\n    got:', a, '\n    want:', e); }
}
function truthy(v, name) {
  if (v) { pass++; console.log('  PASS:', name); }
  else { fail++; console.log('  FAIL:', name); }
}
function falsy(v, name) {
  if (!v) { pass++; console.log('  PASS:', name); }
  else { fail++; console.log('  FAIL:', name); }
}
function throws(fn, matcher, name) {
  try { fn(); fail++; console.log('  FAIL:', name, '(expected throw)'); }
  catch (e) {
    if (matcher instanceof RegExp ? matcher.test(e.message) : e.message.includes(matcher)) {
      pass++; console.log('  PASS:', name);
    } else { fail++; console.log('  FAIL:', name, '\n    expected:', matcher, '\n    got:', e.message); }
  }
}

// ---- stub: bbox-based containsLocation ----
// A "polygon" in tests is { _bbox: { minLat, maxLat, minLng, maxLng } }.
// containsFn returns true iff point is inside the bbox.
function makePoly(minLat, maxLat, minLng, maxLng) {
  return { _bbox: { minLat, maxLat, minLng, maxLng } };
}
const containsFn = (pt, poly) => {
  const b = poly._bbox;
  return pt.lat >= b.minLat && pt.lat <= b.maxLat && pt.lng >= b.minLng && pt.lng <= b.maxLng;
};

// ====== check() ======
console.log('\ncheck — required containsFn:');
throws(() => check({lat:0,lng:0}, [], null), 'containsFn is required', 'missing containsFn throws');
throws(() => check({lat:0,lng:0}, [], 'not-a-fn'), 'containsFn is required', 'non-function containsFn throws');

console.log('\ncheck — empty / null inputs:');
eq(check(null, [{polygons:[makePoly(0,1,0,1)]}], containsFn), { inside: false, polygonHit: null, alertHit: null }, 'null position -> not inside');
eq(check(undefined, [{polygons:[makePoly(0,1,0,1)]}], containsFn), { inside: false, polygonHit: null, alertHit: null }, 'undefined position -> not inside');
eq(check({lat:0.5,lng:0.5}, [], containsFn), { inside: false, polygonHit: null, alertHit: null }, 'empty alerts -> not inside');
eq(check({lat:0.5,lng:0.5}, null, containsFn), { inside: false, polygonHit: null, alertHit: null }, 'null alerts -> not inside');

console.log('\ncheck — single polygon hit:');
const poly = makePoly(0, 1, 0, 1);
const alert1 = { id: 'A1', polygons: [poly] };
const verdict = check({lat:0.5,lng:0.5}, [alert1], containsFn);
truthy(verdict.inside, 'point inside single polygon -> inside=true');
truthy(verdict.polygonHit === poly, 'polygonHit identity preserved');
truthy(verdict.alertHit === alert1, 'alertHit identity preserved');

console.log('\ncheck — outside polygon:');
const out = check({lat:5,lng:5}, [alert1], containsFn);
falsy(out.inside, 'point outside -> inside=false');
eq(out.polygonHit, null, 'no polygonHit when outside');
eq(out.alertHit, null, 'no alertHit when outside');

console.log('\ncheck — multiple polygons in one alert (first hit wins):');
const polyA = makePoly(0, 1, 0, 1);
const polyB = makePoly(2, 3, 2, 3);
const multiAlert = { id: 'MULTI', polygons: [polyA, polyB] };
const v1 = check({lat:0.5, lng:0.5}, [multiAlert], containsFn);
truthy(v1.polygonHit === polyA, 'first matching polygon wins');
const v2 = check({lat:2.5, lng:2.5}, [multiAlert], containsFn);
truthy(v2.polygonHit === polyB, 'second polygon hit when first misses');

console.log('\ncheck — multiple alerts:');
const a1 = { id: 'A', polygons: [makePoly(0,1,0,1)] };
const a2 = { id: 'B', polygons: [makePoly(10,11,10,11)] };
const v3 = check({lat:10.5, lng:10.5}, [a1, a2], containsFn);
truthy(v3.alertHit === a2, 'second alert detected when first misses');

console.log('\ncheck — short-circuits on first hit:');
let calls = 0;
const counter = (pt, p) => { calls++; return containsFn(pt, p); };
check({lat:0.5,lng:0.5}, [a1, a2], counter);
eq(calls, 1, 'returns after first hit (does not check second alert)');

console.log('\ncheck — robust to malformed alert entries:');
const bad = [{ polygons: null }, { /* no polygons */ }, null, alert1];
const vBad = check({lat:0.5,lng:0.5}, bad, containsFn);
truthy(vBad.inside && vBad.alertHit === alert1, 'malformed entries skipped, valid one still found');

// ====== countIntersections() ======
console.log('\ncountIntersections — required containsFn:');
throws(() => countIntersections([{lat:0,lng:0}], [], null), 'containsFn is required', 'missing containsFn throws');

console.log('\ncountIntersections — empty / null inputs:');
eq(countIntersections([], [alert1], containsFn), 0, 'empty path -> 0');
eq(countIntersections(null, [alert1], containsFn), 0, 'null path -> 0');
eq(countIntersections([{lat:0,lng:0}], [], containsFn), 0, 'empty alerts -> 0');
eq(countIntersections([{lat:0,lng:0}], null, containsFn), 0, 'null alerts -> 0');

console.log('\ncountIntersections — counts unique polygons hit:');
const path1 = [{lat:0.5,lng:0.5}, {lat:2.5,lng:2.5}, {lat:5,lng:5}];
eq(countIntersections(path1, [{polygons:[polyA, polyB]}], containsFn, 1), 2, 'two polygons hit -> 2');

console.log('\ncountIntersections — same polygon, multiple hits = 1:');
const path2 = [{lat:0.1,lng:0.1}, {lat:0.5,lng:0.5}, {lat:0.9,lng:0.9}];
eq(countIntersections(path2, [{polygons:[polyA]}], containsFn, 1), 1, 'same polygon hit thrice -> still 1 (Set dedup)');

console.log('\ncountIntersections — sample stride respected:');
// Length 4. Inside-points only at odd indices (1 and 3). Outside at 0, 2.
// Stride 1 visits 0,1,2,3 -> finds at 1 -> 1.
// Stride 2 visits 0,2     -> no finds          -> 0.
// Stride 3 visits 0,3     -> finds at 3        -> 1.
const stridePath = [{lat:5,lng:5}, {lat:0.5,lng:0.5}, {lat:5,lng:5}, {lat:0.5,lng:0.5}];
eq(countIntersections(stridePath, [{polygons:[polyA]}], containsFn, 1), 1, 'stride 1 finds inside');
eq(countIntersections(stridePath, [{polygons:[polyA]}], containsFn, 2), 0, 'stride 2 skips both inside-points (visits 0,2)');
eq(countIntersections(stridePath, [{polygons:[polyA]}], containsFn, 3), 1, 'stride 3 visits index 3 -> finds');

// Default stride is 3. Same path: stride 3 → 1 hit.
console.log('\ncountIntersections — invalid stride defaults to 3:');
eq(countIntersections(stridePath, [{polygons:[polyA]}], containsFn, 0), 1, 'stride 0 defaults to 3 (visits 0,3 -> hit)');
eq(countIntersections(stridePath, [{polygons:[polyA]}], containsFn, 'x'), 1, 'non-numeric stride defaults to 3');
eq(countIntersections(stridePath, [{polygons:[polyA]}], containsFn), 1, 'undefined stride defaults to 3');

console.log('\ncountIntersections — robust to malformed alerts:');
eq(countIntersections([{lat:0.5,lng:0.5}], [null, {polygons:null}, {polygons:[polyA]}], containsFn, 1), 1, 'malformed entries skipped');

console.log('\n' + pass + '/' + (pass + fail) + ' tests passed');
if (fail > 0) process.exit(1);
