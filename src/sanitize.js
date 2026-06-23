'use strict';

// Conservative HTML sanitizer for article paragraph blocks.
// Content is authored by the (trusted) admin via a contenteditable editor,
// but we still whitelist tags/attributes to avoid stored XSS.

const ALLOWED_TAGS = new Set(['b', 'strong', 'i', 'em', 'u', 'br', 'a', 'span']);

function escapeHtml(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function safeColor(value) {
  const v = String(value || '').trim();
  if (!v) return '';
  // Allow #rgb, #rrggbb and a small set of common CSS color names.
  if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(v)) return v.toLowerCase();
  if (/^[a-z]{3,20}$/i.test(v)) return v.toLowerCase();
  return '';
}

function safeUrl(url) {
  const u = String(url || '').trim();
  if (!u) return '';
  // Allow only http(s), mailto, tel, anchors and root-relative paths.
  if (/^(https?:|mailto:|tel:|\/|#)/i.test(u) && !/^javascript:/i.test(u)) return u;
  return '';
}

// Sanitize inline rich-text HTML coming from the editor.
function sanitizeHtml(input) {
  let html = String(input || '');

  // Drop dangerous blocks entirely (with their content).
  html = html.replace(/<\s*(script|style|iframe|object|embed|svg|math)[\s\S]*?<\s*\/\s*\1\s*>/gi, '');

  // Rewrite every tag, keeping only whitelisted ones / attributes.
  html = html.replace(/<\s*(\/?)\s*([a-zA-Z0-9]+)((?:[^>"']|"[^"]*"|'[^']*')*)>/g,
    (match, closing, rawName, rawAttrs) => {
      const name = rawName.toLowerCase();
      if (!ALLOWED_TAGS.has(name)) return '';
      if (closing) return `</${name}>`;
      if (name === 'br') return '<br>';
      if (name === 'a') {
        const hrefMatch = /href\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(rawAttrs || '');
        const href = hrefMatch ? safeUrl(hrefMatch[2] || hrefMatch[3] || hrefMatch[4]) : '';
        if (!href) return '<span>';
        return `<a href="${escapeHtml(href)}" target="_blank" rel="nofollow noopener">`;
      }
      // Allowed formatting tag with no attributes kept.
      return `<${name}>`;
    });

  return html;
}

// Inline formatting only (no links/attributes) — used for button labels.
const ALLOWED_INLINE = new Set(['b', 'strong', 'i', 'em', 'u', 'br']);
function sanitizeInline(input) {
  let html = String(input || '');
  html = html.replace(/<\s*(script|style|iframe|object|embed|svg|math)[\s\S]*?<\s*\/\s*\1\s*>/gi, '');
  html = html.replace(/<\s*(\/?)\s*([a-zA-Z0-9]+)((?:[^>"']|"[^"]*"|'[^']*')*)>/g,
    (match, closing, rawName) => {
      const name = rawName.toLowerCase();
      if (!ALLOWED_INLINE.has(name)) return '';
      if (name === 'br') return '<br>';
      return closing ? `</${name}>` : `<${name}>`;
    });
  return html;
}

// Normalize a full article blocks array into a safe, predictable structure.
function sanitizeBlocks(blocks) {
  if (!Array.isArray(blocks)) return [];
  const out = [];
  for (const raw of blocks) {
    if (!raw || typeof raw !== 'object') continue;
    const type = String(raw.type || '');
    if (type === 'paragraph') {
      out.push({ type, html: sanitizeHtml(raw.html) });
    } else if (type === 'heading') {
      let level = parseInt(raw.level, 10);
      if (![1, 2, 3].includes(level)) level = 2;
      out.push({ type, level, text: escapeHtml(raw.text).slice(0, 300) });
    } else if (type === 'button') {
      out.push({
        type,
        text: sanitizeInline(raw.text).slice(0, 300),
        link: safeUrl(raw.link),
        textColor: safeColor(raw.textColor),
        bgColor: safeColor(raw.bgColor),
      });
    } else if (type === 'image') {
      out.push({
        type,
        url: safeUrl(raw.url),
        captionEnabled: !!raw.captionEnabled,
        caption: escapeHtml(raw.caption).slice(0, 300),
        buttonEnabled: !!raw.buttonEnabled,
        buttonText: escapeHtml(raw.buttonText).slice(0, 120),
        buttonLink: safeUrl(raw.buttonLink),
      });
    }
  }
  return out;
}

module.exports = { sanitizeHtml, sanitizeInline, sanitizeBlocks, escapeHtml, safeUrl, safeColor };
