'use strict';
const https = require('https');

function apiCall(token, method, params = {}) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(params);
    const req = https.request({
      hostname: 'api.telegram.org',
      path: `/bot${token}/${method}`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
    }, (res) => {
      let data = '';
      res.on('data', c => { data += c; });
      res.on('end', () => { try { resolve(JSON.parse(data)); } catch (e) { reject(e); } });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

const sendMessage = (token, chatId, text) =>
  apiCall(token, 'sendMessage', { chat_id: chatId, text, parse_mode: 'HTML' });

const getChatMember = (token, chatId, userId) =>
  apiCall(token, 'getChatMember', { chat_id: chatId, user_id: userId });

const setWebhook = (token, url) =>
  apiCall(token, 'setWebhook', { url, allowed_updates: ['message'] });

module.exports = { apiCall, sendMessage, getChatMember, setWebhook };
