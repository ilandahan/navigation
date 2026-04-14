# PRD — Pikud HaOref Route-Aware Alert POC

Status: POC (late-prototype / early-MVP) · Owner: Ilan · Last updated: 2026-04-14

---

## Problem

During an Israeli siren event, every driver on the road hears every alert in the country via radio / phone apps. Drivers respond to irrelevant alerts (panic, brake, pull over) or miss the one alert that actually threatens their path. Pikud HaOref publishes the authoritative alert feed at `oref.org.il` but does not answer the question that matters most to a driver: **"Is this alert on my route — and do I have time to reach shelter before the siren hits?"**

---

## User and situation

**Primary user:** An adult driver in Israel, mid-journey, phone mounted in the car.

**Trigger:** A Pikud HaOref alert fires for one or more localities while the driver has an active route.

**What the user needs in ≤3 seconds:**
1. A clear answer — am I in the alert zone, heading into it, or unaffected?
2. If affected — how long until the real siren, and can I reach shelter in time?
3. If in danger — the nearest shelter and a safe re-route away from the polygon.

---

## User story

> *As a driver on a planned route, when a Pikud HaOref alert fires I want to see only the alerts whose danger polygon touches my route and is reachable before the local siren time, so that I can react decisively instead of panicking on every siren in the country.*

---

## Scope (this POC)

In scope:
- Browser app (desktop + mobile web) with Google Maps, live GPS or simulated driving.
- Filter incoming alerts against the driver's remaining route + a 3 km buffer.
- Classify each alert as `on_route` / `in_buffer` / `off_route` / `behind_driver` / `too_late` / `unknown_city` / `driver_off_route`.
- Compute ETA-to-polygon-entry vs. regional siren lead time; add 10 s safety margin.
- On danger: propose an escape route; otherwise show nearest shelter.
- Phone-handoff: generate a Google Maps directions link or an SMS/mailto payload.
- Live-location sharing from a signed-in driver (Google Sign-In) to any device holding the share URL, via Firebase Firestore (`/shares/{uid}`).

Out of scope (this POC):
- Authenticated sessions, server-side state, persistence across devices.
- Push notifications, background service workers.
- Production-grade siren-lead-time table per Pikud HaOref polygon.
- Shelter inventory beyond the 32 seed entries in `shelters.json`.
- Cross-browser exhaustive testing (Chrome desktop + Chrome mobile only).

---

## Success metrics

POC is successful when all of the following hold on the Tel Aviv ↔ Haifa demo route:

| Metric | Target | How measured |
|---|---|---|
| False-positive rate | < 5% | Alerts fired in sim for off-route cities must not banner as relevant. |
| False-negative rate | **0 in critical zones** | A `too_late` alert on-route MUST still be shown — never hidden. |
| Time from alert fire → banner | < 1 s | `processIncomingAlert` → `fireAlert` measured in console. |
| Unknown-region surfacing | 100% | Any alert for a city missing from `shelterTimeConstants` lookup surfaces a warning banner; never silently defaults. |
| Escape-route failure | Never silent | Errors in `computeEscapeRoutes` degrade to the shelter panel with a visible toast, per SAFETY-NO-FALLBACKS-001. |

---

## Non-negotiable safety posture

Inherited from `.aid/qa/SAFETY-NO-FALLBACKS-001.yaml` and enforced in code review:

1. **No silent fallbacks.** If a dependency is missing (filter lib, polygon, shelter time, driver speed, route shape) the code surfaces via `setFeedStatus('warn'|'error', ...)` or throws — never continues with a plausible-looking default.
2. **Loud failure over best-guess.** A missed alert is worse than an extra banner. Classification errs toward showing the alert.
3. **One canonical feed-status surface.** `#feed-status-banner` carries every warn/error the driver needs to see.
4. **Every classification has a verdict reason.** The filter never collapses a data gap into `off_route` or `in_time`.

---

## Authoritative data sources

| Data | Source | File |
|---|---|---|
| Alert feed (live mode) | `https://www.oref.org.il/warningMessages/alert/Alerts.json` + history endpoint | polled every 3 s, `index.html` real-feed section |
| Alert city polygons | Pikud HaOref city layer + community geo-data | `locations_polygons.json` (771 KB, 771 entries) built by `download-polygons.js` |
| Regional siren lead time | Pikud HaOref public shelter-time guidance; regional buckets keyed on Hebrew city-name substrings (longest-match-wins) | `shelterTimeConstants.js` |
| Shelter inventory | Curated for the POC corridor | `shelters.json` (32 entries) |

**Known gap:** the regional siren-time table is a POC approximation. A production deployment MUST replace it with the authoritative per-polygon mapping published by Pikud HaOref. Unknown cities now return `null` (surfaced as "ALERT SHELTER-TIME UNKNOWN") instead of silently defaulting to 60 s.

---

## Open risks (to be promoted to issues before shipping)

1. **POC-scale shelter data.** 32 shelters cover the demo corridor; national coverage is a prerequisite for any production use.
2. **Google Maps API cost.** Every route recalculation calls the Routes API; an always-on live-mode session burns quota quickly.
3. **Firestore free-tier caps.** 50 k reads + 20 k writes/day. Driver pushes every 2 s while active ⇒ roughly 5 active driver-hours/day before writes exceed the free tier. Add a write-coalescing step (only push on meaningful position delta) before growing past ~50 daily-active drivers.
4. **Share URL = bearer token.** Anyone holding the `?uid=<uid>` URL can watch the driver live. Matches the WhatsApp/Waze-live-location threat model; no follower list in v1. Private mode is a rule + subcollection change later, not a schema overhaul.
5. **No CI, no git history** (as of 2026-04-14). See section 9 of `docs/research/evaluation-2026-04-14.md`.
6. **Integration-test gap.** ~80% of `alertRouteFilter.js` is covered; integration paths inside `index.html` (simStep, processIncomingAlert, fireAlert) are only exercised via the browser harness.
