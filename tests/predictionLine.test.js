// Offline regression tests for predictionLine.js — centroid, PCA direction,
// prediction line computation, coordinate offset.
// Run with: node tests/predictionLine.test.js

const fs = require('fs');
const path = require('path');

const win = {};
function loadInto(w, file) {
  const src = fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
  new Function('window', 'global', src)(w, w);
}
loadInto(win, 'predictionLine.js');

let pass = 0, fail = 0;
function eq(actual, expected, name) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) { pass++; console.log('  PASS: ' + name); }
  else { fail++; console.log('  FAIL: ' + name + '\n    got:  ' + a + '\n    want: ' + e); }
}
// Approximate equality for floating point
function approx(actual, expected, tolerance, name) {
  if (actual === null && expected === null) { pass++; console.log('  PASS: ' + name); return; }
  if (actual === null || expected === null) { fail++; console.log('  FAIL: ' + name + '\n    got:  ' + actual + '\n    want: ' + expected); return; }
  if (Math.abs(actual - expected) <= tolerance) { pass++; console.log('  PASS: ' + name); }
  else { fail++; console.log('  FAIL: ' + name + '\n    got:  ' + actual + '\n    want: ' + expected + ' ± ' + tolerance); }
}

const { computeCentroid, computeDirection, computePredictionLine, computeOffset, _distanceKm } = win.PredictionLine;

// ── computeCentroid ──────────────────────────────────────────────────

console.log('\nCentroid — single point:');
const c1 = computeCentroid([{ lat: 32.0, lng: 34.8 }]);
eq(c1.lat, 32.0, 'single point lat');
eq(c1.lng, 34.8, 'single point lng');

console.log('\nCentroid — two points:');
const c2 = computeCentroid([{ lat: 32.0, lng: 34.0 }, { lat: 34.0, lng: 36.0 }]);
eq(c2.lat, 33.0, 'two points lat midpoint');
eq(c2.lng, 35.0, 'two points lng midpoint');

console.log('\nCentroid — three points:');
const c3 = computeCentroid([{ lat: 30.0, lng: 33.0 }, { lat: 32.0, lng: 35.0 }, { lat: 34.0, lng: 37.0 }]);
eq(c3.lat, 32.0, 'three points lat avg');
eq(c3.lng, 35.0, 'three points lng avg');

console.log('\nCentroid — empty/null:');
eq(computeCentroid([]), null, 'empty array → null');
eq(computeCentroid(null), null, 'null → null');

// ── computeDirection ─────────────────────────────────────────────────

console.log('\nDirection — two points N-S (same longitude):');
const dNS = computeDirection([{ lat: 30.0, lng: 35.0 }, { lat: 34.0, lng: 35.0 }]);
// Points spread along latitude only → principal axis is N-S → heading ≈ 0° or 180°
approx(dNS % 180, 0, 5, 'N-S axis → heading ≈ 0° or 180°');

console.log('\nDirection — two points E-W (same latitude):');
const dEW = computeDirection([{ lat: 32.0, lng: 33.0 }, { lat: 32.0, lng: 37.0 }]);
// Points spread along longitude only → principal axis is E-W → heading ≈ 90° or 270°
approx(dEW % 180, 90, 5, 'E-W axis → heading ≈ 90° or 270°');

console.log('\nDirection — NE-SW diagonal:');
const dNE = computeDirection([{ lat: 30.0, lng: 33.0 }, { lat: 34.0, lng: 37.0 }]);
// Points on NE-SW line → heading ≈ 45° or 225° (NE or SW)
approx(dNE % 180, 45, 15, 'NE-SW diagonal → heading ≈ 45° mod 180');

console.log('\nDirection — <2 points → null:');
eq(computeDirection([{ lat: 32.0, lng: 35.0 }]), null, 'single point → null');
eq(computeDirection([]), null, 'empty → null');
eq(computeDirection(null), null, 'null → null');

console.log('\nDirection — weighted (3 points, one heavy):');
// Two southern points (weight 1 each), one northern (weight 10)
// Should pull direction toward N-S axis despite the 3rd point being offset
const dW = computeDirection(
  [{ lat: 30.0, lng: 34.0 }, { lat: 30.5, lng: 36.0 }, { lat: 34.0, lng: 35.0 }],
  [1, 1, 10]
);
// Heavy northern point dominates → axis should lean N-S more than without weights
eq(typeof dW, 'number', 'weighted returns a heading');

