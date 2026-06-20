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

CREATE TABLE IF NOT EXISTS banners (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  enabled        INTEGER NOT NULL DEFAULT 1,
  size           TEXT    NOT NULL DEFAULT 'small',   -- 'big' | 'small'
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
  category       TEXT    DEFAULT 'games',  -- games | internet | digital | crypto
  excerpt        TEXT    DEFAULT '',
  featured_image TEXT    DEFAULT '',
  blocks         TEXT    DEFAULT '[]',     -- JSON array of content blocks
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
`);

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
  if (getSetting('seeded') === '1') return;

  const defaults = {
    site_title: 'ПРОМОКОДЫЧ',
    tagline: 'Лучшие промокоды для цифровых сервисов в одном месте',
    intro_text:
      'Ищи актуальные промокоды и бонусы для Playerok, Kupikod, Lis-Skins и десятков ' +
      'других цифровых сервисов. Активируй коды и получай скидки и бонусы без лишних затрат!',
    contacts_telegram: 'https://t.me/promocodich',
    contacts_email: 'support@promocodich.ru',
    contacts_text: 'По вопросам сотрудничества и размещения рекламы пишите нам.',
    dirty: '1',
    seeded: '1',
  };
  for (const [k, v] of Object.entries(defaults)) setSetting(k, v);

  const insBanner = db.prepare(`INSERT INTO banners
    (enabled, size, image_url, image_link, text_enabled, title, subtitle, button_enabled, button_text, button_link, sort_order)
    VALUES (@enabled, @size, @image_url, @image_link, @text_enabled, @title, @subtitle, @button_enabled, @button_text, @button_link, @sort_order)`);

  insBanner.run({
    enabled: 1, size: 'big', image_url: '', image_link: 'https://playerok.com',
    text_enabled: 1, title: 'ЛУЧШИЕ ПРОМОКОДЫ', sort_order: 0,
    subtitle: 'Промокоды и бонусы для Playerok, Kupikod, Lis-Skins и других сервисов. Экономь на каждой покупке!',
    button_enabled: 1, button_text: 'Смотреть промокоды', button_link: '#promocodes',
  });
  insBanner.run({
    enabled: 1, size: 'small', image_url: '', image_link: 'https://kupikod.com',
    text_enabled: 1, title: '+25% к пополнению', sort_order: 1,
    subtitle: 'Промокод KUPIKOD25', button_enabled: 1, button_text: 'Получить бонус', button_link: 'https://kupikod.com',
  });
  insBanner.run({
    enabled: 1, size: 'small', image_url: '', image_link: 'https://lis-skins.com',
    text_enabled: 1, title: 'Стартовый бонус', sort_order: 2,
    subtitle: 'Скидка на первое пополнение', button_enabled: 1, button_text: 'Забрать', button_link: 'https://lis-skins.com',
  });

  const insPromo = db.prepare(`INSERT INTO promocodes
    (enabled, service_name, bonus_label, code, description, image_url, link, sort_order)
    VALUES (@enabled, @service_name, @bonus_label, @code, @description, @image_url, @link, @sort_order)`);

  const promos = [
    { service_name: 'Playerok',  bonus_label: '+10% к балансу', code: 'PROMO10',
      description: 'Бонус к первому пополнению баланса на маркетплейсе цифровых товаров Playerok.', link: 'https://playerok.com' },
    { service_name: 'Kupikod',   bonus_label: '+25% к пополнению', code: 'KUPIKOD25',
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
  promos.forEach((p, i) => insPromo.run({ enabled: 1, image_url: '', sort_order: i, ...p }));

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
