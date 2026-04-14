# Tech Spec — Module APIs

Status: living doc · Last updated: 2026-04-14

Covers the three pure JS modules loaded by `index.html` and `receiver.html`. Each module is a browser IIFE that exposes a single namespace on `window` / `globalThis`. No DOM, no fetch, no Google Maps in two of the three (the filter depends on `google.maps.geometry` but not on the DOM).

Safety contract applies to every public entry point:

> **No silent fallbacks.** Required inputs throw on miss. Data gaps produce distinct verdict reasons that callers must surface. Callers MUST NOT ignore verdict flags.

---

## 1. `alertRouteFilter.js` — `window.AlertRouteFilter`

Pure route-vs-alert classification. Depends on `google.maps.geometry.spherical` (distance) and `google.maps.geometry.poly` (point-in-polygon). The simulation and the real-feed path share this module so sim is a valid test harness for live behaviour.

### 1.1 `buildRouteWithCumulative(path) → { path, cumulativeMeters }`

Pre-computes per-point cumulative distance along a route path so ETA lookups are O(1).

| Param | Type | Notes |
|---|---|---|
| `path` | `Array<google.maps.LatLng \| {lat, lng}>` | Must be non-null or an empty-result is returned. |

Returns `{ path: Array, cumulativeMeters: Array<number> }` where `cumulativeMeters[i]` is meters from `path[0]` to `path[i]`. Empty/null input → `{ path: [], cumulativeMeters: [] }`.

Throws `Error('google.maps.geometry.spherical is required')` when the Maps geometry library isn't loaded and the path is non-empty.

### 1.2 `findDriverIndex(path, driverPos) → number`

O(n) closest-point lookup.

- Returns the index of the closest `path` point to `driverPos` **iff** the snap distance ≤ `OFF_ROUTE_SNAP_THRESHOLD_M` (500 m).
- Returns `-1` when the driver is further than 500 m from every point on `path` — i.e. driver has strayed off-route.
- Returns `0` when `path` is empty or geometry isn't available (safe fallback for the filter, which then uses the no-route path).

### 1.3 `findFirstIndexInsidePoly(path, fromIndex, polygon) → number`

Forward scan from `fromIndex` for the first `path` point that lies **inside** the polygon (uses `google.maps.geometry.poly.containsLocation`). Returns the matching index or `-1`.

### 1.4 `findFirstIndexWithinBuffer(path, fromIndex, polygon, bufferMeters) → number`

Forward scan from `fromIndex` for the first `path` point whose distance to any polygon **vertex** is ≤ `bufferMeters`. Approximation: vertex-distance under-counts at most by the polygon's edge length (well under 3 km for city-scale zones). Returns the matching index or `-1`.

### 1.5 `filterAlertForRoute(params) → Verdict` ⭐ main entry point

```ts
params: {
  alert: { cities: string[], type: string, id?: string }        // required
  polygonIndex: { [cityName]: { latLngs?, gmapPoly?, paths?, _gpoly? } } // required
  route: { path, cumulativeMeters } | null                       // null → no-route fallback
  driver: { position?: LatLng, speedMps: number }                // required; speedMps throws if missing/invalid
  bufferMeters?: number                                          // default 3000
  shelterSecondsFor: (cityName: string) => number | null         // REQUIRED (throws if missing)
}

Verdict: {
  relevant: boolean                                              // true if ≥1 city is actionable
  reasonByCity: { [cityName]: reason }
  relevantCities: string[]
  verdicts: Array<{
    city: string,
    reason: ReasonString,
    etaToEntrySeconds: number | null,
    realSirenInSeconds: number | null,
    shelterTimeUnknown?: true,                                   // SURFACE THIS
    speedAssumption?: 'driver' | 'stationary'                    // SURFACE 'stationary'
  }>
}

ReasonString:
  'on_route'          // polygon touches remaining route
  'in_buffer'         // polygon within bufferMeters of remaining route
  'off_route'         // polygon does not touch route anywhere
  'behind_driver'     // polygon touches route but only behind driverIdx
  'too_late'          // on_route/in_buffer but ETA > shelter time + 10s safety
  'unknown_city'      // city has no entry in polygonIndex (DATA GAP — surface)
  'driver_off_route'  // driver > 500 m from route (DATA GAP — surface)
```

