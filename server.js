'use strict';

const path = require('path');
const crypto = require('crypto');
const express = require('express');
const session = require('express-session');

const { getSetting, setSetting } = require('./src/db');
const { publish } = require('./src/publish');
const publicRoutes = require('./src/routes/public');
const adminRoutes = require('./src/routes/admin');
const { ADMIN_PASSWORD } = require('./src/auth');

// On the very first run there is no published snapshot yet — publish the
// seeded content once so the public site always serves from a real snapshot
// and the draft/publish workflow applies from the first edit onward.
if (!getSetting('published_snapshot', '')) {
  publish();
}

const app = express();
const PORT = process.env.PORT || 3000;

// Views
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Static assets
app.use('/static', express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Body parsing
app.use(express.urlencoded({ extended: true, limit: '2mb' }));
app.use(express.json({ limit: '2mb' }));

// Sessions (secret persisted in DB so logins survive restarts)
let secret = getSetting('session_secret', '');
if (!secret) {
  secret = crypto.randomBytes(32).toString('hex');
  setSetting('session_secret', secret);
}
app.use(session({
  secret,
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: 'lax', maxAge: 1000 * 60 * 60 * 24 * 7 },
}));

// Make a few helpers available to all views
app.use((req, res, next) => {
  res.locals.currentYear = new Date().getFullYear();
  res.locals.currentPath = req.path;
  next();
});

// Routes
app.use('/admin', adminRoutes);
app.use('/', publicRoutes);

// 404
app.use((req, res) => {
  res.status(404).render('public/404', {
    site: { site_title: getSetting('site_title', 'ПРОМОКОДЫЧ') },
    categories: [],
    popups: [],
    page: '',
  });
});

// Error handler
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).send('Внутренняя ошибка сервера');
});

app.listen(PORT, () => {
  console.log('======================================================');
  console.log('  ПРОМОКОДЫЧ запущен');
  console.log(`  Сайт:        http://localhost:${PORT}/`);
  console.log(`  Админка:     http://localhost:${PORT}/admin`);
  console.log(`  Пароль:      ${ADMIN_PASSWORD}  (меняется через ADMIN_PASSWORD)`);
  console.log('======================================================');
});
