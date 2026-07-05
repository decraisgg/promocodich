'use strict';

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const express = require('express');
const multer = require('multer');

const { db, getSetting, setSetting, markDirty, CATEGORIES, CATEGORY_TITLES, getRatingCategories } = require('../db');
const { publish } = require('../publish');
const { sanitizeBlocks } = require('../sanitize');
const { checkPassword, requireAuth, requireAuthApi } = require('../auth');
const { UPLOADS_DIR } = require('../paths');

const router = express.Router();

// --- Uploads ------------------------------------------------------------
const UPLOAD_DIR = UPLOADS_DIR;
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const ext = (path.extname(file.originalname) || '').toLowerCase().replace(/[^.a-z0-9]/g, '');
    cb(null, `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${ext || '.img'}`);
  },
});
const UPLOAD_MAX_MB = 200;
const upload = multer({
  storage,
  limits: { fileSize: UPLOAD_MAX_MB * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (/^(image|video)\//.test(file.mimetype)) return cb(null, true);
    cb(new Error('Можно загружать только изображения и видео'));
  },
});

// --- Helpers ------------------------------------------------------------
const b = (v) => (v === 'on' || v === '1' || v === 'true' || v === true ? 1 : 0);
const s = (v) => (v == null ? '' : String(v).trim());

function flash(req, type, text) {
  req.session.flash = { type, text };
}

function renderAdmin(req, res, view, locals = {}) {
  const flashMsg = req.session.flash || null;
  delete req.session.flash;
  const services = db.prepare('SELECT id, name, slug FROM services ORDER BY sort_order, id').all();
  res.render(view, {
    layout: true,
    active: '',
    dirty: getSetting('dirty', '0') === '1',
    lastPublished: getSetting('last_published_at', ''),
    siteTitle: getSetting('site_title', 'ПРОМОКОДЫЧ'),
    categories: CATEGORIES,
    categoryTitles: CATEGORY_TITLES,
    services,
    flash: flashMsg,
    ...locals,
  });
}

const TRANSLIT = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i',
  й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't',
  у: 'u', ф: 'f', х: 'h', ц: 'c', ч: 'ch', ш: 'sh', щ: 'sch', ъ: '', ы: 'y', ь: '',
  э: 'e', ю: 'yu', я: 'ya',
};
function slugify(str) {
  return String(str || '')
    .toLowerCase()
    .split('')
    .map((ch) => (TRANSLIT[ch] !== undefined ? TRANSLIT[ch] : ch))
    .join('')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'item';
}
function uniqueSlugFor(table, base, excludeId = null) {
  let slug = slugify(base);
  let candidate = slug;
  let n = 2;
  while (true) {
    const row = db.prepare(`SELECT id FROM ${table} WHERE slug = ?`).get(candidate);
    if (!row || row.id === excludeId) return candidate;
    candidate = `${slug}-${n++}`;
  }
}

// --- Auth ---------------------------------------------------------------
router.get('/login', (req, res) => {
  if (req.session && req.session.isAdmin) return res.redirect('/admin');
  res.render('admin/login', { layout: false, error: null });
});

router.post('/login', (req, res) => {
  if (checkPassword(req.body.password)) {
    req.session.isAdmin = true;
    return res.redirect('/admin');
  }
  res.render('admin/login', { layout: false, error: 'Неверный пароль' });
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/admin/login'));
});

// Everything below requires auth.
router.use((req, res, next) => {
  if (req.path === '/login') return next();
  return requireAuth(req, res, next);
});

// --- Dashboard & publish ------------------------------------------------
router.get('/', (req, res) => {
  const counts = {
    banners: db.prepare('SELECT COUNT(*) c FROM banners').get().c,
    promocodes: db.prepare('SELECT COUNT(*) c FROM promocodes').get().c,
    articles: db.prepare('SELECT COUNT(*) c FROM articles').get().c,
    popups: db.prepare('SELECT COUNT(*) c FROM popups').get().c,
    services: db.prepare('SELECT COUNT(*) c FROM services').get().c,
    giveaways: db.prepare('SELECT COUNT(*) c FROM giveaways').get().c,
    ratings: db.prepare('SELECT COUNT(*) c FROM ratings').get().c,
  };
  renderAdmin(req, res, 'admin/dashboard', { active: 'dashboard', counts });
});

router.post('/publish', (req, res) => {
  publish();
  flash(req, 'success', 'Сайт обновлён! Все изменения опубликованы.');
  res.redirect('/admin');
});

// --- Upload (AJAX) ------------------------------------------------------
router.post('/upload', requireAuthApi, (req, res) => {
  upload.single('file')(req, res, (err) => {
    if (err) {
      const msg = err.code === 'LIMIT_FILE_SIZE'
        ? `Файл слишком большой (максимум ${UPLOAD_MAX_MB} МБ)`
        : err.message;
      return res.status(400).json({ ok: false, error: msg });
    }
    if (!req.file) return res.status(400).json({ ok: false, error: 'Файл не получен' });
    res.json({ ok: true, url: `/uploads/${req.file.filename}` });
  });
});

// --- Banners ------------------------------------------------------------
router.get('/banners', (req, res) => {
  const banners = db.prepare('SELECT * FROM banners ORDER BY sort_order, id').all();
  renderAdmin(req, res, 'admin/banners', { active: 'banners', banners });
});

function bannerFromBody(body) {
  return {
    enabled: b(body.enabled),
    service_id: body.service_id ? parseInt(body.service_id, 10) : null,
    size: body.size === 'big' ? 'big' : 'small',
    image_url: s(body.image_url),
    image_link: s(body.image_link),
    text_enabled: b(body.text_enabled),
    title: s(body.title),
    subtitle: s(body.subtitle),
    button_enabled: b(body.button_enabled),
    button_text: s(body.button_text),
    button_link: s(body.button_link),
    sort_order: parseInt(body.sort_order, 10) || 0,
  };
}

router.post('/banners', (req, res) => {
  const d = bannerFromBody(req.body);
  db.prepare(`INSERT INTO banners
    (enabled,service_id,size,image_url,image_link,text_enabled,title,subtitle,button_enabled,button_text,button_link,sort_order)
    VALUES (@enabled,@service_id,@size,@image_url,@image_link,@text_enabled,@title,@subtitle,@button_enabled,@button_text,@button_link,@sort_order)`).run(d);
  markDirty();
  flash(req, 'success', 'Баннер добавлен.');
  res.redirect('/admin/banners');
});

router.post('/banners/:id', (req, res) => {
  const d = bannerFromBody(req.body);
  db.prepare(`UPDATE banners SET
    enabled=@enabled,service_id=@service_id,size=@size,image_url=@image_url,image_link=@image_link,text_enabled=@text_enabled,
    title=@title,subtitle=@subtitle,button_enabled=@button_enabled,button_text=@button_text,button_link=@button_link,sort_order=@sort_order
    WHERE id=@id`).run({ ...d, id: req.params.id });
  markDirty();
  flash(req, 'success', 'Баннер сохранён.');
  res.redirect('/admin/banners');
});

