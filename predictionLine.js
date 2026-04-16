// Source-direction prediction line — weighted PCA through active alert
// polygon centroids. Pure math module, no Google Maps dependency.
// Extracted for offline testability (PREDICTION-LINE-001).

(function (global) {
  'use strict';

  var DEG_TO_RAD = Math.PI / 180;
  var RAD_TO_DEG = 180 / Math.PI;
  var EARTH_RADIUS_KM = 6371;

  // ── Centroid of a set of {lat, lng} points ────────────────────────
  function computeCentroid(points) {
    if (!points || points.length === 0) return null;
    if (points.length === 1) return { lat: points[0].lat, lng: points[0].lng };

    var sumLat = 0, sumLng = 0;
    for (var i = 0; i < points.length; i++) {
      sumLat += points[i].lat;
      sumLng += points[i].lng;
    }
    return { lat: sumLat / points.length, lng: sumLng / points.length };
  }

  // ── Weighted PCA direction on 2D points ───────────────────────────
  // Points: [{lat, lng}], Weights: [number] (same length).
  // Adjusts longitude for cos(lat) compression at Israel's latitude.
  // Returns heading in degrees (0=N, 90=E, 180=S, 270=W) or null if <2 points.
  function computeDirection(points, weights) {
    if (!points || points.length < 2) return null;

    // Weighted centroid
    var totalW = 0, wLat = 0, wLng = 0;
    for (var i = 0; i < points.length; i++) {
      var w = (weights && weights[i]) || 1;
      totalW += w;
      wLat += points[i].lat * w;
      wLng += points[i].lng * w;
    }
    var cLat = wLat / totalW;
    var cLng = wLng / totalW;

    // Cos(lat) adjustment for longitude — at ~32°N, cos ≈ 0.848
    var cosLat = Math.cos(cLat * DEG_TO_RAD);

    // Weighted covariance matrix in local Cartesian (degrees, adjusted)
    var Cxx = 0, Cyy = 0, Cxy = 0;
    for (var j = 0; j < points.length; j++) {
      var wj = (weights && weights[j]) || 1;
      var dx = (points[j].lng - cLng) * cosLat;  // x = east-west (adjusted lng)
      var dy = points[j].lat - cLat;              // y = north-south (lat)
      Cxx += wj * dx * dx;
      Cyy += wj * dy * dy;
      Cxy += wj * dx * dy;
    }

    // Principal eigenvector of 2x2 symmetric matrix [[Cxx, Cxy], [Cxy, Cyy]]
    // Direction angle: θ = 0.5 * atan2(2*Cxy, Cxx - Cyy)
    var theta = 0.5 * Math.atan2(2 * Cxy, Cxx - Cyy);

    // Convert from math angle (0=E, CCW) to geographic heading (0=N, CW)
    // Math: θ=0 → East, θ=π/2 → North
    // Geo:  0=North, 90=East
    var heading = (90 - theta * RAD_TO_DEG + 360) % 360;

    return heading;
  }

  // ── Haversine distance between two points (km) ────────────────────
  function distanceKm(a, b) {
    var dLat = (b.lat - a.lat) * DEG_TO_RAD;
    var dLng = (b.lng - a.lng) * DEG_TO_RAD;
    var sinLat = Math.sin(dLat / 2);
    var sinLng = Math.sin(dLng / 2);
    var h = sinLat * sinLat +
            Math.cos(a.lat * DEG_TO_RAD) * Math.cos(b.lat * DEG_TO_RAD) * sinLng * sinLng;
    return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h));
  }

  // ── Compute full prediction line data ─────────────────────────────
  // alertCentroids: [{lat, lng, weight}]
  // Returns: { centroid: {lat,lng}, heading: number|null, spreadKm: number }
  // heading is null when <2 centroids (dot-only mode).
  function computePredictionLine(alertCentroids) {
    if (!alertCentroids || alertCentroids.length === 0) {
      return { centroid: null, heading: null, spreadKm: 0 };
    }

    var points = [];
    var weights = [];
    for (var i = 0; i < alertCentroids.length; i++) {
      points.push({ lat: alertCentroids[i].lat, lng: alertCentroids[i].lng });
      weights.push(alertCentroids[i].weight || 1);
    }

    var centroid = computeCentroid(points);
    var heading = computeDirection(points, weights);

    // Spread = standard deviation of distances from centroid (km)
    var spreadKm = 0;
    if (points.length >= 2 && centroid) {
      var sumSqDist = 0;
      for (var k = 0; k < points.length; k++) {
        var d = distanceKm(centroid, points[k]);
        sumSqDist += d * d;
      }
      spreadKm = Math.sqrt(sumSqDist / points.length);
    }

    return { centroid: centroid, heading: heading, spreadKm: spreadKm };
  }

  // ── Compute endpoint at given heading + distance from origin ──────
  // Returns {lat, lng}. Used by renderer to extend the line.
  function computeOffset(origin, headingDeg, distanceKm) {
    var lat1 = origin.lat * DEG_TO_RAD;
    var lng1 = origin.lng * DEG_TO_RAD;
    var brng = headingDeg * DEG_TO_RAD;
    var d = distanceKm / EARTH_RADIUS_KM;

    var lat2 = Math.asin(
      Math.sin(lat1) * Math.cos(d) +
      Math.cos(lat1) * Math.sin(d) * Math.cos(brng)
    );
    var lng2 = lng1 + Math.atan2(
      Math.sin(brng) * Math.sin(d) * Math.cos(lat1),
      Math.cos(d) - Math.sin(lat1) * Math.sin(lat2)
    );

    return { lat: lat2 * RAD_TO_DEG, lng: lng2 * RAD_TO_DEG };
  }

  // ── Public API ─────────────────────────────────────────────────────
  global.PredictionLine = {
    computeCentroid:       computeCentroid,
    computeDirection:      computeDirection,
    computePredictionLine: computePredictionLine,
    computeOffset:         computeOffset,
    _distanceKm:           distanceKm,
  };

})(typeof window !== 'undefined' ? window : (typeof global !== 'undefined' ? global : this));
