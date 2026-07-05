'use strict';

const Database = require('better-sqlite3');
const { DB_PATH } = require('./paths');

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

// --- Schema -------------------------------------------------------------
db.exec(`
CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT
);

CREATE TABLE IF NOT EXISTS services (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  slug        TEXT    UNIQUE,
  name        TEXT    DEFAULT '',
  description TEXT    DEFAULT '',
  image_url   TEXT    DEFAULT '',
  tile_image  TEXT    DEFAULT '',
  hero_image  TEXT    DEFAULT '',
  color       TEXT    DEFAULT '',
  meta_title       TEXT DEFAULT '',
  meta_description TEXT DEFAULT '',
  enabled     INTEGER NOT NULL DEFAULT 1,
  sort_order  INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS banners (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  enabled        INTEGER NOT NULL DEFAULT 1,
  service_id     INTEGER REFERENCES services(id) ON DELETE SET NULL,
  size           TEXT    NOT NULL DEFAULT 'small',
  image_url      TEXT    DEFAULT '',
  image_link     TEXT    DEFAULT '',
  text_enabled   INTEGER NOT NULL DEFAULT 1,
  title          TEXT    DEFAULT '',
  subtitle       TEXT    DEFAULT '',
  button_enabled INTEGER NOT NULL DEFAULT 1,
  button_text    TEXT    DEFAULT '',
  button_link    TEXT    DEFAULT '',
  sort_order     INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS promocodes (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  enabled      INTEGER NOT NULL DEFAULT 1,
  service_id   INTEGER REFERENCES services(id) ON DELETE SET NULL,
  service_name TEXT    DEFAULT '',
  bonus_label  TEXT    DEFAULT '',
  code         TEXT    DEFAULT '',
  description  TEXT    DEFAULT '',
  image_url    TEXT    DEFAULT '',
  link         TEXT    DEFAULT '',
  sort_order   INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS articles (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  slug           TEXT    UNIQUE,
  title          TEXT    DEFAULT '',
  category       TEXT    DEFAULT 'games',
  excerpt        TEXT    DEFAULT '',
  featured_image TEXT    DEFAULT '',
  blocks         TEXT    DEFAULT '[]',
  meta_title     TEXT    DEFAULT '',
  meta_description TEXT  DEFAULT '',
  enabled        INTEGER NOT NULL DEFAULT 1,
  created_at     TEXT    DEFAULT (datetime('now')),
  sort_order     INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS page_seo (
  page        TEXT PRIMARY KEY,
  title       TEXT    DEFAULT '',
  description TEXT    DEFAULT '',
  keywords    TEXT    DEFAULT '',
  h1          TEXT    DEFAULT '',
  og_image    TEXT    DEFAULT '',
  noindex     INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS popups (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  enabled     INTEGER NOT NULL DEFAULT 1,
  image_url   TEXT    DEFAULT '',
  text        TEXT    DEFAULT '',
  button_text TEXT    DEFAULT '',
  button_link TEXT    DEFAULT '',
  code        TEXT    DEFAULT '',
  sort_order  INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS giveaways (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  slug        TEXT    UNIQUE,
  title       TEXT    DEFAULT '',
  description TEXT    DEFAULT '',
  image_url   TEXT    DEFAULT '',
  prize       TEXT    DEFAULT '',
  conditions  TEXT    DEFAULT '[]',
  deadline    TEXT    DEFAULT '',
  enabled     INTEGER NOT NULL DEFAULT 1,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT    DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS giveaway_entries (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  giveaway_id INTEGER NOT NULL,
  session_id  TEXT    NOT NULL,
  joined_at   TEXT    DEFAULT (datetime('now')),
  UNIQUE(giveaway_id, session_id)
);

CREATE TABLE IF NOT EXISTS ratings (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  slug            TEXT    UNIQUE,
  name            TEXT    DEFAULT '',
  image_url       TEXT    DEFAULT '',
  hero_image      TEXT    DEFAULT '',
  category        TEXT    DEFAULT 'cases',
  rating          REAL    NOT NULL DEFAULT 0,
  featured        INTEGER NOT NULL DEFAULT 0,
  site_link       TEXT    DEFAULT '',
  button_text     TEXT    DEFAULT '',
  bonus_label     TEXT    DEFAULT '',
  bonus_code      TEXT    DEFAULT '',
  pros            TEXT    DEFAULT '[]',
  cons            TEXT    DEFAULT '[]',
  blocks          TEXT    DEFAULT '[]',
  meta_title      TEXT    DEFAULT '',
  meta_description TEXT   DEFAULT '',
  enabled         INTEGER NOT NULL DEFAULT 1,
  sort_order      INTEGER NOT NULL DEFAULT 0,
  created_at      TEXT    DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS rating_reviews (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  rating_id   INTEGER NOT NULL,
  author      TEXT    DEFAULT '',
  text        TEXT    DEFAULT '',
  stars       INTEGER NOT NULL DEFAULT 5,
  created_at  TEXT    DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS rating_categories (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  slug        TEXT    UNIQUE,
  title       TEXT    DEFAULT '',
  sort_order  INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS analytics_events (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  type        TEXT    NOT NULL,
  label       TEXT    DEFAULT '',
  path        TEXT    DEFAULT '',
  created_at  TEXT    DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_analytics_type ON analytics_events(type);
CREATE INDEX IF NOT EXISTS idx_analytics_created ON analytics_events(created_at);

CREATE TABLE IF NOT EXISTS inline_banners (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  enabled        INTEGER NOT NULL DEFAULT 1,
  after_row      INTEGER NOT NULL DEFAULT 1,
  image_url      TEXT    DEFAULT '',
  image_enabled  INTEGER NOT NULL DEFAULT 1,
  text           TEXT    DEFAULT '',
  text_enabled   INTEGER NOT NULL DEFAULT 1,
  code           TEXT    DEFAULT '',
  code_enabled   INTEGER NOT NULL DEFAULT 0,
  button_text    TEXT    DEFAULT '',
  button_link    TEXT    DEFAULT '',
  button_enabled INTEGER NOT NULL DEFAULT 1,
  sort_order     INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS wheels (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT DEFAULT 'Колесо фортуны',
  enabled    INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS wheel_prizes (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  wheel_id   INTEGER NOT NULL REFERENCES wheels(id) ON DELETE CASCADE,
  label      TEXT DEFAULT '',
  image_url  TEXT DEFAULT '',
  chance     INTEGER NOT NULL DEFAULT 10,
  color      TEXT DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS wheel_keys (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  prize_id       INTEGER NOT NULL REFERENCES wheel_prizes(id) ON DELETE CASCADE,
  key_value      TEXT NOT NULL DEFAULT '',
  used           INTEGER NOT NULL DEFAULT 0,
  used_by_tg_id  TEXT DEFAULT '',
  used_at        TEXT DEFAULT NULL
);
CREATE TABLE IF NOT EXISTS wheel_conditions (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  label       TEXT DEFAULT 'Подписаться на канал',
  channel_url TEXT DEFAULT '',
  channel_id  TEXT DEFAULT '',
  enabled     INTEGER NOT NULL DEFAULT 1,
  sort_order  INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS wheel_spins (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  tg_id       TEXT NOT NULL,
  tg_username TEXT DEFAULT '',
  wheel_id    INTEGER,
  prize_id    INTEGER,
  key_id      INTEGER,
  spun_at     TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS tg_sessions (
  code        TEXT PRIMARY KEY,
  tg_id       TEXT DEFAULT '',
  tg_username TEXT DEFAULT '',
  verified    INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT DEFAULT (datetime('now'))
);
`);

