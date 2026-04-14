// Pure module: generates Google Maps deep links and phone-handoff URLs.
// No DOM, no Google Maps dependency. Used by index.html's Send-to-Phone flow
// and tested directly with node in tests/shareLink.test.js.
//
// Google Maps "directions" URL spec (api=1):
//   https://www.google.com/maps/dir/?api=1
//     &origin=LAT,LNG      | &origin=Encoded+Place+Name
//     &destination=LAT,LNG | &destination=Encoded+Place+Name
//     &travelmode=driving|walking|bicycling|transit|two-wheeler
//     &waypoints=LAT,LNG|LAT,LNG   (pipe-separated)
//
// Spec reference: https://developers.google.com/maps/documentation/urls/get-started

(function (global) {
  'use strict';

  const TRAVEL_MODE_TO_GMAPS = {
    driving: 'driving',
    transit: 'transit',
    walking: 'walking',
    bicycling: 'bicycling',
    two_wheeler: 'two-wheeler'
  };

  // Default speed in meters-per-second per travel mode. Used by the
  // route-aware alert filter to estimate ETA to an alert polygon.
  // These are typical cruising speeds; intentionally conservative.
  const DEFAULT_SPEED_MPS = {
    driving: 27.78,    // ~100 km/h (freeway)
    transit: 15.0,     // ~54 km/h mixed bus/rail average
    walking: 1.4,      // ~5 km/h
    bicycling: 4.2,    // ~15 km/h
    two_wheeler: 15.0  // ~54 km/h (scooter/motorcycle urban)
  };

  function defaultSpeedMps(mode) {
    if (mode && Object.prototype.hasOwnProperty.call(DEFAULT_SPEED_MPS, mode)) {
      return DEFAULT_SPEED_MPS[mode];
    }
    return DEFAULT_SPEED_MPS.driving;
  }

  // Render an origin/destination/waypoint as either "lat,lng" (6 dp) or an
  // encoded place name. A waypoint may also be a string (e.g. "Tel Aviv").
  // SAFETY: reject non-finite lat/lng so a NaN from a callable LatLng
  // cannot ship as the literal string "NaN" inside the share URL.
  function formatLocation(loc) {
    if (loc == null) return '';
    if (typeof loc === 'string') return encodeURIComponent(loc.trim());
    if (typeof loc === 'object' && typeof loc.lat === 'number' && typeof loc.lng === 'number') {
      if (!isFinite(loc.lat) || !isFinite(loc.lng)) return '';
      return loc.lat.toFixed(6) + ',' + loc.lng.toFixed(6);
    }
    // Tolerate LatLng objects (with callable .lat()/.lng() methods)
    if (loc && typeof loc.lat === 'function' && typeof loc.lng === 'function') {
      const la = loc.lat();
      const ln = loc.lng();
      if (typeof la !== 'number' || typeof ln !== 'number' || !isFinite(la) || !isFinite(ln)) return '';
      return la.toFixed(6) + ',' + ln.toFixed(6);
    }
    return '';
  }

  // Build a Google Maps directions deep link.
  // params: { origin, destination, travelMode?, waypoints? }
  // Returns a string URL, or null if origin or destination are missing.
  function buildDirectionsUrl(params) {
    if (!params || !params.origin || !params.destination) return null;
    const origin = formatLocation(params.origin);
    const destination = formatLocation(params.destination);
    if (!origin || !destination) return null;

    const mode = TRAVEL_MODE_TO_GMAPS[params.travelMode] || 'driving';
    const parts = [
      'api=1',
      'origin=' + origin,
      'destination=' + destination,
      'travelmode=' + mode
    ];
    if (Array.isArray(params.waypoints) && params.waypoints.length > 0) {
      const wpStrs = params.waypoints
        .map(formatLocation)
        .filter(Boolean);
      if (wpStrs.length > 0) parts.push('waypoints=' + wpStrs.join('|'));
    }
    return 'https://www.google.com/maps/dir/?' + parts.join('&');
  }

  // Build an SMS handoff URL. On iOS / Android devices, opening this URL
  // launches the messaging app prefilled with the directions link.
  function buildSmsUrl(body) {
    return 'sms:?&body=' + encodeURIComponent(body || '');
  }

  function buildMailtoUrl(subject, body) {
    return 'mailto:?subject=' + encodeURIComponent(subject || '')
      + '&body=' + encodeURIComponent(body || '');
  }

  global.MapsShareLink = {
    buildDirectionsUrl,
    buildSmsUrl,
    buildMailtoUrl,
    formatLocation,
    defaultSpeedMps,
    TRAVEL_MODE_TO_GMAPS,
    DEFAULT_SPEED_MPS
  };
})(typeof window !== 'undefined' ? window : globalThis);