// ── computePredictionLine ────────────────────────────────────────────

console.log('\nPredictionLine — 0 centroids:');
const pl0 = computePredictionLine([]);
eq(pl0.centroid, null, 'no centroids → null centroid');
eq(pl0.heading, null, 'no centroids → null heading');
eq(pl0.spreadKm, 0, 'no centroids → 0 spread');

console.log('\nPredictionLine — 1 centroid (dot-only):');
const pl1 = computePredictionLine([{ lat: 32.0, lng: 34.8, weight: 120 }]);
eq(pl1.centroid.lat, 32.0, '1 centroid lat');
eq(pl1.centroid.lng, 34.8, '1 centroid lng');
eq(pl1.heading, null, '1 centroid → null heading (dot-only)');
eq(pl1.spreadKm, 0, '1 centroid → 0 spread');

console.log('\nPredictionLine — 2 centroids:');
const pl2 = computePredictionLine([
  { lat: 31.0, lng: 34.5, weight: 120 },
  { lat: 33.0, lng: 34.5, weight: 130 }
]);
eq(typeof pl2.heading, 'number', '2 centroids → numeric heading');
eq(pl2.centroid !== null, true, '2 centroids → centroid exists');
approx(pl2.spreadKm, 111, 15, 'spread ≈ 111km (1° lat ≈ 111km, stddev of ±1°)');

console.log('\nPredictionLine — 3 centroids with different weights:');
const pl3 = computePredictionLine([
  { lat: 31.0, lng: 34.0, weight: 120 },
  { lat: 32.0, lng: 35.0, weight: 160 },
  { lat: 33.0, lng: 36.0, weight: 180 }
]);
eq(typeof pl3.heading, 'number', '3 centroids → numeric heading');
eq(pl3.spreadKm > 0, true, '3 centroids → positive spread');

// ── computeOffset ────────────────────────────────────────────────────

console.log('\nOffset — due north 111km ≈ 1° latitude:');
const oN = computeOffset({ lat: 32.0, lng: 35.0 }, 0, 111);
approx(oN.lat, 33.0, 0.05, 'north 111km → lat ≈ 33.0');
approx(oN.lng, 35.0, 0.05, 'north 111km → lng unchanged');

console.log('\nOffset — due east 85km at lat 32°:');
// At lat 32°, 1° lng ≈ 111 * cos(32°) ≈ 94.1km. So 85km → ~0.9° east
const oE = computeOffset({ lat: 32.0, lng: 35.0 }, 90, 85);
approx(oE.lat, 32.0, 0.1, 'east → lat nearly unchanged');
eq(oE.lng > 35.5, true, 'east → lng increased');

// ── distanceKm ──────────────────────────────────────────────────────

console.log('\nDistance — Tel Aviv to Haifa ≈ 80-90km:');
const dTAH = _distanceKm({ lat: 32.08, lng: 34.78 }, { lat: 32.82, lng: 34.98 });
approx(dTAH, 84, 10, 'TA-Haifa ≈ 84km');

console.log('\nDistance — same point → 0:');
approx(_distanceKm({ lat: 32.0, lng: 35.0 }, { lat: 32.0, lng: 35.0 }), 0, 0.001, 'same point → 0km');

// ── Module shape ─────────────────────────────────────────────────────

console.log('\nModule shape:');
eq(typeof win.PredictionLine.computeCentroid, 'function', 'computeCentroid is function');
eq(typeof win.PredictionLine.computeDirection, 'function', 'computeDirection is function');
eq(typeof win.PredictionLine.computePredictionLine, 'function', 'computePredictionLine is function');
eq(typeof win.PredictionLine.computeOffset, 'function', 'computeOffset is function');

// ── Summary ──────────────────────────────────────────────────────────

console.log('\n' + (pass + fail) + ' tests: ' + pass + ' passed, ' + fail + ' failed');
if (fail > 0) process.exit(1);
console.log('\n' + pass + '/' + pass + ' tests passed');
