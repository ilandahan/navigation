'use strict';

// Pikud HaOref alert proxy — Firebase Cloud Function (2nd-gen, me-west1).
// Fetches live alerts from oref.org.il, normalizes, serves from same origin
// via Hosting rewrite (/api/** → this function). No external dependencies
// beyond firebase-functions.

const { onRequest } = require('firebase-functions/v2/https');
const { getAlerts, getHealth } = require('./src/handlers');

exports.api = onRequest(
  {
    region: 'me-west1',
    cpu: 1,
    memory: '256MiB',
    maxInstances: 10,
  },
  async (req, res) => {
    // Simple path router — no Express overhead
    switch (req.path) {
      case '/api/alerts':
        return getAlerts(req, res);
      case '/api/health':
        return getHealth(req, res);
      default:
        res.status(404).json({ error: 'not_found' });
    }
  }
);
