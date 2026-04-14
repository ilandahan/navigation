// Offline regression tests for alertRouteFilter.js and shelterTimeConstants.js.
// Run with: node tests/filter.test.js
//
// Google Maps geometry is mocked with a minimal haversine + ray-casting
// point-in-polygon so the filter's logic can be exercised without a browser.
// The authoritative test is still test-route-filter.html which uses the real
// Google Maps Directions + Geometry libraries; these tests validate the
// pure-logic layer.

'use strict';

const fs = require('fs');
const path = require('path');

// ---- minimal Google Maps geometry mock ----
function haversine(a, b) {
  const toRad = d => d * Math.PI / 180;
  const R = 6371000;
  const lat1 = typeof a.lat === 'function' ? a.lat() : a.lat;
  const lat2 = typeof b.lat === 'function' ? b.lat() : b.lat;
  const lng1 = typeof a.lng === 'function' ? a.lng() : a.lng;
  const lng2 = typeof b.lng === 'function' ? b.lng() : b.lng;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const la1 = toRad(lat1), la2 = toRad(lat2);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

function pointInPolygon(p, ring) {
  const lng = typeof p.lng === 'function' ? p.lng() : p.lng;
  const lat = typeof p.lat === 'function' ? p.lat() : p.lat;
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i].lng, yi = ring[i].lat;
    const xj = ring[j].lng, yj = ring[j].lat;
    // Horizontal edge (yi === yj) can't cross the horizontal test ray;
    // the outer `(yi > lat) !== (yj > lat)` check already excludes it,
    // so the division below is safe without a zero-fallback.
    const intersect = ((yi > lat) !== (yj > lat)) &&
      (lng < (xj - xi) * (lat - yi) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

const g = {
  maps: {
    geometry: {
      spherical: { computeDistanceBetween: haversine },
      poly: { containsLocation: (p, poly) => pointInPolygon(p, poly._ring) }
    },
    Polygon: class {
      constructor(opts) { this._ring = (opts && opts.paths) || []; }
      getPath() {
        const r = this._ring;
        return { getArray: () => r.map(ll => ({ lat: () => ll.lat, lng: () => ll.lng })) };
      }
    }
  }
};
const win = { google: g };

function loadInto(win, file) {
  const src = fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
  new Function('window', 'global', src)(win, win);
}

loadInto(win, 'shelterTimeConstants.js');
loadInto(win, 'alertRouteFilter.js');

// ---- test runner ----
let pass = 0, fail = 0;
function eq(actual, expected, name) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) { pass++; console.log(`  PASS: ${name}`); }
  else { fail++; console.log(`  FAIL: ${name}\n    got:  ${a}\n    want: ${e}`); }
}

// ====== Shelter time constants ======
console.log('\nshelterTimeConstants:');
const st = win.ShelterTime;
eq(st.shelterSecondsFor('תל אביב - מזרח'),    90,  'central: Tel Aviv = 90s');
eq(st.shelterSecondsFor('שדרות'),              15,  'gaza envelope: Sderot = 15s');
eq(st.shelterSecondsFor('אופקים'),            15,  'gaza envelope: Ofakim = 15s');
eq(st.shelterSecondsFor('אשקלון'),            45,  'south coast: Ashkelon = 45s');
eq(st.shelterSecondsFor('קריית גת'),          45,  'south: Kiryat Gat = 45s (order hazard vs Haifa-bay קריית)');
eq(st.shelterSecondsFor('חיפה - מערב'),       60,  'north coast: Haifa = 60s');
eq(st.shelterSecondsFor('קריית שמונה'),       30,  'north border: Kiryat Shmona = 30s (order hazard)');
eq(st.shelterSecondsFor('קריית אתא'),         60,  'Haifa-bay: Kiryat Ata = 60s (via קריית after north rule)');
eq(st.shelterSecondsFor('ירושלים'),           90,  'Jerusalem = 90s');
eq(st.shelterSecondsFor('באר שבע'),           60,  'far south: Beer Sheva = 60s');
// SAFETY: unknown cities return null so callers surface the data gap
// rather than silently shipping a 60s default (which would mis-classify
// e.g. a 15s Gaza-envelope alert as in_time).
eq(st.shelterSecondsFor('Unknown city'),       null, 'unknown city returns null (surface data gap)');
eq(st.shelterSecondsFor(''),                   null, 'empty string returns null');
eq(st.shelterSecondsFor(null),                 null, 'null input returns null');

