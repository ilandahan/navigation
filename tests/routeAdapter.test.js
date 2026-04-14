// Offline tests for routeAdapter.js.
// Run with: node tests/routeAdapter.test.js
//
// The adapter is pure — tests inject plain-JS stubs for routePointToLatLng
// and boundsFromPath so no google.maps mock is needed.

'use strict';

const path = require('path');
const fs = require('fs');

// Load routeAdapter.js into a fresh sandbox. Mirrors filter.test.js's
// loadInto pattern: the module's IIFE checks `typeof window !== 'undefined'`,
// so we must pass `window` as a function param for the check to pass.
const win = {};
function loadInto(win, file) {
  const src = fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
  new Function('window', 'global', src)(win, win);
}
loadInto(win, 'routeAdapter.js');
const { adaptRoute } = win.RouteAdapter;

// ---- stubs ----
const ptToLL = (p) => p ? { _lat: p.latitude, _lng: p.longitude } : null;
const bounds = (pts) => ({ _count: pts.length });

// ---- harness ----
let passed = 0, failed = 0;
function eq(actual, expected, name) {
  const aJ = JSON.stringify(actual), eJ = JSON.stringify(expected);
  if (aJ === eJ) { console.log('  PASS:', name); passed++; }
  else { console.log('  FAIL:', name, '\n    expected:', eJ, '\n    actual:', aJ); failed++; }
}
function truthy(actual, name) {
  if (actual) { console.log('  PASS:', name); passed++; }
  else { console.log('  FAIL:', name, '(got falsy)'); failed++; }
}
function throws(fn, matcher, name) {
  try { fn(); console.log('  FAIL:', name, '(expected throw, got return)'); failed++; }
  catch (e) {
    if (matcher instanceof RegExp ? matcher.test(e.message) : e.message.includes(matcher)) {
      console.log('  PASS:', name); passed++;
    } else {
      console.log('  FAIL:', name, '\n    expected message to match:', matcher, '\n    got:', e.message);
      failed++;
    }
  }
}

// ---- fixtures ----
function validRoute() {
  return {
    description: 'Main St',
    path: [
      { latitude: 32.0, longitude: 34.8 },
      { latitude: 32.1, longitude: 34.9 }
    ],
    legs: [{
      distanceMeters: 10000,
      durationMillis: 600000,
      steps: [
        { distanceMeters: 5000, path: [{ latitude: 32.0, longitude: 34.8 }], instructions: 'Head north' },
        { distanceMeters: 5000, path: [{ latitude: 32.1, longitude: 34.9 }], instructions: 'Arrive' }
      ]
    }]
  };
}

// ---- tests ----
console.log('\nhelper-arg validation:');
throws(() => adaptRoute(validRoute(), null, bounds), 'routePointToLatLng', 'missing routePointToLatLng throws');
throws(() => adaptRoute(validRoute(), ptToLL, null), 'boundsFromPath', 'missing boundsFromPath throws');
throws(() => adaptRoute(validRoute(), 'not-a-fn', bounds), 'routePointToLatLng', 'non-function routePointToLatLng throws');

console.log('\nroute-shape validation:');
throws(() => adaptRoute(null, ptToLL, bounds), 'null/undefined route', 'null route throws');
throws(() => adaptRoute(undefined, ptToLL, bounds), 'null/undefined route', 'undefined route throws');
throws(() => adaptRoute({ path: [] }, ptToLL, bounds), 'empty overview_path', 'empty path throws');
throws(() => adaptRoute({ path: null }, ptToLL, bounds), 'empty overview_path', 'null path throws');

console.log('\nleg validation:');
const badLeg = validRoute(); badLeg.legs[0].distanceMeters = NaN;
throws(() => adaptRoute(badLeg, ptToLL, bounds), 'leg 0 has invalid distanceMeters: NaN', 'NaN leg distance throws');

const negLeg = validRoute(); negLeg.legs[0].distanceMeters = -1;
throws(() => adaptRoute(negLeg, ptToLL, bounds), 'leg 0 has invalid distanceMeters: -1', 'negative leg distance throws');

const undefDistLeg = validRoute(); delete undefDistLeg.legs[0].distanceMeters;
throws(() => adaptRoute(undefDistLeg, ptToLL, bounds), 'invalid distanceMeters: undefined', 'undefined leg distance throws');

const infDur = validRoute(); infDur.legs[0].durationMillis = Infinity;
throws(() => adaptRoute(infDur, ptToLL, bounds), 'invalid durationMillis: Infinity', 'Infinity duration throws');

const nullLeg = validRoute(); nullLeg.legs[0] = null;
throws(() => adaptRoute(nullLeg, ptToLL, bounds), 'leg 0 is not an object', 'null leg throws');

console.log('\nstep validation:');
const badStep = validRoute(); badStep.legs[0].steps[1].distanceMeters = NaN;
throws(() => adaptRoute(badStep, ptToLL, bounds), 'leg 0 step 1 has invalid distanceMeters: NaN', 'NaN step distance reports leg+step index');

const negStep = validRoute(); negStep.legs[0].steps[0].distanceMeters = -5;
throws(() => adaptRoute(negStep, ptToLL, bounds), 'leg 0 step 0 has invalid distanceMeters: -5', 'negative step distance throws');

const nullStep = validRoute(); nullStep.legs[0].steps[0] = null;
throws(() => adaptRoute(nullStep, ptToLL, bounds), 'leg 0 step 0 is not an object', 'null step throws');

console.log('\nzero-total route:');
const zeroTotal = {
  path: [{ latitude: 32, longitude: 34 }],
  legs: [{ distanceMeters: 0, durationMillis: 0, steps: [{ distanceMeters: 0, path: [], instructions: '' }] }]
};
throws(() => adaptRoute(zeroTotal, ptToLL, bounds), 'zero-distance route', 'total=0 throws even when each leg is "valid"');

console.log('\nhappy path:');
const out = adaptRoute(validRoute(), ptToLL, bounds);
eq(out.summary, 'Main St', 'summary passthrough');
eq(out.overview_path.length, 2, 'overview_path mapped');
eq(out.bounds, { _count: 2 }, 'bounds called with path');
eq(out.legs.length, 1, 'one leg');
eq(out.legs[0].distance.value, 10000, 'leg distance preserved');
eq(out.legs[0].duration.value, 600, 'leg duration ms → sec (600000 / 1000)');
eq(out.legs[0].steps.length, 2, 'two steps');
eq(out.legs[0].steps[0].distance.value, 5000, 'step distance preserved');
eq(out.legs[0].steps[0].instructions, 'Head north', 'step instructions preserved');

console.log('\nmissing description defaults to empty string:');
const noDesc = validRoute(); delete noDesc.description;
const out2 = adaptRoute(noDesc, ptToLL, bounds);
eq(out2.summary, '', 'missing description -> ""');

console.log('\nnull-filter on path entries:');
const withNull = validRoute();
withNull.path = [{ latitude: 32, longitude: 34 }, null, { latitude: 32.1, longitude: 34.1 }];
const out3 = adaptRoute(withNull, ptToLL, bounds);
eq(out3.overview_path.length, 2, 'null entries filtered from overview_path');

console.log('\n' + passed + '/' + (passed + failed) + ' tests passed');
if (failed > 0) process.exit(1);
