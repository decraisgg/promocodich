'use strict';

const crypto = require('crypto');
const express = require('express');
const { db, getSetting } = require('../db');
const { getPublishedSnapshot } = require('../publish');
const { generate: generateCaptcha } = require('../captcha');
const { sendMessage, getChatMember } = require('../telegram');

const router = express.Router();

// Analytics / verification codes are read live (not from the published
// snapshot) so they take effect immediately, without "Обновить сайт".
const LIVE_SETTING_KEYS = [
  'metrika_yandex_code', 'metrika_google_code',
  'metrika_yandex_id', 'metrika_google_id',
  'seo_yandex_verification', 'seo_google_verification',
];

// --- Captcha image ------------------------------------------------------
router.get('/captcha.svg', (req, res) => {
  const { code, svg } = generateCaptcha();
  req.session.captcha = code;
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
  res.set('Pragma', 'no-cache');
  res.type('image/svg+xml').send(svg);
});

// --- Lightweight self-hosted analytics ----------------------------------
const insertEventStmt = db.prepare('INSERT INTO analytics_events (type, label, path) VALUES (?, ?, ?)');
router.post('/api/track', (req, res) => {
  try {
    const type = String(req.body && req.body.type || '');
    if (type === 'pageview' || type === 'click') {
      const label = String((req.body && req.body.label) || '').slice(0, 160);
      const path = String((req.body && req.body.path) || '').slice(0, 200);
      insertEventStmt.run(type, label, path);
    }
  } catch (_) { /* never block the page on tracking */ }
  res.status(204).end();
});

