'use strict';

const crypto = require('crypto');

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';

function timingSafeEqual(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

function checkPassword(input) {
  return timingSafeEqual(input || '', ADMIN_PASSWORD);
}

// Gate for admin pages — redirect to login when not authenticated.
function requireAuth(req, res, next) {
  if (req.session && req.session.isAdmin) return next();
  return res.redirect('/admin/login');
}

// Gate for admin JSON APIs — return 401 instead of redirecting.
function requireAuthApi(req, res, next) {
  if (req.session && req.session.isAdmin) return next();
  return res.status(401).json({ ok: false, error: 'Требуется авторизация' });
}

module.exports = { checkPassword, requireAuth, requireAuthApi, ADMIN_PASSWORD };