router.post('/banners/:id/delete', (req, res) => {
  db.prepare('DELETE FROM banners WHERE id = ?').run(req.params.id);
  markDirty();
  flash(req, 'success', 'Баннер удалён.');
  res.redirect('/admin/banners');
});

// --- Promocodes ---------------------------------------------------------
router.get('/promocodes', (req, res) => {
  const promocodes = db.prepare('SELECT * FROM promocodes ORDER BY sort_order, id').all();
  renderAdmin(req, res, 'admin/promocodes', { active: 'promocodes', promocodes });
});

function promoFromBody(body) {
  return {
    enabled: b(body.enabled),
    service_id: body.service_id ? parseInt(body.service_id, 10) : null,
    service_name: s(body.service_name),
    bonus_label: s(body.bonus_label),
    code: s(body.code),
    description: s(body.description),
    image_url: s(body.image_url),
    link: s(body.link),
    sort_order: parseInt(body.sort_order, 10) || 0,
  };
}

router.post('/promocodes', (req, res) => {
  const d = promoFromBody(req.body);
  db.prepare(`INSERT INTO promocodes
    (enabled,service_id,service_name,bonus_label,code,description,image_url,link,sort_order)
    VALUES (@enabled,@service_id,@service_name,@bonus_label,@code,@description,@image_url,@link,@sort_order)`).run(d);
  markDirty();
  flash(req, 'success', 'Промокод добавлен.');
  res.redirect('/admin/promocodes');
});

router.post('/promocodes/:id', (req, res) => {
  const d = promoFromBody(req.body);
  db.prepare(`UPDATE promocodes SET
    enabled=@enabled,service_id=@service_id,service_name=@service_name,bonus_label=@bonus_label,code=@code,
    description=@description,image_url=@image_url,link=@link,sort_order=@sort_order WHERE id=@id`)
    .run({ ...d, id: req.params.id });
  markDirty();
  flash(req, 'success', 'Промокод сохранён.');
  res.redirect('/admin/promocodes');
});

router.post('/promocodes/:id/delete', (req, res) => {
  db.prepare('DELETE FROM promocodes WHERE id = ?').run(req.params.id);
  markDirty();
  flash(req, 'success', 'Промокод удалён.');
  res.redirect('/admin/promocodes');
});

// --- Popups -------------------------------------------------------------
router.get('/popups', (req, res) => {
  const popups = db.prepare('SELECT * FROM popups ORDER BY sort_order, id').all();
  renderAdmin(req, res, 'admin/popups', { active: 'popups', popups });
});

function popupFromBody(body) {
  return {
    enabled: b(body.enabled),
    image_url: s(body.image_url),
    text: s(body.text),
    button_text: s(body.button_text),
    button_link: s(body.button_link),
    code: s(body.code),
    sort_order: parseInt(body.sort_order, 10) || 0,
  };
}

router.post('/popups', (req, res) => {
  const d = popupFromBody(req.body);
  db.prepare(`INSERT INTO popups (enabled,image_url,text,button_text,button_link,code,sort_order)
    VALUES (@enabled,@image_url,@text,@button_text,@button_link,@code,@sort_order)`).run(d);
  markDirty();
  flash(req, 'success', 'Всплывающее окно добавлено.');
  res.redirect('/admin/popups');
});

router.post('/popups/:id', (req, res) => {
  const d = popupFromBody(req.body);
  db.prepare(`UPDATE popups SET enabled=@enabled,image_url=@image_url,text=@text,
    button_text=@button_text,button_link=@button_link,code=@code,sort_order=@sort_order WHERE id=@id`)
    .run({ ...d, id: req.params.id });
  markDirty();
  flash(req, 'success', 'Всплывающее окно сохранено.');
  res.redirect('/admin/popups');
});

router.post('/popups/:id/delete', (req, res) => {
  db.prepare('DELETE FROM popups WHERE id = ?').run(req.params.id);
  markDirty();
  flash(req, 'success', 'Всплывающее окно удалено.');
  res.redirect('/admin/popups');
});

// --- Articles -----------------------------------------------------------
router.get('/articles', (req, res) => {
  const articles = db.prepare('SELECT * FROM articles ORDER BY sort_order, datetime(created_at) DESC, id DESC').all();
  renderAdmin(req, res, 'admin/articles', { active: 'articles', articles });
});

router.get('/articles/new', (req, res) => {
  renderAdmin(req, res, 'admin/article-edit', {
    active: 'articles',
    article: { id: '', slug: '', title: '', category: 'games', excerpt: '', featured_image: '', enabled: 1, blocks: [] },
    isNew: true,
  });
});

router.get('/articles/:id/edit', (req, res) => {
  const article = db.prepare('SELECT * FROM articles WHERE id = ?').get(req.params.id);
  if (!article) return res.redirect('/admin/articles');
  let blocks = [];
  try { blocks = JSON.parse(article.blocks || '[]'); } catch (_) { blocks = []; }
  renderAdmin(req, res, 'admin/article-edit', {
    active: 'articles',
    article: { ...article, blocks },
    isNew: false,
  });
});

function parseBlocks(raw) {
  let parsed = [];
  try { parsed = JSON.parse(raw || '[]'); } catch (_) { parsed = []; }
  return sanitizeBlocks(parsed);
}

router.post('/articles', (req, res) => {
  const title = s(req.body.title) || 'Без названия';
  const slug = uniqueSlugFor('articles', s(req.body.slug) || title);
  const blocks = parseBlocks(req.body.blocks);
  db.prepare(`INSERT INTO articles (slug,title,category,excerpt,featured_image,blocks,meta_title,meta_description,enabled,sort_order)
    VALUES (@slug,@title,@category,@excerpt,@featured_image,@blocks,@meta_title,@meta_description,@enabled,@sort_order)`).run({
    slug,
    title,
    category: s(req.body.category) || 'games',
    excerpt: s(req.body.excerpt),
    featured_image: s(req.body.featured_image),
    blocks: JSON.stringify(blocks),
    meta_title: s(req.body.meta_title),
    meta_description: s(req.body.meta_description),
    enabled: b(req.body.enabled),
    sort_order: parseInt(req.body.sort_order, 10) || 0,
  });
  markDirty();
  flash(req, 'success', 'Статья создана.');
  res.redirect('/admin/articles');
});

router.post('/articles/:id', (req, res) => {
  const id = req.params.id;
  const existing = db.prepare('SELECT id FROM articles WHERE id = ?').get(id);
  if (!existing) return res.redirect('/admin/articles');
  const title = s(req.body.title) || 'Без названия';
  const slug = uniqueSlugFor('articles', s(req.body.slug) || title, Number(id));
  const blocks = parseBlocks(req.body.blocks);
  db.prepare(`UPDATE articles SET slug=@slug,title=@title,category=@category,excerpt=@excerpt,
    featured_image=@featured_image,blocks=@blocks,meta_title=@meta_title,meta_description=@meta_description,
    enabled=@enabled,sort_order=@sort_order WHERE id=@id`).run({
    id,
    slug,
    title,
    category: s(req.body.category) || 'games',
    excerpt: s(req.body.excerpt),
    featured_image: s(req.body.featured_image),
    blocks: JSON.stringify(blocks),
    meta_title: s(req.body.meta_title),
    meta_description: s(req.body.meta_description),
    enabled: b(req.body.enabled),
    sort_order: parseInt(req.body.sort_order, 10) || 0,
  });
  markDirty();
  flash(req, 'success', 'Статья сохранена.');
  res.redirect('/admin/articles');
});