// Shared locals for every public page (header/footer/popups).
function baseLocals(snapshot) {
  const site = { ...(snapshot.settings || {}) };
  // Override analytics/verification with live DB values so they apply at once.
  for (const k of LIVE_SETTING_KEYS) site[k] = getSetting(k, '');
  return {
    site,
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

// Overall rating shown to visitors: the admin score acts as one baseline
// vote, blended with every user review's stars. This way the star rating
// visibly changes as people leave reviews.
function effectiveRating(baseRating, reviewCount, reviewStarsSum) {
  const base = Number(baseRating) || 0;
  const denom = (reviewCount || 0) + (base ? 1 : 0);
  if (!denom) return 0;
  return Math.round((((reviewStarsSum || 0) + base) / denom) * 10) / 10;
}

// Editable home-page section headings.
function sectionHeadings(st) {
  return {
    promocodes: {
      title: st.sec_promocodes_title || 'Актуальные промокоды и бонусы',
      sub: st.sec_promocodes_sub || 'Активируй коды и получай скидки на любимых цифровых сервисах',
      icon: st.sec_promocodes_icon || '',
    },
    sites: { title: st.sec_sites_title || 'Популярные сайты', icon: st.sec_sites_icon || '' },
    articles: { title: st.sec_articles_title || 'Последние статьи', icon: st.sec_articles_icon || '' },
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
  const homeSitesLimit = Math.max(1, parseInt(st.home_sites_limit, 10) || 12);
  const homeArticlesLimit = Math.max(1, parseInt(st.home_articles_limit, 10) || 12);
  const homePromosLimit = Math.max(0, parseInt(st.home_promos_limit, 10) || 12);

  const homeServices = (snap.services || []).slice(0, homeSitesLimit);
  const latestArticles = (snap.articles || []).slice(0, homeArticlesLimit);
  // Pass all global promos; home_promos_limit controls how many show per page
  const globalPromos = (snap.promocodes || []).filter((p) => !p.service_id);
  const promoPerPage = homePromosLimit;

  const defaultTitle = (st.site_title || 'ПРОМОКОДЫЧ') + (st.tagline ? ' — ' + st.tagline : '');

  res.render('public/home', {
    ...baseLocals(snap),
    page: 'home',
    bigBanner,
    smallBanners,
    promocodes: globalPromos,
    promoPerPage,
    inlineBanners: snap.inlineBanners || [],
    latestArticles,
    homeServices,
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
      title: service.meta_title || '',
      defaultTitle: service.name,
      description: service.meta_description || service.description || '',
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
  const list = (activeCategory ? all.filter((r) => r.category === activeCategory) : all).map((item) => {
    const agg = db.prepare('SELECT COUNT(*) c, COALESCE(SUM(stars),0) s FROM rating_reviews WHERE rating_id = ?').get(item.id);
    return { ...item, displayRating: effectiveRating(item.rating, agg.c, agg.s), reviewCount: agg.c };
  });
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
    .prepare('SELECT COUNT(*) c, COALESCE(SUM(stars),0) s FROM rating_reviews WHERE rating_id = ?')
    .get(item.id);
  const reviewCount = reviewAgg ? reviewAgg.c : 0;
  const displayRating = effectiveRating(item.rating, reviewCount, reviewAgg ? reviewAgg.s : 0);

  const justReviewed = req.session._reviewAddedFor === item.slug;
  delete req.session._reviewAddedFor;
  const reviewError = req.session._reviewError === item.slug;
  delete req.session._reviewError;

  const defaultTitle = 'Обзор ' + item.name + ' — плюсы, минусы и отзывы';

  res.render('public/rating-item', {
    ...baseLocals(snap),
    page: 'rating',
    item,
    ratingCategories: snap.ratingCategories || [],
    reviews,
    reviewCount,
    displayRating,
    justReviewed,
    reviewError,
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

  // Validate the captcha (case-insensitive, one-time use).
  const expected = req.session.captcha || '';
  const given = String(req.body.captcha || '').trim().toUpperCase();
  req.session.captcha = null;
  if (!expected || given !== expected) {
    req.session._reviewError = item.slug;
    return res.redirect('/rating/' + item.slug + '#reviews');
  }

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
  let contactsBlocks = [];
  try { contactsBlocks = JSON.parse((snap.settings || {}).contacts_blocks || '[]'); } catch (_) {}
  res.render('public/contacts', {
    ...baseLocals(snap),
    page: 'contacts',
    pageH1: h1,
    contactsBlocks,
    seo: seoFor(snap, req, { pageKey: 'contacts', defaultTitle: h1, path: '/contacts' }),
  });
});

// --- Telegram webhook ---------------------------------------------------
router.post('/telegram/webhook', express.json(), async (req, res) => {
  res.sendStatus(200);
  try {
    const update = req.body;
    if (!update || !update.message) return;
    const msg = update.message;
    const tgId = String(msg.from.id);
    const tgUsername = msg.from.username || msg.from.first_name || '';
    const chatId = msg.chat.id;
    const text = msg.text || '';
    const token = getSetting('tg_bot_token', '');
    if (!token) return;
    if (text.startsWith('/start ')) {
      const code = text.split(' ')[1] || '';
      if (!code) return;
      const sess = db.prepare('SELECT * FROM tg_sessions WHERE code = ?').get(code);
      if (!sess) { await sendMessage(token, chatId, '❌ Неверный код. Попробуйте снова.'); return; }
      db.prepare('UPDATE tg_sessions SET tg_id = ?, tg_username = ? WHERE code = ?').run(tgId, tgUsername, code);
      const conditions = db.prepare('SELECT * FROM wheel_conditions WHERE enabled = 1 ORDER BY sort_order, id').all();
      let allMet = true;
      const failed = [];
      for (const cond of conditions) {
        if (!cond.channel_id) continue;
        try {
          const r = await getChatMember(token, cond.channel_id, tgId);
          const st = r.result && r.result.status;
          if (!['member', 'administrator', 'creator'].includes(st)) {
            allMet = false;
            failed.push(cond.label || cond.channel_url);
          }
        } catch (_) { allMet = false; failed.push(cond.label || cond.channel_url); }
      }
      if (allMet) {
        db.prepare('UPDATE tg_sessions SET verified = 1, reject_reason = ? WHERE code = ?').run('', code);
        await sendMessage(token, chatId, '✅ Отлично! Вы можете крутить колесо фортуны. Вернитесь на сайт — страница обновится автоматически.');
      } else {
        const reason = 'Вы не выполнили условие:\n' + failed.map(f => '• ' + f).join('\n');
        db.prepare('UPDATE tg_sessions SET reject_reason = ? WHERE code = ?').run(reason, code);
        await sendMessage(token, chatId, '❌ ' + reason + '\n\nПодпишитесь на каналы и нажмите кнопку верификации на сайте снова.');
      }
    }
  } catch (e) { console.error('TG webhook error:', e); }
});

// --- Steam Keys page ----------------------------------------------------
router.get('/steam-keys', (req, res) => {
  const snap = getPublishedSnapshot();
  const st = snap.settings || {};
  const allWheels = db.prepare('SELECT * FROM wheels WHERE enabled = 1 ORDER BY sort_order, id').all();
  const conditions = db.prepare('SELECT * FROM wheel_conditions WHERE enabled = 1 ORDER BY sort_order, id').all();
  const tgId = req.session.tg_id || '';
  const tgUsername = req.session.tg_username || '';
  allWheels.forEach(w => {
    w.prizes = db.prepare('SELECT * FROM wheel_prizes WHERE wheel_id = ? ORDER BY sort_order, id').all(w.id);
    w.prizes.forEach(p => {
      p.keyCount = (db.prepare('SELECT COUNT(*) n FROM wheel_keys WHERE prize_id = ? AND used = 0').get(p.id) || {}).n || 0;
    });
    w.alreadySpun = tgId ? !!db.prepare("SELECT id FROM wheel_spins WHERE tg_id = ? AND wheel_id = ? AND date(spun_at) = date('now')").get(tgId, w.id) : false;
  });
  const skBanners = (snap.banners || []).filter(b => !b.service_id && b.page_key === 'steam-keys');
  const bigBanner = skBanners.find(b => b.size === 'big') || null;
  const smallBanners = skBanners.filter(b => b.size === 'small').slice(0, 2);
  const botLink = st.tg_bot_link || 't.me/promocodichbot';
  const ps = (snap.pageSeo || {})['steam-keys'] || {};
  const pageH1 = ps.h1 || st.nav_steamkeys || 'Ключи Steam';
  res.render('public/steam-keys', {
    ...baseLocals(snap),
    page: 'steam-keys',
    wheels: allWheels,
    conditions,
    tgId,
    tgUsername,
    botLink,
    bigBanner,
    smallBanners,
    pageH1,
    pageSubtitle: st.steam_keys_subtitle || 'Крути колесо фортуны и выигрывай ключи Steam. 1 попытка в день.',
    tgVerifiedImage: st.tg_verified_image || '',
    tgVerifyBtnImage: st.tg_verify_btn_image || '',
    seo: seoFor(snap, req, { pageKey: 'steam-keys', defaultTitle: pageH1, path: '/steam-keys' }),
  });
});

// --- API: start-verify --------------------------------------------------
router.post('/api/wheel/start-verify', (req, res) => {
  const code = crypto.randomBytes(16).toString('hex');
  db.prepare('INSERT INTO tg_sessions (code) VALUES (?)').run(code);
  db.prepare("DELETE FROM tg_sessions WHERE created_at < datetime('now', '-1 hour')").run();
  const botLink = getSetting('tg_bot_link', 't.me/promocodichbot');
  res.json({ ok: true, code, url: 'https://' + botLink + '?start=' + code });
});

// --- API: verify poll ---------------------------------------------------
router.get('/api/wheel/verify', (req, res) => {
  const code = String(req.query.code || '');
  if (!code) return res.json({ ok: false });
  const sess = db.prepare('SELECT * FROM tg_sessions WHERE code = ?').get(code);
  if (!sess) return res.json({ ok: false });
  if (sess.verified && sess.tg_id) {
    req.session.tg_id = sess.tg_id;
    req.session.tg_username = sess.tg_username || '';
    db.prepare('DELETE FROM tg_sessions WHERE code = ?').run(code);
    return res.json({ ok: true, tg_id: sess.tg_id, tg_username: sess.tg_username });
  }
  if (sess.reject_reason) {
    db.prepare('DELETE FROM tg_sessions WHERE code = ?').run(code);
    return res.json({ ok: false, rejected: true, reason: sess.reject_reason });
  }
  res.json({ ok: false, pending: true });
});

// --- API: spin ----------------------------------------------------------
router.post('/api/wheel/spin', (req, res) => {
  const tgId = req.session.tg_id || '';
  if (!tgId) return res.json({ ok: false, error: 'not_verified' });
  const wheelId = parseInt(req.body && req.body.wheel_id, 10);
  if (!wheelId) return res.json({ ok: false, error: 'no_wheel' });
  const alreadySpun = db.prepare("SELECT id FROM wheel_spins WHERE tg_id = ? AND wheel_id = ? AND date(spun_at) = date('now')").get(tgId, wheelId);
  if (alreadySpun) return res.json({ ok: false, error: 'already_spun', message: 'Вы уже крутили это колесо сегодня. Возвращайтесь завтра!' });
  const prizes = db.prepare('SELECT * FROM wheel_prizes WHERE wheel_id = ? ORDER BY sort_order, id').all(wheelId);
  if (!prizes.length) return res.json({ ok: false, error: 'no_prizes' });
  const total = prizes.reduce((s, p) => s + (parseInt(p.chance, 10) || 1), 0);
  let rand = Math.random() * total;
  let selected = prizes[prizes.length - 1];
  for (const p of prizes) { rand -= (parseInt(p.chance, 10) || 1); if (rand <= 0) { selected = p; break; } }
  const prizeIdx = prizes.indexOf(selected);
  const key = db.prepare('SELECT * FROM wheel_keys WHERE prize_id = ? AND used = 0 ORDER BY id LIMIT 1').get(selected.id);
  let keyId = null;
  if (key) {
    db.prepare('UPDATE wheel_keys SET used = 1, used_by_tg_id = ?, used_at = datetime("now") WHERE id = ?').run(tgId, key.id);
    keyId = key.id;
  }
  const tgUsername = req.session.tg_username || '';
  db.prepare('INSERT INTO wheel_spins (tg_id, tg_username, wheel_id, prize_id, key_id) VALUES (?, ?, ?, ?, ?)').run(tgId, tgUsername, wheelId, selected.id, keyId);
  res.json({ ok: true, prizeIdx, prize: { id: selected.id, label: selected.label, image_url: selected.image_url }, key: key ? key.key_value : null });
});

// --- API: logout --------------------------------------------------------
router.post('/api/wheel/logout', (req, res) => {
  delete req.session.tg_id;
  delete req.session.tg_username;
  res.json({ ok: true });
});

// --- Warsaw relay: provide conditions list (called by relay.js) ---------
router.post('/api/tg-conditions', express.json(), (req, res) => {
  const secret = getSetting('relay_secret', '');
  if (!secret || req.headers['x-relay-secret'] !== secret) return res.status(403).json({ ok: false });
  const conditions = db.prepare('SELECT label, channel_url, channel_id FROM wheel_conditions WHERE enabled = 1 AND channel_id != "" ORDER BY sort_order, id').all();
  res.json({ ok: true, conditions });
});

// --- Warsaw relay: receive verification result (called by relay.js) -----
router.post('/api/tg-relay', express.json(), (req, res) => {
  const secret = getSetting('relay_secret', '');
  if (!secret || req.headers['x-relay-secret'] !== secret) return res.status(403).json({ ok: false });
  const { code, tg_id, tg_username, verified, reason } = req.body || {};
  if (!code || !tg_id) return res.json({ ok: false, error: 'missing_fields' });
  const sess = db.prepare('SELECT * FROM tg_sessions WHERE code = ?').get(code);
  if (!sess) return res.json({ ok: false, error: 'session_not_found' });
  if (verified) {
    db.prepare('UPDATE tg_sessions SET tg_id = ?, tg_username = ?, verified = 1, reject_reason = ? WHERE code = ?').run(String(tg_id), tg_username || '', '', code);
  } else {
    db.prepare('UPDATE tg_sessions SET tg_id = ?, tg_username = ?, reject_reason = ? WHERE code = ?').run(String(tg_id), tg_username || '', reason || 'Условия не выполнены', code);
  }
  res.json({ ok: true });
});

// --- API: history -------------------------------------------------------
router.get('/api/wheel/history', (req, res) => {
  const tgId = req.session.tg_id || '';
  if (!tgId) return res.json({ ok: true, history: [], total: 0, pages: 0, page: 1 });
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const perPage = 7;
  const offset = (page - 1) * perPage;
  const history = db.prepare(`SELECT ws.spun_at, wp.label as prize_label, wp.image_url,
    wk.key_value, w.name as wheel_name
    FROM wheel_spins ws
    LEFT JOIN wheel_prizes wp ON ws.prize_id = wp.id
    LEFT JOIN wheel_keys wk ON ws.key_id = wk.id
    LEFT JOIN wheels w ON ws.wheel_id = w.id
    WHERE ws.tg_id = ? ORDER BY ws.spun_at DESC LIMIT ? OFFSET ?`).all(tgId, perPage, offset);
  const total = (db.prepare('SELECT COUNT(*) n FROM wheel_spins WHERE tg_id = ?').get(tgId) || {}).n || 0;
  res.json({ ok: true, history, total, pages: Math.ceil(total / perPage), page });
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
