// Pure formatting helpers extracted from index.html so the logic is
// unit-testable and reused via window.Formatters. No DOM, no globals.
// Each function is a small UI/copy-formatting primitive used in toasts,
// route-info cards, and route-summary chips.

(function (global) {
  'use strict';

  // Map a Google Routes/Directions API error to a driver-facing message.
  // Branches on the error string (message OR code) — the API surfaces
  // ZERO_RESULTS / NOT_FOUND / OVER_QUERY_LIMIT / REQUEST_DENIED in
  // either field depending on which client was used. Falls back to a
  // generic "Route calculation failed: <raw>" with a graceful 'unknown'
  // when nothing useful is present.
  function humanizeDirectionsError(err, origin, destination) {
    const raw = (err && (err.message || err.code || '')) + '';
    const oName = (origin && origin.name) || 'origin';
    const dName = (destination && destination.name) || 'destination';
    if (/ZERO_RESULTS/i.test(raw)) {
      return `No driving route found between "${oName}" and "${dName}". ` +
             `One of them may be off-road (water, park, etc.) — try picking ` +
             `a nearby city, street, or landmark.`;
    }
    if (/NOT_FOUND/i.test(raw)) {
      return `One of the locations could not be geocoded. Try a more specific address.`;
    }
    if (/OVER_QUERY_LIMIT|REQUEST_DENIED/i.test(raw)) {
      return 'Map service temporarily unavailable — please try again in a moment.';
    }
    const fallback = (err && (err.message || err.code)) || 'unknown';
    return 'Route calculation failed: ' + fallback;
  }

  // ETA / route-duration display: "Xh Ym" when ≥1h, else just "Ym".
  // Minutes use Math.round so 89s → 1m, 91s → 2m. Hours use Math.floor
  // so 3599s → 0h 60m... wait, that's a known display oddity but matches
  // the previous inline behavior. Documented; tests pin it down.
  function formatDuration(seconds) {
    const h = Math.floor(seconds / 3600);
    const m = Math.round((seconds % 3600) / 60);
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
  }

  // Distance display: "X m" under 1km, "X.Y km" at/over 1km (one decimal).
  function formatDistance(meters) {
    if (meters < 1000) return `${Math.round(meters)} m`;
    return `${(meters / 1000).toFixed(1)} km`;
  }

  // HTML-entity-encode a string for safe interpolation into innerHTML
  // contexts. Standard 5-entity replacement (& < > " ').
  // Null/undefined are coerced to ''.
  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  // Produce a "via X" label for a route. Prefer Google's `route.summary`
  // (the dominant highway name); fall back to the longest leg step's
  // road name (Google Maps own UI does this when summary is empty —
  // walking/bicycling routes often have no summary).
  // HTML tags inside instruction strings are stripped; >40-char results
  // are truncated with an ellipsis to keep the chip tidy.
  function summarizeRouteVia(route) {
    if (!route) return null;
    if (route.summary) return route.summary;
    const legs = route.legs || [];
    let best = null, bestLen = 0;
    for (const leg of legs) {
      const steps = (leg && leg.steps) || [];
      for (const step of steps) {
        const len = step && step.distance ? step.distance.value : 0;
        if (len > bestLen && step.instructions) {
          bestLen = len;
          best = step.instructions.replace(/<[^>]+>/g, '').trim();
        }
      }
    }
    if (best && best.length > 40) best = best.slice(0, 40) + '…';
    return best;
  }

  global.Formatters = {
    humanizeDirectionsError,
    formatDuration,
    formatDistance,
    escapeHtml,
    summarizeRouteVia
  };
})(typeof window !== 'undefined' ? window : globalThis);
