# Code Review — Pikud HaOref Driving POC

**Scope:** `index.html` (2537 lines before this change), `download-polygons.js`, `locations_polygons.json`, `shelters.json`.
**Reviewer:** Claude, via Explore subagent (pre-change) + direct reading.
**Date:** 2026-04-13.
**Commit:** No git — review pinned to `index.html` file size 2537 lines pre-change.

## TL;DR

The POC is ~90% feature-complete and demonstrates the core idea well. It has five material issues that matter for production credibility (in order):

1. **No route-aware filtering** — every alert fires identically for every driver. *Addressed by this task.*
2. **`checkDangerZone` runs at 20 Hz, O(n·m)** — will stutter once many alerts are active.
3. **Hardcoded Google Maps API key** in `index.html:2534`, checked into the repo. Not addressed here.
4. **Mock and live alert paths are parallel code** with no shared funnel — drift risk. *Addressed by this task.*
5. **Monolithic `index.html`** (inline 1700-line `<script>`). Untestable as-is. *Partially addressed — new pure functions moved to external files.*

None of these are blockers for a POC demo. All are things a reviewer would flag before the POC becomes production.

---

## Architecture at a glance

```
index.html (single file)
├─ <style> ~350 lines
├─ <body> DOM ~470 lines
└─ <script> inline ~1700 lines
    ├─ Globals (30+ let/const)         lines 866–903
    ├─ initApp()                       909
    ├─ Polygon index + fireAlert       1635–1787
    ├─ Danger detection                1846–1873
    ├─ Simulation loop                 1948–2046
    ├─ Real GPS + live alert polling   2096–2227
    ├─ Route alternatives + escape     1290–1490
    └─ DOM wiring + Maps callback      2373–2537
```

Everything shares module-level `let`s (`routePath`, `driverMarker`, `activeAlerts`, `currentMode`, etc.). There is no module boundary, no event bus, no namespace. This is acceptable for a 2-week POC, dangerous for anything longer.

---

## Section-by-section review

### 1. `buildPolygonIndex()` — `index.html:1635–1645`

**What it does.** Converts the `locations_polygons.json` dictionary (city name → `[lng,lat]` rings) into `polygonIndex[city] = { latLngs: [{lat,lng}, ...] }`.

**Issues.**
- Skips keys prefixed with `_` silently (line 1637) — undocumented convention; a reader has to guess what metadata keys exist.
- No dedup of duplicate polygons. Two city aliases that point to the same geographic zone produce two separate `google.maps.Polygon` objects when fired.
- Keys are raw Hebrew labels from the upstream feed. Any spacing/diacritic variance between the alert payload and the polygon-data feed silently fails (see `fireAlert` partial-match fallback).

**Severity.** LOW. Data is curated.

**Recommendation.** Document the `_`-skip convention with a one-line comment. Log on startup any alert-API cities that would fail lookup.

### 2. `fireAlert()` — `index.html:1664–1740`

**What it does.** For each city in the alert payload, looks up the polygon, creates a `google.maps.Polygon` with red styling, wires a click handler for the infoWindow, pushes the entry into `activeAlerts`. Also triggers shelter-panel preview.

**Issues.**
- **Partial-match logging (lines 1672–1677)** logs a partial candidate but doesn't use it. The alert silently loses that city from the rendered set. Either use the match or fail loudly.
- **Duration coupling via `alertData._durationMs`** (used by the click handler at 1693). Mutating the caller's object is a hidden contract. The duration should be a parameter to `fireAlert`.
- **`updateRouteOptionsPanel` + shelter panel side-effects** (lines 1724–1737) — `fireAlert` does too much. It renders, updates the banner, refreshes alternates, AND pre-computes shelter suggestions. Split responsibilities.

**Severity.** MEDIUM. No correctness bug, but several fragile couplings.

### 3. `checkDangerZone()` — `index.html:1846–1873`

