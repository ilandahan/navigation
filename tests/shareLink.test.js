// Offline tests for mapsShareLink.js. Run: node tests/shareLink.test.js

'use strict';

const fs = require('fs');
const path = require('path');

// Load module into a synthetic global
const win = {};
const src = fs.readFileSync(path.join(__dirname, '..', 'mapsShareLink.js'), 'utf8');
new Function('window', 'global', src)(win, win);
const M = win.MapsShareLink;

let pass = 0, fail = 0;
function eq(actual, expected, name) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) { pass++; console.log(`  PASS: ${name}`); }
  else { fail++; console.log(`  FAIL: ${name}\n    got:  ${a}\n    want: ${e}`); }
}
function truthy(actual, name) {
  if (actual) { pass++; console.log(`  PASS: ${name}`); }
  else { fail++; console.log(`  FAIL: ${name} (expected truthy, got ${JSON.stringify(actual)})`); }
}
function contains(haystack, needle, name) {
  if (typeof haystack === 'string' && haystack.indexOf(needle) !== -1) {
    pass++; console.log(`  PASS: ${name}`);
  } else {
    fail++; console.log(`  FAIL: ${name} — '${haystack}' does not contain '${needle}'`);
  }
}

// ====== formatLocation ======
console.log('\nformatLocation:');
eq(M.formatLocation({ lat: 32.0853, lng: 34.7818 }), '32.085300,34.781800', 'lat/lng rounded to 6dp');
eq(M.formatLocation('Tel Aviv'), 'Tel%20Aviv', 'plain string is URL-encoded');
eq(M.formatLocation('   Haifa   '), 'Haifa', 'string is trimmed');
eq(M.formatLocation('שדרות, Israel'), encodeURIComponent('שדרות, Israel'), 'Hebrew name encoded');
eq(M.formatLocation(null), '', 'null returns empty');
eq(M.formatLocation(undefined), '', 'undefined returns empty');
eq(M.formatLocation({ notAPoint: true }), '', 'invalid shape returns empty');
eq(M.formatLocation({ lat: () => 32.0, lng: () => 35.0 }), '32.000000,35.000000', 'LatLng-style callable');

// ====== buildDirectionsUrl — basic ======
console.log('\nbuildDirectionsUrl basic:');
const urlDrive = M.buildDirectionsUrl({
  origin: { lat: 32.0853, lng: 34.7818 },
  destination: { lat: 32.8093, lng: 35.1134 },
  travelMode: 'driving'
});
truthy(urlDrive && urlDrive.startsWith('https://www.google.com/maps/dir/?api=1'), 'url has maps directions prefix');
contains(urlDrive, 'origin=32.085300,34.781800', 'origin encoded');
contains(urlDrive, 'destination=32.809300,35.113400', 'destination encoded');
contains(urlDrive, 'travelmode=driving', 'travelmode=driving');

// ====== All 4 travel modes ======
console.log('\ntravel modes:');
['driving', 'transit', 'walking', 'bicycling'].forEach(mode => {
  const u = M.buildDirectionsUrl({
    origin: 'Tel Aviv', destination: 'Haifa', travelMode: mode
  });
  contains(u, 'travelmode=' + mode, mode + ' mode in url');
});
// two_wheeler is exposed in TRAVEL_MODE_TO_GMAPS — verify it round-trips as 'two-wheeler'
const tw = M.buildDirectionsUrl({
  origin: 'Tel Aviv', destination: 'Haifa', travelMode: 'two_wheeler'
});
contains(tw, 'travelmode=two-wheeler', 'two_wheeler mode maps to two-wheeler');
eq(M.defaultSpeedMps('two_wheeler'), 15.0, 'two_wheeler default speed = 15 m/s');

// Unknown mode defaults to driving
const unknown = M.buildDirectionsUrl({
  origin: 'Tel Aviv', destination: 'Haifa', travelMode: 'hovercraft'
});
contains(unknown, 'travelmode=driving', 'unknown mode defaults to driving');

