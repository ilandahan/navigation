// Offline regression tests for myLocation.js — pure helpers behind the
// "📍 Use my location" shortcut wired in useMyLocationAsFrom() in index.html.
// Run with: node tests/myLocation.test.js

const fs = require('fs');
const path = require('path');

const win = {};
function loadInto(win, file) {
  const src = fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
  new Function('window', 'global', src)(win, win);
}
loadInto(win, 'myLocation.js');

let pass = 0, fail = 0;
function eq(actual, expected, name) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) { pass++; console.log(`  PASS: ${name}`); }
  else { fail++; console.log(`  FAIL: ${name}\n    got:  ${a}\n    want: ${e}`); }
}
function throws(fn, namePart, name) {
  try {
    fn();
    fail++; console.log(`  FAIL: ${name}\n    expected throw containing: ${namePart}, got: no throw`);
  } catch (e) {
    if (!namePart || (e.message || '').includes(namePart)) {
      pass++; console.log(`  PASS: ${name}`);
    } else {
      fail++; console.log(`  FAIL: ${name}\n    expected throw containing: ${namePart}\n    got message: ${e.message}`);
    }
  }
}

const { MY_LOCATION_LABEL, buildMyLocationOrigin, formatMyLocationToast, describeGeolocationError } = win.MyLocation;

console.log('\nMyLocation — module export shape:');
eq(typeof win.MyLocation, 'object',  'window.MyLocation is an object');
eq(typeof buildMyLocationOrigin,    'function', 'buildMyLocationOrigin is a function');
eq(typeof formatMyLocationToast,    'function', 'formatMyLocationToast is a function');
eq(typeof describeGeolocationError, 'function', 'describeGeolocationError is a function');
eq(MY_LOCATION_LABEL, '📍 My Location', 'MY_LOCATION_LABEL constant is "📍 My Location"');

console.log('\nbuildMyLocationOrigin — happy path:');
eq(
  buildMyLocationOrigin({ latitude: 32.0853, longitude: 34.7818, accuracy: 12 }),
  { lat: 32.0853, lng: 34.7818, name: '📍 My Location' },
  'Tel Aviv coords → { lat, lng, name }'
);
eq(
  buildMyLocationOrigin({ latitude: -33.8688, longitude: 151.2093 }),
  { lat: -33.8688, lng: 151.2093, name: '📍 My Location' },
  'Negative lat (Sydney) preserved exactly'
);
eq(
  buildMyLocationOrigin({ latitude: 0, longitude: 0 }),
  { lat: 0, lng: 0, name: '📍 My Location' },
  'Null Island (0,0) is valid — both must pass the isFinite check'
);
eq(
  buildMyLocationOrigin({ latitude: 31.9642, longitude: 34.8048, accuracy: 5, heading: 90, speed: 22 }),
  { lat: 31.9642, lng: 34.8048, name: '📍 My Location' },
  'Extra GeolocationCoordinates fields are ignored (not copied through)'
);

console.log('\nbuildMyLocationOrigin — error paths:');
throws(() => buildMyLocationOrigin(null),       'coords object required',  'null coords throws');
throws(() => buildMyLocationOrigin(undefined),  'coords object required',  'undefined coords throws');
throws(() => buildMyLocationOrigin('32.0,34.7'), 'coords object required', 'string coords throws');
throws(() => buildMyLocationOrigin({}),                                    'latitude must be a finite number', 'empty object throws on missing lat');
throws(() => buildMyLocationOrigin({ longitude: 34.7 }),                   'latitude must be a finite number', 'missing latitude throws');
throws(() => buildMyLocationOrigin({ latitude: 32.0 }),                    'longitude must be a finite number', 'missing longitude throws');
throws(() => buildMyLocationOrigin({ latitude: NaN, longitude: 34.7 }),    'latitude must be a finite number', 'NaN latitude throws');
throws(() => buildMyLocationOrigin({ latitude: 32.0, longitude: NaN }),    'longitude must be a finite number', 'NaN longitude throws');
throws(() => buildMyLocationOrigin({ latitude: Infinity, longitude: 34 }), 'latitude must be a finite number', 'Infinity latitude throws');
throws(() => buildMyLocationOrigin({ latitude: 32, longitude: -Infinity }), 'longitude must be a finite number', '-Infinity longitude throws');
throws(() => buildMyLocationOrigin({ latitude: '32', longitude: 34 }),     'latitude must be a finite number', 'string latitude throws (no silent coercion)');
throws(() => buildMyLocationOrigin({ latitude: 32, longitude: null }),     'longitude must be a finite number', 'null longitude throws');

console.log('\nformatMyLocationToast — rounding & format:');
eq(formatMyLocationToast(0),       'Using your location (±0m)',    'accuracy 0 → 0m');
eq(formatMyLocationToast(5),       'Using your location (±5m)',    'accuracy 5 → 5m');
eq(formatMyLocationToast(12.4),    'Using your location (±12m)',   '12.4 rounds DOWN to 12');
eq(formatMyLocationToast(12.5),    'Using your location (±13m)',   '12.5 rounds UP to 13 (Math.round)');
eq(formatMyLocationToast(12.6),    'Using your location (±13m)',   '12.6 rounds UP to 13');
eq(formatMyLocationToast(999.7),   'Using your location (±1000m)', 'large value rounds correctly');

console.log('\nformatMyLocationToast — fallback for non-numeric accuracy:');
eq(formatMyLocationToast(null),      'Using your location (±?m)', 'null accuracy → ±?m');
eq(formatMyLocationToast(undefined), 'Using your location (±?m)', 'undefined accuracy → ±?m');
eq(formatMyLocationToast(NaN),       'Using your location (±?m)', 'NaN accuracy → ±?m (NaN is not finite)');
eq(formatMyLocationToast(Infinity),  'Using your location (±?m)', 'Infinity accuracy → ±?m (not finite)');
eq(formatMyLocationToast('5'),       'Using your location (±?m)', 'string accuracy → ±?m (no coercion)');
eq(formatMyLocationToast({}),        'Using your location (±?m)', 'object accuracy → ±?m');

console.log('\ndescribeGeolocationError — happy path:');
eq(
  describeGeolocationError({ code: 1, message: 'User denied Geolocation' }),
  'Could not get your location: User denied Geolocation',
  'PERMISSION_DENIED message preserved'
);
eq(
  describeGeolocationError({ code: 2, message: 'Position unavailable' }),
  'Could not get your location: Position unavailable',
  'POSITION_UNAVAILABLE message preserved'
);
eq(
  describeGeolocationError({ code: 3, message: 'Timeout expired' }),
  'Could not get your location: Timeout expired',
  'TIMEOUT message preserved'
);

console.log('\ndescribeGeolocationError — fallback for missing message:');
eq(describeGeolocationError(null),               'Could not get your location: unknown error', 'null err → unknown error');
eq(describeGeolocationError(undefined),          'Could not get your location: unknown error', 'undefined err → unknown error');
eq(describeGeolocationError({}),                 'Could not get your location: unknown error', 'empty err → unknown error');
eq(describeGeolocationError({ code: 1 }),        'Could not get your location: unknown error', 'err with code but no message → unknown error');
eq(describeGeolocationError({ message: '' }),    'Could not get your location: unknown error', 'empty message → unknown error');
eq(describeGeolocationError({ message: null }),  'Could not get your location: unknown error', 'null message → unknown error');

console.log(`\n${pass}/${pass + fail} tests passed`);
if (fail > 0) process.exit(1);