router.post('/articles/:id/delete', (req, res) => {
  db.prepare('DELETE FROM articles WHERE id = ?').run(req.params.id);
  markDirty();
  flash(req, 'success', 'Статья удалена.');
  res.redirect('/admin/articles');
});

// --- Services -----------------------------------------------------------
router.get('/services', (req, res) => {
  const allServices = db.prepare('SELECT * FROM services ORDER BY sort_order, id').all();
  const withCounts = allServices.map((svc) => ({
    ...svc,
    bannerCount: db.prepare('SELECT COUNT(*) c FROM banners WHERE service_id = ?').get(svc.id).c,
    promoCount: db.prepare('SELECT COUNT(*) c FROM promocodes WHERE service_id = ?').get(svc.id).c,
  }));
  renderAdmin(req, res, 'admin/services', { active: 'services', allServices: withCounts });
});

router.get('/services/new', (req, res) => {
  renderAdmin(req, res, 'admin/service-edit', {
    active: 'services',
    service: { id: '', slug: '', name: '', description: '', image_url: '', color: '', enabled: 1, sort_order: 0 },
    isNew: true,
  });
});

router.get('/services/:id/edit', (req, res) => {
  const service = db.prepare('SELECT * FROM services WHERE id = ?').get(req.params.id);
  if (!service) return res.redirect('/admin/services');
  renderAdmin(req, res, 'admin/service-edit', { active: 'services', service, isNew: false });
});

function serviceFromBody(body) {
  return {
    name: s(body.name),
    slug: slugify(s(body.slug) || s(body.name)),
    description: s(body.description),
    image_url: s(body.image_url),
    tile_image: s(body.tile_image),
    hero_image: s(body.hero_image),
    color: s(body.color),
    meta_title: s(body.meta_title),
    meta_description: s(body.meta_description),
    enabled: b(body.enabled),
    sort_order: parseInt(body.sort_order, 10) || 0,
  };
}

router.post('/services', (req, res) => {
  const d = serviceFromBody(req.body);
  const slug = uniqueSlugFor('services', d.slug);
  db.prepare(`INSERT INTO services (slug,name,description,image_url,tile_image,hero_image,color,meta_title,meta_description,enabled,sort_order)
    VALUES (@slug,@name,@description,@image_url,@tile_image,@hero_image,@color,@meta_title,@meta_description,@enabled,@sort_order)`).run({ ...d, slug });
  markDirty();
  flash(req, 'success', 'Сервис добавлен.');
  res.redirect('/admin/services');
});

router.post('/services/:id', (req, res) => {
  const id = req.params.id;
  const existing = db.prepare('SELECT id FROM services WHERE id = ?').get(id);
  if (!existing) return res.redirect('/admin/services');
  const d = serviceFromBody(req.body);
  const slug = uniqueSlugFor('services', d.slug, Number(id));
  db.prepare(`UPDATE services SET slug=@slug,name=@name,description=@description,image_url=@image_url,
    tile_image=@tile_image,hero_image=@hero_image,color=@color,meta_title=@meta_title,meta_description=@meta_description,
    enabled=@enabled,sort_order=@sort_order WHERE id=@id`).run({ ...d, slug, id });
  markDirty();
  flash(req, 'success', 'Сервис сохранён.');
  res.redirect('/admin/services');
});

router.post('/services/:id/delete', (req, res) => {
  db.prepare('DELETE FROM services WHERE id = ?').run(req.params.id);
  markDirty();
  flash(req, 'success', 'Сервис удалён.');
  res.redirect('/admin/services');
});

// --- Giveaways ----------------------------------------------------------
router.get('/giveaways', (req, res) => {
  const allGiveaways = db.prepare('SELECT * FROM giveaways ORDER BY sort_order, id').all();
  const withCounts = allGiveaways.map((g) => ({
    ...g,
    entryCount: db.prepare('SELECT COUNT(*) c FROM giveaway_entries WHERE giveaway_id = ?').get(g.id).c,
  }));
  renderAdmin(req, res, 'admin/giveaways', { active: 'giveaways', allGiveaways: withCounts });
});

router.get('/giveaways/new', (req, res) => {
  renderAdmin(req, res, 'admin/giveaway-edit', {
    active: 'giveaways',
    giveaway: { id: '', slug: '', title: '', description: '', image_url: '', prize: '', conditions: [], deadline: '', enabled: 1, sort_order: 0 },
    isNew: true,
  });
});

router.get('/giveaways/:id/edit', (req, res) => {
  const giveaway = db.prepare('SELECT * FROM giveaways WHERE id = ?').get(req.params.id);
  if (!giveaway) return res.redirect('/admin/giveaways');
  let conditions = [];
  try { conditions = JSON.parse(giveaway.conditions || '[]'); } catch (_) { conditions = []; }
  renderAdmin(req, res, 'admin/giveaway-edit', {
    active: 'giveaways',
    giveaway: { ...giveaway, conditions },
    isNew: false,
  });
});

router.get('/giveaways/:id/entries', (req, res) => {
  const giveaway = db.prepare('SELECT * FROM giveaways WHERE id = ?').get(req.params.id);
  if (!giveaway) return res.redirect('/admin/giveaways');
  const entries = db.prepare('SELECT * FROM giveaway_entries WHERE giveaway_id = ? ORDER BY joined_at DESC').all(giveaway.id);
  renderAdmin(req, res, 'admin/giveaway-entries', { active: 'giveaways', giveaway, entries });
});

function conditionsFromText(text) {
  return String(text || '').split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, i) => ({ id: `c${i + 1}`, text: line }));
}

function giveawayFromBody(body) {
  return {
    title: s(body.title),
    description: s(body.description),
    image_url: s(body.image_url),
    prize: s(body.prize),
    conditions: JSON.stringify(conditionsFromText(body.conditions_text)),
    deadline: s(body.deadline),
    enabled: b(body.enabled),
    sort_order: parseInt(body.sort_order, 10) || 0,
  };
}

router.post('/giveaways', (req, res) => {
  const d = giveawayFromBody(req.body);
  const title = d.title || 'Розыгрыш';
  const slug = uniqueSlugFor('giveaways', s(req.body.slug) || title);
  db.prepare(`INSERT INTO giveaways (slug,title,description,image_url,prize,conditions,deadline,enabled,sort_order)
    VALUES (@slug,@title,@description,@image_url,@prize,@conditions,@deadline,@enabled,@sort_order)`)
    .run({ ...d, slug });
  markDirty();
  flash(req, 'success', 'Розыгрыш создан.');
  res.redirect('/admin/giveaways');
});