// ====== Route filter scenarios ======
console.log('\nalertRouteFilter scenarios:');
// Straight east-west route at lat 32.0 from lng 34.8 to 35.1 (~28 km, 300 points)
const routePath = [];
for (let i = 0; i < 300; i++) {
  routePath.push({ lat: 32.0, lng: 34.8 + (i / 300) * 0.3 });
}
const route = win.AlertRouteFilter.buildRouteWithCumulative(routePath);

// Polygons placed relative to the route
const polyOnClose = { latLngs: [
  { lat: 31.995, lng: 34.895 }, { lat: 32.005, lng: 34.895 },
  { lat: 32.005, lng: 34.905 }, { lat: 31.995, lng: 34.905 }
] };
const polyOnFar = { latLngs: [
  { lat: 31.995, lng: 34.94 }, { lat: 32.005, lng: 34.94 },
  { lat: 32.005, lng: 34.96 }, { lat: 31.995, lng: 34.96 }
] };
const polyOff = { latLngs: [ // 10 km north
  { lat: 32.10, lng: 34.94 }, { lat: 32.11, lng: 34.94 },
  { lat: 32.11, lng: 34.96 }, { lat: 32.10, lng: 34.96 }
] };
const polyBehind = { latLngs: [
  { lat: 31.995, lng: 34.81 }, { lat: 32.005, lng: 34.81 },
  { lat: 32.005, lng: 34.82 }, { lat: 31.995, lng: 34.82 }
] };
const polyBuffer = { latLngs: [ // ~2 km north, ahead of driver
  { lat: 32.020, lng: 34.90 }, { lat: 32.022, lng: 34.90 },
  { lat: 32.022, lng: 34.91 }, { lat: 32.020, lng: 34.91 }
] };
const polygonIndex = {
  OnClose: polyOnClose, OnFar: polyOnFar, Off: polyOff,
  Behind: polyBehind, Buffer: polyBuffer
};

function reasons(params) {
  return win.AlertRouteFilter.filterAlertForRoute(params).verdicts.map(v => v.reason);
}

// Driver at 30% of route (index 90 → ~8.5 km along the route, lng ≈ 34.89)
const driverMid = { position: routePath[90], speedMps: 27.78 };

eq(reasons({
  alert: { cities: ['OnClose'] }, polygonIndex, route, driver: driverMid,
  bufferMeters: 3000, shelterSecondsFor: () => 90
}), ['on_route'], 'on_route: polygon ~1 km ahead, reachable in 90s');

eq(reasons({
  alert: { cities: ['OnFar'] }, polygonIndex, route, driver: driverMid,
  bufferMeters: 3000, shelterSecondsFor: () => 90
}), ['too_late'], 'too_late: on-route polygon 5 km ahead, shelter 90s');

eq(reasons({
  alert: { cities: ['Off'] }, polygonIndex, route, driver: driverMid,
  bufferMeters: 3000, shelterSecondsFor: () => 90
}), ['off_route'], 'off_route: polygon 10 km north');

eq(reasons({
  alert: { cities: ['Behind'] }, polygonIndex, route, driver: driverMid,
  bufferMeters: 3000, shelterSecondsFor: () => 90
}), ['behind_driver'], 'behind_driver: polygon near route start');

eq(reasons({
  alert: { cities: ['Buffer'] }, polygonIndex, route, driver: driverMid,
  bufferMeters: 3000, shelterSecondsFor: () => 90
}), ['in_buffer'], 'in_buffer: 2 km off route but within 3 km buffer');

eq(reasons({
  alert: { cities: ['OnClose', 'Off', 'Behind', 'Buffer', 'OnFar'] },
  polygonIndex, route, driver: driverMid,
  bufferMeters: 3000, shelterSecondsFor: () => 90
}), ['on_route', 'off_route', 'behind_driver', 'in_buffer', 'too_late'],
   'mixed: all five classifications returned in input order');

