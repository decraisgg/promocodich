(function () {
  'use strict';

  function setPreview(el, url) {
    if (!el) return;
    if (url) {
      el.style.backgroundImage = "url('" + String(url).replace(/'/g, '%27') + "')";
      el.classList.remove('empty');
    } else {
      el.style.backgroundImage = 'none';
      el.classList.add('empty');
    }
  }

  // ---- Image upload (delegated; works for static fields and dynamic blocks) ----
  document.addEventListener('change', function (e) {
    var t = e.target;
    if (!t.classList || !t.classList.contains('img-file')) return;
    var field = t.closest('.img-field');
    if (!field) return;
    var urlInput = field.querySelector('.img-url');
    var preview = field.querySelector('.img-preview');
    var status = field.querySelector('.img-status');
    var file = t.files && t.files[0];
    if (!file) return;

    var fd = new FormData();
    fd.append('file', file);
    if (status) { status.textContent = 'Загрузка…'; status.className = 'img-status'; }

    fetch('/admin/upload', { method: 'POST', body: fd })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (d && d.ok) {
          if (urlInput) urlInput.value = d.url;
          setPreview(preview, d.url);
          if (status) { status.textContent = 'Загружено ✓'; status.className = 'img-status ok'; }
        } else {
          if (status) { status.textContent = (d && d.error) || 'Ошибка'; status.className = 'img-status err'; }
        }
      })
      .catch(function () {
        if (status) { status.textContent = 'Ошибка загрузки'; status.className = 'img-status err'; }
      });
  });

  // Live preview when a URL is typed/pasted manually.
  document.addEventListener('input', function (e) {
    var t = e.target;
    if (!t.classList || !t.classList.contains('img-url')) return;
    var field = t.closest('.img-field');
    if (field) setPreview(field.querySelector('.img-preview'), t.value.trim());
  });

  // Sync native color pickers with their text inputs (button block colors).
  document.addEventListener('input', function (e) {
    var t = e.target;
    if (!t.classList) return;
    if (t.classList.contains('blk-btn-textcolor-picker')) {
      var ti = t.parentNode.querySelector('.blk-btn-textcolor'); if (ti) ti.value = t.value;
    } else if (t.classList.contains('blk-btn-bgcolor-picker')) {
      var bi = t.parentNode.querySelector('.blk-btn-bgcolor'); if (bi) bi.value = t.value;
    } else if (t.classList.contains('blk-btn-textcolor')) {
      var tp = t.parentNode.querySelector('.blk-btn-textcolor-picker');
      if (tp && /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(t.value)) tp.value = t.value;
    } else if (t.classList.contains('blk-btn-bgcolor')) {
      var bp = t.parentNode.querySelector('.blk-btn-bgcolor-picker');
      if (bp && /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(t.value)) bp.value = t.value;
    }
  });

  // ---- Flash auto-hide ----
  var flash = document.getElementById('flash');
  if (flash) {
    setTimeout(function () {
      flash.style.transition = 'opacity .4s';
      flash.style.opacity = '0';
      setTimeout(function () { if (flash.parentNode) flash.parentNode.removeChild(flash); }, 420);
    }, 3500);
  }

  // ---- Article block editor ----
  var form = document.getElementById('articleForm');
  if (!form) return;

  var blocksEl = document.getElementById('blocks');
  var input = document.getElementById('blocksInput');

  function addBlock(type, values) {
    var tpl = document.getElementById('tpl-' + type);
    if (!tpl) return null;
    var node = tpl.content.firstElementChild.cloneNode(true);
    blocksEl.appendChild(node);
    if (values) fill(node, type, values);
    return node;
  }

  function fill(node, type, v) {
    if (type === 'paragraph') {
      node.querySelector('.block-rte').innerHTML = v.html || '';
    } else if (type === 'heading') {
      node.querySelector('.blk-level').value = String(v.level || 2);
      node.querySelector('.blk-text').value = v.text || '';
    } else if (type === 'button') {
      node.querySelector('.blk-btn-text').value = v.text || '';
      node.querySelector('.blk-btn-link').value = v.link || '';
      var tc = node.querySelector('.blk-btn-textcolor');
      var bc = node.querySelector('.blk-btn-bgcolor');
      if (tc) { tc.value = v.textColor || ''; }
      if (bc) { bc.value = v.bgColor || ''; }
      var tcp = node.querySelector('.blk-btn-textcolor-picker');
      var bcp = node.querySelector('.blk-btn-bgcolor-picker');
      if (tcp && v.textColor && /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(v.textColor)) tcp.value = v.textColor;
      if (bcp && v.bgColor && /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(v.bgColor)) bcp.value = v.bgColor;
    } else if (type === 'image') {
      node.querySelector('.blk-img-url').value = v.url || '';
      setPreview(node.querySelector('.img-preview'), v.url || '');
      node.querySelector('.blk-cap-en').checked = !!v.captionEnabled;
      node.querySelector('.blk-cap').value = v.caption || '';
      node.querySelector('.blk-btn-en').checked = !!v.buttonEnabled;
      node.querySelector('.blk-imgbtn-text').value = v.buttonText || '';
      node.querySelector('.blk-imgbtn-link').value = v.buttonLink || '';
    }
  }

  function serialize() {
    var out = [];
    var nodes = blocksEl.querySelectorAll('.block');
    nodes.forEach(function (block) {
      var type = block.getAttribute('data-type');
      if (type === 'paragraph') {
        out.push({ type: 'paragraph', html: block.querySelector('.block-rte').innerHTML.trim() });
      } else if (type === 'heading') {
        out.push({ type: 'heading', level: parseInt(block.querySelector('.blk-level').value, 10) || 2, text: block.querySelector('.blk-text').value });
      } else if (type === 'button') {
        out.push({
          type: 'button',
          text: block.querySelector('.blk-btn-text').value,
          link: block.querySelector('.blk-btn-link').value,
          textColor: (block.querySelector('.blk-btn-textcolor') || {}).value || '',
          bgColor: (block.querySelector('.blk-btn-bgcolor') || {}).value || '',
        });
      } else if (type === 'image') {
        out.push({
          type: 'image',
          url: block.querySelector('.blk-img-url').value,
          captionEnabled: block.querySelector('.blk-cap-en').checked,
          caption: block.querySelector('.blk-cap').value,
          buttonEnabled: block.querySelector('.blk-btn-en').checked,
          buttonText: block.querySelector('.blk-imgbtn-text').value,
          buttonLink: block.querySelector('.blk-imgbtn-link').value,
        });
      }
    });
    return out;
  }

  // Preserve text selection when clicking the rich-text toolbar.
  blocksEl.addEventListener('mousedown', function (e) {
    if (e.target.closest('.rte-cmd')) e.preventDefault();
  });

  blocksEl.addEventListener('click', function (e) {
    var btn = e.target.closest('button');
    if (!btn) return;
    var block = btn.closest('.block');
    if (!block) return;
    if (btn.classList.contains('blk-del')) {
      if (confirm('Удалить блок?')) block.remove();
    } else if (btn.classList.contains('blk-up')) {
      var prev = block.previousElementSibling;
      if (prev) blocksEl.insertBefore(block, prev);
    } else if (btn.classList.contains('blk-down')) {
      var next = block.nextElementSibling;
      if (next) blocksEl.insertBefore(next, block);
    } else if (btn.classList.contains('rte-cmd')) {
      var cmd = btn.getAttribute('data-cmd');
      var rte = block.querySelector('.block-rte');
      if (rte) rte.focus();
      if (cmd === 'link') {
        var url = prompt('Введите ссылку (URL):', 'https://');
        if (url) document.execCommand('createLink', false, url);
      } else {
        document.execCommand(cmd, false, null);
      }
    }
  });

  // Build existing blocks
  var initial = window.__ARTICLE_BLOCKS__ || [];
  initial.forEach(function (b) { if (b && b.type) addBlock(b.type, b); });

  // Add-block buttons
  document.querySelectorAll('.add-block-bar [data-add]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var node = addBlock(btn.getAttribute('data-add'));
      if (node) node.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  });

  // Serialize on submit
  form.addEventListener('submit', function () {
    input.value = JSON.stringify(serialize());
  });
})();
