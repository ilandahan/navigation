// Pure helpers for the "📍 Use my location" shortcut — extracted from
// index.html so the state-building and user-facing-string logic is
// unit-testable without a browser or navigator.geolocation
// (MY-LOCATION-001 follow-up).
//
// Used by useMyLocationAsFrom() in index.html:
//   1. buildMyLocationOrigin(pos.coords) → shape for currentOrigin
//   2. formatMyLocationToast(pos.coords.accuracy) → success toast text
//   3. describeGeolocationError(err) → error toast text

(function (global) {
  'use strict';

  // Single source of truth for the display string shown in the From input
  // after a My-Location pick. Exported so tests can assert the exact value.
  const MY_LOCATION_LABEL = '📍 My Location';

  // Build the currentOrigin object from a GeolocationCoordinates-like value.
  // Shape: { lat, lng, name } — matches what the autocomplete gmp-select
  // handler produces so downstream code (updateDirectionsGate, route
  // calculation) doesn't need a branch for which origin source was used.
  //
  // Throws on missing/invalid input — a silent default (NaN, 0,0) would
  // hide a wiring regression and steer the driver into the wrong routes.
  function buildMyLocationOrigin(coords) {
    if (!coords || typeof coords !== 'object') {
      throw new Error('MyLocation.buildMyLocationOrigin: coords object required');
    }
    const lat = coords.latitude;
    const lng = coords.longitude;
    if (typeof lat !== 'number' || !isFinite(lat)) {
      throw new Error('MyLocation.buildMyLocationOrigin: coords.latitude must be a finite number');
    }
    if (typeof lng !== 'number' || !isFinite(lng)) {
      throw new Error('MyLocation.buildMyLocationOrigin: coords.longitude must be a finite number');
    }
    return { lat, lng, name: MY_LOCATION_LABEL };
  }

  // Format the success toast: "Using your location (±12m)". Accuracy is
  // rounded to the nearest integer. A non-numeric accuracy surfaces as
  // "±?m" rather than throwing — toast copy is cosmetic, not load-bearing.
  function formatMyLocationToast(accuracy) {
    const rounded = (typeof accuracy === 'number' && isFinite(accuracy))
      ? Math.round(accuracy)
      : '?';
    return `Using your location (±${rounded}m)`;
  }

  // Format the error toast from a GeolocationPositionError (or any object
  // carrying a .message): "Could not get your location: Permission denied".
  // Falls back to 'unknown error' on missing/falsy .message so the toast
  // is always informative.
  function describeGeolocationError(err) {
    const msg = (err && err.message) ? err.message : 'unknown error';
    return `Could not get your location: ${msg}`;
  }

  global.MyLocation = {
    MY_LOCATION_LABEL,
    buildMyLocationOrigin,
    formatMyLocationToast,
    describeGeolocationError
  };
})(typeof window !== 'undefined' ? window : globalThis);
