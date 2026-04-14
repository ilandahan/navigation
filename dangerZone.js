// Spatial relationships between a position / route and active alert
// polygons. Pure: no DOM, no Google Maps globals. Caller injects a
// containsLocation function (google.maps.geometry.poly.containsLocation
// in the app, a JS stub in tests) so the module can run under Node.
//
// Two related queries:
//   * check(position, activeAlerts, containsFn)
//       → { inside, polygonHit, alertHit }
//     Used by the live driver/sim tick to decide if the driver is
//     currently inside any active danger polygon. The CALLER owns the
//     `insideDangerZone` state machine + DOM updates — this module
//     only reports the spatial fact.
//
//   * countIntersections(routePath, activeAlerts, containsFn, sampleStride)
//       → number
//     Used by the Route Options panel to score each alternative
//     route by how many alert polygons it crosses. Sampled every
//     `sampleStride` (default 3) path points to bound cost; first hit
//     per polygon wins (Set-deduped).
//
// SAFETY: a missing containsFn is a wiring regression, not a runtime
// edge case. Throw loudly so the caller's catch can banner.

(function (global) {
  'use strict';

  function check(position, activeAlerts, containsFn) {
    if (typeof containsFn !== 'function') {
      throw new Error('DangerZone.check: containsFn is required');
    }
    if (!position) {
      return { inside: false, polygonHit: null, alertHit: null };
    }
    if (!Array.isArray(activeAlerts) || activeAlerts.length === 0) {
      return { inside: false, polygonHit: null, alertHit: null };
    }

    for (const alert of activeAlerts) {
      if (!alert || !Array.isArray(alert.polygons)) continue;
      for (const poly of alert.polygons) {
        if (containsFn(position, poly)) {
          return { inside: true, polygonHit: poly, alertHit: alert };
        }
      }
    }
    return { inside: false, polygonHit: null, alertHit: null };
  }

  function countIntersections(routePath, activeAlerts, containsFn, sampleStride) {
    if (typeof containsFn !== 'function') {
      throw new Error('DangerZone.countIntersections: containsFn is required');
    }
    if (!Array.isArray(routePath) || routePath.length === 0) return 0;
    if (!Array.isArray(activeAlerts) || activeAlerts.length === 0) return 0;

    const stride = (typeof sampleStride === 'number' && sampleStride >= 1)
      ? Math.floor(sampleStride)
      : 3;

    const intersecting = new Set();
    for (const alert of activeAlerts) {
      if (!alert || !Array.isArray(alert.polygons)) continue;
      for (const poly of alert.polygons) {
        for (let i = 0; i < routePath.length; i += stride) {
          if (containsFn(routePath[i], poly)) {
            intersecting.add(poly);
            break;
          }
        }
      }
    }
    return intersecting.size;
  }

  global.DangerZone = { check, countIntersections };
})(typeof window !== 'undefined' ? window : globalThis);
