// Routes API response → legacy-shaped route object. Pure: no DOM, no
// Google Maps globals. Caller injects routePointToLatLng + boundsFromPath
// so the module can be unit-tested without a browser (tests inject plain
// JS stubs; the app injects the google.maps-backed helpers).
//
// SAFETY: a zero-length or zero-distance route silently breaks every
// downstream call (findFirstIndexWithinBuffer never matches, so every
// alert looks `off_route`). A single malformed leg (NaN / negative /
// undefined distance) would silently become 0 under a `|| 0` coercion —
// cumulativeMeters would skip that span, TBT step bounds would collapse,
// and the alert filter's ETA would be computed against a hole in the
// route. Validate loudly so the caller's catch can banner "route load
// failed".

(function (global) {
  'use strict';

  function adaptRoute(r, routePointToLatLng, boundsFromPath) {
    if (typeof routePointToLatLng !== 'function') {
      throw new Error('adaptRoute: routePointToLatLng function is required');
    }
    if (typeof boundsFromPath !== 'function') {
      throw new Error('adaptRoute: boundsFromPath function is required');
    }
    if (!r) throw new Error('adaptRoute: null/undefined route');

    const overview_path = (r.path || []).map(routePointToLatLng).filter(Boolean);
    if (overview_path.length === 0) {
      throw new Error('adaptRoute: empty overview_path — Routes API returned no geometry');
    }
    const bounds = boundsFromPath(overview_path);

    const legs = (r.legs || []).map((leg, i) => {
      if (!leg || typeof leg !== 'object') {
        throw new Error('adaptRoute: leg ' + i + ' is not an object');
      }
      if (typeof leg.distanceMeters !== 'number' || !isFinite(leg.distanceMeters) || leg.distanceMeters < 0) {
        throw new Error('adaptRoute: leg ' + i + ' has invalid distanceMeters: ' + leg.distanceMeters);
      }
      if (typeof leg.durationMillis !== 'number' || !isFinite(leg.durationMillis) || leg.durationMillis < 0) {
        throw new Error('adaptRoute: leg ' + i + ' has invalid durationMillis: ' + leg.durationMillis);
      }
      const steps = (leg.steps || []).map((step, j) => {
        if (!step || typeof step !== 'object') {
          throw new Error('adaptRoute: leg ' + i + ' step ' + j + ' is not an object');
        }
        if (typeof step.distanceMeters !== 'number' || !isFinite(step.distanceMeters) || step.distanceMeters < 0) {
          throw new Error('adaptRoute: leg ' + i + ' step ' + j + ' has invalid distanceMeters: ' + step.distanceMeters);
        }
        return {
          distance: { value: step.distanceMeters },
          path: (step.path || []).map(routePointToLatLng).filter(Boolean),
          instructions: step.instructions || ''
        };
      });
      return {
        distance: { value: leg.distanceMeters },
        duration: { value: Math.round(leg.durationMillis / 1000) },
        steps: steps
      };
    });

    const totalMeters = legs.reduce((sum, l) => sum + l.distance.value, 0);
    if (legs.length > 0 && totalMeters === 0) {
      throw new Error('adaptRoute: zero-distance route — Routes API returned legs summing to 0');
    }

    return { summary: r.description || '', overview_path, bounds, legs };
  }

  global.RouteAdapter = { adaptRoute };
})(typeof window !== 'undefined' ? window : globalThis);