router.post('/giveaways/:id', (req, res) => {
  const id = req.params.id;
  const existing = db.prepare('SELECT id FROM giveaways WHERE id = ?').get(id);
  if (!existing) return res.redirect('/admin/giveaways');
  const d = giveawayFromBody(req.body);
  const title = d.title || 'Розыгрыш';
  const slug = uniqueSlugFor('giveaways', s(req.body.slug) || title, Number(id));
  db.prepare(`UPDATE giveaways SET slug=@slug,title=@title,description=@description,image_url=@image_url,
    prize=@prize,conditions=@conditions,deadline=@deadline,enabled=@enabled,sort_order=@sort_order WHERE id=@id`)
    .run({ ...d, slug, id });
  markDirty();
  flash(req, 'success', 'Розыгрыш сохранён.');
  res.redirect('/admin/giveaways');
});

router.post('/giveaways/:id/delete', (req, res) => {
  db.prepare('DELETE FROM giveaway_entries WHERE giveaway_id = ?').run(req.params.id);
  db.prepare('DELETE FROM giveaways WHERE id = ?').run(req.params.id);
  markDirty();
  flash(req, 'success', 'Розыгрыш удалён.');
  res.redirect('/admin/giveaways');
});

// --- Ratings (Рейтинг сайтов) -------------------------------------------
function ratingCat(v) {
  const slugs = getRatingCategories().map((c) => c.slug);
  return slugs.includes(v) ? v : (slugs[0] || 'cases');
}
function linesToArray(text) {
  return String(text || '').split('\n').map((l) => l.trim()).filter(Boolean).slice(0, 30);
}
function clampRating(v) {
  let n = parseFloat(String(v).replace(',', '.'));
  if (!isFinite(n)) n = 0;
  n = Math.max(0, Math.min(5, n));
  return Math.round(n * 10) / 10;
}

router.get('/ratings', (req, res) => {
  const ratings = db.prepare('SELECT * FROM ratings ORDER BY featured DESC, sort_order, id').all().map((r) => ({
    ...r,
    reviewCount: db.prepare('SELECT COUNT(*) c FROM rating_reviews WHERE rating_id = ?').get(r.id).c,
  }));
  renderAdmin(req, res, 'admin/ratings', { active: 'ratings', ratings, ratingCategories: getRatingCategories() });
});

router.get('/ratings/new', (req, res) => {
  const cats = getRatingCategories();
  renderAdmin(req, res, 'admin/rating-edit', {
    active: 'ratings',
    ratingCategories: cats,
    item: { id: '', slug: '', name: '', image_url: '', hero_image: '', category: (cats[0] && cats[0].slug) || 'cases', rating: 0, featured: 0,
      site_link: '', button_text: 'Перейти на сайт', bonus_label: '', pros: [], cons: [], blocks: [],
      meta_title: '', meta_description: '', enabled: 1, sort_order: 0 },
    reviews: [],
    isNew: true,
  });
});

router.get('/ratings/:id/edit', (req, res) => {
  const row = db.prepare('SELECT * FROM ratings WHERE id = ?').get(req.params.id);
  if (!row) return res.redirect('/admin/ratings');
  let blocks = []; let pros = []; let cons = [];
  try { blocks = JSON.parse(row.blocks || '[]'); } catch (_) {}
  try { pros = JSON.parse(row.pros || '[]'); } catch (_) {}
  try { cons = JSON.parse(row.cons || '[]'); } catch (_) {}
  const reviews = db.prepare('SELECT * FROM rating_reviews WHERE rating_id = ? ORDER BY datetime(created_at) DESC, id DESC').all(row.id);
  renderAdmin(req, res, 'admin/rating-edit', {
    active: 'ratings',
    ratingCategories: getRatingCategories(),
    item: { ...row, blocks, pros, cons },
    reviews,
    isNew: false,
  });
});

function ratingFromBody(body) {
  return {
    name: s(body.name) || 'Без названия',
    image_url: s(body.image_url),
    hero_image: s(body.hero_image),
    category: ratingCat(s(body.category)),
    rating: clampRating(body.rating),
    featured: b(body.featured),
    site_link: s(body.site_link),
    button_text: s(body.button_text) || 'Перейти на сайт',
    bonus_label: s(body.bonus_label),
    bonus_code: s(body.bonus_code),
    pros: JSON.stringify(linesToArray(body.pros)),
    cons: JSON.stringify(linesToArray(body.cons)),
    blocks: JSON.stringify(parseBlocks(body.blocks)),
    meta_title: s(body.meta_title),
    meta_description: s(body.meta_description),
    enabled: b(body.enabled),
    sort_order: parseInt(body.sort_order, 10) || 0,
  };
}

router.post('/ratings', (req, res) => {
  const d = ratingFromBody(req.body);
  const slug = uniqueSlugFor('ratings', s(req.body.slug) || d.name);
  db.prepare(`INSERT INTO ratings
    (slug,name,image_url,hero_image,category,rating,featured,site_link,button_text,bonus_label,bonus_code,pros,cons,blocks,meta_title,meta_description,enabled,sort_order)
    VALUES (@slug,@name,@image_url,@hero_image,@category,@rating,@featured,@site_link,@button_text,@bonus_label,@bonus_code,@pros,@cons,@blocks,@meta_title,@meta_description,@enabled,@sort_order)`)
    .run({ ...d, slug });
  markDirty();
  flash(req, 'success', 'Сайт добавлен в рейтинг.');
  res.redirect('/admin/ratings');
});

router.post('/ratings/:id', (req, res) => {
  const id = req.params.id;
  const existing = db.prepare('SELECT id FROM ratings WHERE id = ?').get(id);
  if (!existing) return res.redirect('/admin/ratings');
  const d = ratingFromBody(req.body);
  const slug = uniqueSlugFor('ratings', s(req.body.slug) || d.name, Number(id));
  db.prepare(`UPDATE ratings SET slug=@slug,name=@name,image_url=@image_url,hero_image=@hero_image,category=@category,
    rating=@rating,featured=@featured,site_link=@site_link,button_text=@button_text,bonus_label=@bonus_label,bonus_code=@bonus_code,
    pros=@pros,cons=@cons,blocks=@blocks,meta_title=@meta_title,meta_description=@meta_description,
    enabled=@enabled,sort_order=@sort_order WHERE id=@id`).run({ ...d, slug, id });
  markDirty();
  flash(req, 'success', 'Сайт в рейтинге сохранён.');
  res.redirect('/admin/ratings');
});

router.post('/ratings/:id/delete', (req, res) => {
  db.prepare('DELETE FROM rating_reviews WHERE rating_id = ?').run(req.params.id);
  db.prepare('DELETE FROM ratings WHERE id = ?').run(req.params.id);
  markDirty();
  flash(req, 'success', 'Сайт удалён из рейтинга.');
  res.redirect('/admin/ratings');
});

