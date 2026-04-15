// Offline regression tests for formatters.js — humanizeDirectionsError,
// formatDuration, formatDistance, escapeHtml, summarizeRouteVia.
// Run with: node tests/formatters.test.js

const fs = require('fs');
const path = require('path');

const win = {};
function loadInto(win, file) {
  const src = fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
  new Function('window', 'global', src)(win, win);
}
loadInto(win, 'formatters.js');

let pass = 0, fail = 0;
function eq(actual, expected, name) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) { pass++; console.log(`  PASS: ${name}`); }
  else { fail++; console.log(`  FAIL: ${name}\n    got:  ${a}\n    want: ${e}`); }
}

const { humanizeDirectionsError, formatDuration, formatDistance, escapeHtml, summarizeRouteVia } = win.Formatters;

console.log('\nFormatters — module export shape:');
eq(typeof win.Formatters,        'object',   'window.Formatters is an object');
eq(typeof humanizeDirectionsError, 'function', 'humanizeDirectionsError is a function');
eq(typeof formatDuration,          'function', 'formatDuration is a function');
eq(typeof formatDistance,          'function', 'formatDistance is a function');
eq(typeof escapeHtml,              'function', 'escapeHtml is a function');
eq(typeof summarizeRouteVia,       'function', 'summarizeRouteVia is a function');

const O = { name: 'Rishon LeZion' };
const D = { name: 'Kiryat Ata' };

console.log('\nhumanizeDirectionsError — branch coverage:');
eq(
  humanizeDirectionsError({ message: 'ZERO_RESULTS' }, O, D),
  'No driving route found between "Rishon LeZion" and "Kiryat Ata". One of them may be off-road (water, park, etc.) — try picking a nearby city, street, or landmark.',
  'ZERO_RESULTS branch returns no-route copy with both names'
);
eq(
  humanizeDirectionsError({ code: 'ZERO_RESULTS' }, O, D),
  'No driving route found between "Rishon LeZion" and "Kiryat Ata". One of them may be off-road (water, park, etc.) — try picking a nearby city, street, or landmark.',
  'ZERO_RESULTS via .code field also matched'
);
eq(
  humanizeDirectionsError({ message: 'NOT_FOUND' }, O, D),
  'One of the locations could not be geocoded. Try a more specific address.',
  'NOT_FOUND branch'
);
eq(
  humanizeDirectionsError({ message: 'OVER_QUERY_LIMIT' }, O, D),
  'Map service temporarily unavailable — please try again in a moment.',
  'OVER_QUERY_LIMIT branch'
);
eq(
  humanizeDirectionsError({ message: 'REQUEST_DENIED' }, O, D),
  'Map service temporarily unavailable — please try again in a moment.',
  'REQUEST_DENIED branch (shares the same regex)'
);
eq(
  humanizeDirectionsError({ message: 'Some random failure' }, O, D),
  'Route calculation failed: Some random failure',
  'default branch with .message'
);
eq(
  humanizeDirectionsError({ code: 'NETWORK_ERR' }, O, D),
  'Route calculation failed: NETWORK_ERR',
  'default branch with .code only'
);
eq(
  humanizeDirectionsError({}, O, D),
  'Route calculation failed: unknown',
  'default branch with empty err → unknown'
);

console.log('\nhumanizeDirectionsError — missing origin/destination names:');
eq(
  humanizeDirectionsError({ message: 'ZERO_RESULTS' }, null, null),
  'No driving route found between "origin" and "destination". One of them may be off-road (water, park, etc.) — try picking a nearby city, street, or landmark.',
  'null origin/destination → fallback labels'
);
eq(
  humanizeDirectionsError({ message: 'ZERO_RESULTS' }, {}, {}),
  'No driving route found between "origin" and "destination". One of them may be off-road (water, park, etc.) — try picking a nearby city, street, or landmark.',
  'origin/destination without .name → fallback labels'
);

console.log('\nhumanizeDirectionsError — case-insensitive regex match:');
eq(
  humanizeDirectionsError({ message: 'zero_results' }, O, D).startsWith('No driving route found'),
  true,
  'lowercase ZERO_RESULTS matches (regex /i)'
);

