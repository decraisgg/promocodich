'use strict';

// Resolves where persistent data lives. On Amvera the persistent disk is
// mounted at /data (see amvera.yml `persistenceMount: /data`); anything written
// outside that mount is wiped on every restart/redeploy. We therefore keep the
// SQLite database and all uploaded files under the persistent directory.
//
// Resolution order:
//   1. DATA_DIR env var (explicit override)
//   2. /data  — the Amvera persistent mount, when present
//   3. <project>/data — local development fallback

const fs = require('fs');
const path = require('path');

function resolveBase() {
  if (process.env.DATA_DIR) return process.env.DATA_DIR;
  try {
    if (fs.existsSync('/data') && fs.statSync('/data').isDirectory()) return '/data';
  } catch (_) { /* ignore */ }
  return path.join(__dirname, '..', 'data');
}

const DATA_DIR = resolveBase();
const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');
const DB_PATH = path.join(DATA_DIR, 'promocodich.db');

try { fs.mkdirSync(DATA_DIR, { recursive: true }); } catch (_) { /* ignore */ }
try { fs.mkdirSync(UPLOADS_DIR, { recursive: true }); } catch (_) { /* ignore */ }

module.exports = { DATA_DIR, UPLOADS_DIR, DB_PATH };