router.post('/ratings/:id/reviews/:rid/delete', (req, res) => {
  db.prepare('DELETE FROM rating_reviews WHERE id = ? AND rating_id = ?').run(req.params.rid, req.params.id);
  flash(req, 'success', 'Отзыв удалён.');
  res.redirect('/admin/ratings/' + req.params.id + '/edit');
});

// --- Rating categories (add / edit / delete) ----------------------------
router.get('/rating-categories', (req, res) => {
  const categories = db.prepare('SELECT * FROM rating_categories ORDER BY sort_order, id').all().map((c) => ({
    ...c,
    usedBy: db.prepare('SELECT COUNT(*) n FROM ratings WHERE category = ?').get(c.slug).n,
  }));
  renderAdmin(req, res, 'admin/rating-categories', { active: 'ratings', categories });
});

router.post('/rating-categories', (req, res) => {
  const title = s(req.body.title);
  if (title) {
    const slug = uniqueSlugFor('rating_categories', s(req.body.slug) || title);
    const maxRow = db.prepare('SELECT COALESCE(MAX(sort_order),-1) m FROM rating_categories').get();
    db.prepare('INSERT INTO rating_categories (slug, title, sort_order) VALUES (?, ?, ?)')
      .run(slug, title, (maxRow.m || 0) + 1);
    markDirty();
    flash(req, 'success', 'Категория добавлена.');
  }
  res.redirect('/admin/rating-categories');
});

router.post('/rating-categories/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM rating_categories WHERE id = ?').get(req.params.id);
  if (!row) return res.redirect('/admin/rating-categories');
  const title = s(req.body.title) || row.title;
  const newSlug = uniqueSlugFor('rating_categories', s(req.body.slug) || title, Number(row.id));
  // Keep ratings pointing at this category in sync when the slug changes.
  if (newSlug !== row.slug) {
    db.prepare('UPDATE ratings SET category = ? WHERE category = ?').run(newSlug, row.slug);
  }
  db.prepare('UPDATE rating_categories SET slug = ?, title = ?, sort_order = ? WHERE id = ?')
    .run(newSlug, title, parseInt(req.body.sort_order, 10) || 0, row.id);
  markDirty();
  flash(req, 'success', 'Категория сохранена.');
  res.redirect('/admin/rating-categories');
});

router.post('/rating-categories/:id/delete', (req, res) => {
  const row = db.prepare('SELECT * FROM rating_categories WHERE id = ?').get(req.params.id);
  if (!row) return res.redirect('/admin/rating-categories');
  const total = db.prepare('SELECT COUNT(*) c FROM rating_categories').get().c;
  if (total <= 1) {
    flash(req, 'error', 'Нельзя удалить последнюю категорию.');
    return res.redirect('/admin/rating-categories');
  }
  // Reassign sites from the deleted category to the first remaining one.
  const fallback = db.prepare('SELECT slug FROM rating_categories WHERE id != ? ORDER BY sort_order, id LIMIT 1').get(row.id);
  if (fallback) db.prepare('UPDATE ratings SET category = ? WHERE category = ?').run(fallback.slug, row.slug);
  db.prepare('DELETE FROM rating_categories WHERE id = ?').run(row.id);
  markDirty();
  flash(req, 'success', 'Категория удалена.');
  res.redirect('/admin/rating-categories');
});

// --- Settings -----------------------------------------------------------
const SETTINGS_KEYS = [
  'site_title', 'tagline', 'intro_text', 'logo_url', 'favicon_url',
  'giveaways_icon', 'giveaways_icon_image', 'home_sections',
  'bg_image', 'bg_blur', 'reviews_icon', 'reviews_icon_image',
  'contacts_telegram', 'contacts_email', 'contacts_text',
  'promo_per_page',
];
const HOME_SECTION_DEFS = [
  { key: 'promocodes', label: 'Актуальные промокоды и бонусы' },
  { key: 'sites',      label: 'Популярные сайты' },
  { key: 'articles',   label: 'Последние статьи' },
];
const HOME_SECTION_KEYS = HOME_SECTION_DEFS.map((d) => d.key);

function normalizeHomeSections(raw) {
  const requested = String(raw || '')
    .split(',')
    .map((x) => x.trim())
    .filter((x) => HOME_SECTION_KEYS.includes(x));
  const seen = new Set();
  const order = [];
  for (const x of requested) if (!seen.has(x)) { seen.add(x); order.push(x); }
  for (const x of HOME_SECTION_KEYS) if (!seen.has(x)) order.push(x);
  return order;
}

router.get('/settings', (req, res) => {
  const values = {};
  for (const k of SETTINGS_KEYS) values[k] = getSetting(k, '');
  const order = normalizeHomeSections(values.home_sections);
  const homeSections = order.map((key) => ({
    key,
    label: (HOME_SECTION_DEFS.find((d) => d.key === key) || {}).label || key,
  }));
  renderAdmin(req, res, 'admin/settings', { active: 'settings', values, homeSections });
});

router.post('/settings', (req, res) => {
  for (const k of SETTINGS_KEYS) {
    if (k === 'home_sections') {
      setSetting(k, normalizeHomeSections(req.body.home_sections).join(','));
    } else {
      setSetting(k, s(req.body[k]));
    }
  }
  markDirty();
  flash(req, 'success', 'Настройки сохранены.');
  res.redirect('/admin/settings');
});

// --- Header (navigation labels) -----------------------------------------
const NAV_ORDER_KEYS = ['home', 'promocodes', 'rating', 'services', 'articles', 'contacts'];
const NAV_LABELS = { home: 'Главная', promocodes: 'Промокоды', rating: 'Рейтинг', services: 'Сайты', articles: 'Статьи', contacts: 'Контакты' };
function normalizeNavOrder(raw) {
  const requested = String(raw || '').split(',').map((x) => x.trim()).filter((x) => NAV_ORDER_KEYS.includes(x));
  const seen = new Set();
  const order = [];
  for (const x of requested) if (!seen.has(x)) { seen.add(x); order.push(x); }
  for (const x of NAV_ORDER_KEYS) if (!seen.has(x)) order.push(x);
  return order;
}

router.get('/header', (req, res) => {
  const order = normalizeNavOrder(getSetting('nav_order', ''));
  const navItems = order.map((k) => ({ key: k, label: getSetting('nav_' + k, NAV_LABELS[k]) }));
  const ratingIcon = {
    enabled: getSetting('nav_rating_icon_enabled', '1') === '1',
    icon: getSetting('nav_rating_icon', '★'),
    image: getSetting('nav_rating_icon_image', ''),
  };
  renderAdmin(req, res, 'admin/header', { active: 'header', navItems, ratingIcon });
});

