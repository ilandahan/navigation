// Pikud HaOref alert client — polls /api/alerts, classifies, detects
// all-clears via session diff, deduplicates by rid.
// Extracted as standalone module for offline testability (PIKUD-CLIENT-001).
// Wired into index.html by PIKUD-CUTOVER-001.

(function (global) {
  'use strict';

  // ── Category display map (Hebrew) ──────────────────────────────────
  var CATEGORY_DISPLAY = {
    missilealert:     'טיל',
    uav:              'כטב״ם',
    warning:          'אזהרה מוקדמת',
    hazmat:           'חומ״ס',
    tsunami:          'צונאמי',
    cbrne:            'נשק בלתי קונבנציונלי',
    terrorattack:     'חדירת מחבלים',
    nonconventional:  'נשק לא קונבנציונלי',
    earthquakealert1: 'רעידת אדמה',
    earthquakealert2: 'רעידת אדמה',
  };

  // ── Classify catId + priority → colorState ─────────────────────────
  // UAV (catId 2) gets its own purple regardless of priority bucket.
  // Unknown catId → 'red' (fail-safe: noisy > silent for life-safety).
  function classify(catId, priority) {
    if (catId === 2) return 'purple';
    if (priority >= 160) return 'critical';
    if (priority >= 120) return 'red';
    if (priority >= 51)  return 'yellow';
    if (priority > 0)    return 'yellow';   // catch any 1-50 range
    return 'drop';                          // priority 0 = updates/memorial/drills
  }

  // ── Normalize: server response alert → internal dispatch shape ─────
  function normalize(serverAlert) {
    var colorState = classify(serverAlert.catId, serverAlert.priority);
    if (colorState === 'drop') return null;

    var displayType = CATEGORY_DISPLAY[serverAlert.category] || serverAlert.categoryHe || 'התרעה';

    return {
      id:          serverAlert.rid || serverAlert.id,
      rid:         serverAlert.rid || 0,
      catId:       serverAlert.catId,
      category:    serverAlert.category,
      categoryHe:  serverAlert.categoryHe || '',
      priority:    serverAlert.priority,
      colorState:  colorState,
      type:        displayType,
      cities:      serverAlert.cities || [],
      timestamp:   serverAlert.timestamp ? new Date(serverAlert.timestamp) : new Date(),
      _durationMs: 90000,
    };
  }

  // ── Diff: detect all-clears via presence/absence ───────────────────
  // liveActiveRids: Map<rid, {cities, lastSeenMs}> — mutated in-place
  // currentAlerts: array of normalized alerts from this poll
  // Returns: Array<{rid, cities}> — the clears detected this tick
  function diff(liveActiveRids, currentAlerts, nowMs) {
    var currentRids = new Set();
    var i, rid;

    for (i = 0; i < currentAlerts.length; i++) {
      currentRids.add(currentAlerts[i].rid);
    }

    var clears = [];
    var entries = Array.from(liveActiveRids.entries());
    for (i = 0; i < entries.length; i++) {
      rid = entries[i][0];
      var info = entries[i][1];
      if (!currentRids.has(rid) && (nowMs - info.lastSeenMs) > 5000) {
        clears.push({ rid: rid, cities: info.cities });
        liveActiveRids.delete(rid);
      }
    }

    // Update / add current rids
    for (i = 0; i < currentAlerts.length; i++) {
      var alert = currentAlerts[i];
      liveActiveRids.set(alert.rid, { cities: alert.cities, lastSeenMs: nowMs });
    }

    return clears;
  }

  // ── Dedup: rid-based Set with 30-min prune ─────────────────────────
  var DEDUP_MAX_AGE_MS = 30 * 60 * 1000;

  function pruneDedup(dispatchedRids, nowMs) {
    var entries = Array.from(dispatchedRids.entries());
    for (var i = 0; i < entries.length; i++) {
      if ((nowMs - entries[i][1]) > DEDUP_MAX_AGE_MS) {
        dispatchedRids.delete(entries[i][0]);
      }
    }
  }

  // ── Polling engine ─────────────────────────────────────────────────
  // 3 s base cadence — balances responsiveness with Cloud Function rate limits.
  // On 429 (rate-limited) or network error: exponential backoff up to 30 s.
  // On success: reset to base cadence.
  var POLL_BASE_MS = 3000;
  var POLL_MAX_MS  = 30000;
  var consecutiveFailures = 0;
  var timerId = null;
  var callbacks = { onAlert: null, onClear: null, onStatus: null };
  var liveActiveRids = new Map();
  var dispatchedRids = new Map();  // rid → dispatchedAtMs

  function nextDelay() {
    if (consecutiveFailures === 0) return POLL_BASE_MS;
    // Exponential: 3s → 6s → 12s → 24s → 30s cap
    return Math.min(POLL_BASE_MS * Math.pow(2, consecutiveFailures), POLL_MAX_MS);
  }

  function tick() {
    var nowMs = Date.now();
    pruneDedup(dispatchedRids, nowMs);

    fetch('/api/alerts').then(function (res) {
      if (!res.ok) {
        consecutiveFailures++;
        if (callbacks.onStatus) callbacks.onStatus(res.status === 429 ? 'rate_limited' : 'network_error');
        scheduleNext();
        return;
      }
      return res.json();
    }).then(function (json) {
      if (!json) return;

      if (!json.ok) {
        consecutiveFailures++;
        if (callbacks.onStatus) callbacks.onStatus('upstream_degraded');
        var emptyClears = diff(liveActiveRids, [], nowMs);
        emitClears(emptyClears);
        scheduleNext();
        return;
      }

      consecutiveFailures = 0;  // success — reset backoff
      if (callbacks.onStatus) callbacks.onStatus('ok');

      // Normalize all alerts
      var alerts = json.alerts || [];
      var normalized = [];
      for (var i = 0; i < alerts.length; i++) {
        var n = normalize(alerts[i]);
        if (n) normalized.push(n);
      }

      // Detect clears
      var clears = diff(liveActiveRids, normalized, nowMs);
      emitClears(clears);

      // Dispatch new alerts (dedup by rid)
      for (var j = 0; j < normalized.length; j++) {
        var alert = normalized[j];
        if (alert.rid && dispatchedRids.has(alert.rid)) continue;
        if (alert.rid) dispatchedRids.set(alert.rid, nowMs);
        if (callbacks.onAlert) callbacks.onAlert(alert);
      }

      scheduleNext();
    }).catch(function () {
      consecutiveFailures++;
      if (callbacks.onStatus) callbacks.onStatus('network_error');
      scheduleNext();
    });
  }

  function emitClears(clears) {
    if (!callbacks.onClear) return;
    for (var i = 0; i < clears.length; i++) {
      callbacks.onClear(clears[i].rid, clears[i].cities);
    }
  }

  function scheduleNext() {
    if (timerId === null) return;  // stopped while in-flight
    timerId = setTimeout(tick, nextDelay());
  }

  function start(opts) {
    if (timerId !== null) return;  // already running
    callbacks.onAlert  = opts.onAlert  || null;
    callbacks.onClear  = opts.onClear  || null;
    callbacks.onStatus = opts.onStatus || null;
    liveActiveRids.clear();
    dispatchedRids.clear();
    consecutiveFailures = 0;
    timerId = setTimeout(tick, 0);  // fire immediately
  }

  function stop() {
    if (timerId === null) return;
    clearTimeout(timerId);
    timerId = null;
    liveActiveRids.clear();
    dispatchedRids.clear();
    callbacks.onAlert = null;
    callbacks.onClear = null;
    callbacks.onStatus = null;
  }

  // ── Public API ─────────────────────────────────────────────────────
  global.PikudClient = {
    start:      start,
    stop:       stop,
    _state:     { liveActiveRids: liveActiveRids, dispatchedRids: dispatchedRids },
    _normalize: normalize,
    _classify:  classify,
    _diff:      diff,
  };

})(typeof window !== 'undefined' ? window : (typeof global !== 'undefined' ? global : this));
