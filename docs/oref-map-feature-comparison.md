# oref-map.org Feature Comparison

**Date:** 2026-04-15
**Source of facts:** Live recon on `https://oref-map.org/` + static teardown of the page bundle + read-only review of the public repo `github.com/maorcc/oref-map`.
**Goal:** Identify features they have that we don't, so we can build equivalents ourselves. **No code was ported.** Repo is AGPLv3; polygon JSON carries a `_copyright` line.

---

## 1. Comparison table

| Category                  | Capability                                                                                 | Ours                                                   | oref-map.org                                                | Gap     |
| ------------------------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------ | ----------------------------------------------------------- | ------- |
| **Alert classification**  | Alert types recognized                                                                     | 1 (hardcoded `'Missiles'`)                             | ~17 Hebrew titles, normalized                               | ❌      |
|                           | Color states                                                                               | 2 (safe / danger)                                      | 5 (red / purple / yellow / green / inherit)                 | ❌      |
|                           | Priority ordering                                                                          | None                                                   | `red > purple > yellow`; green overrides; inherit preserves | ❌      |
|                           | Rocket/missile (red)                                                                       | ✅                                                     | ✅ `ירי רקטות וטילים`                                       | ✅      |
|                           | CBRN / non-conventional (red)                                                              | ❌                                                     | ✅ `נשק לא קונבנציונלי`                                     | ❌      |
|                           | Terrorist infiltration (red)                                                               | ❌                                                     | ✅ `חדירת מחבלים`                                           | ❌      |
|                           | Hostile aircraft/UAV (purple)                                                              | ❌                                                     | ✅ `חדירת כלי טיס עוין` (UI label `חדירת כטב״מ`)            | ❌      |
|                           | Early-warning tier (yellow)                                                                | ❌                                                     | ✅ 4 preparedness phrases                                   | ❌      |
|                           | All-clear detection + 60 s green fade                                                      | ❌                                                     | ✅ 7 end-of-event phrases                                   | ❌      |
|                           | Generic "enter shelter" inherit rule                                                       | ❌                                                     | ✅ preserves prior red/purple                               | ❌      |
|                           | Unknown-title telemetry (server push)                                                      | ❌                                                     | ✅ Pushover to maintainer on new titles                     | ❌      |
| **Live feed**             | Upstream source                                                                            | `api.tzevaadom.co.il/notifications` via `corsproxy.io` | Pikud HaOref direct via Cloudflare Pages Function           | —       |
|                           | Live-alert poll interval                                                                   | 3 s + 30 s backoff                                     | 1 s                                                         | ❌      |
|                           | History poll (catches short events)                                                        | ❌                                                     | ✅ 10 s                                                     | ❌      |
|                           | Day-history replay (date param)                                                            | ❌                                                     | ✅ `/api/day-history?date=YYYY-MM-DD`                       | ❌      |
|                           | Edge caching                                                                               | None                                                   | `s-maxage=1` on proxy                                       | ❌      |
|                           | Geo failover                                                                               | None                                                   | `/api` (TLV-preferred) ↔ `/api2` Worker, colo-aware         | ❌      |
|                           | Session-pinned proxy                                                                       | ❌                                                     | ✅ Detects 303 once, reuses for session                     | ❌      |
|                           | Dedup mechanism                                                                            | 2 min window by `notificationId`                       | Monotonic `rid`                                             | ≈       |
| **Map & rendering**       | Map library                                                                                | Google Maps JS API                                     | MapLibre GL 4 + PMTiles 3 + Protomaps 5.7.2                 | —       |
|                           | Tile cost                                                                                  | Paid (Google Maps)                                     | $0 (self-hosted 72 MB PMTiles)                              | ❌      |
|                           | Basemap offline-capable                                                                    | ❌                                                     | ✅                                                          | ❌      |
|                           | Hebrew RTL labels                                                                          | partial                                                | ✅ RTL plugin                                               | ❌      |
|                           | Same-color polygon merging                                                                 | ❌                                                     | ✅ Borders dissolve into one zone                           | ❌      |
|                           | Per-polygon click → area history                                                           | ❌                                                     | ✅                                                          | ❌      |
|                           | Dark theme                                                                                 | ❌                                                     | ✅ persisted to `oref-theme`                                | ❌      |
| **Polygons**              | Count                                                                                      | 1,449                                                  | 1,451                                                       | ≈       |
|                           | Format                                                                                     | `{name:[[lng,lat]]}`                                   | `{name:[[lng,lat]]}` + `_populations` dict                  | ≈       |
|                           | Population per locality                                                                    | ❌                                                     | ✅ 1,200 entries                                            | ❌      |
|                           | Coastline sea-suppression                                                                  | ❌                                                     | ✅ 0.5 km sampled CSV                                       | ❌      |
|                           | South of 30.6°N (Eilat/Arava)                                                              | unchecked                                              | reportedly gap in `cities_geo.json`                         | ?       |
| **Prediction & analysis** | Source-direction line (weighted PCA)                                                       | ❌                                                     | ✅ azimuth-tuned extension                                  | ❌      |
|                           | Ellipse/cluster mode (BFS groups)                                                          | ❌                                                     | ✅ 78 KB lazy module                                        | ❌      |
|                           | Probability window (half-normal, `P=0.99`)                                                 | ❌                                                     | documented, unclear if shipped                              | ?       |
|                           | Timeline scrubber (1–2 h replay)                                                           | ❌                                                     | ✅                                                          | ❌      |
| **Driving context**       | Route-aware filter (`on_route` / `in_buffer` / `behind_driver` / `off_route` / `too_late`) | ✅                                                     | ❌                                                          | ✅ Ours |
|                           | Driving simulator harness                                                                  | ✅                                                     | ❌                                                          | ✅ Ours |
|                           | Driver-relative ETA vs. shelter time                                                       | ✅                                                     | ❌                                                          | ✅ Ours |
|                           | Follow-me camera mode                                                                      | ❌                                                     | ✅ 3-state (manual / events / follow)                       | ❌      |
|                           | `?myPosition=lat,lng` URL override                                                         | ❌                                                     | ✅                                                          | ❌      |
| **Shelter data**          | Shelter POI overlay on map                                                                 | ✅ 32 points                                           | ❌                                                          | ✅ Ours |
|                           | Regional shelter times                                                                     | ✅ 5 hardcoded buckets                                 | ❌ client-side; expose `RemainderConfig_heb.json` endpoint  | ≈       |
| **UX / PWA**              | Alert sound                                                                                | partial                                                | ✅ cached in SW                                             | ❌      |
|                           | Mute toggle                                                                                | ❌                                                     | ✅                                                          | ❌      |
|                           | PWA installable                                                                            | ❌                                                     | ✅ manifest + SW                                            | ❌      |
|                           | Standalone iOS icons + screenshots                                                         | ❌                                                     | ✅                                                          | ❌      |
|                           | Feature-flag system (URL params)                                                           | ❌                                                     | ✅ `?f-log`, `?f-ellipse`, `?f-predict`, `?f-debugapi`      | ❌      |
|                           | On-screen log overlay for debugging                                                        | ❌                                                     | ✅ `?f-log`                                                 | ❌      |
|                           | Visitor sparkline                                                                          | ❌                                                     | ✅ `/api/analytics-daily`                                   | ❌      |
| **Ops & resilience**      | License                                                                                    | (unspecified on our repo)                              | AGPLv3                                                      | —       |
|                           | Public issue tracker / roadmap                                                             | ❌                                                     | ✅ GitHub issues                                            | —       |
|                           | Long-term history archive                                                                  | ❌                                                     | ✅ R2 + cron ingest, JSONL per day                          | ❌      |
|                           | Sitemap + 404 page + OG image                                                              | partial                                                | ✅                                                          | ≈       |
|                           | Offline service worker                                                                     | ❌                                                     | ✅                                                          | ❌      |