router.post('/header', (req, res) => {
  const order = normalizeNavOrder(req.body.nav_order);
  setSetting('nav_order', order.join(','));
  for (const k of NAV_ORDER_KEYS) setSetting('nav_' + k, s(req.body['nav_' + k]));
  setSetting('nav_rating_icon_enabled', b(req.body.nav_rating_icon_enabled) ? '1' : '0');
  setSetting('nav_rating_icon', s(req.body.nav_rating_icon));
  setSetting('nav_rating_icon_image', s(req.body.nav_rating_icon_image));
  markDirty();
  flash(req, 'success', 'Шапка сохранена.');
  res.redirect('/admin/header');
});

// --- Gift (Подарок) -----------------------------------------------------
const GIFT_TEXT_KEYS = ['gift_icon', 'gift_icon_image', 'gift_image', 'gift_text', 'gift_code', 'gift_button_text', 'gift_button_link'];

router.get('/gift', (req, res) => {
  const values = {};
  for (const k of GIFT_TEXT_KEYS) values[k] = getSetting(k, '');
  values.gift_enabled = getSetting('gift_enabled', '1') === '1';
  renderAdmin(req, res, 'admin/gift', { active: 'gift', values });
});

router.post('/gift', (req, res) => {
  for (const k of GIFT_TEXT_KEYS) setSetting(k, s(req.body[k]));
  setSetting('gift_enabled', b(req.body.gift_enabled) ? '1' : '0');
  markDirty();
  flash(req, 'success', 'Подарок сохранён.');
  res.redirect('/admin/gift');
});

// --- Inline banner (Межстрочная плашка) --------------------------------
router.get('/inline-banner', (req, res) => {
  const banners = db.prepare('SELECT * FROM inline_banners ORDER BY sort_order, id').all();
  const clicks = db.prepare("SELECT label, COUNT(*) n FROM analytics_events WHERE type='click' AND label LIKE 'Межстрочная плашка%' GROUP BY label ORDER BY n DESC").all();
  renderAdmin(req, res, 'admin/inline-banner', { active: 'inline-banner', banners, clicks });
});

function inlineBannerFromBody(body) {
  return {
    enabled:        b(body.enabled),
    after_row:      Math.max(1, parseInt(body.after_row, 10) || 1),
    banner_image:   s(body.banner_image),
    image_url:      s(body.image_url),
    image_enabled:  b(body.image_enabled),
    text:           s(body.text).slice(0, 400),
    text_enabled:   b(body.text_enabled),
    code:           s(body.code).slice(0, 100),
    code_enabled:   b(body.code_enabled),
    button_text:    s(body.button_text).slice(0, 80),
    button_link:    s(body.button_link),
    button_enabled: b(body.button_enabled),
    sort_order:     parseInt(body.sort_order, 10) || 0,
  };
}

router.post('/inline-banner', (req, res) => {
  const d = inlineBannerFromBody(req.body);
  db.prepare(`INSERT INTO inline_banners
    (enabled,after_row,banner_image,image_url,image_enabled,text,text_enabled,code,code_enabled,button_text,button_link,button_enabled,sort_order)
    VALUES (@enabled,@after_row,@banner_image,@image_url,@image_enabled,@text,@text_enabled,@code,@code_enabled,@button_text,@button_link,@button_enabled,@sort_order)`).run(d);
  markDirty();
  flash(req, 'success', 'Межстрочная плашка добавлена.');
  res.redirect('/admin/inline-banner');
});

router.post('/inline-banner/:id', (req, res) => {
  const d = inlineBannerFromBody(req.body);
  db.prepare(`UPDATE inline_banners SET
    enabled=@enabled,after_row=@after_row,banner_image=@banner_image,
    image_url=@image_url,image_enabled=@image_enabled,
    text=@text,text_enabled=@text_enabled,code=@code,code_enabled=@code_enabled,
    button_text=@button_text,button_link=@button_link,button_enabled=@button_enabled,sort_order=@sort_order
    WHERE id=@id`).run({ ...d, id: req.params.id });
  markDirty();
  flash(req, 'success', 'Плашка сохранена.');
  res.redirect('/admin/inline-banner');
});

router.post('/inline-banner/:id/delete', (req, res) => {
  db.prepare('DELETE FROM inline_banners WHERE id = ?').run(req.params.id);
  markDirty();
  flash(req, 'success', 'Плашка удалена.');
  res.redirect('/admin/inline-banner');
});

// --- Метрика / аналитика ------------------------------------------------
router.get('/metrika', (req, res) => {
  const tab = req.query.tab === 'clicks' ? 'clicks' : 'overview';
  const one = (sql) => db.prepare(sql).get().c;
  const stats = {
    totalViews: one("SELECT COUNT(*) c FROM analytics_events WHERE type='pageview'"),
    todayViews: one("SELECT COUNT(*) c FROM analytics_events WHERE type='pageview' AND date(created_at)=date('now')"),
    weekViews: one("SELECT COUNT(*) c FROM analytics_events WHERE type='pageview' AND created_at >= datetime('now','-7 days')"),
    totalClicks: one("SELECT COUNT(*) c FROM analytics_events WHERE type='click'"),
  };
  const topPages = db.prepare("SELECT path, COUNT(*) n FROM analytics_events WHERE type='pageview' GROUP BY path ORDER BY n DESC LIMIT 30").all();
  const clicks = db.prepare("SELECT label, COUNT(*) n FROM analytics_events WHERE type='click' AND label <> '' GROUP BY label ORDER BY n DESC LIMIT 200").all();
  renderAdmin(req, res, 'admin/metrika', {
    active: 'metrika',
    tab,
    values: {
      metrika_yandex_id: getSetting('metrika_yandex_id', ''),
      metrika_google_id: getSetting('metrika_google_id', ''),
      metrika_yandex_code: getSetting('metrika_yandex_code', ''),
      metrika_google_code: getSetting('metrika_google_code', ''),
    },
    stats, topPages, clicks,
  });
});

router.post('/metrika', (req, res) => {
  setSetting('metrika_yandex_id', String(req.body.metrika_yandex_id || '').replace(/[^0-9]/g, '').slice(0, 20));
  setSetting('metrika_google_id', String(req.body.metrika_google_id || '').trim().replace(/[^A-Za-z0-9_-]/g, '').slice(0, 40));
  // Full pasted snippets (stored verbatim; admin-only trusted input).
  setSetting('metrika_yandex_code', String(req.body.metrika_yandex_code || '').slice(0, 20000));
  setSetting('metrika_google_code', String(req.body.metrika_google_code || '').slice(0, 20000));
  flash(req, 'success', 'Коды метрики сохранены и сразу применяются на сайте.');
  res.redirect('/admin/metrika');
});

router.post('/metrika/reset', (req, res) => {
  db.prepare('DELETE FROM analytics_events').run();
  flash(req, 'success', 'Статистика сброшена.');
  res.redirect('/admin/metrika');
});

// --- Contacts page (rich editor) ----------------------------------------
router.get('/contacts', (req, res) => {
  let blocks = [];
  try { blocks = JSON.parse(getSetting('contacts_blocks', '[]')); } catch (_) {}
  renderAdmin(req, res, 'admin/contacts-edit', {
    active: 'settings',
    blocks,
    contacts_text:     getSetting('contacts_text', ''),
    contacts_telegram: getSetting('contacts_telegram', ''),
    contacts_email:    getSetting('contacts_email', ''),
  });
});

