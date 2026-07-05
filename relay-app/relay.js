'use strict';

/**
 * Telegram Relay — запускается на Warsaw-сервере.
 *
 * Переменные окружения:
 *   BOT_TOKEN    — токен Telegram-бота
 *   RELAY_SECRET — общий секрет с московским сервером (берётся из Админка → Ключи Steam)
 *   MOSCOW_URL   — HTTPS-адрес московского сайта, например https://yoursite.ru
 *   WARSAW_URL   — публичный HTTPS-адрес этого сервера, например https://bot.yoursite.ru
 *   PORT         — порт для прослушивания (по умолчанию 3001)
 *
 * Запуск:
 *   BOT_TOKEN=... RELAY_SECRET=... MOSCOW_URL=https://... WARSAW_URL=https://... node relay.js
 *
 * Установить webhook один раз:
 *   curl -X POST "https://WARSAW_URL/set-webhook?secret=RELAY_SECRET"
 */

const BOT_TOKEN    = process.env.BOT_TOKEN    || '';
const RELAY_SECRET = process.env.RELAY_SECRET || '';
const MOSCOW_URL   = (process.env.MOSCOW_URL  || '').replace(/\/$/, '');
const WARSAW_URL   = (process.env.WARSAW_URL  || '').replace(/\/$/, '');
const PORT         = parseInt(process.env.PORT || '3001', 10);

if (!BOT_TOKEN || !RELAY_SECRET || !MOSCOW_URL || !WARSAW_URL) {
  console.error('❌  Укажите все переменные: BOT_TOKEN, RELAY_SECRET, MOSCOW_URL, WARSAW_URL');
  process.exit(1);
}

const https = require('https');
const http  = require('http');
const { URL } = require('url');

// --- Telegram API call ---------------------------------------------------
function tgApi(method, params) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(params);
    const req = https.request({
      hostname: 'api.telegram.org',
      path: `/bot${BOT_TOKEN}/${method}`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
    }, res => {
      let d = '';
      res.on('data', c => { d += c; });
      res.on('end', () => { try { resolve(JSON.parse(d)); } catch (e) { reject(e); } });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// --- POST to Moscow server -----------------------------------------------
function callMoscow(path, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const parsed = new URL(MOSCOW_URL + path);
    const isHttps = parsed.protocol === 'https:';
    const mod = isHttps ? https : http;
    const req = mod.request({
      hostname: parsed.hostname,
      port: parsed.port || (isHttps ? 443 : 80),
      path: parsed.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data),
        'x-relay-secret': RELAY_SECRET,
      },
    }, res => {
      let d = '';
      res.on('data', c => { d += c; });
      res.on('end', () => { try { resolve(JSON.parse(d)); } catch (e) { resolve({}); } });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

// --- Conditions cache (5 minutes) ----------------------------------------
let _condCache = null;
let _condCacheAt = 0;

async function getConditions() {
  if (_condCache && Date.now() - _condCacheAt < 5 * 60 * 1000) return _condCache;
  try {
    const res = await callMoscow('/api/tg-conditions', {});
    _condCache = res.conditions || [];
    _condCacheAt = Date.now();
  } catch (e) {
    console.error('Failed to fetch conditions from Moscow:', e.message);
    _condCache = _condCache || [];
  }
  return _condCache;
}

// --- Handle /start CODE --------------------------------------------------
async function handleStart(code, tgId, tgUsername, chatId) {
  const conditions = await getConditions();
  let allMet = true;
  const failed = [];

  for (const cond of conditions) {
    if (!cond.channel_id) continue;
    try {
      const r = await tgApi('getChatMember', { chat_id: cond.channel_id, user_id: parseInt(tgId, 10) });
      const st = r.result && r.result.status;
      if (!['member', 'administrator', 'creator'].includes(st)) {
        allMet = false;
        failed.push(cond.label || cond.channel_url || cond.channel_id);
      }
    } catch (e) {
      console.error('getChatMember error:', e.message);
      allMet = false;
      failed.push(cond.label || cond.channel_url || cond.channel_id);
    }
  }

  const reason = allMet
    ? ''
    : 'Вы не выполнили условие:\n' + failed.map(f => '• ' + f).join('\n');

  try {
    await callMoscow('/api/tg-relay', {
      code, tg_id: tgId, tg_username: tgUsername, verified: allMet, reason,
    });
  } catch (e) {
    console.error('Failed to notify Moscow:', e.message);
  }

  const text = allMet
    ? '✅ Отлично! Вы можете крутить колесо фортуны. Вернитесь на сайт — страница обновится автоматически.'
    : '❌ ' + reason + '\n\nПодпишитесь и попробуйте снова.';

  await tgApi('sendMessage', { chat_id: chatId, text, parse_mode: 'HTML' }).catch(console.error);
}

// --- Read request body ---------------------------------------------------
function readBody(req) {
  return new Promise(resolve => {
    let d = '';
    req.on('data', c => { d += c; });
    req.on('end', () => resolve(d));
    req.on('error', () => resolve(''));
  });
}

// --- HTTP server ---------------------------------------------------------
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');

  // Healthcheck
  if (req.method === 'GET' && url.pathname === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, moscow: MOSCOW_URL, warsaw: WARSAW_URL }));
    return;
  }

  // One-time webhook setup: POST /set-webhook?secret=...
  if (req.method === 'POST' && url.pathname === '/set-webhook') {
    if (url.searchParams.get('secret') !== RELAY_SECRET) {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: 'forbidden' }));
      return;
    }
    try {
      const result = await tgApi('setWebhook', {
        url: WARSAW_URL + '/telegram/webhook',
        allowed_updates: ['message'],
      });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result));
      if (result.ok) console.log('✅  Webhook set to', WARSAW_URL + '/telegram/webhook');
      else console.error('❌  setWebhook error:', JSON.stringify(result));
    } catch (e) {
      res.writeHead(500); res.end(String(e));
    }
    return;
  }

  // Telegram webhook: POST /telegram/webhook
  if (req.method === 'POST' && url.pathname === '/telegram/webhook') {
    const body = await readBody(req);
    res.writeHead(200); res.end();
    try {
      const update = JSON.parse(body);
      if (!update.message) return;
      const msg = update.message;
      const tgId = String(msg.from.id);
      const tgUsername = msg.from.username || msg.from.first_name || '';
      const chatId = msg.chat.id;
      const text = msg.text || '';
      if (text.startsWith('/start ')) {
        const code = (text.split(' ')[1] || '').trim();
        if (code) await handleStart(code, tgId, tgUsername, chatId);
      }
    } catch (e) {
      console.error('Webhook parse error:', e.message);
    }
    return;
  }

  res.writeHead(404); res.end();
});

server.listen(PORT, () => {
  console.log('======================================================');
  console.log(`  Telegram Relay запущен на порту ${PORT}`);
  console.log(`  Moscow URL:  ${MOSCOW_URL}`);
  console.log(`  Warsaw URL:  ${WARSAW_URL}`);
  console.log(`  Webhook URL: ${WARSAW_URL}/telegram/webhook`);
  console.log('');
  console.log('  Установить webhook:');
  console.log(`  curl -X POST "${WARSAW_URL}/set-webhook?secret=${RELAY_SECRET}"`);
  console.log('======================================================');
});