#### Throws (contract violations — callers must not catch silently)

| Condition | Message |
|---|---|
| `shelterSecondsFor` not a function | `filterAlertForRoute: shelterSecondsFor is required` |
| `driver` missing, `driver.speedMps` missing / non-finite / negative | `filterAlertForRoute: driver.speedMps is required and must be a finite non-negative number` |

#### Invariants

1. `too_late` alerts STILL appear in `relevantCities` — the driver must see them.
2. `off_route` and `behind_driver` are the only reasons that exclude a city from `relevantCities`.
3. A missing polygon (data gap) produces `unknown_city`, not `off_route`.
4. A stationary driver (`speedMps ≤ 0.1`) is clamped to 0.1 m/s and the verdict carries `speedAssumption: 'stationary'` — ETA becomes pessimistic and alerts trend toward `too_late` rather than toward a false `in_time`.
5. Unknown shelter lead time (`shelterSecondsFor(city) === null`) produces the base classification (`on_route` / `in_buffer`) with `shelterTimeUnknown: true` and `realSirenInSeconds: null`. Callers MUST banner this.

#### Caller obligations (enforced by UI in `index.html`)

- Surface `shelterTimeUnknown` verdicts via `setFeedStatus('warn', 'ALERT SHELTER-TIME UNKNOWN for: …')`.
- Surface `driver_off_route` verdicts via `setFeedStatus('warn', 'DRIVER OFF-ROUTE …')`.
- Surface `speedAssumption === 'stationary'` via `setFeedStatus('warn', 'DRIVER STATIONARY …')`.

---

## 2. `shelterTimeConstants.js` — `window.ShelterTime`

Regional siren lead-time lookup.

### 2.1 `shelterSecondsFor(cityName: string) → number | null`

Returns the shelter lead time in seconds for the given Hebrew city label.

- **Matching rule:** longest-matching substring wins (not first-match). `קריית שמונה` (11 chars, 30 s) beats `קריית` (5 chars, 60 s) regardless of rule order, so maintainers can safely append new rules without silently shifting an existing city.
- **Unknown city → `null`.** No global default. Callers MUST surface the data gap; they MUST NOT substitute a number.

### 2.2 Coverage buckets (current POC approximation)

| Region | Seconds | Example cities |
|---|---|---|
| Gaza envelope | 15 | שדרות, נתיבות, אופקים, בארי |
| Ashkelon–Ashdod corridor | 45 | אשקלון, אשדוד, קריית גת, רחובות |
| Far south / Arava | 60 | באר שבע, דימונה, אילת |
| Northern border / Galilee / Golan | 30 | קריית שמונה, נהריה, קצרין |
| Haifa bay / northern coast | 60 | חיפה, קריית, עכו, חדרה |
| Jerusalem + Judea/Samaria | 90 | ירושלים, גוש עציון, מודיעין |
| Central Israel (urban belt) | 90 | תל אביב, רמת גן, נתניה |

**Migration target:** replace this table with the authoritative per-polygon siren-time map published by Pikud HaOref. Key by canonical city name (the exact string in `locations_polygons.json`), not by substring.

---

## 3. `mapsShareLink.js` — `window.MapsShareLink`

Builds Google Maps deep links and phone-handoff URLs. No DOM, no Google Maps dependency.

### 3.1 `buildDirectionsUrl(params) → string | null`

```ts
params: {
  origin: { lat, lng } | LatLng | string              // required; returns null if missing
  destination: { lat, lng } | LatLng | string         // required; returns null if missing
  travelMode?: 'driving'|'transit'|'walking'|'bicycling'|'two_wheeler'  // default 'driving'
  waypoints?: Array<{lat,lng} | LatLng | string>      // optional
}
```

Returns `https://www.google.com/maps/dir/?api=1&…`. Unknown `travelMode` maps to `driving` (UX-only path, not a safety path — the alert filter uses the explicit `ROUTES_MODE` whitelist in `index.html` which throws on unknown).

### 3.2 `formatLocation(loc) → string`