eq(reasons({
  alert: { cities: ['NotInPolygonIndex'] },
  polygonIndex, route, driver: driverMid,
  bufferMeters: 3000, shelterSecondsFor: () => 90
}), ['unknown_city'], 'unknown city: surfaces as unknown_city (not silently hidden)');

eq(reasons({
  alert: { cities: [] }, polygonIndex, route, driver: driverMid,
  bufferMeters: 3000, shelterSecondsFor: () => 90
}), [], 'empty cities list: no verdicts');

// Driver at start of route: a polygon at the start should be on_route, not behind_driver
const driverStart = { position: routePath[0], speedMps: 27.78 };
eq(reasons({
  alert: { cities: ['Behind'] }, polygonIndex, route, driver: driverStart,
  bufferMeters: 3000, shelterSecondsFor: () => 90
}), ['on_route'], 'polygon at start with driver at start: on_route');

// No route: should fall back to "all relevant"
eq(reasons({
  alert: { cities: ['Off'] }, polygonIndex, route: null, driver: driverMid,
  bufferMeters: 3000, shelterSecondsFor: () => 90
}), [], 'no route: returns empty verdicts but relevant=true');
// (The filter returns relevant:true with empty verdicts when route is null;
//  reasons() only returns verdicts so is empty here.)

// too_late when shelter time is tiny (1 second) — any ETA > 11s classifies too_late
eq(reasons({
  alert: { cities: ['OnClose'] }, polygonIndex, route, driver: driverMid,
  bufferMeters: 3000, shelterSecondsFor: () => 1
}), ['too_late'], 'too_late: on-route polygon with 1-second shelter time');

// ---- Edge-case input tests ----
console.log('\nedge cases:');
const emptyRoute = win.AlertRouteFilter.buildRouteWithCumulative([]);
eq(emptyRoute, { path: [], cumulativeMeters: [] }, 'buildRouteWithCumulative([]) returns empty meta');
const nullRoute = win.AlertRouteFilter.buildRouteWithCumulative(null);
eq(nullRoute, { path: [], cumulativeMeters: [] }, 'buildRouteWithCumulative(null) returns empty meta');
const singlePoint = win.AlertRouteFilter.buildRouteWithCumulative([{ lat: 32, lng: 35 }]);
eq(singlePoint.cumulativeMeters, [0], 'buildRouteWithCumulative(single point) -> [0]');

// findDriverIndex with empty path returns 0
eq(win.AlertRouteFilter.findDriverIndex([], { lat: 32, lng: 35 }), 0, 'findDriverIndex(empty path) -> 0');

// Direct helper assertions
eq(win.AlertRouteFilter.findFirstIndexInsidePoly(routePath, 0, polyOff), -1, 'findFirstIndexInsidePoly on off-route returns -1');
eq(win.AlertRouteFilter.findFirstIndexWithinBuffer(routePath, 0, polyOff, 3000), -1, 'findFirstIndexWithinBuffer for far-off polygon returns -1');

// alert missing / empty
function fullResult(alert, extra) {
  const p = Object.assign({
    alert, polygonIndex, route, driver: driverMid,
    bufferMeters: 3000, shelterSecondsFor: () => 90
  }, extra || {});
  return win.AlertRouteFilter.filterAlertForRoute(p);
}
eq(fullResult(null).relevant, false, 'null alert -> not relevant');

// Unknown city now produces `unknown_city` verdict, not `off_route`.
// Because `unknown_city` is still excluded from relevantCities, the alert
// as a whole is still not-relevant — but the verdict carries the data
// gap so the caller can surface it.
const unknownFull = fullResult({ cities: ['NotInPolygonIndex'] });
eq(unknownFull.reasonByCity, { NotInPolygonIndex: 'unknown_city' }, 'unknown city reasonByCity');
eq(unknownFull.relevantCities, [], 'unknown city not counted as relevant');
eq(unknownFull.relevant, false, 'alert with only unknown cities: not relevant');
eq(fullResult({ type: 'x' }).relevant, false, 'alert without cities -> not relevant');
eq(fullResult({ cities: [] }).relevant, false, 'empty cities -> not relevant');