**What it does.** For each active alert, for each polygon, checks if the driver's position is inside via `google.maps.geometry.poly.containsLocation`. Updates `insideDangerZone` and visuals.

**Issues.**
- **Called every `simStep` tick (every 50 ms, 20 Hz).** With N active alerts × M polygons per alert, per-frame cost is O(N·M). Currently bounded (≤4 mock alerts), but unbounded in live mode when many zones fire together.
- **`containsLocation` on a `google.maps.Polygon` is not free** — it tests point-in-polygon across the full ring. No spatial index.

**Severity.** MEDIUM. *Addressed partially by this task:* throttled to 2 Hz in `simStep` (motion still at 20 Hz for smoothness). The O(N·M) is unchanged but the call rate is.

**Recommendation (follow-up).** Index active polygons spatially, or pre-filter to polygons whose bounding-box overlaps the driver's current vicinity.

### 4. `computeEscapeRoutes()` + `countRouteAlertIntersections()` — `index.html:1290–1490`

**What it does.** Requests DirectionsService alternatives, samples each alternative's `overview_path` every 3 points, counts how many sample points fall inside any active polygon. Scores alternatives by intersections.

**Issues.**
- **Sampling stride of 3 on `overview_path`** can miss small polygons. `overview_path` is already decimated — sampling on top of that is risky for narrow city polygons.
- **Scoring is incomplete** — the code counts intersections but doesn't heavily weight "exits within the first 30%" mentioned in the original design.
- **Same `containsLocation` loop pattern as `checkDangerZone`** — opportunity to share one utility.

**Severity.** LOW for POC. The feature works; just not as well as it could.

**Recommendation.** Decode the full `route.legs[*].steps[*].path` instead of `overview_path` for precise intersection.

### 5. Simulation loop `simStep()` — `index.html:1991–2046`

**What it does.** Advances `currentIndex` by `speed` per frame, moves driver marker, updates heading, pans map every 10 frames, checks mock-alert triggers, runs `checkDangerZone`, updates progress UI.

**Issues.**
- **Mock-alert triggers are percent-based** on `currentIndex / routePath.length`. If the user changes speed, the fire times warp. Fine for demo, misleading as a test harness.
- **`triggeredMockAlerts` (Set) is cleared only in `beginDriving`** — if user picks a new route without pressing Start, stale entries persist. *Addressed indirectly* — route change now re-evaluates active alerts, but the Set itself still clears only on Start.
- **Heading calculation (line 2013)** uses `speed` as the lookback offset: at speed 32 the heading is computed from ~32 points back, giving a very coarse angle and visible rotation jitter at high speeds.
- **No separate motion vs. logic tick.** *Addressed by this task* — `checkDangerZone` is throttled to 500 ms.

**Severity.** LOW. None cause incorrect behavior in normal use.

### 6. `startRealAlertPolling()` — `index.html:2200–2227`

**What it does.** Polls `oref.org.il/WarningMessages/alert/alerts.json` every 3 s. Parses JSON. Fires alert if `data.data` is non-empty.

**Issues.**
- **Error swallow (line 2224)** — catches all errors, `console.warn`s, continues. A driver who enabled live mode has zero UX feedback that the feed is dead. *Addressed* — now shows a toast after 5 consecutive failures.
- **No deduplication.** If the feed returns the same alert on two consecutive polls (3 s apart), the UI fires two overlapping alerts. *Addressed* — `processIncomingAlert` dedups by `alert.id` within a 2-minute window.
- **No route-aware filtering before firing.** *Addressed.*
- **No backoff.** 3-second polling regardless of server load. Fine for one user; wrong in aggregate.

**Severity.** HIGH (was). MEDIUM after this task.

### 7. GPS path `startRealGPS()` — `index.html:2096–2185`

**What it does.** `navigator.geolocation.watchPosition` with high accuracy. On each fix: updates marker, heading, accuracy circle, status bar, danger check.

