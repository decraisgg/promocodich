'use strict';

const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

const DATA_DIR = path.join(__dirname, '..', 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(path.join(DATA_DIR, 'promocodich.db'));
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
  hero_image  TEXT    DEFAULT '',
  color       TEXT    DEFAULT '',
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
  enabled        INTEGER NOT NULL DEFAULT 1,
  created_at     TEXT    DEFAULT (datetime('now')),
  sort_order     INTEGER NOT NULL DEFAULT 0
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

// --- Seed (only on first run / empty DB) --------------------------------
function seed() {
  if (getSetting('seeded') !== '1') {
    _seedInitial();
  }
  _seedV2();
  _ensureDefaults();
}

// Ensure newer settings keys have a sensible default without clobbering
// values the admin has set. Safe to run on every boot.
function _ensureDefaults() {
  const defaults = {
    favicon_url: '',
    giveaways_icon: '🎁',
    home_sections: 'promocodes,sites,articles',
  };
  for (const [k, v] of Object.entries(defaults)) {
    if (getSettingStmt.get(k) === undefined) setSetting(k, v);
  }
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
};