Legend: ✅ yes · ❌ no / gap · ≈ comparable · ? open question · "✅ Ours" = we have it, they don't

---

## 2. Their Hebrew alert-title taxonomy (full)

Source: their client-side `classifyTitle()` + `TITLE_LABELS`. The upstream Pikud feed sends only `{data, alertDate, category_desc, rid}` — all classification is client-side string matching on `category_desc`.

| State             | Priority | Hebrew title                                | Translation                               |
| ----------------- | -------- | ------------------------------------------- | ----------------------------------------- |
| red               | 3        | `ירי רקטות וטילים`                          | Rockets and missiles fire                 |
| red               | 3        | `נשק לא קונבנציונלי`                        | Non-conventional weapon (CBRN)            |
| red               | 3        | `חדירת מחבלים`                              | Terrorist infiltration                    |
| purple            | 2        | `חדירת כלי טיס עוין`                        | Hostile aircraft / UAV infiltration       |
| yellow            | 1        | `בדקות הקרובות צפויות להתקבל התרעות באזורך` | Alerts expected shortly in your area      |
| yellow            | 1        | `יש לשהות בסמיכות למרחב המוגן`              | Stay near the protected space             |
| yellow            | 1        | `...לשפר את המיקום למיגון המיטבי...`        | Improve your position for optimal shelter |
| yellow            | 1        | `...להישאר בקרבתו`                          | Stay near it                              |
| inherit           | —        | `היכנסו מייד למרחב המוגן`                   | Enter the protected space immediately     |
| inherit           | —        | `היכנסו למרחב המוגן`                        | Enter the protected space                 |
| green (all-clear) | 0        | contains `האירוע הסתיים`                    | The event has ended                       |
| green (all-clear) | 0        | contains `ניתן לצאת` (and NOT "stay near")  | You may leave                             |
| green (all-clear) | 0        | contains `החשש הוסר`                        | The concern has been removed              |
| green (all-clear) | 0        | contains `יכולים לצאת`                      | … can leave                               |
| green (all-clear) | 0        | contains `אינם צריכים לשהות`                | Need not remain                           |
| green (all-clear) | 0        | contains `סיום שהייה בסמיכות`               | End of "stay near"                        |
| green (all-clear) | 0        | exact `עדכון`                               | Update                                    |