Internal helper, exported for tests. Returns `lat,lng` (6 dp) for coordinate inputs, URL-encoded string for name inputs, `''` for null / invalid shapes. **Non-finite lat/lng is rejected** (returns `''`) so a `NaN` from a callable `LatLng` can't ship as the literal string `"NaN"` inside the URL.

### 3.3 `buildSmsUrl(body: string) → string`

Returns `sms:?&body=<encoded>` for mobile OS SMS-app handoff.

### 3.4 `buildMailtoUrl(subject: string, body: string) → string`

Returns `mailto:?subject=<encoded>&body=<encoded>`.

### 3.5 `defaultSpeedMps(mode: string) → number`

Typical cruising speed per travel mode. Used by the alert filter to estimate ETA to polygon entry:

| Mode | m/s | km/h |
|---|---|---|
| driving | 27.78 | ~100 |
| transit | 15.0 | ~54 |
| bicycling | 4.2 | ~15 |
| walking | 1.4 | ~5 |
| two_wheeler | 15.0 | ~54 |

Unknown mode → `driving` default. Live GPS `coords.speed` overrides this when present (follow-up; not yet wired).

---

## Cross-module invariants

1. **Loud failure surface.** Every safety-relevant failure route lands in one of:
   - Throw (contract violation — caller bug).
   - `setFeedStatus('warn' | 'error', msg)` (runtime data gap — user needs to know).
   - Distinct verdict reason (`unknown_city`, `driver_off_route`, `shelterTimeUnknown`, `speedAssumption: 'stationary'`).
2. **No silent defaults.** If you find yourself writing `|| 60`, `|| 20000`, `|| 27.8`, `|| 'DRIVING'`, or `|| []` on a safety path, stop and pick one of the three surfaces above.
3. **Pure modules stay pure.** These three files must not import DOM, fetch, or app globals. The filter depends on `google.maps.geometry`; that is the only permitted non-pure dependency.

---

## Test coverage

| Module | Test | Notes |
|---|---|---|
| `alertRouteFilter.js` | `tests/filter.test.js` (50 assertions) | Runs under node with a minimal haversine + ray-casting mock of `google.maps.geometry`. Covers all seven verdict reasons + the three contract-violation throws. |
| `shelterTimeConstants.js` | `tests/filter.test.js` (13 assertions at top) | Covers longest-match precedence + null-return for unknown cities. |
| `mapsShareLink.js` | `tests/shareLink.test.js` (43 assertions) | Covers URL building, travel modes, waypoints, XSS-escape on user-supplied names. |
| Integration (Maps-driven) | `test-route-filter.html` | Hand-run in browser; 7 live-API scenarios against real Google Directions + Geometry. Uses a live Maps key. |

Run locally:

```bash
node tests/filter.test.js && node tests/shareLink.test.js
```

---

## 4. Share architecture — `/shares/{uid}` on Firestore

Replaces the earlier `localStorage`-based handoff. The driver writes one document per their Firebase Auth UID; the receiver subscribes to that doc with `onSnapshot`. No session IDs, no polling, no localStorage cleanup.

### 4.1 Data model

```
/shares/{uid}           — one document per signed-in driver (uid = Firebase Auth UID)
  lat:          number              // degrees
  lng:          number              // degrees
  accuracy:     number | null       // meters; from GPS fix
  name:         string              // user.displayName (or email fallback)
  inDanger:     boolean             // true while driver is inside an alert polygon
  status:       'driving' | 'gps-tracking' | 'waiting-to-drive'
  updatedAt:    Timestamp           // serverTimestamp() on every push
  endedAt:      Timestamp | null    // set on stopSharing; null while active
```

The collection is flat. The document id IS the driver's UID; that gives us a natural primary key and the Firestore rule (`request.auth.uid == uid`) enforces owner-write without any additional checks.

### 4.2 Security rules (`firestore.rules`)

| Operation | Rule | Rationale |
|---|---|---|
| write to `/shares/{uid}` | `request.auth != null && request.auth.uid == uid` | Only the signed-in owner can push their own location |
| read from `/shares/{uid}` | `true` | Capability model — knowing the UID (≈ 168 bits of entropy in the URL) is sufficient; matches WhatsApp/Waze Live Location |
| any other path | denied | Nothing else is exposed yet |