router.post('/contacts', (req, res) => {
  setSetting('contacts_text',     s(req.body.contacts_text));
  setSetting('contacts_telegram', s(req.body.contacts_telegram));
  setSetting('contacts_email',    s(req.body.contacts_email));
  setSetting('contacts_blocks',   JSON.stringify(parseBlocks(req.body.blocks)));
  markDirty();
  flash(req, 'success', 'Страница контактов сохранена.');
  res.redirect('/admin/contacts');
});

// --- SEO ----------------------------------------------------------------
const SEO_TEXT_KEYS = [
  'seo_title_suffix', 'seo_default_description', 'seo_default_keywords',
  'seo_og_image', 'seo_canonical_host', 'seo_yandex_verification',
  'seo_google_verification', 'seo_robots_txt',
  'home_promos_limit', 'home_sites_limit', 'home_articles_limit',
];
const SECTION_KEYS = [
  'sec_promocodes_title', 'sec_promocodes_sub', 'sec_sites_title', 'sec_articles_title',
  'sec_promocodes_icon', 'sec_sites_icon', 'sec_articles_icon',
];
const PAGE_SEO_PAGES = [
  { page: 'home',       label: 'Главная',           hasH1: false },
  { page: 'services',   label: 'Сайты (список)',    hasH1: true },
  { page: 'giveaways',  label: 'Розыгрыши (список)', hasH1: true },
  { page: 'articles',   label: 'Статьи (список)',   hasH1: true },
  { page: 'rating',     label: 'Рейтинг (список)',  hasH1: true },
  { page: 'contacts',   label: 'Контакты',          hasH1: true },
  { page: 'steam-keys', label: 'Ключи Steam',       hasH1: true },
];

router.get('/seo', (req, res) => {
  const seoValues = {};
  for (const k of SEO_TEXT_KEYS) seoValues[k] = getSetting(k, '');
  seoValues.seo_noindex = getSetting('seo_noindex', '0') === '1';
  const sectionValues = {};
  for (const k of SECTION_KEYS) sectionValues[k] = getSetting(k, '');

  const rows = {};
  for (const r of db.prepare('SELECT * FROM page_seo').all()) rows[r.page] = r;
  const pageSeoList = PAGE_SEO_PAGES.map((p) => ({ ...p, data: rows[p.page] || {} }));

  renderAdmin(req, res, 'admin/seo', {
    active: 'seo',
    seoValues,
    sectionValues,
    pageSeoList,
    canonicalHost: getSetting('seo_canonical_host', ''),
  });
});

router.post('/seo', (req, res) => {
  for (const k of SEO_TEXT_KEYS) setSetting(k, s(req.body[k]));
  setSetting('seo_noindex', b(req.body.seo_noindex) ? '1' : '0');
  for (const k of SECTION_KEYS) setSetting(k, s(req.body[k]));

  const upsert = db.prepare(`INSERT INTO page_seo (page,title,description,keywords,h1,og_image,noindex)
    VALUES (@page,@title,@description,@keywords,@h1,@og_image,@noindex)
    ON CONFLICT(page) DO UPDATE SET
      title=@title, description=@description, keywords=@keywords,
      h1=@h1, og_image=@og_image, noindex=@noindex`);
  for (const p of PAGE_SEO_PAGES) {
    upsert.run({
      page: p.page,
      title: s(req.body[p.page + '_title']),
      description: s(req.body[p.page + '_description']),
      keywords: s(req.body[p.page + '_keywords']),
      h1: p.hasH1 ? s(req.body[p.page + '_h1']) : '',
      og_image: s(req.body[p.page + '_og_image']),
      noindex: b(req.body[p.page + '_noindex']),
    });
  }
  markDirty();
  flash(req, 'success', 'SEO-настройки сохранены.');
  res.redirect('/admin/seo');
});

// --- Wheels (Steam Keys roulette) ----------------------------------------
router.get('/wheels', (req, res) => {
  const wheels = db.prepare('SELECT * FROM wheels ORDER BY sort_order, id').all();
  wheels.forEach(w => {
    w.prizes = db.prepare('SELECT * FROM wheel_prizes WHERE wheel_id = ? ORDER BY sort_order, id').all(w.id);
    w.prizes.forEach(p => {
      p.keys = db.prepare('SELECT * FROM wheel_keys WHERE prize_id = ? ORDER BY id').all(p.id);
      p.keyCount = p.keys.filter(k => !k.used).length;
    });
    w.spinCount = (db.prepare('SELECT COUNT(*) n FROM wheel_spins WHERE wheel_id = ?').get(w.id) || {}).n || 0;
  });
  const conditions = db.prepare('SELECT * FROM wheel_conditions ORDER BY sort_order, id').all();
  const spinStats = db.prepare(`SELECT ws.tg_username, COUNT(*) spins, MAX(ws.spun_at) last_spin
    FROM wheel_spins ws GROUP BY ws.tg_id ORDER BY last_spin DESC LIMIT 50`).all();
  const totalSpins = (db.prepare('SELECT COUNT(*) n FROM wheel_spins').get() || {}).n || 0;
  const _hostname = req.get('x-forwarded-host') || req.get('host') || 'localhost';
  const _proto = _hostname.startsWith('localhost') ? 'http' : 'https';
  // Auto-generate relay secret if missing
  let relaySecret = getSetting('relay_secret', '');
  if (!relaySecret) {
    relaySecret = crypto.randomBytes(20).toString('hex');
    setSetting('relay_secret', relaySecret);
  }
  renderAdmin(req, res, 'admin/wheels', {
    active: 'wheels', wheels, conditions, spinStats, totalSpins,
    botToken: getSetting('tg_bot_token', ''),
    botLink: getSetting('tg_bot_link', 't.me/promocodichbot'),
    navSteamkeys: getSetting('nav_steamkeys', 'Ключи Steam'),
    navSteamkeysIcon: getSetting('nav_steamkeys_icon', '🎮'),
    navSteamkeysIconImage: getSetting('nav_steamkeys_icon_image', ''),
    navSteamkeysBold: getSetting('nav_steamkeys_bold', '1') === '1',
    navSteamkeysEnabled: getSetting('nav_steamkeys_enabled', '1') === '1',
    webhookUrl: `${_proto}://${_hostname}`,
    siteUrl: getSetting('tg_site_url', ''),
    relaySecret,
  });
});

