# RUNBOOK — Pikud HaOref Route Alert POC

Operational runbook for developers working on this app. Pairs with
`docs/prd/PRD.md` (what + why) and `docs/tech-spec/MODULE-APIS.md`
(module contracts).

## Quickstart (local dev)

```bash
# 1. Serve the app — any static file server works
python -m http.server 5173
# or:
npx http-server -p 5173

# 2. Open
http://localhost:5173/

# 3. (Optional) Refresh polygon data — only needed when Pikud HaOref
#    publishes new zones (rare). See "Polygon refresh" below.
node download-polygons.js
```

The app is vanilla JS + inline `<script>` in `index.html` plus four
extracted pure modules (`alertRouteFilter.js`, `mapsShareLink.js`,
`shelterTimeConstants.js`, `routeAdapter.js`, `polygonIndex.js`).
**No build step.**

## Tests

| Suite | Command | What it covers |
|---|---|---|
| Offline unit (`filter`)        | `node tests/filter.test.js`        | `alertRouteFilter` + `shelterTimeConstants` (50 assertions) |
| Offline unit (`shareLink`)     | `node tests/shareLink.test.js`     | `mapsShareLink` URL builder, XSS escape (43) |
| Offline unit (`tbt-step-index`)| `node tests/tbt-step-index.test.js`| TBT cursor + step-index logic (35) |
| Offline unit (`routeAdapter`)  | `node tests/routeAdapter.test.js`  | Routes API → legacy shape + every throw path (27) |
| Offline unit (`polygonIndex`)  | `node tests/polygonIndex.test.js`  | GeoJSON pivot + skip reasons (19) |
| Browser harness                | open `test-route-filter.html`, click **Run tests** | 7 scenarios against live Google Directions |
| Playwright e2e                 | `npm install && npm run test:e2e:local` | Local end-to-end (project: `local`) |
| Playwright e2e (prod)          | `npm run test:e2e:prod`            | Same against prod target (project: `prod`) |

Total offline: **174 assertions, all required to pass.** Run them all
before committing anything that touches the alert path:

```bash
for t in tests/*.test.js; do node "$t" || exit 1; done
```

## Operational modes

### Simulation mode

1. Pick a preset route (Tel Aviv → Haifa is the default).
2. Click **Start Simulation**.
3. Driver marker advances along the route at ~20 Hz.
4. Mock alerts fire at 22 / 30 / 50 / 70 % of route progress; each goes
   through the same `processIncomingAlert` funnel as live alerts.
5. The TBT panel and shelter panel react in real time.

### Live mode

1. Sign in (Google → Firebase Auth).
2. Pick origin + destination via autocomplete.
3. Click **Start Driving**. The browser will prompt for geolocation
   permission.
4. The app polls `oref.org.il/.../alerts.json` every 3 s (via the
   project's CORS proxy) and pushes the driver position to Firestore
   every 2 s.
5. A receiver opened with the same Firebase auth UID picks up the
   position via `onSnapshot` (see `receiver.html`).

### Stopping

* Closing or backgrounding the tab during a Live drive triggers the
  R4 `beforeunload` warning + `visibilitychange` banner. This is by
  design — alerts can't be received in a hidden tab.

## Polygon refresh

```bash
node download-polygons.js
```

Fetches the upstream `oref-map.org/locations_polygons.json` (~770 KB),
validates it's a non-empty object (R5 guard), then writes
`locations_polygons.json` in place. The script exits non-zero on any
HTTP error, parse error, or empty payload — never silently overwrites
with bad data.

After refresh, reload the app and confirm the console line:
`Loaded N alert zones` where N is roughly 1 400 (current upstream).

## Configuration & secrets

| Item | Where it lives | Notes |
|---|---|---|
| Google Maps API key       | `index.html` script tag       | Browser-scoped; restrict by HTTP referrer in GCP. |
| Firebase project config   | `firebaseConfig.js` (inline)  | Public identifiers only — safe to commit. |
| Firestore security rules  | `firestore.rules`             | Enforced server-side. Auth required for writes. |
| Pikud HaOref feed URL     | `index.html` (live-mode poll) | Geo-restricted to Israeli IPs; uses CORS proxy. |
| `.env*`                   | gitignored                    | Not currently used. |

## Known operational caveats

* **CORS** — Pikud HaOref endpoint is geo-restricted; a proxy is
  required outside Israel. The proxy is a single point of failure for
  the alert feed; `setFeedStatus('error', ...)` surfaces outages.
* **Google Maps quota** — Routes API recalculations consume quota
  fast in always-on sessions; throttle aggressive recalcs.
* **Firestore free tier** — 20 k writes/day. At 1 write / 2 s = ~5
  driver-hours/day before breach. Monitor the project usage console.
* **Browser support** — Chrome desktop + Chrome mobile only (Safari
  / Firefox untested per PRD scope).
* **Geolocation** — Requires `https://` or `localhost` in modern
  browsers; `http://` from a LAN IP will silently never resolve.
* **Tab visibility** — Hidden tabs throttle `setInterval` and may
  drop the alert poll cadence; the R4 visibility banner warns the
  driver.

## Safety posture (non-negotiable)

This is a life-safety app. Two enforcement rules from the PRD:

1. **No silent fallbacks** — every catch, every `||` / `??` default
   in a safety-critical path either banners (loud) or is justified by
   comment (UX-cosmetic). New code must follow `.aid/qa/SAFETY-NO-FALLBACKS-001.yaml`.
2. **Loud failures** — `#feed-status-banner` is the canonical surface
   for any condition that can cause a missed or wrong alert. Never
   downgrade an existing loud failure to silent.

When in doubt, refer to `docs/research/evaluation-2026-04-14.md` for
the historical silent-failure inventory and what was addressed.

## Where things live

```
.
├── index.html            ← single-page app, inline <script>
├── receiver.html         ← phone-handoff receiver
├── alertRouteFilter.js   ← pure: route ∩ alert filter
├── shelterTimeConstants.js ← pure: regional siren lead-times
├── mapsShareLink.js      ← pure: deep-link / SMS / mailto builder
├── routeAdapter.js       ← pure: Routes API → legacy route shape (R1)
├── polygonIndex.js       ← pure: GeoJSON → cityName→latLngs index (E2)
├── shelters.json         ← 32 public shelters
├── locations_polygons.json ← ~1 400 alert zone polygons
├── download-polygons.js  ← dev tool: refresh the polygon dataset
├── tests/                ← 5 offline suites, 174 assertions
├── tests/e2e/            ← Playwright e2e suite
├── docs/prd/             ← PRD.md (user story, success metrics)
├── docs/tech-spec/       ← MODULE-APIS.md
├── docs/research/        ← code reviews, evaluation reports
└── docs/implementation-plan/ ← this file
```