### 4.3 Driver contract (`index.html`)

| Function | Contract |
|---|---|
| `signInWithGoogle()` | Firebase `signInWithPopup(GoogleAuthProvider)`. Surfaces toast on failure. Returns the user object or `null` on cancel/error. |
| `startSharing()` | Requires signed-in user. Sets `shareSessionId = user.uid`. Opens `./receiver.html?uid=<uid>` in a new tab. Schedules `pushSharedLocation` every 2 s. |
| `pushSharedLocation()` | `setDoc(doc(db, 'shares', uid), { lat, lng, accuracy, name, inDanger, status, updatedAt: serverTimestamp(), endedAt: null }, { merge: true })`. On rejection: toast the first failure, auto-stop sharing after 3 consecutive rejections (S8 guard preserved). |
| `stopSharing()` | Best-effort `updateDoc(..., { endedAt: serverTimestamp() })`, then tear down local state. Failure to write `endedAt` still completes the local tear-down (UI does not lie). |

### 4.4 Receiver contract (`receiver.html`)

| Behavior | Contract |
|---|---|
| URL input | `?uid=<driverUid>`. Missing `uid` → permanent "Invalid share link" message; no session-picker fallback (there is no localStorage to scan). |
| Subscribe | `onSnapshot(doc(db, 'shares', driverUid), cb, errCb)`. One persistent listener; no polling. |
| Offline detection | Runs every 500 ms. If `Date.now() - updatedAt > OFFLINE_THRESHOLD_MS` (4 s) → flip to "Lost" overlay with timer. |
| Explicit end | `data.endedAt != null` → flip to "Lost" overlay immediately (replaces the old `_ended` localStorage marker). |
| Reconnect | A fresh snapshot with newer `updatedAt` → dismiss "Lost" + flash "✓ Reconnected" banner. |
| Read errors | `onSnapshot` error callback invokes `surfaceError(code, reason)` → yellow banner with the Firestore error code. Silent failures are not allowed. |

### 4.5 Cross-module invariants (still hold under Firebase)

- **No silent fallbacks.** Write failures toast + auto-stop. Read failures banner + flip to Lost/Error state. Missing uid → "Invalid link", not a blank map.
- **Capability-based access.** The URL is the token. There is no enumeration API; `/shares` has no list rule.
- **Client-only.** No Cloud Functions, no backend code. The Firebase project is the backend.

### 4.6 Known gaps (future work)

- **Write coalescing.** Driver currently pushes every 2 s unconditionally. At Firestore's 20k-writes/day free cap this is ~5.5 active driver-hours/day. Pre-scale, add a "delta > 10 m OR status change" gate before calling `setDoc`.
- **Stale share TTL.** No cleanup job yet — abandoned `/shares/{uid}` docs accumulate forever. A scheduled Cloud Function deleting docs with `updatedAt` older than N days will close this.
- **Receiver auth (opt-in).** For a future "private mode", a `followers` subcollection + a rules change (`allow read: if request.auth.uid in …`) promotes the share URL from pure capability to authenticated capability.

---

## 5. Turn-by-turn directions subsystem (TBT-001)

When the driver hits **Start Simulation** (Sim) or **Start Driving** (Live), the Route Options panel swaps for an in-app turn-by-turn directions UI: current maneuver, distance to next turn, next-step preview, ETA, and voice announcements. The user no longer needs Google Maps on a second screen — the **📱 Send** handoff stays as a desktop→mobile convenience, not a hard dependency.

### 5.1 Step-index data model

On `applySelectedRoute(idx)` (`index.html`), in addition to building `currentRouteMeta`, we record per-step boundaries and metadata in `currentStepIndex[]`:

```ts
{
  stepIdx: number,         // sequential across all legs
  legIdx: number,
  localStepIdx: number,    // index within the leg
  instructionHtml: string, // raw from Routes API
  instructionText: string, // HTML-stripped, used for TTS
  maneuver: 'turn-left' | 'turn-right' | 'sharp-left' | 'sharp-right'
          | 'slight-left' | 'slight-right' | 'keep-left' | 'keep-right'
          | 'uturn' | 'merge' | 'exit' | 'arrive' | 'straight',
  distanceMeters: number,  // step.distance.value
  startPathIdx: number,    // index into currentRouteMeta.path where this step begins
  endPathIdx: number,      // inclusive — last point of this step
  startCumM: number,       // currentRouteMeta.cumulativeMeters[startPathIdx]
  endCumM: number          // currentRouteMeta.cumulativeMeters[endPathIdx]
}
```

