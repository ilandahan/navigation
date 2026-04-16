'use strict';

// Structured logging for Cloud Logging — JSON to stdout.
// Cloud Logging auto-parses JSON lines into structured entries.

function log(obj) {
  console.log(JSON.stringify({
    ...obj,
    timestamp: new Date().toISOString(),
  }));
}

module.exports = { log };