**Fallback:** unknown title → red + `console.warn('Unknown alert title:', title)`. Their server also pushes a Pushover notification to the maintainer so the list stays current.

**Title-priority merge rule (their behavior):** when multiple alerts target the same polygon, a lower-priority state cannot overwrite a higher one. Green is an exception: it overrides anything, then fades over 60 s. `inherit` titles preserve whatever red/purple was there, else default to red.

---

## 3. Live-feed endpoints they expose

| Endpoint                                         | Purpose               | Cadence   |
| ------------------------------------------------ | --------------------- | --------- |
| `/api/alerts` (→ `/api2/alerts` on non-TLV colo) | Live active alerts    | 1 s poll  |
| `/api/history`                                   | Today so far          | 10 s poll |
| `/api/day-history?date=YYYY-MM-DD`               | Historical day replay | On demand |
| `/api/analytics`                                 | Visitor count         | 30 s poll |

**Shape of each alert entry:** `{"data":"<locality name HE>","alertDate":"2026-04-15T07:59:00","category_desc":"<Hebrew title>","rid":687154}`.

**Proxy architecture:** `/api` is a Cloudflare Pages Function (preferred for Tel Aviv colo), falls through to a Worker at `/api2` via 303 when colo ≠ TLV. Client detects via `X-CF-Colo` header, pins the session to whichever path succeeds. Re-checks every 5 min. Upstream Pikud URL is never exposed client-side.

---

