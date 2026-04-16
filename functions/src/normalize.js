'use strict';

const { log } = require('./logger');

// Baked copy of alertCategories.json — 28 entries, ids 1-28.
// Updated manually when Pikud changes their taxonomy (rare — hasn't changed in years).
const categories = require('../categories.json');

// Build lookup: catId (int) → { category, priority }
const catLookup = new Map();
for (const entry of categories) {
  catLookup.set(entry.id, { category: entry.category, priority: entry.priority });
}

// Convert Israel-local datetime string (no offset) to ISO UTC.
// Handles DST correctly: IST (UTC+2, ~Oct–Mar) and IDT (UTC+3, ~Mar–Oct).
function israelLocalToUTC(localDateStr) {
  const utcGuess = new Date(localDateStr + 'Z');
  if (isNaN(utcGuess.getTime())) return new Date().toISOString();
  const israelStr = utcGuess.toLocaleString('en-US', { timeZone: 'Asia/Jerusalem' });
  const israelAsDate = new Date(israelStr);
  const offsetMs = israelAsDate.getTime() - utcGuess.getTime();
  return new Date(utcGuess.getTime() - offsetMs).toISOString();
}

// Assumed raw Pikud shape (from community wrappers, to be confirmed by PIKUD-PROBE-001):
//   { id: "string-numeric", cat: "string-numeric 1-14", title: "Hebrew", desc: "Hebrew", data: ["city1", ...] }
// Shape-drift: if an alert lacks expected fields, log + skip (don't crash life-safety proxy).

function rawToNormalized(rawAlerts) {
  if (!Array.isArray(rawAlerts)) return [];

  const normalized = [];

  for (const raw of rawAlerts) {
    // Parse catId from the string 'cat' field
    const catId = parseInt(raw.cat, 10);
    if (isNaN(catId)) {
      log({ severity: 'WARNING', event: 'normalize.invalid_cat', rawCat: raw.cat, rawId: raw.id });
      continue;
    }

    // Drill filter: catId >= 15 are drills
    if (catId >= 15) continue;

    // Category lookup
    const catInfo = catLookup.get(catId);
    if (!catInfo) {
      log({ severity: 'WARNING', event: 'normalize.unknown_cat', catId, rawId: raw.id });
      continue;
    }

    // Parse cities — Pikud 'data' can be an array of strings or a comma-separated string
    let cities;
    if (Array.isArray(raw.data)) {
      cities = raw.data;
    } else if (typeof raw.data === 'string') {
      cities = raw.data.split(',').map(s => s.trim()).filter(Boolean);
    } else {
      cities = [];
    }
    // Dedupe
    cities = [...new Set(cities)];

    // Timestamp: Pikud alertDate is Asia/Jerusalem local without offset.
    // Convert to UTC correctly, respecting Israel DST (IST=+02, IDT=+03).
    const timestamp = raw.alertDate
      ? israelLocalToUTC(raw.alertDate)
      : new Date().toISOString();

    normalized.push({
      id: String(raw.id || ''),
      rid: parseInt(raw.rid, 10) || 0,
      catId,
      category: catInfo.category,
      categoryHe: raw.title || '',
      priority: catInfo.priority,
      cities,
      timestamp,
      isDrill: false,
    });
  }

  return normalized;
}

module.exports = { rawToNormalized };
