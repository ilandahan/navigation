'use strict';

const { log } = require('./logger');

const LIVE_URL = 'https://www.oref.org.il/WarningMessages/alert/alerts.json';
const LIVE_TIMEOUT_MS = 2500;

const HEADERS = {
  'Referer': 'https://www.oref.org.il/',
  'X-Requested-With': 'XMLHttpRequest',
  'User-Agent': 'Mozilla/5.0 (compatible; WazePocAlerts/0.1; +https://navigation-app-493307.web.app)',
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'he-IL,he;q=0.9,en;q=0.8',
};

// UTF-8 BOM: 0xEF 0xBB 0xBF
function stripBom(buf) {
  if (buf.length >= 3 && buf[0] === 0xEF && buf[1] === 0xBB && buf[2] === 0xBF) {
    return buf.slice(3);
  }
  return buf;
}

async function fetchLive() {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), LIVE_TIMEOUT_MS);
  const startedAt = Date.now();

  try {
    const res = await fetch(LIVE_URL, { headers: HEADERS, signal: controller.signal });
    const fetchMs = Date.now() - startedAt;

    if (!res.ok) {
      log({ severity: 'WARNING', event: 'upstream.live.fail', status: res.status, fetchMs });
      throw new Error(`upstream_http_${res.status}`);
    }

    const ab = await res.arrayBuffer();
    const buf = stripBom(Buffer.from(ab));

    // Pikud returns empty string "" when no active alerts (not "[]")
    const text = buf.toString('utf8').trim();
    if (!text) {
      log({ severity: 'INFO', event: 'upstream.live.empty', fetchMs });
      return [];
    }

    const parsed = JSON.parse(text);
    const alerts = Array.isArray(parsed) ? parsed : [];

    log({ severity: 'INFO', event: 'upstream.live.ok', status: res.status, alertCount: alerts.length, fetchMs });
    return alerts;
  } catch (err) {
    const fetchMs = Date.now() - startedAt;
    if (err.name === 'AbortError') {
      log({ severity: 'WARNING', event: 'upstream.live.timeout', fetchMs });
      throw new Error('upstream_timeout');
    }
    if (err.message && err.message.startsWith('upstream_http_')) {
      throw err;
    }
    log({ severity: 'ERROR', event: 'upstream.live.error', errorName: err.name, errorMessage: err.message, fetchMs });
    throw new Error('upstream_error');
  } finally {
    clearTimeout(timeoutId);
  }
}

module.exports = { fetchLive };
