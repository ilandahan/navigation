// Route-vs-alert filter. No DOM, no app globals. Depends on google.maps
// (geometry + Polygon). Input/output are plain objects so the simulation
// test harness can drive this directly. Note: for performance the filter
// caches a throwaway google.maps.Polygon instance on each input polygon
// object under `_gpoly` so repeated calls reuse it instead of rebuilding
// the geometry index on every tick.
//
// Filter rule (see plan silly-cuddling-beacon.md):
//   A polygon is relevant to the driver's remaining route if the nearest
//   route point lies within `bufferMeters` of the polygon. That entry point
//   must be ahead of the driver; ETA to entry vs. the real-siren countdown
//   produces the `in_time` / `too_late` classification. Only `off_route`
//   and `behind_driver` exclude an alert — `too_late` still shows because
//   the driver is still heading into a live alert zone.

(function (global) {
  'use strict';

  function hasGeometry() {
    return global.google
      && global.google.maps
      && global.google.maps.geometry
      && global.google.maps.geometry.spherical;
  }

  // Pre-compute per-point cumulative distance along a route path.
  // Returns { path, cumulativeMeters } where path is the input (shared
  // reference) and cumulativeMeters[i] is meters from path[0] to path[i].
  function buildRouteWithCumulative(path) {
    if (!Array.isArray(path) || path.length === 0) {
      return { path: [], cumulativeMeters: [] };
    }
    if (!hasGeometry()) {
      throw new Error('google.maps.geometry.spherical is required');
    }
    const cum = new Array(path.length);
    cum[0] = 0;
    const sph = global.google.maps.geometry.spherical;
    for (let i = 1; i < path.length; i++) {
      cum[i] = cum[i - 1] + sph.computeDistanceBetween(path[i - 1], path[i]);
    }
    return { path, cumulativeMeters: cum };
  }

  function resolveGpoly(polygon) {
    let gpoly = polygon.gmapPoly || polygon._gpoly;
    if (!gpoly && polygon.paths) gpoly = polygon;
    if (!gpoly && Array.isArray(polygon.latLngs)) {
      gpoly = new global.google.maps.Polygon({ paths: polygon.latLngs });
      polygon._gpoly = gpoly;
    }
    return gpoly;
  }

  function polygonRing(polygon, gpoly) {
    if (Array.isArray(polygon.latLngs)) return polygon.latLngs;
    if (gpoly && gpoly.getPath) {
      return gpoly.getPath().getArray().map(ll => ({ lat: ll.lat(), lng: ll.lng() }));
    }
    return [];
  }

  // Scan forward from `fromIndex` for the first path point that lies INSIDE
  // the polygon. Returns -1 if no point is inside.
  function findFirstIndexInsidePoly(path, fromIndex, polygon) {
    if (!hasGeometry()) throw new Error('google.maps.geometry is required');
    const gpoly = resolveGpoly(polygon);
    if (!gpoly) return -1;
    const polyFn = global.google.maps.geometry.poly.containsLocation;
    for (let i = fromIndex; i < path.length; i++) {
      if (polyFn(path[i], gpoly)) return i;
    }
    return -1;
  }

  // Scan forward from `fromIndex` for the first path point whose distance to
  // any polygon vertex is <= bufferMeters. This detects "near the polygon"
  // (the 3 km proximity case) without requiring the point to be inside.
  // Approximation: vertex-distance under-counts at most by the polygon's
  // edge length, which is well under 3 km for city-scale zones.
  function findFirstIndexWithinBuffer(path, fromIndex, polygon, bufferMeters) {
    if (!hasGeometry()) throw new Error('google.maps.geometry is required');
    const gpoly = resolveGpoly(polygon);
    const ring = polygonRing(polygon, gpoly);
    const sph = global.google.maps.geometry.spherical;
    for (let i = fromIndex; i < path.length; i++) {
      const p = path[i];
      for (let v = 0; v < ring.length; v++) {
        const d = sph.computeDistanceBetween(p, ring[v]);
        if (d <= bufferMeters) return i;
      }
    }
    return -1;
  }

  // Snap threshold: if the closest route point is further than this from the
  // driver's position, the driver has strayed off-route and the filter MUST
  // NOT silently snap to the route tail (which would cause every alert to
  // classify `behind_driver`). Instead findDriverIndex returns -1 and the
  // caller surfaces the off-route state.
  const OFF_ROUTE_SNAP_THRESHOLD_M = 500;

  // Locate the driver's current index on the route (closest path point).
  // Simple O(n) scan — routes are ~100–500 points for Tel Aviv ↔ Haifa.
  // Returns -1 when the driver is further than OFF_ROUTE_SNAP_THRESHOLD_M
  // from every point on the route (driver is off-route).
  function findDriverIndex(path, driverPos) {
    if (!hasGeometry() || path.length === 0) return 0;
    const sph = global.google.maps.geometry.spherical;
    let bestIdx = 0;
    let bestDist = Infinity;
    for (let i = 0; i < path.length; i++) {
      const d = sph.computeDistanceBetween(path[i], driverPos);
      if (d < bestDist) { bestDist = d; bestIdx = i; }
    }
    if (bestDist > OFF_ROUTE_SNAP_THRESHOLD_M) return -1;
    return bestIdx;
  }

  // Main filter entrypoint.
  //
  // Returns:
  //   {
  //     relevant: boolean,
  //     reasonByCity: { [cityName]: 'on_route'|'in_buffer'|'off_route'|'behind_driver'|'too_late' },
  //     relevantCities: string[],
  //     verdicts: Array<{ city, reason, etaToEntrySeconds, realSirenInSeconds }>
  //   }
  function filterAlertForRoute(params) {
    const {
      alert,                         // { cities: string[], type: string, id? }
      polygonIndex,                  // { [cityName]: { latLngs: [{lat,lng}], gmapPoly? } }
      route,                         // { path, cumulativeMeters } from buildRouteWithCumulative
      driver,                        // { position: LatLng, speedMps: number }
      bufferMeters = 3000,
      shelterSecondsFor              // (cityName) => number
    } = params;

    const reasonByCity = {};
    const relevantCities = [];
    const verdicts = [];

    if (!alert || !Array.isArray(alert.cities) || alert.cities.length === 0) {
      return { relevant: false, reasonByCity, relevantCities, verdicts };
    }
    if (!route || !Array.isArray(route.path) || route.path.length === 0) {
      // No active route — fall back to "always relevant" so drivers still
      // see alerts when they haven't picked a destination.
      alert.cities.forEach(c => { reasonByCity[c] = 'on_route'; relevantCities.push(c); });
      return { relevant: true, reasonByCity, relevantCities, verdicts };
    }

    // SAFETY: shelterSecondsFor MUST be provided by the caller. Silently
    // defaulting to 60s would mask a wiring regression that causes Gaza-
    // envelope (real siren 15s) alerts to be classified `in_time`.
    if (typeof shelterSecondsFor !== 'function') {
      throw new Error('filterAlertForRoute: shelterSecondsFor is required');
    }

    // SAFETY: driver.speedMps MUST be provided by the caller. Silently
    // defaulting to 27.8 m/s (~100 km/h) would produce optimistic ETAs and
    // flip `too_late` alerts into `in_time` for drivers stuck in traffic.
    if (!driver || typeof driver.speedMps !== 'number' || !isFinite(driver.speedMps) || driver.speedMps < 0) {
      throw new Error('filterAlertForRoute: driver.speedMps is required and must be a finite non-negative number');
    }

    const driverIdx = driver.position
      ? findDriverIndex(route.path, driver.position)
      : 0;

    // Driver is off-route (snap distance > OFF_ROUTE_SNAP_THRESHOLD_M).
    // Cannot classify alerts relative to a route the driver isn't on —
    // surface the state so the UI can banner it and show the alerts anyway.
    if (driverIdx === -1) {
      alert.cities.forEach(c => {
        reasonByCity[c] = 'driver_off_route';
        relevantCities.push(c);
        verdicts.push({ city: c, reason: 'driver_off_route', etaToEntrySeconds: null, realSirenInSeconds: null });
      });
      return { relevant: true, reasonByCity, relevantCities, verdicts };
    }

    // Stationary / very slow driver: avoid divide-by-zero in ETA and, more
    // importantly, avoid optimistic classification. If speed <= 0.1 m/s we
    // treat the driver as not approaching — ETA to entry becomes large, so
    // any polygon ahead flips to `too_late` (conservative: the alert still
    // shows, just with a "you won't make it" verdict instead of a false
    // "you can make it"). A `speedAssumption` flag is added to each verdict
    // so the caller can surface the condition.
    const STATIONARY_MPS = 0.1;
    const speedMps = driver.speedMps > STATIONARY_MPS ? driver.speedMps : STATIONARY_MPS;
    const speedAssumed = driver.speedMps <= STATIONARY_MPS;

    for (const city of alert.cities) {
      const polygon = polygonIndex[city];
      if (!polygon) {
        // SAFETY: surface the data gap instead of silently hiding the
        // alert behind "off_route". The caller decides how to handle it.
        reasonByCity[city] = 'unknown_city';
        verdicts.push({ city, reason: 'unknown_city', etaToEntrySeconds: null, realSirenInSeconds: null });
        continue;
      }

      // Classify with three scans on the REMAINING path (from driverIdx):
      //   1) Any point strictly inside the polygon? -> on_route
      //   2) Else any point within bufferMeters?     -> in_buffer
      //   3) Else scan the WHOLE path for either;    -> behind_driver or off_route
      let entryIdx = findFirstIndexInsidePoly(route.path, driverIdx, polygon);
      let classification = entryIdx !== -1 ? 'on_route' : null;

      if (entryIdx === -1) {
        entryIdx = findFirstIndexWithinBuffer(route.path, driverIdx, polygon, bufferMeters);
        if (entryIdx !== -1) classification = 'in_buffer';
      }

      if (entryIdx === -1) {
        // Did the polygon intersect the full route at all?
        const insideAnywhere = findFirstIndexInsidePoly(route.path, 0, polygon);
        const bufferAnywhere = findFirstIndexWithinBuffer(route.path, 0, polygon, bufferMeters);
        if (insideAnywhere === -1 && bufferAnywhere === -1) {
          reasonByCity[city] = 'off_route';
          verdicts.push({ city, reason: 'off_route', etaToEntrySeconds: null, realSirenInSeconds: null });
        } else {
          reasonByCity[city] = 'behind_driver';
          verdicts.push({ city, reason: 'behind_driver', etaToEntrySeconds: null, realSirenInSeconds: null });
        }
        continue;
      }

      // Compute ETA to entry point
      const metersToEntry = Math.max(
        0,
        route.cumulativeMeters[entryIdx] - route.cumulativeMeters[driverIdx]
      );
      const etaSec = metersToEntry / speedMps;
      const shelterSec = shelterSecondsFor(city);

      // SAFETY: if shelterSecondsFor cannot classify the city's region, do
      // NOT silently fall back to a single global number — that's exactly
      // how a 15s Gaza-envelope alert gets treated like a 60s bucket. Show
      // the alert (classification stays on_route/in_buffer) but flag the
      // data gap so the caller can banner it.
      if (shelterSec == null) {
        reasonByCity[city] = classification;
        relevantCities.push(city);
        verdicts.push({
          city, reason: classification,
          etaToEntrySeconds: etaSec, realSirenInSeconds: null,
          shelterTimeUnknown: true,
          speedAssumption: speedAssumed ? 'stationary' : 'driver'
        });
        continue;
      }

      // SAFETY_MARGIN: add driver's reaction time to the comparison.
      const SAFETY_MARGIN_SEC = 10;
      const reason = (etaSec > shelterSec + SAFETY_MARGIN_SEC)
        ? 'too_late'
        : classification;

      reasonByCity[city] = reason;
      relevantCities.push(city);
      verdicts.push({
        city, reason,
        etaToEntrySeconds: etaSec, realSirenInSeconds: shelterSec,
        speedAssumption: speedAssumed ? 'stationary' : 'driver'
      });
    }

    return {
      relevant: relevantCities.length > 0,
      reasonByCity,
      relevantCities,
      verdicts
    };
  }

  global.AlertRouteFilter = {
    buildRouteWithCumulative,
    findFirstIndexWithinBuffer,
    findFirstIndexInsidePoly,
    findDriverIndex,
    filterAlertForRoute
  };
})(typeof window !== 'undefined' ? window : globalThis);