## 4. Tech stack (for reference, not adoption)

- Vanilla JS (no framework). ~180 KB inlined in one HTML file.
- MapLibre GL JS 4.7.1 + PMTiles 3.2.1 + Protomaps basemaps 5.7.2.
- 72 MB PMTiles archive self-hosted on `tiles.oref-map.org` (Cloudflare R2, range-requested).
- Cloudflare Pages + Pages Functions + Workers + R2.
- PWA with service worker (`/sw.js`, cache `oref-map-v1`, caches alert sound).
- Feature flags via URL params: `?f-log`, `?f-ellipse`, `?f-predict`, `?f-debugapi=<host>`; also CSS-gated via `body.f-<name>`.
- Lazy-loaded extensions: `/ellipse-mode.js` (78 KB, behind `?f-ellipse`), `/prediction-mode.js` (18 KB, menu toggle).

---

## 5. Features we have they don't

- Route-aware filtering classifies each alert as `on_route` / `in_buffer` / `behind_driver` / `off_route` / `too_late` / `driver_off_route` / `unknown_city` against a planned path. Their "driving mode" is only a camera mode.
- Driving simulator harness — replay trips deterministically for testing.
- Driver-relative ETA vs. shelter time — `too_late` decision factors shelter time per region.
- Shelter POI overlay (32 points).
- Google Maps routing engine + traffic.

---

## 6. Our top 3 to build next

Ranked by (impact × feasibility) for a driving-context alert app.

1. **Multi-title classifier + 5-state model + all-clear fade** — `[M]` ~1–3 days. Our current 1-type, 2-state model is wrong for the feed and silently misses UAV, early-warning, and end-of-event. Touches `alertRouteFilter.js`, the real-alert path in `index.html` (~line 4200 area), and the banner/danger UI. Unblocks every downstream feature.
2. **Dual polling (1 s live + 10 s history)** — `[S]` <1 day. Current 3 s + 30 s backoff misses short all-clears. Replace the polling loop + introduce a history-reconcile pass.
3. **Source-direction prediction line** — `[M]` ~1–3 days. Weighted-PCA line fit through centroids of currently-alerting polygons, azimuth-tuned extension. For drivers, knowing "threat came from SSW" is more actionable than a cluster ellipse.

Explicitly **not** top-3: PMTiles basemap swap (large, Google Maps is acceptable); ellipse/cluster mode (optimized for stationary users); R2 long-term history (premature).

---

## 7. Open questions to confirm later

- Is their ellipse probability window (`P(r ≤ R) = 0.99`) actually live, or still proposed in docs?
- Does our polygon set have the same Eilat/Arava gap (south of ~30.6°N)?
- Can we pull `RemainderConfig_heb.json` live for per-locality shelter times instead of hardcoding 5 regional buckets?
- What's the exact upstream Pikud URL their proxy calls? (Server-side, not in their bundle — would require reading the `functions/api/*` in their repo, which we're avoiding per the no-code-porting rule.)

---

## 8. License posture

- **Their repo:** AGPLv3. Copying any of their code would force our POC under AGPLv3 if we ever exposed it over a network.
- **Their `locations_polygons.json`:** carries `© 2026 Maor Conforti … Unauthorized reproduction or redistribution is prohibited.` The underlying polygon geometry derives from public Pikud HaOref / OSM data (not original); the copyright line is on their derivative formatting.
- **Our rule:** read their repo and live site for feature ideas only. Implement ourselves. Don't ship their JSON / icons / sound / screenshots.

---

## 9. Source references

- Live site: `https://oref-map.org/`
- Repo: `https://github.com/maorcc/oref-map`
- Their docs (useful for follow-up, read-only):
  - `docs/architecture.md` — proxy, R2, tiles overview
  - `docs/driving-mode.md` — their driving camera spec
  - `docs/ellipse-feature.md` — cluster/ellipse algorithm
  - `docs/ellipse-probability-window.md` — probability metric
  - `docs/oref-sources.md` — full list of available Pikud endpoints
