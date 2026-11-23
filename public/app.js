(function ($) {
  'use strict';

  var LS_CHATS = 'kronbot:chats', LS_SET = 'kronbot:settings', LS_ACTIVE = 'kronbot:active';
  var DEFAULTS = { theme: 'dark', font: 'inter', fontSize: 16, typing: 'normal', model: 'gemini-2.5-flash',
                   temperature: 0.7, maxTokens: 2048, systemPrompt: '' };
  var FONTS = {
    inter: "'Inter',system-ui,sans-serif",
    grotesk: "'Space Grotesk',system-ui,sans-serif",
    serif: "'Lora',Georgia,serif",
    mono: "'JetBrains Mono',ui-monospace,monospace"
  };
  var SPEED = { instant: 0, fast: 500, normal: 180, slow: 70 }; // characters per second
  var MODEL_NAMES = { 'gemini-2.5-flash': 'Gemini 2.5 Flash', 'gemini-2.5-flash-lite': 'Gemini 2.5 Flash-Lite', 'gemini-2.5-pro': 'Gemini 2.5 Pro' };
  var SUGGESTIONS = [
    'Explain how a neural network learns, in simple words',
    'Write a Python function that merges two sorted lists',
    'Plan a 3-day itinerary for a first trip to Jaipur',
    'Draft a polite email asking for a deadline extension'
  ];
  var ICON_COPY = '<svg viewBox="0 0 24 24"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h9"/></svg>';
  var ICON_REGEN = '<svg viewBox="0 0 24 24"><path d="M3 12a9 9 0 0 1 15.5-6.2L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-15.5 6.2L3 16"/><path d="M3 21v-5h5"/></svg>';
  var ICON_X = '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>';

  var state = { chats: [], activeId: null, settings: {}, busy: false, stop: null };
  var $thread = $('#thread'), $scroll = $('#scroll'), $input = $('#input'), $send = $('#send');

  /* ---------- storage ---------- */
  function read(key, fallback) { try { var v = JSON.parse(localStorage.getItem(key)); return v == null ? fallback : v; } catch (e) { return fallback; } }
  function write(key, val) { try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) {} }
  function saveChats() { write(LS_CHATS, state.chats); write(LS_ACTIVE, state.activeId); }
  function saveSettings() { write(LS_SET, state.settings); }

  /* ---------- helpers ---------- */
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
  function esc(s) { return $('<div>').text(s).html(); }
  function activeChat() { return state.chats.filter(function (c) { return c.id === state.activeId; })[0]; }
  function toast(msg) { var $t = $('#toast').text(msg).addClass('show'); clearTimeout($t.data('t')); $t.data('t', setTimeout(function () { $t.removeClass('show'); }, 1800)); }
  function md(text) {
    var html = window.marked ? marked.parse(text, { gfm: true, breaks: true }) : esc(text).replace(/\n/g, '<br>');
    return window.DOMPurify ? DOMPurify.sanitize(html, { ADD_ATTR: ['target'] }) : html;
  }
  function nearBottom() { var el = $scroll[0]; return el.scrollHeight - el.scrollTop - el.clientHeight < 140; }
  function toBottom(smooth) { var el = $scroll[0]; if (smooth) { el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' }); } else { el.scrollTop = el.scrollHeight; } }
  function copyText(t) {
    if (navigator.clipboard && navigator.clipboard.writeText) { return navigator.clipboard.writeText(t).then(function () { toast('Copied'); }); }
    var $ta = $('<textarea>').val(t).appendTo('body').select(); document.execCommand('copy'); $ta.remove(); toast('Copied');
  }

  /* ---------- settings ---------- */
  function applySettings() {
    var s = state.settings, theme = s.theme;
    if (theme === 'system') theme = matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', theme);
    $('meta[name=theme-color]').attr('content', theme === 'light' ? '#ffffff' : '#000000');
    document.documentElement.style.setProperty('--font', FONTS[s.font] || FONTS.inter);
    document.documentElement.style.setProperty('--fs', s.fontSize + 'px');
    $('#modelLabel').text(MODEL_NAMES[s.model] || s.model);
    $('.seg').each(function () {
      var key = $(this).data('key');
      $(this).find('button').each(function () { $(this).toggleClass('on', String($(this).data('v')) === String(s[key])); });
    });
    $('#fontSel').val(s.font); $('#modelSel').val(s.model);
    $('#tempRange').val(s.temperature); $('#tempOut').text(Number(s.temperature).toFixed(1));
    $('#tokRange').val(s.maxTokens); $('#tokOut').text(s.maxTokens);
    if ($('#sysPrompt').val() !== s.systemPrompt) $('#sysPrompt').val(s.systemPrompt);
  }
  function setSetting(k, v) { state.settings[k] = v; saveSettings(); applySettings(); }

  /* ---------- sidebar ---------- */
  function renderSidebar() {
    var $l = $('#chatList').empty();
    var list = state.chats.slice().sort(function (a, b) { return b.updated - a.updated; });
    if (!list.length) { $l.append('<p class="empty-list">No chats yet.</p>'); return; }
    list.forEach(function (c) {
      var $i = $('<div class="chat-item">').toggleClass('active', c.id === state.activeId).attr('data-id', c.id);
      $('<button class="t">').text(c.title || 'New chat').appendTo($i);
      $('<button class="del" aria-label="Delete chat">').html(ICON_X).appendTo($i);
      $l.append($i);
    });
  }
  function openSidebar(open) { $('#sidebar').toggleClass('open', open); $('#backdrop').toggleClass('show', open); }

  /* ---------- chats ---------- */
  function newChat() {
    if (state.busy && state.stop) state.stop();
    var c = { id: uid(), title: '', messages: [], updated: Date.now() };
    // reuse an existing empty chat instead of piling up blanks
    var empty = state.chats.filter(function (x) { return !x.messages.length; })[0];
    if (empty) c = empty; else state.chats.push(c);
    state.activeId = c.id; saveChats(); renderSidebar(); renderMessages(); openSidebar(false); $input.focus();
  }
  function switchChat(id) {
    if (id === state.activeId) { openSidebar(false); return; }
    if (state.busy && state.stop) state.stop();
    state.activeId = id; saveChats(); renderSidebar(); renderMessages(); openSidebar(false);
  }
  function deleteChat(id) {
    if (!window.confirm('Delete this chat?')) return;
    if (id === state.activeId && state.busy && state.stop) state.stop();
    state.chats = state.chats.filter(function (c) { return c.id !== id; });
    if (state.activeId === id) state.activeId = state.chats.length ? state.chats[state.chats.length - 1].id : null;
    saveChats(); renderSidebar(); renderMessages();
  }

  /* ---------- rendering ---------- */
  function renderWelcome() {
    var $w = $('<div class="welcome">').append(
      '<div class="logo">K</div><h2>How can I help today?</h2><p>Kronbot 1.0 · Ask anything.</p>');
    var $c = $('<div class="chips">').appendTo($w);
    SUGGESTIONS.forEach(function (s) { $('<button class="chip">').text(s).appendTo($c); });
    $thread.append($w);
  }
  function botShell() {
    var $m = $('<div class="msg bot"><div class="avatar" aria-hidden="true">K</div><div class="body"><div class="bubble"></div></div></div>');
    return $m;
  }
  function decorate($bubble) {
    $bubble.find('a').attr({ target: '_blank', rel: 'noopener noreferrer' });
    $bubble.find('pre').each(function () {
      var $pre = $(this), $code = $pre.children('code');
      if ($pre.parent().hasClass('code')) return;
      var m = ($code.attr('class') || '').match(/language-([\w+#-]+)/), lang = m ? m[1] : 'code';
      if (window.hljs) { try { if (m && hljs.getLanguage(lang)) { $code.html(hljs.highlight($code.text(), { language: lang }).value); } else { hljs.highlightElement($code[0]); } } catch (e) {} }
      var $wrap = $('<div class="code">'), $head = $('<div class="code-head">');
      $('<span>').text(lang).appendTo($head);
      $('<button type="button">').html(ICON_COPY + 'Copy').on('click', function () { copyText($code.text()); }).appendTo($head);
      $pre.wrap($wrap).before($head);
    });
  }
  function addActions($m, isLast, chat) {
    $m.find('.actions').remove();
    var $a = $('<div class="actions">');
    $('<button class="act" aria-label="Copy reply">').html(ICON_COPY + 'Copy').on('click', function () {
      copyText($m.data('raw') || $m.find('.bubble').text());
    }).appendTo($a);
    if (isLast) {
      $('<button class="act" aria-label="Regenerate reply">').html(ICON_REGEN + 'Regenerate').on('click', function () { regenerate(); }).appendTo($a);
    }
    $m.find('.body').append($a);
    $m.toggleClass('last', !!isLast);
  }
  function renderMessages() {
    $thread.empty();
    var chat = activeChat();
    if (!chat || !chat.messages.length) { renderWelcome(); return; }
    chat.messages.forEach(function (m, i) {
      if (m.role === 'user') {
        $('<div class="msg user">').append($('<div class="bubble">').text(m.content)).appendTo($thread);
      } else {
        var $m = botShell().data('raw', m.content).appendTo($thread);
        var $b = $m.find('.bubble').html(md(m.content)); decorate($b);
        addActions($m, i === chat.messages.length - 1, chat);
      }
    });
    toBottom(false);
  }

  /* ---------- sending + streaming ---------- */
  function setBusy(b) {
    state.busy = b;
    $send.toggleClass('busy', b).attr('aria-label', b ? 'Stop generating' : 'Send message');
    $send.prop('disabled', !b && !$.trim($input.val()));
  }
  function send(text) {
    text = $.trim(text);
    if (!text || state.busy) return;
    var chat = activeChat();
    if (!chat) { newChat(); chat = activeChat(); }
    chat.messages.push({ role: 'user', content: text });
    if (!chat.title) chat.title = text.length > 46 ? text.slice(0, 46) + '…' : text;
    chat.updated = Date.now();
    saveChats(); renderSidebar();
    $input.val('').trigger('input');
    renderMessages();
    stream(chat);
  }
  function regenerate() {
    var chat = activeChat();
    if (!chat || state.busy) return;
    if (chat.messages.length && chat.messages[chat.messages.length - 1].role === 'assistant') chat.messages.pop();
    saveChats(); renderMessages(); stream(chat);
  }

  function stream(chat) {
    setBusy(true);
    $thread.find('.msg.bot .actions').remove();
    var $m = botShell().appendTo($thread), $bubble = $m.find('.bubble').html('<span class="dots"><i></i><i></i><i></i></span>');
    toBottom(true);

    var s = state.settings, pending = '', shown = '', netDone = false, errored = '', stopped = false, started = false;
    var raf, last = performance.now(), acc = 0, lastRender = 0, ctrl = new AbortController();

    function caret($b) {
      var $t = $b.children().last();
      if ($t.is('ul,ol')) $t = $t.children('li').last();
      ($t.length && !$t.is('pre,table') ? $t : $b).append('<span class="caret"></span>');
    }
    function paint(final) {
      var follow = nearBottom();
      $bubble.html(md(shown));
      if (!final) caret($bubble);
      if (follow) toBottom(false);
    }
    function finish() {
      cancelAnimationFrame(raf);
      $bubble.empty();
      if (shown) {
        paint(true); decorate($bubble);
        chat.messages.push({ role: 'assistant', content: shown });
        chat.updated = Date.now(); $m.data('raw', shown);
        addActions($m, true, chat);
      }
      if (errored) {
        $('<div class="err">').append($('<span>').text(errored))
          .append($('<button type="button">Try again</button>').on('click', function () { $m.remove(); if (shown) { chat.messages.pop(); } stream(chat); }))
          .appendTo($m.find('.body'));
      } else if (!shown && !stopped) {
        $bubble.text('No response was returned. Try rephrasing your message.');
      }
      saveChats(); renderSidebar(); state.stop = null; setBusy(false); $input.focus();
    }
    function tick(now) {
      var dt = Math.min((now - last) / 1000, 0.1); last = now;
      var cps = SPEED[s.typing];
      if (pending.length) {
        var n;
        if (!cps) { n = pending.length; }
        else { acc += dt * Math.max(cps, pending.length * 2); n = Math.floor(acc); acc -= n; }   // speeds up if we fall behind
        if (n > 0) {
          shown += pending.slice(0, n); pending = pending.slice(n);
          if (now - lastRender > 40 || !pending.length) { paint(false); lastRender = now; }
        }
      }
      if ((netDone || stopped) && !pending.length) { finish(); return; }
      raf = requestAnimationFrame(tick);
    }

    state.stop = function () { stopped = true; netDone = true; shown += pending; pending = ''; ctrl.abort(); };
    raf = requestAnimationFrame(tick);

    fetch('/api/chat', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: ctrl.signal,
      body: JSON.stringify({
        messages: chat.messages.slice(-30).map(function (m) { return { role: m.role, content: m.content }; }),
        model: s.model, temperature: Number(s.temperature), max_tokens: Number(s.maxTokens), system_prompt: s.systemPrompt
      })
    }).then(function (res) {
      if (!res.ok) {
        return res.json().catch(function () { return {}; }).then(function (j) { throw new Error(j.error || j.detail && 'Invalid request.' || 'Request failed (' + res.status + ').'); });
      }
      var reader = res.body.getReader(), dec = new TextDecoder(), buf = '';
      (function pump() {
        return reader.read().then(function (r) {
          if (r.done) { netDone = true; return; }
          buf += dec.decode(r.value, { stream: true });
          var parts = buf.split('\n\n'); buf = parts.pop();
          parts.forEach(function (p) {
            if (p.indexOf('data: ') !== 0) return;
            var o; try { o = JSON.parse(p.slice(6)); } catch (e) { return; }
            if (o.t) { if (!started) { started = true; $bubble.empty(); } pending += o.t; }
            if (o.error) errored = o.error;
            if (o.done) netDone = true;
          });
          return pump();
        });
      })();
    }).catch(function (e) {
      if (e.name !== 'AbortError') errored = e.message || 'Network error. Check your connection.';
      netDone = true;
    });
  }

  /* ---------- events ---------- */
  $input.on('input', function () {
    this.style.height = 'auto'; this.style.height = Math.min(this.scrollHeight, 200) + 'px';
    if (!state.busy) $send.prop('disabled', !$.trim(this.value));
  }).on('keydown', function (e) {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && window.innerWidth > 860) { e.preventDefault(); send(this.value); }
  });
  $send.on('click', function () { if (state.busy) { state.stop && state.stop(); } else { send($input.val()); } });
  $thread.on('click', '.chip', function () { send($(this).text()); });

  $('#newChat,#newChatTop').on('click', newChat);
  $('#openSidebar').on('click', function () { openSidebar(true); });
  $('#closeSidebar,#backdrop').on('click', function () { openSidebar(false); });
  $('#chatList').on('click', '.t', function () { switchChat($(this).closest('.chat-item').data('id')); })
                .on('click', '.del', function () { deleteChat($(this).closest('.chat-item').data('id')); });

  function modal(open) { $('#modal').toggleClass('open', open).attr('aria-hidden', !open); if (open) { applySettings(); openSidebar(false); } }
  $('#openSettings').on('click', function () { modal(true); });
  $('#closeSettings').on('click', function () { modal(false); });
  $('#modal').on('click', function (e) { if (e.target === this) modal(false); });
  $(document).on('keydown', function (e) { if (e.key === 'Escape') { modal(false); openSidebar(false); } });

  $('.seg').on('click', 'button', function () {
    var key = $(this).parent().data('key'), v = $(this).data('v');
    setSetting(key, key === 'fontSize' ? Number(v) : v);
  });
  $('#fontSel,#modelSel').on('change', function () { setSetting($(this).data('key'), this.value); });
  $('#tempRange').on('input', function () { setSetting('temperature', parseFloat(this.value)); });
  $('#tokRange').on('input', function () { setSetting('maxTokens', parseInt(this.value, 10)); });
  $('#sysPrompt').on('input', function () { state.settings.systemPrompt = this.value; saveSettings(); });
  $('#resetSettings').on('click', function () { state.settings = $.extend({}, DEFAULTS); saveSettings(); applySettings(); toast('Settings reset'); });
  $('#clearChats').on('click', function () {
    if (!window.confirm('Delete all chats? This cannot be undone.')) return;
    if (state.busy && state.stop) state.stop();
    state.chats = []; state.activeId = null; saveChats(); renderSidebar(); renderMessages(); modal(false); toast('All chats deleted');
  });
  $('#exportChats').on('click', function () {
    var blob = new Blob([JSON.stringify({ app: 'Kronbot', version: '1.0', chats: state.chats }, null, 2)], { type: 'application/json' });
    var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'kronbot-chats.json'; a.click(); URL.revokeObjectURL(a.href);
  });
  if (window.matchMedia) matchMedia('(prefers-color-scheme: light)').addEventListener('change', function () { if (state.settings.theme === 'system') applySettings(); });

  /* ---------- init ---------- */
  state.settings = $.extend({}, DEFAULTS, read(LS_SET, {}));
  state.chats = read(LS_CHATS, []);
  state.activeId = read(LS_ACTIVE, null);
  if (!activeChat()) state.activeId = state.chats.length ? state.chats[state.chats.length - 1].id : null;
  applySettings(); renderSidebar(); renderMessages();
  if (window.innerWidth > 860) $input.focus();
})(jQuery);
    
