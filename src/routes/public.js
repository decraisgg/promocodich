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

// Base origin for canonical URLs / sitemap. Prefers the admin-configured
// canonical host; falls back to the current request origin.
function baseUrl(snap, req) {
  const host = String((snap.settings || {}).seo_canonical_host || '').trim().replace(/\/+$/, '');
  if (host) return host;
  return req.protocol + '://' + req.get('host');
}

// Build the per-page SEO object consumed by the header partial.
function seoFor(snap, req, opts = {}) {
  const st = snap.settings || {};
  const ps = (snap.pageSeo || {})[opts.pageKey] || {};
  const siteTitle = st.site_title || 'ПРОМОКОДЫЧ';
  const suffix = st.seo_title_suffix || '';

  let title = String(opts.title || ps.title || '').trim();
  if (!title) {
    title = String(opts.defaultTitle || siteTitle).trim();
    if (suffix && opts.appendSuffix !== false) title += suffix;
  }

  const description = String(
    opts.description || ps.description || st.seo_default_description || st.tagline || ''
  ).trim();
  const keywords = String(ps.keywords || st.seo_default_keywords || '').trim();
  const ogImage = String(opts.image || ps.og_image || st.seo_og_image || '').trim();

  const noindex = opts.noindex != null
    ? !!opts.noindex
    : (String(ps.noindex) === '1' || String(st.seo_noindex) === '1');

  const base = baseUrl(snap, req);
  const path = opts.path || req.path || '/';
  const ogImageAbs = ogImage
    ? (/^https?:\/\//.test(ogImage) ? ogImage : base + ogImage)
    : '';

  return {
    title,
    description,
    keywords,
    ogImage,
    ogImageAbs,
    ogType: opts.type || 'website',
    canonical: base + path,
    noindex,
    yandexVerification: st.seo_yandex_verification || '',
    googleVerification: st.seo_google_verification || '',
    siteName: siteTitle,
  };
}

// Editable home-page section headings.
function sectionHeadings(st) {
  return {
    promocodes: {
      title: st.sec_promocodes_title || 'Актуальные промокоды и бонусы',
      sub: st.sec_promocodes_sub || 'Активируй коды и получай скидки на любимых цифровых сервисах',
    },
    sites: { title: st.sec_sites_title || 'Популярные сайты' },
    articles: { title: st.sec_articles_title || 'Последние статьи' },
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
  const st = snap.settings || {};
  const allBanners = snap.banners || [];
  // Global banners: service_id is null/0/falsy
  const globalBanners = allBanners.filter((b) => !b.service_id);
  const bigBanner = globalBanners.find((b) => b.size === 'big') || null;
  const smallBanners = globalBanners.filter((b) => b.size === 'small').slice(0, 2);
  const latestArticles = (snap.articles || []).slice(0, 6);
  // Global promos: no service_id
  const globalPromos = (snap.promocodes || []).filter((p) => !p.service_id);

  const defaultTitle = (st.site_title || 'ПРОМОКОДЫЧ') + (st.tagline ? ' — ' + st.tagline : '');

  res.render('public/home', {
    ...baseLocals(snap),
    page: 'home',
    bigBanner,
    smallBanners,
    promocodes: globalPromos,
    latestArticles,
    homeSections: parseHomeSections(st.home_sections),
    sections: sectionHeadings(st),
    seo: seoFor(snap, req, { pageKey: 'home', defaultTitle, appendSuffix: false, path: '/' }),
  });
});

router.get('/articles', (req, res) => {
  const snap = getPublishedSnapshot();
  const all = snap.articles || [];
  const activeCategory = req.query.category || '';
  const list = activeCategory ? all.filter((a) => a.category === activeCategory) : all;
  const ps = (snap.pageSeo || {}).articles || {};
  const h1 = ps.h1 || 'Статьи';

  res.render('public/articles', {
    ...baseLocals(snap),
    page: 'articles',
    articles: list,
    activeCategory,
    pageH1: h1,
    seo: seoFor(snap, req, { pageKey: 'articles', defaultTitle: h1, path: '/articles' }),
  });
});

router.get('/articles/:slug', (req, res) => {
  const snap = getPublishedSnapshot();
  const article = (snap.articles || []).find((a) => a.slug === req.params.slug);
  if (!article) {
    return res.status(404).render('public/404', {
      ...baseLocals(snap),
      page: 'articles',
      seo: seoFor(snap, req, { pageKey: 'articles', defaultTitle: 'Страница не найдена', noindex: true }),
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
    seo: seoFor(snap, req, {
      pageKey: 'article',
      title: article.meta_title || '',
      defaultTitle: article.title,
      description: article.meta_description || article.excerpt || '',
      image: article.featured_image || '',
      type: 'article',
      path: '/articles/' + article.slug,
    }),
  });
});

// --- Services -----------------------------------------------------------
router.get('/services', (req, res) => {
  const snap = getPublishedSnapshot();
  const ps = (snap.pageSeo || {}).services || {};
  const h1 = ps.h1 || 'Сайты';
  res.render('public/services', {
    ...baseLocals(snap),
    page: 'services',
    services: snap.services || [],
    pageH1: h1,
    seo: seoFor(snap, req, { pageKey: 'services', defaultTitle: h1, path: '/services' }),
  });
});

router.get('/services/:slug', (req, res) => {
  const snap = getPublishedSnapshot();
  const service = (snap.services || []).find((s) => s.slug === req.params.slug);
  if (!service) {
    return res.status(404).render('public/404', {
      ...baseLocals(snap),
      page: 'services',
      seo: seoFor(snap, req, { pageKey: 'services', defaultTitle: 'Страница не найдена', noindex: true }),
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
    seo: seoFor(snap, req, {
      pageKey: 'service',
      defaultTitle: service.name,
      description: service.description || '',
      image: service.hero_image || service.image_url || '',
      path: '/services/' + service.slug,
    }),
  });
});

// --- Giveaways ----------------------------------------------------------
router.get('/giveaways', (req, res) => {
  const snap = getPublishedSnapshot();
  const giveaways = snap.giveaways || [];
  const ps = (snap.pageSeo || {}).giveaways || {};
  const h1 = ps.h1 || '🎁 Розыгрыши';

  // Attach entry counts (live from DB)
  const withCounts = giveaways.map((g) => {
    const row = db.prepare('SELECT COUNT(*) AS c FROM giveaway_entries WHERE giveaway_id = ?').get(g.id);
    return { ...g, entryCount: row ? row.c : 0 };
  });

  res.render('public/giveaways', {
    ...baseLocals(snap),
    page: 'giveaways',
    giveaways: withCounts,
    pageH1: h1,
    seo: seoFor(snap, req, { pageKey: 'giveaways', defaultTitle: 'Розыгрыши', path: '/giveaways' }),
  });
});

router.get('/giveaways/:slug', (req, res) => {
  const snap = getPublishedSnapshot();
  const giveaway = (snap.giveaways || []).find((g) => g.slug === req.params.slug);
  if (!giveaway) {
    return res.status(404).render('public/404', {
      ...baseLocals(snap),
      page: 'giveaways',
      seo: seoFor(snap, req, { pageKey: 'giveaways', defaultTitle: 'Страница не найдена', noindex: true }),
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
    seo: seoFor(snap, req, {
      pageKey: 'giveaway',
      defaultTitle: giveaway.title,
      description: giveaway.description || '',
      image: giveaway.image_url || '',
      path: '/giveaways/' + giveaway.slug,
    }),
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

// --- Rating -------------------------------------------------------------
router.get('/rating', (req, res) => {
  const snap = getPublishedSnapshot();
  const all = snap.ratings || [];
  const activeCategory = req.query.category || '';
  const list = activeCategory ? all.filter((r) => r.category === activeCategory) : all;
  const ps = (snap.pageSeo || {}).rating || {};
  const h1 = ps.h1 || 'Рейтинг сайтов';

  res.render('public/rating', {
    ...baseLocals(snap),
    page: 'rating',
    ratings: list,
    ratingCategories: snap.ratingCategories || [],
    activeCategory,
    pageH1: h1,
    seo: seoFor(snap, req, { pageKey: 'rating', defaultTitle: h1, path: '/rating' }),
  });
});

router.get('/rating/:slug', (req, res) => {
  const snap = getPublishedSnapshot();
  const item = (snap.ratings || []).find((r) => r.slug === req.params.slug);
  if (!item) {
    return res.status(404).render('public/404', {
      ...baseLocals(snap),
      page: 'rating',
      seo: seoFor(snap, req, { pageKey: 'rating', defaultTitle: 'Страница не найдена', noindex: true }),
    });
  }

  const reviews = db
    .prepare('SELECT * FROM rating_reviews WHERE rating_id = ? ORDER BY datetime(created_at) DESC, id DESC')
    .all(item.id);
  const reviewAgg = db
    .prepare('SELECT COUNT(*) c, AVG(stars) avg FROM rating_reviews WHERE rating_id = ?')
    .get(item.id);

  const justReviewed = req.session._reviewAddedFor === item.slug;
  delete req.session._reviewAddedFor;

  const defaultTitle = 'Обзор ' + item.name + ' — плюсы, минусы и отзывы';

  res.render('public/rating-item', {
    ...baseLocals(snap),
    page: 'rating',
    item,
    ratingCategories: snap.ratingCategories || [],
    reviews,
    reviewCount: reviewAgg ? reviewAgg.c : 0,
    reviewAvg: reviewAgg && reviewAgg.avg ? Math.round(reviewAgg.avg * 10) / 10 : 0,
    justReviewed,
    seo: seoFor(snap, req, {
      pageKey: 'rating-item',
      title: item.meta_title || '',
      defaultTitle,
      description: item.meta_description || ('Обзор сайта ' + item.name + ': плюсы, минусы, рейтинг и отзывы пользователей.'),
      image: item.image_url || item.hero_image || '',
      type: 'article',
      path: '/rating/' + item.slug,
    }),
  });
});

router.post('/rating/:slug/review', (req, res) => {
  const snap = getPublishedSnapshot();
  const item = (snap.ratings || []).find((r) => r.slug === req.params.slug);
  if (!item) return res.redirect('/rating');

  const author = String(req.body.author || '').trim().slice(0, 60) || 'Аноним';
  const text = String(req.body.text || '').trim().slice(0, 2000);
  let stars = parseInt(req.body.stars, 10);
  if (!(stars >= 1 && stars <= 5)) stars = 5;

  if (text) {
    db.prepare('INSERT INTO rating_reviews (rating_id, author, text, stars) VALUES (?, ?, ?, ?)')
      .run(item.id, author, text, stars);
    req.session._reviewAddedFor = item.slug;
  }
  res.redirect('/rating/' + item.slug + '#reviews');
});

// --- Contacts -----------------------------------------------------------
router.get('/contacts', (req, res) => {
  const snap = getPublishedSnapshot();
  const ps = (snap.pageSeo || {}).contacts || {};
  const h1 = ps.h1 || 'Контакты';
  res.render('public/contacts', {
    ...baseLocals(snap),
    page: 'contacts',
    pageH1: h1,
    seo: seoFor(snap, req, { pageKey: 'contacts', defaultTitle: h1, path: '/contacts' }),
  });
});

// --- robots.txt & sitemap.xml ------------------------------------------
function escapeXml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

router.get('/robots.txt', (req, res) => {
  const snap = getPublishedSnapshot();
  const st = snap.settings || {};
  res.type('text/plain');

  // Custom robots.txt overrides everything if provided.
  if (String(st.seo_robots_txt || '').trim()) {
    return res.send(st.seo_robots_txt);
  }

  const base = baseUrl(snap, req);
  if (String(st.seo_noindex) === '1') {
    return res.send('User-agent: *\nDisallow: /\n');
  }
  res.send(`User-agent: *\nAllow: /\n\nSitemap: ${base}/sitemap.xml\n`);
});

router.get('/sitemap.xml', (req, res) => {
  const snap = getPublishedSnapshot();
  const base = baseUrl(snap, req);
  const urls = [];
  const add = (path, priority, changefreq) => urls.push({ loc: base + path, priority, changefreq });

  add('/', '1.0', 'daily');
  add('/services', '0.8', 'weekly');
  (snap.services || []).forEach((s) => add('/services/' + s.slug, '0.7', 'weekly'));
  add('/rating', '0.8', 'weekly');
  (snap.ratings || []).forEach((r) => add('/rating/' + r.slug, '0.6', 'weekly'));
  add('/articles', '0.7', 'weekly');
  (snap.articles || []).forEach((a) => add('/articles/' + a.slug, '0.6', 'monthly'));
  add('/contacts', '0.4', 'monthly');

  const body = urls
    .map((u) => `  <url><loc>${escapeXml(u.loc)}</loc><changefreq>${u.changefreq}</changefreq><priority>${u.priority}</priority></url>`)
    .join('\n');
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`;
  res.type('application/xml').send(xml);
});

module.exports = router;
