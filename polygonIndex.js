// Pikud HaOref polygon-zone index. Pivots the upstream
// `locations_polygons.json` shape (`{ cityName: [[lng, lat], ...] }`)
// into the `{ cityName: { latLngs: [{lat, lng}] } }` shape the alert
// filter expects. Pure: no DOM, no Google Maps. The caller assigns the
// returned object to its own polygonIndex global.
//
// Behaviour preserved from the original inline implementation:
//   * Keys starting with `_` are upstream metadata and are skipped.
//   * Polygons with fewer than 3 coordinates are skipped (cannot form
//     a ring; would crash the geometry filter downstream).
// The caller (initApp) already throws if the resulting index is empty,
// so we don't double-guard here — but we DO surface the skip count so
// the caller can decide whether the skip rate looks abnormal.

(function (global) {
  'use strict';

  function build(data) {
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      throw new Error('PolygonIndex.build: expected top-level object, got ' +
        (data === null ? 'null' : Array.isArray(data) ? 'array' : typeof data));
    }

    const index = {};
    const skipped = [];

    for (const [name, coords] of Object.entries(data)) {
      if (name.startsWith('_')) continue;
      if (!Array.isArray(coords)) {
        skipped.push({ name, reason: 'not-an-array' });
        continue;
      }
      if (coords.length < 3) {
        skipped.push({ name, reason: 'fewer-than-3-coords' });
        continue;
      }

      // Upstream shape is [lng, lat]; the rest of the app uses {lat, lng}.
      // We keep this strict: a non-numeric coord is a real upstream bug,
      // skip the city and surface it via `skipped`.
      const latLngs = [];
      let bad = false;
      for (let i = 0; i < coords.length; i++) {
        const c = coords[i];
        if (!Array.isArray(c) || c.length < 2 ||
            typeof c[0] !== 'number' || typeof c[1] !== 'number' ||
            !isFinite(c[0]) || !isFinite(c[1])) {
          bad = true;
          break;
        }
        latLngs.push({ lat: c[1], lng: c[0] });
      }
      if (bad) {
        skipped.push({ name, reason: 'invalid-coord' });
        continue;
      }

      index[name] = { latLngs };
    }

    return { index, skipped };
  }

  global.PolygonIndex = { build };
})(typeof window !== 'undefined' ? window : globalThis);
