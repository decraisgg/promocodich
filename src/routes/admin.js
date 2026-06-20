'use strict';

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const express = require('express');
const multer = require('multer');

const { db, getSetting, setSetting, markDirty, CATEGORIES, CATEGORY_TITLES } = require('../db');
const { publish } = require('../publish');
const { sanitizeBlocks } = require('../sanitize');
const { checkPassword, requireAuth, requireAuthApi } = require('../auth');

const router = express.Router();

// --- Uploads ------------------------------------------------------------
const UPLOAD_DIR = path.join(__dirname, '..', '..', 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const ext = (path.extname(file.originalname) || '').toLowerCase().replace(/[^.a-z0-9]/g, '');
    cb(null, `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${ext || '.img'}`);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (/^image\//.test(file.mimetype)) return cb(null, true);
    cb(new Error('Можно загружать только изображения'));
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
  res.render(view, {
    layout: true,
    active: '',
    dirty: getSetting('dirty', '0') === '1',
    lastPublished: getSetting('last_published_at', ''),
    siteTitle: getSetting('site_title', 'ПРОМОКОДЫЧ'),
    categories: CATEGORIES,
    categoryTitles: CATEGORY_TITLES,
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
    .slice(0, 80) || 'article';
}
function uniqueSlug(base, excludeId = null) {
  let slug = slugify(base);
  let candidate = slug;
  let n = 2;
  while (true) {
    const row = db.prepare('SELECT id FROM articles WHERE slug = ?').get(candidate);
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
    if (err) return res.status(400).json({ ok: false, error: err.message });
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
    (enabled,size,image_url,image_link,text_enabled,title,subtitle,button_enabled,button_text,button_link,sort_order)
    VALUES (@enabled,@size,@image_url,@image_link,@text_enabled,@title,@subtitle,@button_enabled,@button_text,@button_link,@sort_order)`).run(d);
  markDirty();
  flash(req, 'success', 'Баннер добавлен.');
  res.redirect('/admin/banners');
});

router.post('/banners/:id', (req, res) => {
  const d = bannerFromBody(req.body);
  db.prepare(`UPDATE banners SET
    enabled=@enabled,size=@size,image_url=@image_url,image_link=@image_link,text_enabled=@text_enabled,
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
    (enabled,service_name,bonus_label,code,description,image_url,link,sort_order)
    VALUES (@enabled,@service_name,@bonus_label,@code,@description,@image_url,@link,@sort_order)`).run(d);
  markDirty();
  flash(req, 'success', 'Промокод добавлен.');
  res.redirect('/admin/promocodes');
});

router.post('/promocodes/:id', (req, res) => {
  const d = promoFromBody(req.body);
  db.prepare(`UPDATE promocodes SET
    enabled=@enabled,service_name=@service_name,bonus_label=@bonus_label,code=@code,
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
  const slug = uniqueSlug(s(req.body.slug) || title);
  const blocks = parseBlocks(req.body.blocks);
  db.prepare(`INSERT INTO articles (slug,title,category,excerpt,featured_image,blocks,enabled,sort_order)
    VALUES (@slug,@title,@category,@excerpt,@featured_image,@blocks,@enabled,@sort_order)`).run({
    slug,
    title,
    category: s(req.body.category) || 'games',
    excerpt: s(req.body.excerpt),
    featured_image: s(req.body.featured_image),
    blocks: JSON.stringify(blocks),
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
  const slug = uniqueSlug(s(req.body.slug) || title, Number(id));
  const blocks = parseBlocks(req.body.blocks);
  db.prepare(`UPDATE articles SET slug=@slug,title=@title,category=@category,excerpt=@excerpt,
    featured_image=@featured_image,blocks=@blocks,enabled=@enabled,sort_order=@sort_order WHERE id=@id`).run({
    id,
    slug,
    title,
    category: s(req.body.category) || 'games',
    excerpt: s(req.body.excerpt),
    featured_image: s(req.body.featured_image),
    blocks: JSON.stringify(blocks),
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

// --- Settings -----------------------------------------------------------
router.get('/settings', (req, res) => {
  const keys = ['site_title', 'tagline', 'intro_text', 'contacts_telegram', 'contacts_email', 'contacts_text'];
  const values = {};
  for (const k of keys) values[k] = getSetting(k, '');
  renderAdmin(req, res, 'admin/settings', { active: 'settings', values });
});

router.post('/settings', (req, res) => {
  const keys = ['site_title', 'tagline', 'intro_text', 'contacts_telegram', 'contacts_email', 'contacts_text'];
  for (const k of keys) setSetting(k, s(req.body[k]));
  markDirty();
  flash(req, 'success', 'Настройки сохранены.');
  res.redirect('/admin/settings');
});

module.exports = router;
