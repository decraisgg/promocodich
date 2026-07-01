'use strict';

const { db, getSetting, setSetting, CATEGORIES, CATEGORY_TITLES, getRatingCategories, getRatingCategoryTitles } = require('./db');

// Build a complete snapshot of the public-facing site from the DB (draft state).
function buildSnapshot() {
  const settingsRows = db.prepare('SELECT key, value FROM settings').all();
  const settings = {};
  for (const r of settingsRows) settings[r.key] = r.value;
  // Internal keys that should never reach the public snapshot.
  for (const k of ['published_snapshot', 'session_secret', 'seeded', 'dirty', 'last_published_at']) {
    delete settings[k];
  }

  const services = db
    .prepare('SELECT * FROM services WHERE enabled = 1 ORDER BY sort_order, id')
    .all();

  const banners = db
    .prepare('SELECT * FROM banners WHERE enabled = 1 ORDER BY sort_order, id')
    .all();

  const promocodes = db
    .prepare('SELECT * FROM promocodes WHERE enabled = 1 ORDER BY sort_order, id')
    .all();

  const articlesRaw = db
    .prepare('SELECT * FROM articles WHERE enabled = 1 ORDER BY sort_order, datetime(created_at) DESC, id DESC')
    .all();
  const articles = articlesRaw.map((a) => {
    let blocks = [];
    try { blocks = JSON.parse(a.blocks || '[]'); } catch (_) { blocks = []; }
    return { ...a, blocks, categoryTitle: CATEGORY_TITLES[a.category] || a.category };
  });

  const popups = db
    .prepare('SELECT * FROM popups WHERE enabled = 1 ORDER BY sort_order, id')
    .all();

  const inlineBanners = db
    .prepare('SELECT * FROM inline_banners WHERE enabled = 1 ORDER BY sort_order, id')
    .all();

  const giveawaysRaw = db
    .prepare('SELECT * FROM giveaways WHERE enabled = 1 ORDER BY sort_order, id')
    .all();
  const giveaways = giveawaysRaw.map((g) => {
    let conditions = [];
    try { conditions = JSON.parse(g.conditions || '[]'); } catch (_) { conditions = []; }
    return { ...g, conditions };
  });

  const ratingCategoryTitles = getRatingCategoryTitles();
  const ratingsRaw = db
    .prepare('SELECT * FROM ratings WHERE enabled = 1 ORDER BY featured DESC, sort_order, rating DESC, id')
    .all();
  const ratings = ratingsRaw.map((r) => {
    let blocks = []; let pros = []; let cons = [];
    try { blocks = JSON.parse(r.blocks || '[]'); } catch (_) { blocks = []; }
    try { pros = JSON.parse(r.pros || '[]'); } catch (_) { pros = []; }
    try { cons = JSON.parse(r.cons || '[]'); } catch (_) { cons = []; }
    return { ...r, blocks, pros, cons, categoryTitle: ratingCategoryTitles[r.category] || r.category };
  });

  // Per-page SEO keyed by page id for quick lookup on the public site.
  const pageSeo = {};
  for (const row of db.prepare('SELECT * FROM page_seo').all()) {
    pageSeo[row.page] = row;
  }

  return {
    settings,
    services,
    banners,
    inlineBanners,
    promocodes,
    articles,
    popups,
    giveaways,
    ratings,
    pageSeo,
    categories: CATEGORIES,
    ratingCategories: getRatingCategories(),
    publishedAt: new Date().toISOString(),
  };
}

// Publish: persist the current snapshot and clear the dirty flag.
function publish() {
  const snapshot = buildSnapshot();
  setSetting('published_snapshot', JSON.stringify(snapshot));
  setSetting('last_published_at', snapshot.publishedAt);
  setSetting('dirty', '0');
  return snapshot;
}

// Return the live (published) snapshot for the public site.
// Falls back to a freshly built snapshot if nothing has been published yet.
function getPublishedSnapshot() {
  const raw = getSetting('published_snapshot', '');
  if (raw) {
    try { return JSON.parse(raw); } catch (_) { /* fall through */ }
  }
  return buildSnapshot();
}

module.exports = { buildSnapshot, publish, getPublishedSnapshot };
