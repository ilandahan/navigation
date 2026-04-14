// Pikud HaOref per-region pre-alert lead times (seconds between alert fire
// and the real siren). Values are public Pikud HaOref shelter times; see
// https://www.oref.org.il and community projects in project memory.
// POC-scope: approximate regional buckets keyed by substring of the
// Hebrew city label used in locations_polygons.json. Production deployment
// needs the authoritative per-polygon table.

(function (global) {
  'use strict';

  // Longest-match-wins lookup. No global default: unknown cities return
  // null so the caller can SURFACE the data gap instead of silently
  // classifying (e.g.) a 15s Gaza-envelope locality with a 60s bucket.
  // Picking longest-matching substring removes the old first-match ordering
  // hazard — a maintainer appending a rule at the bottom can no longer
  // silently shift a city into a longer-lead-time bucket. Example:
  //   'קריית שמונה' (11 chars, 30s) beats 'קריית' (5 chars, 60s) regardless
  //   of rule order, because the longer match wins.
  const RULES = [
    // Gaza envelope — 15 seconds
    { seconds: 15, patterns: ['שדרות', 'נתיבות', 'אופקים', 'שער הנגב', 'שדות נגב',
      'אשכול', 'חוף אשקלון', 'שפיר', 'לכיש', 'בני שמעון', 'מרחבים',
      'נתיב העשרה', 'יד מרדכי', 'זיקים', 'כרם שלום', 'כיסופים', 'נירים',
      'עין השלושה', 'ניר עוז', 'מגן', 'רעים', 'בארי', 'כפר עזה'] },

    // Ashkelon, Ashdod corridor — 45 seconds
    { seconds: 45, patterns: ['אשקלון', 'אשדוד', 'קריית גת', 'יבנה', 'גדרה',
      'רחובות', 'נס ציונה', 'גן יבנה'] },

    // Far south / Beer Sheva / Arava — 60 seconds (depending on subregion)
    { seconds: 60, patterns: ['באר שבע', 'דימונה', 'ערד', 'ירוחם', 'מצפה רמון',
      'אילת'] },

    // Northern border / Galilee / Golan — 30 seconds (rocket from Lebanon)
    { seconds: 30, patterns: ['קריית שמונה', 'מטולה', 'כפר גלעדי', 'מעלות',
      'שלומי', 'נהריה', 'רמת הגולן', 'קצרין', 'מעלה גליל', 'גליל עליון',
      'גליל תחתון', 'מרום גליל', 'מבואות החרמון'] },

    // Haifa bay / northern coast — 60 seconds
    { seconds: 60, patterns: ['חיפה', 'קריית', 'עכו', 'כרמיאל', 'זכרון יעקב',
      'בנימינה', 'פרדס חנה', 'אור עקיבא', 'קיסריה', 'חדרה'] },

    // Jerusalem + Judea/Samaria
    { seconds: 90, patterns: ['ירושלים', 'גוש עציון', 'מעלה אדומים', 'מודיעין',
      'בית שמש'] },

    // Central Israel (default urban belt) — 90 seconds
    { seconds: 90, patterns: ['תל אביב', 'גוש דן', 'רמת גן', 'גבעתיים', 'בני ברק',
      'פתח תקווה', 'ראשון לציון', 'חולון', 'בת ים', 'לוד', 'רמלה',
      'כפר סבא', 'רעננה', 'הרצליה', 'נתניה', 'כפר יונה', 'פרדסיה'] }
  ];

  // Returns the regional shelter lead time in seconds for `cityName`, or
  // null when no rule matches. Callers MUST NOT silently substitute a
  // default — they must surface the data gap to the driver.
  function shelterSecondsFor(cityName) {
    if (!cityName || typeof cityName !== 'string') return null;
    let bestSeconds = null;
    let bestLen = 0;
    for (const rule of RULES) {
      for (const p of rule.patterns) {
        if (p.length > bestLen && cityName.indexOf(p) !== -1) {
          bestLen = p.length;
          bestSeconds = rule.seconds;
        }
      }
    }
    return bestSeconds;
  }

  global.ShelterTime = {
    shelterSecondsFor,
    _rules: RULES
  };
})(typeof window !== 'undefined' ? window : globalThis);
