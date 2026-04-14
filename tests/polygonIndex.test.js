// Offline tests for polygonIndex.js.
// Run with: node tests/polygonIndex.test.js

'use strict';

const path = require('path');
const fs = require('fs');

const win = {};
function loadInto(win, file) {
  const src = fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
  new Function('window', 'global', src)(win, win);
}
loadInto(win, 'polygonIndex.js');
const { build } = win.PolygonIndex;

let pass = 0, fail = 0;
function eq(actual, expected, name) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) { pass++; console.log('  PASS:', name); }
  else { fail++; console.log('  FAIL:', name, '\n    got:', a, '\n    want:', e); }
}
function throws(fn, matcher, name) {
  try { fn(); fail++; console.log('  FAIL:', name, '(expected throw)'); }
  catch (e) {
    if (matcher instanceof RegExp ? matcher.test(e.message) : e.message.includes(matcher)) {
      pass++; console.log('  PASS:', name);
    } else { fail++; console.log('  FAIL:', name, '\n    expected:', matcher, '\n    got:', e.message); }
  }
}

console.log('\ntop-level shape validation:');
throws(() => build(null), 'expected top-level object, got null', 'null throws');
throws(() => build(undefined), 'expected top-level object, got undefined', 'undefined throws');
throws(() => build('not-an-object'), 'expected top-level object, got string', 'string throws');
throws(() => build([1, 2, 3]), 'expected top-level object, got array', 'array throws');

console.log('\nempty input:');
const empty = build({});
eq(empty.index, {}, 'empty input -> empty index');
eq(empty.skipped, [], 'empty input -> no skips');

console.log('\nmetadata key skip (underscore prefix):');
const meta = build({ '_meta': [[34, 32], [34.1, 32.1], [34.2, 32.2]], 'תל אביב': [[34, 32], [34.1, 32.1], [34.2, 32.2]] });
eq(Object.keys(meta.index), ['תל אביב'], 'underscore key not in index');
eq(meta.skipped, [], 'underscore key NOT counted as skip (intentional metadata)');

console.log('\ncoord pivot [lng, lat] -> {lat, lng}:');
const tlv = build({ 'תל אביב': [[34.78, 32.07], [34.79, 32.08], [34.80, 32.09]] });
eq(tlv.index['תל אביב'].latLngs, [
  { lat: 32.07, lng: 34.78 },
  { lat: 32.08, lng: 34.79 },
  { lat: 32.09, lng: 34.80 }
], 'coords pivoted correctly');

console.log('\nfewer-than-3-coords:');
const tooFew = build({ 'X': [[1, 2], [3, 4]], 'Y': [[1, 2], [3, 4], [5, 6]] });
eq(Object.keys(tooFew.index), ['Y'], 'X dropped, Y kept');
eq(tooFew.skipped, [{ name: 'X', reason: 'fewer-than-3-coords' }], 'X reported as skipped');

console.log('\nnon-array value:');
const notArr = build({ 'X': 'oops', 'Y': [[1, 2], [3, 4], [5, 6]] });
eq(Object.keys(notArr.index), ['Y'], 'string value dropped');
eq(notArr.skipped, [{ name: 'X', reason: 'not-an-array' }], 'reported');

console.log('\ninvalid coord:');
const badCoord = build({
  'BadNaN':   [[NaN, 32], [34.1, 32.1], [34.2, 32.2]],
  'BadShort': [[34], [34.1, 32.1], [34.2, 32.2]],
  'BadInf':   [[Infinity, 32], [34.1, 32.1], [34.2, 32.2]],
  'BadStr':   [['x', 32], [34.1, 32.1], [34.2, 32.2]],
  'Good':     [[34, 32], [34.1, 32.1], [34.2, 32.2]]
});
eq(Object.keys(badCoord.index), ['Good'], 'only the valid city kept');
eq(badCoord.skipped.map(s => s.name).sort(), ['BadInf', 'BadNaN', 'BadShort', 'BadStr'], 'all four bad cities reported');
eq(badCoord.skipped.every(s => s.reason === 'invalid-coord'), true, 'all bad-coord reasons are invalid-coord');

console.log('\nmultiple cities preserved:');
const multi = build({
  'A': [[1, 1], [2, 2], [3, 3]],
  'B': [[4, 4], [5, 5], [6, 6]],
  'C': [[7, 7], [8, 8], [9, 9]]
});
eq(Object.keys(multi.index).sort(), ['A', 'B', 'C'], 'three cities kept');
eq(multi.index.A.latLngs.length, 3, 'A has 3 coords');

console.log('\nreturn value never shares mutation with input:');
const src = { 'X': [[1, 1], [2, 2], [3, 3]] };
const out = build(src);
out.index.X.latLngs.push({ lat: 99, lng: 99 });
eq(src.X.length, 3, 'mutating returned latLngs does not mutate source');

console.log('\n' + pass + '/' + (pass + fail) + ' tests passed');
if (fail > 0) process.exit(1);