console.log('\nformatDuration — boundary coverage:');
eq(formatDuration(0),    '0m',     '0 seconds → "0m"');
eq(formatDuration(30),   '1m',     '30 seconds → "1m" (rounds up)');
eq(formatDuration(59),   '1m',     '59 seconds → "1m" (Math.round of 0.98)');
eq(formatDuration(60),   '1m',     '60 seconds → "1m"');
eq(formatDuration(150),  '3m',     '150 seconds → "3m" (Math.round of 2.5 = 3)');
// 3599s: h = floor(3599/3600) = 0; m = round(3599/60) = round(59.98) = 60.
// Since h === 0, output is "${m}m" = "60m" — a known display quirk preserved
// from the inline original. Pinning it down so future refactors don't drift.
eq(formatDuration(3599), '60m',    '3599s → "60m" (h=0 falls into else; m rounded to 60 — quirk preserved)');
eq(formatDuration(3600), '1h 0m',  'exactly 1 hour → "1h 0m"');
eq(formatDuration(3660), '1h 1m',  '1h 1m');
eq(formatDuration(7200), '2h 0m',  'exactly 2 hours → "2h 0m"');
eq(formatDuration(7320), '2h 2m',  '2h 2m');

console.log('\nformatDistance — boundary coverage:');
eq(formatDistance(0),       '0 m',     '0 meters');
eq(formatDistance(1),       '1 m',     '1 meter');
eq(formatDistance(500),     '500 m',   '500 m (under 1km)');
eq(formatDistance(999),     '999 m',   '999 m (just under 1km)');
eq(formatDistance(999.5),   '1000 m',  '999.5 m → 1000 m (rounds up but still < 1000 raw, so "m" branch)');
eq(formatDistance(1000),    '1.0 km',  'exactly 1000 m → "1.0 km" (>= 1000 branch)');
eq(formatDistance(1500),    '1.5 km',  '1500 m → "1.5 km"');
eq(formatDistance(12345),   '12.3 km', '12345 m → "12.3 km" (toFixed(1))');
eq(formatDistance(99999),   '100.0 km','99999 m → "100.0 km"');

console.log('\nescapeHtml — entity coverage:');
eq(escapeHtml('hello'),                  'hello',                                        'plain text passes through');
eq(escapeHtml('<script>'),                '&lt;script&gt;',                                 '< and > escaped');
eq(escapeHtml('Tom & Jerry'),             'Tom &amp; Jerry',                                '& escaped');
eq(escapeHtml('"quoted"'),                '&quot;quoted&quot;',                             'double-quote escaped');
eq(escapeHtml("it's"),                    'it&#39;s',                                       'single-quote escaped');
eq(escapeHtml(`<a href="x" title='y'>z</a>`), '&lt;a href=&quot;x&quot; title=&#39;y&#39;&gt;z&lt;/a&gt;', 'all 5 entities together');
eq(escapeHtml(null),                      '',                                               'null → empty string');
eq(escapeHtml(undefined),                 '',                                               'undefined → empty string');
eq(escapeHtml(0),                         '0',                                              'numeric 0 → "0" (not empty — only null/undefined)');
eq(escapeHtml(''),                        '',                                               'empty string passes through');

console.log('\nsummarizeRouteVia — happy path + fallbacks:');
eq(summarizeRouteVia({ summary: 'Highway 6', legs: [] }), 'Highway 6', 'route.summary preferred when present');
eq(
  summarizeRouteVia({
    summary: '',
    legs: [{ steps: [
      { distance: { value: 100 }, instructions: 'Turn left on Foo St' },
      { distance: { value: 5000 }, instructions: 'Continue on <b>Highway 1</b>' },
      { distance: { value: 200 }, instructions: 'Exit right' }
    ] }]
  }),
  'Continue on Highway 1',
  'fallback: longest step wins; HTML stripped'
);
eq(
  summarizeRouteVia({
    legs: [{ steps: [
      { distance: { value: 9999 }, instructions: 'A very long instruction string that exceeds forty characters indeed' }
    ] }]
  }),
  'A very long instruction string that exce…',
  'fallback truncated at 40 chars + ellipsis'
);
eq(summarizeRouteVia({ legs: [] }), null, 'empty legs → null (no summary, no fallback)');
eq(summarizeRouteVia({ summary: '', legs: [{ steps: [] }] }), null, 'leg with no steps → null');
eq(summarizeRouteVia({ summary: '', legs: [{ steps: [{ distance: null, instructions: 'X' }] }] }), null, 'step with no distance → 0 length, never beats bestLen, returns null');
eq(summarizeRouteVia(null), null, 'null route → null');

console.log(`\n${pass}/${pass + fail} tests passed`);
if (fail > 0) process.exit(1);