// Migration: add service_id to existing tables if column is missing
const addColIfMissing = (table, col, def) => {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all();
  if (!cols.some((c) => c.name === col)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${def}`);
  }
};
addColIfMissing('banners', 'service_id', 'INTEGER REFERENCES services(id) ON DELETE SET NULL');
addColIfMissing('promocodes', 'service_id', 'INTEGER REFERENCES services(id) ON DELETE SET NULL');
addColIfMissing('services', 'hero_image', "TEXT DEFAULT ''");
addColIfMissing('services', 'tile_image', "TEXT DEFAULT ''");
addColIfMissing('services', 'meta_title', "TEXT DEFAULT ''");
addColIfMissing('services', 'meta_description', "TEXT DEFAULT ''");
addColIfMissing('articles', 'meta_title', "TEXT DEFAULT ''");
addColIfMissing('articles', 'meta_description', "TEXT DEFAULT ''");
addColIfMissing('ratings', 'bonus_code', "TEXT DEFAULT ''");
addColIfMissing('inline_banners', 'banner_image', "TEXT DEFAULT ''");
addColIfMissing('tg_sessions', 'reject_reason', "TEXT DEFAULT ''");

// --- Settings helpers ---------------------------------------------------
const getSettingStmt = db.prepare('SELECT value FROM settings WHERE key = ?');
const setSettingStmt = db.prepare(
  'INSERT INTO settings (key, value) VALUES (?, ?) ' +
  'ON CONFLICT(key) DO UPDATE SET value = excluded.value'
);

function getSetting(key, fallback = '') {
  const row = getSettingStmt.get(key);
  return row ? row.value : fallback;
}
function setSetting(key, value) {
  setSettingStmt.run(key, value == null ? '' : String(value));
}
function markDirty() {
  setSetting('dirty', '1');
}

// --- Categories (single source of truth) --------------------------------
const CATEGORIES = [
  { slug: 'games',    title: 'Игровые' },
  { slug: 'internet', title: 'Новости интернета' },
  { slug: 'digital',  title: 'Цифровые статьи' },
  { slug: 'crypto',   title: 'Крипто статьи' },
];
const CATEGORY_TITLES = Object.fromEntries(CATEGORIES.map((c) => [c.slug, c.title]));

// --- Rating categories (now editable; stored in rating_categories) ------
const RATING_CATEGORIES_DEFAULT = [
  { slug: 'cases',      title: 'Кейсы' },
  { slug: 'mini-games', title: 'Мини игры' },
  { slug: 'skins',      title: 'Скины' },
  { slug: 'keys',       title: 'Ключи' },
  { slug: 'steam',      title: 'Пополнение Steam' },
];
// Read the admin-managed rating categories from the DB (ordered).
function getRatingCategories() {
  return db.prepare('SELECT slug, title FROM rating_categories ORDER BY sort_order, id').all();
}
function getRatingCategoryTitles() {
  const m = {};
  for (const c of getRatingCategories()) m[c.slug] = c.title;
  return m;
}

// --- Seed (only on first run / empty DB) --------------------------------
function seed() {
  if (getSetting('seeded') !== '1') {
    _seedInitial();
  }
  _seedV2();
  _seedRatingCategories();
  _ensureDefaults();
  // _seedInlineBanner is called from inside _ensureDefaults
}

// Seed the default rating categories once (admin can edit them afterwards).
function _seedRatingCategories() {
  if (getSetting('seeded_rating_cats') === '1') return;
  const count = db.prepare('SELECT COUNT(*) c FROM rating_categories').get().c;
  if (count === 0) {
    const ins = db.prepare('INSERT INTO rating_categories (slug, title, sort_order) VALUES (?, ?, ?)');
    RATING_CATEGORIES_DEFAULT.forEach((c, i) => ins.run(c.slug, c.title, i));
  }
  setSetting('seeded_rating_cats', '1');
}

// Ensure newer settings keys have a sensible default without clobbering
// values the admin has set. Safe to run on every boot.
function _ensureDefaults() {
  const defaults = {
    favicon_url: '',
    giveaways_icon: '🎁',
    giveaways_icon_image: '',
    home_sections: 'promocodes,sites,articles',

    // Floating gift widget ("Подарок")
    gift_enabled: '1',
    gift_icon: '🎁',
    gift_icon_image: '',
    gift_image: '',
    gift_text: 'Лови подарок — забери бонус прямо сейчас!',
    gift_code: '',
    gift_button_text: 'Забрать',
    gift_button_link: '#',

    // Header navigation labels + order (editable section names)
    nav_home: 'Главная',
    nav_promocodes: 'Промокоды',
    nav_services: 'Сайты',
    nav_articles: 'Статьи',
    nav_giveaways: 'Розыгрыши',
    nav_contacts: 'Контакты',
    nav_rating: 'Рейтинг',
    nav_order: 'steamkeys,home,promocodes,rating,services,articles,contacts',

    // Site background (configurable in admin Settings)
    bg_image: '',
    bg_blur: '3',

    // Global SEO
    seo_title_suffix: ' — ПРОМОКОДЫЧ',
    seo_default_description: 'Актуальные промокоды и бонусы для Playerok, Kupikod, Lis-Skins и десятков других цифровых сервисов.',
    seo_default_keywords: 'промокоды, бонусы, скидки, playerok, kupikod, lis-skins',
    seo_og_image: '',
    seo_canonical_host: '',
    seo_yandex_verification: '',
    seo_google_verification: '',
    seo_noindex: '0',
    seo_robots_txt: '',

    // Editable section headings (home page)
    sec_promocodes_title: 'Актуальные промокоды и бонусы',
    sec_promocodes_sub: 'Активируй коды и получай скидки на любимых цифровых сервисах',
    sec_sites_title: 'Популярные сайты',
    sec_articles_title: 'Последние статьи',
    // PNG icons for home section headings (empty = default % badge)
    sec_promocodes_icon: '',
    sec_sites_icon: '',
    sec_articles_icon: '',

    // Star icon on the "Рейтинг" header item
    nav_rating_icon_enabled: '1',
    nav_rating_icon: '★',
    nav_rating_icon_image: '',

    // Icon next to "Отзывы о проекте" on rating pages
    reviews_icon: '★',
    reviews_icon_image: '',

    // Promo pagination
    promo_per_page: '0',

    // Contacts page rich content
    contacts_blocks: '[]',

    // Homepage display limits (0 = unlimited)
    home_promos_limit: '12',
    home_sites_limit: '12',
    home_articles_limit: '12',

    // Telegram bot (for wheel verification)
    tg_bot_token: '8819786475:AAGPVn-p8GSvxyA0wABDeDt8ZEvvlxKQ0yM',
    tg_bot_link: 't.me/promocodichbot',
    tg_site_url: '',

    // Steam Keys nav item
    nav_steamkeys: 'Ключи Steam',
    nav_steamkeys_icon: '🎮',
    nav_steamkeys_icon_image: '',
    nav_steamkeys_bold: '1',
    nav_steamkeys_enabled: '1',

    // Web analytics counters (Метрика)
    metrika_yandex_id: '',
    metrika_google_id: '',
    // Full counter snippets (pasted as-is); take priority over the ID fields.
    metrika_yandex_code: `<!-- Yandex.Metrika counter -->
<script type="text/javascript">
    (function(m,e,t,r,i,k,a){
        m[i]=m[i]||function(){(m[i].a=m[i].a||[]).push(arguments)};
        m[i].l=1*new Date();
        for (var j = 0; j < document.scripts.length; j++) {if (document.scripts[j].src === r) { return; }}
        k=e.createElement(t),a=e.getElementsByTagName(t)[0],k.async=1,k.src=r,a.parentNode.insertBefore(k,a)
    })(window, document,'script','https://mc.yandex.ru/metrika/tag.js?id=110126935', 'ym');

    ym(110126935, 'init', {ssr:true, webvisor:true, clickmap:true, ecommerce:"dataLayer", referrer: document.referrer, url: location.href, accurateTrackBounce:true, trackLinks:true});
</script>
<noscript><div><img src="https://mc.yandex.ru/watch/110126935" style="position:absolute; left:-9999px;" alt="" /></div></noscript>
<!-- /Yandex.Metrika counter -->`,
    metrika_google_code: '',
  };
  for (const [k, v] of Object.entries(defaults)) {
    if (getSettingStmt.get(k) === undefined) setSetting(k, v);
  }

  // Seed default per-page SEO rows (page H1 / titles) once.
  const pages = [
    { page: 'home',     h1: '',          title: '' },
    { page: 'services', h1: 'Сайты',     title: '' },
    { page: 'giveaways',h1: '🎁 Розыгрыши', title: '' },
    { page: 'articles', h1: 'Статьи',    title: '' },
    { page: 'rating',   h1: 'Рейтинг сайтов', title: '' },
    { page: 'contacts',    h1: 'Контакты',     title: '' },
    { page: 'steam-keys', h1: 'Ключи Steam',  title: '' },
  ];
  const ins = db.prepare('INSERT OR IGNORE INTO page_seo (page, h1, title) VALUES (@page, @h1, @title)');
  for (const p of pages) ins.run(p);

  _seedRatings();
  _seedInlineBanner();
}

function _seedInlineBanner() {
  if (getSetting('seeded_inline_banner') === '1') return;
  const count = db.prepare('SELECT COUNT(*) c FROM inline_banners').get().c;
  if (count === 0) {
    db.prepare(`INSERT INTO inline_banners
      (enabled,after_row,image_url,image_enabled,text,text_enabled,code,code_enabled,button_text,button_link,button_enabled,sort_order)
      VALUES (1,1,'',1,'Получи бонус прямо сейчас!',1,'',0,'Перейти','#',1,0)`).run();
  }
  setSetting('seeded_inline_banner', '1');
}

// Seed a couple of sample rating entries once (only if the table is empty).
function _seedRatings() {
  if (getSetting('seeded_ratings') === '1') return;
  const count = db.prepare('SELECT COUNT(*) c FROM ratings').get().c;
  if (count === 0) {
    const ins = db.prepare(`INSERT INTO ratings
      (slug,name,image_url,hero_image,category,rating,featured,site_link,button_text,bonus_label,pros,cons,blocks,enabled,sort_order)
      VALUES (@slug,@name,@image_url,@hero_image,@category,@rating,@featured,@site_link,@button_text,@bonus_label,@pros,@cons,@blocks,1,@sort_order)`);
    const samples = [
      { slug: 'mycsgo', name: 'MyCSGO', category: 'cases', rating: 3.3, featured: 1, bonus_label: '+25% к депозиту',
        pros: ['Популярный сайт', 'Красивое оформление', 'Большой выбор кейсов'], cons: [],
        intro: 'MyCSGO — одна из популярных площадок для открытия кейсов CS2 и CS:GO.' },
      { slug: 'ggdrop', name: 'GGDROP', category: 'cases', rating: 4.1, featured: 1, bonus_label: '+10% к пополнению',
        pros: ['Быстрый вывод', 'Частые акции'], cons: ['Нужна регистрация'],
        intro: 'GGDROP — сайт открытия кейсов с регулярными розыгрышами.' },
      { slug: 'magicdrop', name: 'MagicDrop', category: 'cases', rating: 4.1, featured: 0, bonus_label: '',
        pros: ['Удобный интерфейс'], cons: ['Мало бонусов'],
        intro: 'MagicDrop — площадка для открытия кейсов.' },
    ];
    samples.forEach((sm, i) => ins.run({
      slug: sm.slug, name: sm.name, image_url: '', hero_image: '', category: sm.category,
      rating: sm.rating, featured: sm.featured, site_link: '#', button_text: 'Перейти на сайт',
      bonus_label: sm.bonus_label,
      pros: JSON.stringify(sm.pros), cons: JSON.stringify(sm.cons),
      blocks: JSON.stringify([{ type: 'paragraph', html: sm.intro }]),
      sort_order: i,
    }));
  }
  setSetting('seeded_ratings', '1');
  setSetting('dirty', '1');
}

function _seedV2() {
  if (getSetting('seeded_v2') === '1') return;

  const svc1 = db.prepare(`INSERT OR IGNORE INTO services
    (slug, name, description, image_url, color, enabled, sort_order)
    VALUES (@slug, @name, @description, @image_url, @color, @enabled, @sort_order)`).run({
    slug: 'playerok', name: 'Playerok',
    description: 'Крупнейший маркетплейс цифровых товаров — игровые ключи, подписки и пополнение игровых счетов.',
    image_url: '', color: '#6c3fe8', enabled: 1, sort_order: 0,
  });
  const svc2 = db.prepare(`INSERT OR IGNORE INTO services
    (slug, name, description, image_url, color, enabled, sort_order)
    VALUES (@slug, @name, @description, @image_url, @color, @enabled, @sort_order)`).run({
    slug: 'kupikod', name: 'Kupikod',
    description: 'Сервис для выгодного пополнения баланса Steam, PlayStation, Xbox и других платформ.',
    image_url: '', color: '#ff9100', enabled: 1, sort_order: 1,
  });
  const svc3 = db.prepare(`INSERT OR IGNORE INTO services
    (slug, name, description, image_url, color, enabled, sort_order)
    VALUES (@slug, @name, @description, @image_url, @color, @enabled, @sort_order)`).run({
    slug: 'lis-skins', name: 'Lis-Skins',
    description: 'Торговая площадка скинов CS2 и Dota 2 с быстрым выводом средств.',
    image_url: '', color: '#00c853', enabled: 1, sort_order: 2,
  });

  // Service-specific banners
  const s1id = db.prepare('SELECT id FROM services WHERE slug=?').get('playerok');
  if (s1id) {
    const insBanner = db.prepare(`INSERT INTO banners
      (enabled, service_id, size, image_url, image_link, text_enabled, title, subtitle, button_enabled, button_text, button_link, sort_order)
      VALUES (@enabled, @service_id, @size, @image_url, @image_link, @text_enabled, @title, @subtitle, @button_enabled, @button_text, @button_link, @sort_order)`);
    insBanner.run({
      enabled: 1, service_id: s1id.id, size: 'big', image_url: '', image_link: 'https://playerok.com',
      text_enabled: 1, title: 'Бонус к первому пополнению', sort_order: 10,
      subtitle: 'Используй промокод PROMO10 и получи +10% к балансу на Playerok.',
      button_enabled: 1, button_text: 'Получить бонус', button_link: 'https://playerok.com',
    });
    insBanner.run({
      enabled: 1, service_id: s1id.id, size: 'small', image_url: '', image_link: 'https://playerok.com',
      text_enabled: 1, title: 'Скидки на игры', sort_order: 11,
      subtitle: 'Тысячи цифровых товаров по выгодным ценам',
      button_enabled: 1, button_text: 'Перейти', button_link: 'https://playerok.com',
    });
    insBanner.run({
      enabled: 1, service_id: s1id.id, size: 'small', image_url: '', image_link: 'https://playerok.com',
      text_enabled: 1, title: 'Быстрая доставка', sort_order: 12,
      subtitle: 'Мгновенное пополнение счёта',
      button_enabled: 1, button_text: 'Купить', button_link: 'https://playerok.com',
    });

    // Service-specific promos
    db.prepare(`INSERT INTO promocodes
      (enabled, service_id, service_name, bonus_label, code, description, image_url, link, sort_order)
      VALUES (@enabled, @service_id, @service_name, @bonus_label, @code, @description, @image_url, @link, @sort_order)`).run({
      enabled: 1, service_id: s1id.id, service_name: 'Playerok',
      bonus_label: '+10% к балансу', code: 'PROMO10',
      description: 'Бонус к первому пополнению на Playerok. Введи код при пополнении.', link: 'https://playerok.com',
      image_url: '', sort_order: 10,
    });
  }

  // Sample giveaway
  db.prepare(`INSERT OR IGNORE INTO giveaways
    (slug, title, description, image_url, prize, conditions, deadline, enabled, sort_order)
    VALUES (@slug, @title, @description, @image_url, @prize, @conditions, @deadline, @enabled, @sort_order)`).run({
    slug: 'rozygrysh-steam',
    title: 'Розыгрыш пополнения Steam на 1000 рублей',
    description: 'Разыгрываем пополнение кошелька Steam на 1000 рублей среди подписчиков! Выполни условия участия и попади в список участников.',
    image_url: '',
    prize: 'Пополнение Steam на 1000 рублей',
    conditions: JSON.stringify([
      { id: 'c1', text: 'Подпишись на наш Telegram-канал' },
      { id: 'c2', text: 'Сделай репост этой записи в соцсетях' },
      { id: 'c3', text: 'Оставь комментарий с ником' },
    ]),
    deadline: '2026-12-31',
    enabled: 1,
    sort_order: 0,
  });

  setSetting('seeded_v2', '1');
  setSetting('dirty', '1');
}

function _seedInitial() {

  const defaults = {
    site_title: 'ПРОМОКОДЫЧ',
    tagline: 'Лучшие промокоды для цифровых сервисов в одном месте',
    intro_text:
      'Ищи актуальные промокоды и бонусы для Playerok, Kupikod, Lis-Skins и десятков ' +
      'других цифровых сервисов. Активируй коды и получай скидки и бонусы без лишних затрат!',
    contacts_telegram: 'https://t.me/promocodich',
    contacts_email: 'support@promocodich.ru',
    contacts_text: 'По вопросам сотрудничества и размещения рекламы пишите нам.',
    logo_url: '',
    favicon_url: '',
    giveaways_icon: '🎁',
    home_sections: 'promocodes,sites,articles',
    dirty: '1',
    seeded: '1',
  };
  for (const [k, v] of Object.entries(defaults)) setSetting(k, v);

  // Services
  const insService = db.prepare(`INSERT INTO services
    (slug, name, description, image_url, color, enabled, sort_order)
    VALUES (@slug, @name, @description, @image_url, @color, @enabled, @sort_order)`);

  const svc1 = insService.run({
    slug: 'playerok', name: 'Playerok',
    description: 'Крупнейший маркетплейс цифровых товаров — игровые ключи, подписки и пополнение игровых счетов.',
    image_url: '', color: '#6c3fe8', enabled: 1, sort_order: 0,
  });
  const svc2 = insService.run({
    slug: 'kupikod', name: 'Kupikod',
    description: 'Сервис для выгодного пополнения баланса Steam, PlayStation, Xbox и других платформ.',
    image_url: '', color: '#ff9100', enabled: 1, sort_order: 1,
  });
  const svc3 = insService.run({
    slug: 'lis-skins', name: 'Lis-Skins',
    description: 'Торговая площадка скинов CS2 и Dota 2 с быстрым выводом средств.',
    image_url: '', color: '#00c853', enabled: 1, sort_order: 2,
  });

  const insBanner = db.prepare(`INSERT INTO banners
    (enabled, service_id, size, image_url, image_link, text_enabled, title, subtitle, button_enabled, button_text, button_link, sort_order)
    VALUES (@enabled, @service_id, @size, @image_url, @image_link, @text_enabled, @title, @subtitle, @button_enabled, @button_text, @button_link, @sort_order)`);

  // Global banners (home page)
  insBanner.run({
    enabled: 1, service_id: null, size: 'big', image_url: '', image_link: 'https://playerok.com',
    text_enabled: 1, title: 'ЛУЧШИЕ ПРОМОКОДЫ', sort_order: 0,
    subtitle: 'Промокоды и бонусы для Playerok, Kupikod, Lis-Skins и других сервисов. Экономь на каждой покупке!',
    button_enabled: 1, button_text: 'Смотреть промокоды', button_link: '#promocodes',
  });
  insBanner.run({
    enabled: 1, service_id: null, size: 'small', image_url: '', image_link: 'https://kupikod.com',
    text_enabled: 1, title: '+25% к пополнению', sort_order: 1,
    subtitle: 'Промокод KUPIKOD25', button_enabled: 1, button_text: 'Получить бонус', button_link: 'https://kupikod.com',
  });
  insBanner.run({
    enabled: 1, service_id: null, size: 'small', image_url: '', image_link: 'https://lis-skins.com',
    text_enabled: 1, title: 'Стартовый бонус', sort_order: 2,
    subtitle: 'Скидка на первое пополнение', button_enabled: 1, button_text: 'Забрать', button_link: 'https://lis-skins.com',
  });

  // Service-specific banners (Playerok)
  insBanner.run({
    enabled: 1, service_id: svc1.lastInsertRowid, size: 'big', image_url: '', image_link: 'https://playerok.com',
    text_enabled: 1, title: 'Бонус к первому пополнению', sort_order: 0,
    subtitle: 'Используй промокод PROMO10 и получи +10% к балансу на Playerok.',
    button_enabled: 1, button_text: 'Получить бонус', button_link: 'https://playerok.com',
  });
  insBanner.run({
    enabled: 1, service_id: svc1.lastInsertRowid, size: 'small', image_url: '', image_link: 'https://playerok.com',
    text_enabled: 1, title: 'Скидки на игры', sort_order: 1,
    subtitle: 'Тысячи цифровых товаров по выгодным ценам',
    button_enabled: 1, button_text: 'Перейти', button_link: 'https://playerok.com',
  });
  insBanner.run({
    enabled: 1, service_id: svc1.lastInsertRowid, size: 'small', image_url: '', image_link: 'https://playerok.com',
    text_enabled: 1, title: 'Быстрая доставка', sort_order: 2,
    subtitle: 'Мгновенное пополнение счёта',
    button_enabled: 1, button_text: 'Купить', button_link: 'https://playerok.com',
  });

  const insPromo = db.prepare(`INSERT INTO promocodes
    (enabled, service_id, service_name, bonus_label, code, description, image_url, link, sort_order)
    VALUES (@enabled, @service_id, @service_name, @bonus_label, @code, @description, @image_url, @link, @sort_order)`);

  // Global promos (home page — no service_id)
  const promos = [
    { service_name: 'Playerok', bonus_label: '+10% к балансу', code: 'PROMO10',
      description: 'Бонус к первому пополнению баланса на маркетплейсе цифровых товаров Playerok.', link: 'https://playerok.com' },
    { service_name: 'Kupikod', bonus_label: '+25% к пополнению', code: 'KUPIKOD25',
      description: 'Дополнительные 25% к пополнению для покупки игр, подписок и пополнения сервисов.', link: 'https://kupikod.com' },
    { service_name: 'Lis-Skins', bonus_label: 'Скидка 5%', code: 'LIS5',
      description: 'Скидка на покупку и пополнение баланса скинами CS2 и Dota 2.', link: 'https://lis-skins.com' },
    { service_name: 'GGStandoff', bonus_label: '+15% на депозит', code: 'PROMOCODICH',
      description: 'Бонус к пополнению баланса для открытия кейсов и игр.', link: '#' },
    { service_name: 'Plati.Market', bonus_label: 'Кэшбэк 7%', code: 'PLATI7',
      description: 'Возврат части средств при покупке цифровых товаров и ключей.', link: '#' },
    { service_name: 'Steam', bonus_label: 'Скидка на пополнение', code: 'STEAMUP',
      description: 'Выгодное пополнение кошелька Steam через проверенные сервисы.', link: '#' },
  ];
  promos.forEach((p, i) => insPromo.run({ enabled: 1, service_id: null, image_url: '', sort_order: i, ...p }));

  // Service-specific promos (Playerok)
  insPromo.run({
    enabled: 1, service_id: svc1.lastInsertRowid, service_name: 'Playerok',
    bonus_label: '+10% к балансу', code: 'PROMO10',
    description: 'Бонус к первому пополнению на Playerok. Введи код при пополнении.', link: 'https://playerok.com',
    image_url: '', sort_order: 0,
  });
  insPromo.run({
    enabled: 1, service_id: svc1.lastInsertRowid, service_name: 'Playerok',
    bonus_label: 'Кэшбэк 5%', code: 'PLAYBACK5',
    description: 'Кэшбэк 5% на все покупки в течение 30 дней.', link: 'https://playerok.com',
    image_url: '', sort_order: 1,
  });

  const insArticle = db.prepare(`INSERT INTO articles
    (slug, title, category, excerpt, featured_image, blocks, enabled, sort_order)
    VALUES (@slug, @title, @category, @excerpt, @featured_image, @blocks, @enabled, @sort_order)`);

  insArticle.run({
    slug: 'kak-aktivirovat-promokod-playerok',
    title: 'Как активировать промокод на Playerok в 2026 году',
    category: 'games',
    excerpt: 'Пошаговая инструкция по активации промокодов и бонусов на маркетплейсе Playerok.',
    featured_image: '',
    enabled: 1,
    sort_order: 0,
    blocks: JSON.stringify([
      { type: 'paragraph', html: 'Промокоды <b>Playerok</b> позволяют получить бонус к пополнению баланса и скидки на покупку цифровых товаров. В этой статье разберём, как их активировать.' },
      { type: 'heading', level: 2, text: 'Где взять рабочий промокод' },
      { type: 'paragraph', html: 'Актуальные промокоды всегда публикуются на нашем сайте в разделе <i>Промокоды</i>. Просто скопируйте код и используйте его при оплате.' },
      { type: 'button', text: 'Перейти к промокодам', link: '/#promocodes' },
      { type: 'heading', level: 2, text: 'Пошаговая активация' },
      { type: 'paragraph', html: '1. Войдите в аккаунт. 2. Перейдите в раздел пополнения. 3. Введите промокод в специальное поле. 4. Подтвердите — бонус начислится автоматически.' },
    ]),
  });

  insArticle.run({
    slug: 'luchshie-bonusy-kupikod',
    title: 'Лучшие бонусы Kupikod: как сэкономить на цифровых покупках',
    category: 'digital',
    excerpt: 'Обзор актуальных бонусов и промокодов сервиса Kupikod для выгодных покупок.',
    featured_image: '',
    enabled: 1,
    sort_order: 1,
    blocks: JSON.stringify([
      { type: 'paragraph', html: 'Сервис <b>Kupikod</b> регулярно предлагает бонусы к пополнению. Собрали для вас самые выгодные предложения.' },
      { type: 'heading', level: 3, text: 'Промокод на +25%' },
      { type: 'paragraph', html: 'Используйте код <b>KUPIKOD25</b> и получите дополнительные 25% к сумме пополнения.' },
    ]),
  });

  const insPopup = db.prepare(`INSERT INTO popups
    (enabled, image_url, text, button_text, button_link, code, sort_order)
    VALUES (@enabled, @image_url, @text, @button_text, @button_link, @code, @sort_order)`);

  insPopup.run({
    enabled: 1, image_url: '',
    text: 'Используй промокод ниже и получи +35% к депозиту!',
    button_text: 'Применить на сайте', button_link: 'https://kupikod.com',
    code: 'PROMOCODICH35', sort_order: 0,
  });

  // Sample giveaway
  const insGiveaway = db.prepare(`INSERT INTO giveaways
    (slug, title, description, image_url, prize, conditions, deadline, enabled, sort_order)
    VALUES (@slug, @title, @description, @image_url, @prize, @conditions, @deadline, @enabled, @sort_order)`);

  insGiveaway.run({
    slug: 'rozygrysh-steam',
    title: 'Розыгрыш пополнения Steam на 1000 рублей',
    description: 'Разыгрываем пополнение кошелька Steam на 1000 рублей среди подписчиков! Выполни условия участия и попади в список участников.',
    image_url: '',
    prize: 'Пополнение Steam на 1000 рублей',
    conditions: JSON.stringify([
      { id: 'c1', text: 'Подпишись на наш Telegram-канал' },
      { id: 'c2', text: 'Сделай репост этой записи в соцсетях' },
      { id: 'c3', text: 'Оставь комментарий с ником' },
    ]),
    deadline: '2026-12-31',
    enabled: 1,
    sort_order: 0,
  });
}

seed();

module.exports = {
  db,
  getSetting,
  setSetting,
  markDirty,
  CATEGORIES,
  CATEGORY_TITLES,
  RATING_CATEGORIES_DEFAULT,
  getRatingCategories,
  getRatingCategoryTitles,
};
