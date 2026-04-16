'use strict';

const { log } = require('./logger');
const { getOrFetch } = require('./cache');
const { fetchLive } = require('./upstream');
const { rawToNormalized } = require('./normalize');

const LIVE_CACHE_TTL_MS = 900;
const VERSION = require('../package.json').version;
const KNOWN_ERRORS = new Set(['upstream_timeout', 'upstream_error', 'upstream_http_403', 'upstream_http_500', 'upstream_http_502', 'upstream_http_503']);

// Track last successful live fetch for health endpoint
let lastLiveOk = false;
let lastLiveMs = 0;

async function getAlerts(req, res) {
  const fetchedAt = new Date().toISOString();

  try {
    const { data: rawAlerts, fromCache, stale } = await getOrFetch('live', fetchLive, LIVE_CACHE_TTL_MS);
    const alerts = rawToNormalized(rawAlerts);

    lastLiveOk = !stale;
    lastLiveMs = Date.now();

    res.set('Cache-Control', 'public, s-maxage=1, stale-while-revalidate=2');
    res.status(200).json({
      ok: true,
      fetchedAt,
      alerts,
    });
  } catch (err) {
    lastLiveOk = false;

    const errorCode = KNOWN_ERRORS.has(err.message) ? err.message : 'upstream_error';
    log({ severity: 'ERROR', event: 'handler.alerts.fail', errorCode, rawMessage: err.message });

    res.set('Cache-Control', 'public, s-maxage=1, stale-while-revalidate=2');
    res.status(200).json({
      ok: false,
      error: errorCode,
      fetchedAt,
      alerts: [],
    });
  }
}

function getHealth(req, res) {
  res.set('Cache-Control', 'no-store');
  res.status(200).json({
    ok: true,
    version: VERSION,
    upstreamLiveOk: lastLiveOk,
    lastLiveMs,
  });
}

module.exports = { getAlerts, getHealth };