- Their tile host: `https://tiles.oref-map.org/middle-east.pmtiles` (PMTiles v3, 72 MB)

---

## 10. Official Pikud HaOref alert taxonomy (embedded)

**Decision (2026-04-15):** keep Tzeva Adom as upstream for now — the tradeoff of switching is relatively small, and the cost of a server-side relay isn't justified yet. **However**, we're embedding the official Pikud category taxonomy as a reference so future classification work has an authoritative source instead of substring matching.

**Source:** `https://www.oref.org.il/alerts/alertCategories.json` (HTTP 200, 3.4 KB, **not** geo-blocked — only the live alerts endpoint is). Fetched 2026-04-15.

**Embedded at:** `./alertCategories.json` (repo root; also served by Firebase Hosting at `https://navigation-app-493307.web.app/alertCategories.json`).

**Shape:** flat array of 28 objects: `{id, category, matrix_id, priority, queue}`. Real alerts are ids 1–14; drills are ids 15–28 (note the `matrix_id` offset: drill matrix_id = real matrix_id + 100, e.g. `missilealert`=1, `missilealertdrill`=101).

**Priority ranking (severity, high → low):**
| id | category | priority | Plain-English |
|---:|---|---:|---|
| 3 | `nonconventional` | **180** | CBRN / non-conventional weapon (most severe) |
| 9 | `cbrne` | 170 | Chemical / biological / radiological / nuclear / explosive |
| 10 | `terrorattack` | 160 | Terror attack |
| 12 | `hazmat` | 150 | Hazardous materials |
| 4 | `warning` | 140 | General HFC warning (yellow-tier early warning) |
| 2 | `uav` | 130 | Hostile aircraft / drone |
| 1 | `missilealert` | **120** | Rockets / missiles |
| 8 | `earthquakealert2` | 110 | Earthquake (stronger) |
| 11 | `tsunami` | 100 | Tsunami |
| 7 | `earthquakealert1` | 90 | Earthquake (milder) |
| 13,14 | `update`, `flash` | 0 | Updates / flashes — not alerts |
| 5,6 | `memorialday1/2` | 0 | Memorial-day siren |

**Mapping Tzeva Adom `threat` enum (our current upstream) → Pikud category ids:**
| Tzeva `threat` | Meaning | Pikud `id` | Pikud `category` | Pikud priority |
|---:|---|---:|---|---:|
| 0 | rockets/missiles | 1 | `missilealert` | 120 |
| 1 | hazmat | 12 | `hazmat` | 150 |
| 2 | terror infiltration | 10 | `terrorattack` | 160 |
| 3 | earthquake | 7/8 | `earthquakealert1/2` | 90/110 |
| 4 | tsunami | 11 | `tsunami` | 100 |
| 5 | hostile aircraft (UAV) | 2 | `uav` | 130 |
| 6 | radiological | 9 | `cbrne` | 170 |
| 7 | chemical | 3 or 9 | `nonconventional` / `cbrne` | 180 / 170 |
| 8 | HFC warning | 4 | `warning` | 140 |

**Why embed now (without switching upstream):**
- The priority numbers give us an **authoritative severity ordering** if we ever implement the multi-state / priority-merge feature (vs. oref-map's invented 0/1/2/3 tiers from Hebrew substrings).
- The canonical English category names are stable even when Hebrew title wording drifts.
- Drill detection becomes trivial: any `cat_id` ≥ 15 (or `matrix_id` ≥ 100) is a drill.
- The JSON will also be served from our own Firebase origin, so no CORS / geo concerns when we eventually consume it client-side.

**What we did NOT do here:**
- No switch to Pikud as upstream — still Tzeva Adom.
- No code changes to `alertRouteFilter.js` / `index.html` — the file is purely reference data at this point.
- No server-side relay.
