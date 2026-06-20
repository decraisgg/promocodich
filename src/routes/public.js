'use strict';

const express = require('express');
const { db } = require('../db');
const { getPublishedSnapshot } = require('../publish');

const router = express.Router();

// Shared locals for every public page (header/footer/popups).
function baseLocals(snapshot) {
  return {
    site: snapshot.settings || {},
    categories: snapshot.categories || [],
    services: snapshot.services || [],
    popups: snapshot.popups || [],
  };
}

// Known home-page content sections and their default order.
const HOME_SECTIONS = ['promocodes', 'sites', 'articles'];
function parseHomeSections(raw) {
  const requested = String(raw || '')
    .split(',')
    .map((s) => s.trim())
    .filter((s) => HOME_SECTIONS.includes(s));
  // De-duplicate, then append any known sections that were omitted.
  const seen = new Set();
  const order = [];
  for (const s of requested) if (!seen.has(s)) { seen.add(s); order.push(s); }
  for (const s of HOME_SECTIONS) if (!seen.has(s)) order.push(s);
  return order;
}

router.get('/', (req, res) => {
  const snap = getPublishedSnapshot();
  const allBanners = snap.banners || [];
  // Global banners: service_id is null/0/falsy
  const globalBanners = allBanners.filter((b) => !b.service_id);
  const bigBanner = globalBanners.find((b) => b.size === 'big') || null;
  const smallBanners = globalBanners.filter((b) => b.size === 'small').slice(0, 2);
  const latestArticles = (snap.articles || []).slice(0, 6);
  // Global promos: no service_id
  const globalPromos = (snap.promocodes || []).filter((p) => !p.service_id);

  res.render('public/home', {
    ...baseLocals(snap),
    page: 'home',
    bigBanner,
    smallBanners,
    promocodes: globalPromos,
    latestArticles,
    homeSections: parseHomeSections((snap.settings || {}).home_sections),
  });
});

router.get('/articles', (req, res) => {
  const snap = getPublishedSnapshot();
  const all = snap.articles || [];
  const activeCategory = req.query.category || '';
  const list = activeCategory ? all.filter((a) => a.category === activeCategory) : all;

  res.render('public/articles', {
    ...baseLocals(snap),
    page: 'articles',
    articles: list,
    activeCategory,
  });
});

router.get('/articles/:slug', (req, res) => {
  const snap = getPublishedSnapshot();
  const article = (snap.articles || []).find((a) => a.slug === req.params.slug);
  if (!article) {
    return res.status(404).render('public/404', {
      ...baseLocals(snap),
      page: 'articles',
    });
  }
  const related = (snap.articles || [])
    .filter((a) => a.category === article.category && a.slug !== article.slug)
    .slice(0, 3);

  res.render('public/article', {
    ...baseLocals(snap),
    page: 'articles',
    article,
    related,
  });
});

// --- Services -----------------------------------------------------------
router.get('/services', (req, res) => {
  const snap = getPublishedSnapshot();
  res.render('public/services', {
    ...baseLocals(snap),
    page: 'services',
    services: snap.services || [],
  });
});

router.get('/services/:slug', (req, res) => {
  const snap = getPublishedSnapshot();
  const service = (snap.services || []).find((s) => s.slug === req.params.slug);
  if (!service) {
    return res.status(404).render('public/404', {
      ...baseLocals(snap),
      page: 'services',
    });
  }

  const serviceBanners = (snap.banners || []).filter((b) => b.service_id === service.id);
  const bigBanner = serviceBanners.find((b) => b.size === 'big') || null;
  const smallBanners = serviceBanners.filter((b) => b.size === 'small').slice(0, 2);
  const servicePromos = (snap.promocodes || []).filter((p) => p.service_id === service.id);

  res.render('public/service', {
    ...baseLocals(snap),
    page: 'services',
    service,
    bigBanner,
    smallBanners,
    promocodes: servicePromos,
  });
});

// --- Giveaways ----------------------------------------------------------
router.get('/giveaways', (req, res) => {
  const snap = getPublishedSnapshot();
  const giveaways = snap.giveaways || [];

  // Attach entry counts (live from DB)
  const withCounts = giveaways.map((g) => {
    const row = db.prepare('SELECT COUNT(*) AS c FROM giveaway_entries WHERE giveaway_id = ?').get(g.id);
    return { ...g, entryCount: row ? row.c : 0 };
  });

  res.render('public/giveaways', {
    ...baseLocals(snap),
    page: 'giveaways',
    giveaways: withCounts,
  });
});

router.get('/giveaways/:slug', (req, res) => {
  const snap = getPublishedSnapshot();
  const giveaway = (snap.giveaways || []).find((g) => g.slug === req.params.slug);
  if (!giveaway) {
    return res.status(404).render('public/404', {
      ...baseLocals(snap),
      page: 'giveaways',
    });
  }

  const entryRow = db.prepare('SELECT COUNT(*) AS c FROM giveaway_entries WHERE giveaway_id = ?').get(giveaway.id);
  const entryCount = entryRow ? entryRow.c : 0;

  // Check if current session already joined
  const sessionEntry = req.sessionID
    ? db.prepare('SELECT id FROM giveaway_entries WHERE giveaway_id = ? AND session_id = ?').get(giveaway.id, req.sessionID)
    : null;
  const alreadyJoined = !!sessionEntry;

  const joined = req.session._giveawayJoined || null;
  delete req.session._giveawayJoined;

  res.render('public/giveaway', {
    ...baseLocals(snap),
    page: 'giveaways',
    giveaway,
    entryCount,
    alreadyJoined,
    justJoined: joined === giveaway.slug,
  });
});

router.post('/giveaways/:slug/join', (req, res) => {
  const snap = getPublishedSnapshot();
  const giveaway = (snap.giveaways || []).find((g) => g.slug === req.params.slug);
  if (!giveaway) return res.redirect('/giveaways');

  if (req.sessionID) {
    try {
      db.prepare('INSERT OR IGNORE INTO giveaway_entries (giveaway_id, session_id) VALUES (?, ?)').run(giveaway.id, req.sessionID);
    } catch (_) { /* ignore duplicate */ }
    req.session._giveawayJoined = giveaway.slug;
  }

  res.redirect(`/giveaways/${giveaway.slug}`);
});

// --- Contacts -----------------------------------------------------------
router.get('/contacts', (req, res) => {
  const snap = getPublishedSnapshot();
  res.render('public/contacts', {
    ...baseLocals(snap),
    page: 'contacts',
  });
});

module.exports = router;