router.post('/wheels', (req, res) => {
  db.prepare('INSERT INTO wheels (name, enabled, sort_order) VALUES (?, ?, ?)').run(
    s(req.body.name) || 'Колесо фортуны', 1, parseInt(req.body.sort_order, 10) || 0);
  markDirty(); flash(req, 'success', 'Колесо добавлено.'); res.redirect('/admin/wheels');
});
router.post('/wheels/:id', (req, res) => {
  db.prepare('UPDATE wheels SET name=?, enabled=?, sort_order=? WHERE id=?').run(
    s(req.body.name) || 'Колесо фортуны', b(req.body.enabled), parseInt(req.body.sort_order, 10) || 0, req.params.id);
  markDirty(); flash(req, 'success', 'Колесо сохранено.'); res.redirect('/admin/wheels');
});
router.post('/wheels/:id/delete', (req, res) => {
  db.prepare('DELETE FROM wheels WHERE id = ?').run(req.params.id);
  markDirty(); flash(req, 'success', 'Колесо удалено.'); res.redirect('/admin/wheels');
});

router.post('/wheels/:wid/prizes', (req, res) => {
  db.prepare('INSERT INTO wheel_prizes (wheel_id,label,image_url,chance,color,sort_order) VALUES (?,?,?,?,?,?)').run(
    req.params.wid, s(req.body.label), s(req.body.image_url),
    Math.max(1, parseInt(req.body.chance, 10) || 10), s(req.body.color),
    parseInt(req.body.sort_order, 10) || 0);
  markDirty(); flash(req, 'success', 'Приз добавлен.'); res.redirect('/admin/wheels');
});
router.post('/wheel-prizes/:id', (req, res) => {
  db.prepare('UPDATE wheel_prizes SET label=?,image_url=?,chance=?,color=?,sort_order=? WHERE id=?').run(
    s(req.body.label), s(req.body.image_url),
    Math.max(1, parseInt(req.body.chance, 10) || 10), s(req.body.color),
    parseInt(req.body.sort_order, 10) || 0, req.params.id);
  markDirty(); flash(req, 'success', 'Приз сохранён.'); res.redirect('/admin/wheels');
});
router.post('/wheel-prizes/:id/delete', (req, res) => {
  db.prepare('DELETE FROM wheel_prizes WHERE id = ?').run(req.params.id);
  markDirty(); flash(req, 'success', 'Приз удалён.'); res.redirect('/admin/wheels');
});

router.post('/wheel-prizes/:pid/keys', (req, res) => {
  const keysRaw = s(req.body.keys);
  const keys = keysRaw.split(/[\s,]+/).map(k => k.trim()).filter(Boolean);
  const ins = db.prepare('INSERT INTO wheel_keys (prize_id, key_value) VALUES (?, ?)');
  for (const k of keys) ins.run(req.params.pid, k);
  markDirty(); flash(req, 'success', `Добавлено ключей: ${keys.length}`); res.redirect('/admin/wheels');
});
router.post('/wheel-keys/:id/delete', (req, res) => {
  db.prepare('DELETE FROM wheel_keys WHERE id = ?').run(req.params.id);
  markDirty(); flash(req, 'success', 'Ключ удалён.'); res.redirect('/admin/wheels');
});

router.post('/wheel-conditions', (req, res) => {
  db.prepare('INSERT INTO wheel_conditions (label,channel_url,channel_id,enabled,sort_order) VALUES (?,?,?,?,?)').run(
    s(req.body.label) || 'Подписаться на канал', s(req.body.channel_url), s(req.body.channel_id),
    1, parseInt(req.body.sort_order, 10) || 0);
  flash(req, 'success', 'Условие добавлено.'); res.redirect('/admin/wheels');
});
router.post('/wheel-conditions/:id', (req, res) => {
  db.prepare('UPDATE wheel_conditions SET label=?,channel_url=?,channel_id=?,enabled=?,sort_order=? WHERE id=?').run(
    s(req.body.label), s(req.body.channel_url), s(req.body.channel_id),
    b(req.body.enabled), parseInt(req.body.sort_order, 10) || 0, req.params.id);
  flash(req, 'success', 'Условие сохранено.'); res.redirect('/admin/wheels');
});
router.post('/wheel-conditions/:id/delete', (req, res) => {
  db.prepare('DELETE FROM wheel_conditions WHERE id = ?').run(req.params.id);
  flash(req, 'success', 'Условие удалено.'); res.redirect('/admin/wheels');
});

router.post('/wheel-settings', (req, res) => {
  setSetting('tg_bot_token', s(req.body.tg_bot_token));
  setSetting('tg_bot_link', s(req.body.tg_bot_link));
  setSetting('nav_steamkeys', s(req.body.nav_steamkeys) || 'Ключи Steam');
  setSetting('nav_steamkeys_icon', s(req.body.nav_steamkeys_icon));
  setSetting('nav_steamkeys_icon_image', s(req.body.nav_steamkeys_icon_image));
  setSetting('nav_steamkeys_bold', b(req.body.nav_steamkeys_bold) ? '1' : '0');
  setSetting('nav_steamkeys_enabled', b(req.body.nav_steamkeys_enabled) ? '1' : '0');
  markDirty(); flash(req, 'success', 'Настройки сохранены.'); res.redirect('/admin/wheels');
});

router.post('/wheel-webhook', (req, res) => {
  let base = s(req.body.site_url) || '';
  if (!base) {
    const hostname = req.get('x-forwarded-host') || req.get('host') || 'localhost';
    const proto = hostname.startsWith('localhost') ? 'http' : 'https';
    base = proto + '://' + hostname;
  }
  base = base.replace(/\/$/, '');
  setSetting('tg_site_url', base);
  flash(req, 'success', 'URL сохранён: ' + base);
  res.redirect('/admin/wheels');
});

router.get('/wheel-relay-check', async (req, res) => {
  const relayUrl = s(req.query.url).replace(/\/$/, '');
  if (!relayUrl || !/^https?:\/\//i.test(relayUrl)) {
    return res.json({ ok: false, error: 'Некорректный URL Warsaw relay' });
  }
  const https = require('https');
  const http = require('http');
  const { URL } = require('url');
  try {
    const parsed = new URL(relayUrl + '/health');
    const mod = parsed.protocol === 'https:' ? https : http;
    const data = await new Promise((resolve, reject) => {
      const r = mod.get(parsed, resp => {
        let d = '';
        resp.on('data', c => { d += c; });
        resp.on('end', () => {
          try { resolve(JSON.parse(d)); } catch (e) { reject(new Error('Неверный ответ relay')); }
        });
      });
      r.on('error', reject);
      r.setTimeout(8000, () => { r.destroy(); reject(new Error('Таймаут')); });
    });
    const moscowUrl = getSetting('tg_site_url', '') || '';
    if (data.ok && moscowUrl && data.moscow && data.moscow !== moscowUrl.replace(/\/$/, '')) {
      return res.json({
        ok: false,
        error: 'Relay работает, но MOSCOW_URL не совпадает с URL сайта. В Warsaw задайте MOSCOW_URL=' + moscowUrl,
        moscow: data.moscow,
        warsaw: data.warsaw,
      });
    }
    res.json({ ok: !!data.ok, moscow: data.moscow, warsaw: data.warsaw });
  } catch (e) {
    res.json({ ok: false, error: 'Relay недоступен: ' + e.message });
  }
});

module.exports = router;