// speedMps = 0: driver is stationary. The pessimistic clamp causes
// ETA-to-polygon-ahead to be large, so an on-route polygon with a 90s
// shelter flips to too_late — conservative, but the alert still SHOWS
// (too_late is not excluded). The verdict records speedAssumption so
// the caller can banner the uncertainty.
const zeroSpeedVerdict = fullResult({ cities: ['OnClose'] }, { driver: { position: routePath[90], speedMps: 0 } });
eq(zeroSpeedVerdict.relevantCities, ['OnClose'], 'speed 0 -> stationary clamp, OnClose still classified (too_late)');
eq(zeroSpeedVerdict.verdicts[0].reason, 'too_late', 'speed 0 -> pessimistic ETA flips to too_late');
eq(zeroSpeedVerdict.verdicts[0].speedAssumption, 'stationary', 'speed 0 -> speedAssumption=stationary');

// Omitting shelterSecondsFor -> must THROW (contract, no silent default)
let shelterThrew = false;
try {
  fullResult({ cities: ['OnClose'] }, { shelterSecondsFor: null });
} catch (e) {
  shelterThrew = /shelterSecondsFor/.test(e.message);
}
eq(shelterThrew, true, 'missing shelterSecondsFor -> throws (no silent 60s default)');

// Omitting driver or driver.speedMps -> must THROW (contract, no silent 27.8)
let driverThrew = false;
try {
  fullResult({ cities: ['OnClose'] }, { driver: { position: routePath[90] } });
} catch (e) {
  driverThrew = /driver\.speedMps/.test(e.message);
}
eq(driverThrew, true, 'missing driver.speedMps -> throws (no silent 100 km/h default)');

// Shelter time unknown for a known-polygon city -> verdict flags it rather
// than silently using 60s (which would mis-classify a 15s region as in_time).
const unknownShelterVerdict = fullResult(
  { cities: ['OnClose'] },
  { shelterSecondsFor: () => null }
);
eq(unknownShelterVerdict.verdicts[0].shelterTimeUnknown, true,
   'shelterSecondsFor returns null -> verdict.shelterTimeUnknown=true');
eq(unknownShelterVerdict.verdicts[0].realSirenInSeconds, null,
   'shelterSecondsFor returns null -> realSirenInSeconds=null');
eq(unknownShelterVerdict.verdicts[0].reason, 'on_route',
   'shelterSecondsFor null + close polygon -> stays on_route (alert still shown)');

// Driver off-route (more than 500m from any route point) -> new verdict
// reason `driver_off_route`, all alerts shown.
const offRouteDriver = { position: { lat: 32.5, lng: 35.5 }, speedMps: 27.78 };
const offRouteResult = win.AlertRouteFilter.filterAlertForRoute({
  alert: { cities: ['OnClose', 'Off'] }, polygonIndex, route, driver: offRouteDriver,
  bufferMeters: 3000, shelterSecondsFor: () => 90
});
eq(offRouteResult.verdicts.map(v => v.reason), ['driver_off_route', 'driver_off_route'],
   'driver off-route (>500m snap) -> driver_off_route for all cities');
eq(offRouteResult.relevant, true, 'driver off-route -> relevant=true (show alerts)');

// findDriverIndex directly: -1 when off-route
eq(win.AlertRouteFilter.findDriverIndex(routePath, { lat: 32.5, lng: 35.5 }), -1,
   'findDriverIndex returns -1 when snap > 500m');

// No-route fallback: filter returns relevant=true with all cities marked on_route
const noRouteResult = win.AlertRouteFilter.filterAlertForRoute({
  alert: { cities: ['Off'] }, polygonIndex, route: null, driver: driverMid,
  bufferMeters: 3000, shelterSecondsFor: () => 90
});
eq(noRouteResult.relevant, true, 'no route: relevant=true (show everything)');
eq(noRouteResult.reasonByCity, { Off: 'on_route' }, 'no route: cities marked on_route');
eq(noRouteResult.relevantCities, ['Off'], 'no route: relevantCities includes input cities');

// ====== Report ======
const total = pass + fail;
console.log(`\n${pass}/${total} tests passed`);
if (fail > 0) { process.exit(1); }