**Issues.**
- **No stale-fix handling.** If a fix arrives after a long pause, heading from prev→current may be miles apart and meaningless.
- **`checkDangerZone` is called per GPS fix** (fine — fix rate is ~1 Hz).
- **Duplicate position-update logic** shared with `simStep` — both compute heading, both update marker icon, both call `checkDangerZone`. Extracting to `onDriverPositionUpdate(pos)` is a clear win; not done in this task to keep the diff small.

**Severity.** LOW.

### 8. State management — globals at `index.html:866–903`

30+ module-level `let`s. No freeze, no validation, no event source. The pattern works but is brittle — any new contributor has to trace every mutation manually.

**Severity.** HIGH as a maintainability issue. LOW as a correctness issue today.

**Recommendation (follow-up, out of scope here):** Introduce a single `appState = { route, driver, alerts, ui }` object and gate mutations through named functions. This is where a modularization pass should start.

### 9. Security — `index.html:2534`

The Google Maps API key is a string literal embedded in the HTML that ships to every browser. Anyone who inspects the page can copy it, and usage will bill to the project. Acceptable for a local-only POC; unacceptable the moment this goes on the public web.

**Severity.** HIGH for any public deployment.

**Recommendation.** (a) Restrict the key by HTTP referrer in Google Cloud Console, OR (b) move the Maps loader behind a simple proxy.

---

## Changes introduced by this task

| Area | Change |
|---|---|
| `alertRouteFilter.js` (new) | Pure route-vs-polygon filter with `filterAlertForRoute`, `buildRouteWithCumulative`, `findFirstIndexWithinBuffer`, `findDriverIndex` |
| `shelterTimeConstants.js` (new) | Per-region pre-alert lead-time table via `ShelterTime.shelterSecondsFor(city)` |
| `index.html` header | Loads the two new scripts before Google Maps |
| `index.html` state block | Adds `currentRouteMeta`, `recentAlertIds`, `lastDangerCheckAt`, `lastAlertStats` |
| `index.html` `processIncomingAlert(alert, duration, opts)` | Single funnel for mock + live + manual alerts |
| `index.html` `simStep` | Mock alerts go through funnel; `checkDangerZone` throttled to 2 Hz |
| `index.html` `startRealAlertPolling` | Alerts go through funnel; dedup by id; toast after 5 failures |
| `index.html` `applySelectedRoute` | Rebuilds `currentRouteMeta` + re-evaluates active alerts on route change |
| `index.html` manual dropdown | Routes through funnel with `bypassFilter:true` (documented) |
| `test-route-filter.html` (new) | 7-scenario test harness — runs filter against real Google Maps geometry |
| `docs/research/code-review.md` (this file) | The review itself |

## Verification

- Simulation test matrix at `test-route-filter.html` runs 7 scenarios and reports PASS/FAIL per scenario.
- Smoke-test the main app (`index.html`) in simulation mode — verify mock alerts still fire at 22/30/50/70% and now log `[alert-filter] shown/discarded` in the console.
- Live-mode smoke test requires an Israeli IP (geo-block). The dedup and filter paths can be exercised offline by manually calling `processIncomingAlert({cities:['Be\u2019er Sheva'], type:'Missiles'}, 20000, {source:'live'})` from DevTools.

## How to run

```
cd "C:/ilans' local files/waze"
python -m http.server 5173
# http://localhost:5173/index.html              — main app
# http://localhost:5173/test-route-filter.html  — filter test harness
```

To refresh polygons from the upstream source:

```
node download-polygons.js
```

## Follow-ups (NOT in this task)

1. Move Google Maps API key off the client or restrict by referrer.
2. Introduce `git init` + `.gitignore` so changes are recoverable.
3. Extract the inline `<script>` into modules progressively. Start with driver-state + alert service, then UI.
4. Spatial-index the active polygons if live traffic brings >10 simultaneous zones.
5. Replace the partial-string shelter-time patterns with the authoritative per-polygon pre-alert-time dataset.
6. Decode full route paths (not `overview_path`) for more precise polygon intersection in escape-route scoring.