// ====== Waypoints ======
console.log('\nwaypoints:');
const wpUrl = M.buildDirectionsUrl({
  origin: { lat: 32.0, lng: 34.8 },
  destination: { lat: 32.8, lng: 35.0 },
  travelMode: 'driving',
  waypoints: [
    { lat: 32.3, lng: 34.85 },
    { lat: 32.5, lng: 34.9 }
  ]
});
contains(wpUrl, 'waypoints=32.300000,34.850000|32.500000,34.900000', 'waypoints pipe-joined');

// String + coord waypoints mix
const wpMixed = M.buildDirectionsUrl({
  origin: 'Tel Aviv', destination: 'Haifa', travelMode: 'driving',
  waypoints: ['Netanya', { lat: 32.5, lng: 34.9 }]
});
contains(wpMixed, 'waypoints=Netanya|32.500000,34.900000', 'mixed string+coord waypoints');

// Empty waypoints array is omitted from URL
const noWp = M.buildDirectionsUrl({
  origin: 'Tel Aviv', destination: 'Haifa', travelMode: 'driving', waypoints: []
});
eq(noWp.indexOf('waypoints='), -1, 'empty waypoints array: no waypoints param');

// ====== Missing inputs ======
console.log('\nguards:');
eq(M.buildDirectionsUrl({}), null, 'empty params -> null');
eq(M.buildDirectionsUrl(null), null, 'null params -> null');
eq(M.buildDirectionsUrl({ origin: 'A' }), null, 'missing destination -> null');
eq(M.buildDirectionsUrl({ destination: 'B' }), null, 'missing origin -> null');
eq(M.buildDirectionsUrl({ origin: null, destination: 'B' }), null, 'null origin -> null');

// ====== defaultSpeedMps ======
console.log('\ndefaultSpeedMps:');
eq(M.defaultSpeedMps('driving'),   27.78, 'driving = 27.78 m/s');
eq(M.defaultSpeedMps('transit'),   15.0,  'transit = 15 m/s');
eq(M.defaultSpeedMps('walking'),   1.4,   'walking = 1.4 m/s');
eq(M.defaultSpeedMps('bicycling'), 4.2,   'bicycling = 4.2 m/s');
eq(M.defaultSpeedMps('unknown'),   27.78, 'unknown defaults to driving');
eq(M.defaultSpeedMps(null),        27.78, 'null defaults to driving');

// ====== buildSmsUrl / buildMailtoUrl ======
console.log('\nSMS / mailto:');
eq(M.buildSmsUrl('Directions: https://x'), 'sms:?&body=' + encodeURIComponent('Directions: https://x'), 'sms url encodes body');
eq(M.buildSmsUrl(''),  'sms:?&body=', 'empty sms body');
eq(M.buildSmsUrl(null),'sms:?&body=', 'null sms body');
const mail = M.buildMailtoUrl('Subject Line', 'Body with url https://x');
contains(mail, 'mailto:?subject=Subject%20Line', 'mailto subject encoded');
contains(mail, 'body=Body%20with%20url%20https%3A%2F%2Fx', 'mailto body encoded');
eq(M.buildMailtoUrl(null, null), 'mailto:?subject=&body=', 'mailto null subject + null body');
eq(M.buildMailtoUrl('', ''),     'mailto:?subject=&body=', 'mailto empty subject + empty body');
eq(M.buildMailtoUrl(undefined, undefined), 'mailto:?subject=&body=', 'mailto undefined args');

// ====== XSS / injection safety ======
console.log('\nescaping:');
const xss = M.buildDirectionsUrl({
  origin: '<script>alert(1)</script>',
  destination: 'Haifa',
  travelMode: 'driving'
});
contains(xss, '%3Cscript%3E', 'origin with <script> is URL-encoded');
eq(xss.indexOf('<script>'), -1, 'raw <script> not in URL');

// ====== Report ======
console.log(`\n${pass}/${pass + fail} tests passed`);
if (fail > 0) process.exit(1);