The flattening loop pushes step paths into `routePath` and records the start/end indices in one pass — O(n), no reconciliation needed. Cumulative meters are backfilled after `buildRouteWithCumulative`. Build failures (empty legs / steps / paths) **throw loudly** with `"step-index build failed: …"`. No silent fallback.

### 5.2 Cursor algorithm

A module-level `currentStepCursor` advances monotonically:

```
while (cursor < N-1 && pathIdx > stepIndex[cursor].endPathIdx) cursor++
```

Amortized O(1). On rare jump-back (driver re-routed to an earlier point), a linear-scan fallback corrects the cursor in O(n).

### 5.3 Render contract

`renderTbt(pathIdx)` is the **only** function that writes to `#directions-tbt`. Sim and Live both funnel through it via `updateTbtForSim(currentIndex)` / `updateTbtForLive(gLatLng)`. Live calls `findDriverIndex(currentRouteMeta.path, gLatLng)` first and feeds the result (or `-1` for off-route) to the renderer.

### 5.4 Voice TTS yield contract

`SpeechSynthesisUtterance`, dedup keyed `${stepIdx}:${threshold}` per route. Thresholds: **500 m**, **100 m**, and on cursor advance ("Now …"). Toggle persisted via `localStorage.tbtVoiceEnabled`.

**Yields to alerts unconditionally**: `processIncomingAlert` calls `tbtYieldVoiceForAlert(20000)` which sets `voiceYieldUntilMs = Date.now() + 20000` and `speechSynthesis.cancel()`. `speakManeuver()` bails while `Date.now() < voiceYieldUntilMs`. Future alert audio reuses the same gate.

### 5.5 Off-route state machine

State: `{ offRouteSinceMs, offRouteTickCount, recalcInFlight }`. Trigger after **≥3 consecutive off-route ticks OR ≥5 s**:

1. `.tbt-offroute` class (amber background) + `.tbt-offroute-banner` countdown ("Off route — recalculating in 10 s")
2. `#btn-tbt-recalc` becomes visible (manual override)
3. Countdown expires OR button click → `recalcRoute()` wraps `runRoutingRequest({ origin: driverPos, destination: currentDestination, travelMode, alternatives: true })`. Rebuilds `currentStepIndex`, resets cursor.
4. **Recalc failure** → persistent banner "Recalculation failed — tap 'Recalculate now' to retry". `recalcInFlight=false`. **No silent recovery.**
5. Back on-route before countdown → state cleared, `console.log('[tbt] off-route cleared after Ns')`.

### 5.6 Show/hide toggle

`setPanelVisible(el, visible)` toggles BOTH the `hidden` attribute AND the `.hidden` CSS class. The CSS rule `.hidden { display: none !important; }` defeats `display:flex` overrides — fix for an earlier bug observed on the auth gate. Mount points:

| Event | `#route-options` | `#directions-tbt` |
|---|---|---|
| `startSimulation()` / `startNavigation()` | hidden | visible |
| `stopSimulation()` / `stopNavigation()` | re-rendered (`updateRouteOptionsPanel()`) | hidden |
| Alert fires | unchanged | unchanged (z-stack: alert banner z:100 above) |

### 5.7 Safety preserved

All existing safety surfaces are untouched:

- `#alert-banner` (z:100) still wins z-order
- `#shelter-panel` and the static `#instructions-panel` (Pikud HaOref emergency guidance — pull over, lie down) are not displaced
- The 10 anti-fallback safety guards from `SAFETY-NO-FALLBACKS-001` continue to hold
- Voice TTS yields for 20 s on every alert so spoken navigation does not compete with safety messaging

### 5.8 NOT in v1

Lane guidance, voice language selection, snap-to-road polyline rendering, traffic-aware auto-reroute, background TTS when tab is hidden (`speechSynthesis` is flaky off-screen), waypoint vs final arrival distinction.


