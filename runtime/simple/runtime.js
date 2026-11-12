/*
 * ODE App Builder runtime ("Simple" template).
 *
 * One prebuilt app shared by every app made with the ODE App Builder. It reads
 * window.ODE_APP_CONFIG (written to config.js by the builder) and draws:
 *   - a branded home screen (cards, list or dashboard design),
 *   - a record list per form,
 *   - a details page per record, with its linked records (e.g. household -> visits).
 * Forms open in Formplayer through the Formulus API, the same full-screen form every
 * ODE collector uses.
 *
 * Back button: every screen change is a history entry (location.hash + pushState).
 * Formulus watches pushState, so the Android back button steps back one screen inside
 * the app and only offers to exit on the home screen. The on-screen Back button uses
 * the same history, so it behaves the same in Formulus, ODE Desktop and a browser.
 *
 * Formulus API reference:
 * https://github.com/OpenDataEnsemble/ode/blob/main/formulus/src/webview/FormulusInterfaceDefinition.ts
 */
(function () {
  'use strict';

  var RUNTIME_VERSION = '2.0.0';
  var config = window.ODE_APP_CONFIG || { app: { name: 'ODE app' }, forms: [] };
  var app = document.getElementById('app');
  var toastEl = document.getElementById('toast');
  var api = null;
  var depth = 0; // screens we pushed; 0 = the first screen this session
  var renderSeq = 0;

  var TEXT = {
    en: { newRecord: 'New', saved: 'saved', records: 'Records', none: 'Nothing saved yet.', back: 'Back', edit: 'Edit', submitted: 'Saved', updated: 'Updated', draft: 'Draft saved', error: 'Something went wrong', noApi: 'Open this app in Formulus or ODE Desktop to collect data.', noForms: 'This app has no forms yet.', drafts: 'draft', search: 'Search', all: 'All records', today: 'Today', week: 'This week', recent: 'Recent', start: 'Start', details: 'Details', notFound: 'This record is no longer on this device.', empty: '—', yes: 'Yes', no: 'No', attached: 'attached', seeAll: 'See all' },
    pt: { newRecord: 'Novo', saved: 'guardados', records: 'Registos', none: 'Ainda nada guardado.', back: 'Voltar', edit: 'Editar', submitted: 'Guardado', updated: 'Atualizado', draft: 'Rascunho guardado', error: 'Algo correu mal', noApi: 'Abra esta aplicação no Formulus ou no ODE Desktop para recolher dados.', noForms: 'Esta aplicação ainda não tem formulários.', drafts: 'rascunho', search: 'Pesquisar', all: 'Todos os registos', today: 'Hoje', week: 'Esta semana', recent: 'Recentes', start: 'Começar', details: 'Detalhes', notFound: 'Este registo já não está neste dispositivo.', empty: '—', yes: 'Sim', no: 'Não', attached: 'anexado', seeAll: 'Ver todos' },
    fr: { newRecord: 'Nouveau', saved: 'enregistrés', records: 'Enregistrements', none: 'Rien pour le moment.', back: 'Retour', edit: 'Modifier', submitted: 'Enregistré', updated: 'Mis à jour', draft: 'Brouillon enregistré', error: 'Une erreur est survenue', noApi: 'Ouvrez cette application dans Formulus ou ODE Desktop pour collecter des données.', noForms: "Cette application n'a pas encore de formulaires.", drafts: 'brouillon', search: 'Rechercher', all: 'Tous', today: "Aujourd'hui", week: 'Cette semaine', recent: 'Récents', start: 'Commencer', details: 'Détails', notFound: "Cet enregistrement n'est plus sur cet appareil.", empty: '—', yes: 'Oui', no: 'Non', attached: 'joint', seeAll: 'Voir tout' },
    sw: { newRecord: 'Mpya', saved: 'zimehifadhiwa', records: 'Rekodi', none: 'Hakuna kilichohifadhiwa bado.', back: 'Rudi', edit: 'Hariri', submitted: 'Imehifadhiwa', updated: 'Imesasishwa', draft: 'Rasimu imehifadhiwa', error: 'Kuna tatizo', noApi: 'Fungua programu hii kwenye Formulus au ODE Desktop ili kukusanya data.', noForms: 'Programu hii bado haina fomu.', drafts: 'rasimu', search: 'Tafuta', all: 'Rekodi zote', today: 'Leo', week: 'Wiki hii', recent: 'Za karibuni', start: 'Anza', details: 'Maelezo', notFound: 'Rekodi hii haipo tena kwenye kifaa hiki.', empty: '—', yes: 'Ndiyo', no: 'Hapana', attached: 'imeambatishwa', seeAll: 'Ona zote' },
  };

  function lang() {
    var l = (config.app && config.app.defaultLocale) || 'en';
    return TEXT[l] ? l : 'en';
  }
  function t(key) {
    return TEXT[lang()][key] || TEXT.en[key];
  }

  function el(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        var v = attrs[k];
        if (v === null || v === undefined || v === false) return;
        if (k === 'style') node.setAttribute('style', v);
        else if (k.indexOf('data-') === 0 || k.indexOf('aria-') === 0) node.setAttribute(k, v);
        else if (k === 'onclick') node.addEventListener('click', v);
        else if (k === 'oninput') node.addEventListener('input', v);
        else node[k] = v;
      });
    }
    for (var i = 2; i < arguments.length; i++) add(node, arguments[i]);
    return node;
  }
  function add(node, c) {
    if (c === null || c === undefined || c === false) return;
    if (Array.isArray(c)) return c.forEach(function (x) { add(node, x); });
    node.append(c);
  }

  /** replaceChildren that skips null/false (replaceChildren would print "null"). */
  function show() {
    var list = [];
    for (var i = 0; i < arguments.length; i++) {
      var a = arguments[i];
      if (Array.isArray(a)) a.forEach(function (x) { if (x) list.push(x); });
      else if (a) list.push(a);
    }
    app.replaceChildren.apply(app, list);
  }

  var SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">';
  /** A form icon: a Lucide line icon by name, or the text itself (older projects used emoji). */
  function icon(name) {
    var icons = window.ODE_ICONS || {};
    var span = el('span', { className: 'icon', 'aria-hidden': 'true' });
    var key = icons[name] ? name : !name && icons['clipboard-list'] ? 'clipboard-list' : null;
    if (key) span.innerHTML = SVG + icons[key] + '</svg>';
    else span.textContent = name || '';
    return span;
  }
  var GLYPH = {
    back: '<path d="m15 18-6-6 6-6"/>',
    plus: '<path d="M5 12h14"/><path d="M12 5v14"/>',
    next: '<path d="m9 18 6-6-6-6"/>',
    edit: '<path d="M12 20h9"/><path d="M16.376 3.622a1 1 0 0 1 3.002 3.002L7.368 18.635a2 2 0 0 1-.855.506l-2.872.838a.5.5 0 0 1-.62-.62l.838-2.872a2 2 0 0 1 .506-.854z"/>',
    search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
  };
  function glyph(name) {
    var s = el('span', { className: 'glyph', 'aria-hidden': 'true' });
    s.innerHTML = SVG + GLYPH[name] + '</svg>';
    return s;
  }

  /* ---------- Theme ---------- */

  function applyTheme() {
    var theme = config.theme || {};
    var dark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    var colors = (dark ? theme.dark : theme.light) || theme.light || {};
    var root = document.documentElement.style;
    Object.keys(colors).forEach(function (k) {
      root.setProperty('--' + k, colors[k]);
    });
    document.title = (config.app && config.app.name) || 'ODE app';
    document.documentElement.lang = lang();
  }

  /* ---------- Toast ---------- */

  var toastTimer = null;
  function toast(text, kind) {
    if (!text) return;
    toastEl.textContent = text;
    toastEl.className = kind || '';
    toastEl.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      toastEl.hidden = true;
    }, 2600);
  }

  function resultText(result) {
    var s = result && result.status;
    if (s === 'form_submitted') return [t('submitted'), 'good'];
    if (s === 'form_updated') return [t('updated'), 'good'];
    if (s === 'draft_saved') return [t('draft'), ''];
    if (s === 'error') return [t('error') + (result.message ? ': ' + result.message : ''), 'bad'];
    return [null, ''];
  }

  /* ---------- Navigation (one history entry per screen) ---------- */

  function parseRoute(hash) {
    var p = String(hash || '').replace(/^#\/?/, '').split('/').map(decodeURIComponent);
    if (p[0] === 'f' && p[1]) return { screen: 'list', formType: p[1] };
    if (p[0] === 'r' && p[1] && p[2]) return { screen: 'record', formType: p[1], id: p[2] };
    return { screen: 'home' };
  }
  function routeHash(r) {
    if (r.screen === 'list') return '#/f/' + encodeURIComponent(r.formType);
    if (r.screen === 'record') return '#/r/' + encodeURIComponent(r.formType) + '/' + encodeURIComponent(r.id);
    return '#/';
  }
  /** Full URL for a route. A bare "#/..." would resolve against <base> or the parent page in some hosts. */
  function routeUrl(r) {
    return String(location.href).split('#')[0] + routeHash(r);
  }
  function go(r) {
    try {
      history.pushState({ ode: true, depth: depth + 1 }, '', routeUrl(r));
    } catch (e) {
      location.hash = routeHash(r); // still a history entry, and it fires popstate on back
    }
    depth++;
    render();
    window.scrollTo(0, 0);
  }
  function back() {
    if (depth > 0) history.back();
    else {
      var r = parseRoute(location.hash);
      // Opened straight on an inner screen: step up one level instead of leaving the app.
      var up = r.screen === 'record' ? { screen: 'list', formType: r.formType } : { screen: 'home' };
      try { history.replaceState({ ode: true, depth: 0 }, '', routeUrl(up)); render(); } catch (e) { location.hash = routeHash(up); }
    }
  }
  window.addEventListener('popstate', function (e) {
    depth = e.state && typeof e.state.depth === 'number' ? e.state.depth : Math.max(0, depth - 1);
    render();
  });

  /* ---------- Data ---------- */

  function formConfig(formType) {
    return (config.forms || []).filter(function (f) { return f.formType === formType; })[0] || { formType: formType, title: formType, fields: [] };
  }
  function childrenOf(f) {
    return (config.forms || []).filter(function (c) { return c.parent && c.parent.formType === f.formType; });
  }

  var cache = {};
  async function records(formType) {
    if (!api) return [];
    if (cache[formType]) return cache[formType];
    var list = [];
    try {
      list = (await api.getObservations(formType)) || [];
    } catch (e) {
      list = [];
    }
    list = list.filter(function (o) { return o && !o.deleted; });
    list.sort(function (a, b) { return new Date(b.updatedAt || b.createdAt || 0) - new Date(a.updatedAt || a.createdAt || 0); });
    cache[formType] = list;
    return list;
  }
  function clearCache() { cache = {}; }

  function fieldOf(f, name) {
    return (f.fields || []).filter(function (x) { return x.name === name; })[0];
  }
  function display(f, name, v) {
    if (v === null || v === undefined || v === '') return null;
    var fd = fieldOf(f, name);
    if (Array.isArray(v)) return v.map(function (x) { return display(f, name, x); }).filter(Boolean).join(', ');
    if (fd && fd.choices && fd.choices[String(v)]) return fd.choices[String(v)];
    if (typeof v === 'boolean') return v ? t('yes') : t('no');
    if (typeof v === 'object') return (fd && fd.label ? '' : '') + t('attached');
    if (fd && fd.type === 'date') return when(v);
    return String(v);
  }
  function titleOf(o, f) {
    var data = o.data || {};
    var keys = f.summaryFields && f.summaryFields.length ? f.summaryFields : (f.fields || []).map(function (x) { return x.name; }).concat(Object.keys(data));
    var parts = [];
    var link = f.parent && f.parent.field;
    for (var i = 0; i < keys.length && parts.length < 2; i++) {
      if (keys[i] === link) continue;
      var v = data[keys[i]];
      if (v === null || v === undefined || v === '' || typeof v === 'object' && !Array.isArray(v)) continue;
      var d = display(f, keys[i], v);
      if (d && parts.indexOf(d) === -1) parts.push(d);
    }
    return parts.join(' · ') || when(o.createdAt) || o.observationId;
  }

  function when(d) {
    if (!d) return '';
    var date = new Date(d);
    if (isNaN(date.getTime())) return String(d);
    return date.toLocaleDateString(lang(), { day: 'numeric', month: 'short', year: 'numeric' });
  }

  async function openForm(formType, savedData, observationId, prefill) {
    if (!api) return toast(t('noApi'), 'bad');
    var opts = observationId ? { observationId: observationId } : undefined;
    var params = prefill ? { defaultData: prefill } : {};
    var result;
    try {
      result = await api.openFormplayer(formType, params, savedData || {}, opts);
    } catch (e) {
      result = { status: 'error', message: e && e.message ? e.message : String(e) };
    }
    var msg = resultText(result);
    clearCache();
    await render();
    toast(msg[0], msg[1]);
    return result;
  }

  /* ---------- Pieces ---------- */

  function header(sub) {
    var a = config.app || {};
    return el('header', { className: 'top' },
      a.logo ? el('img', { className: 'logo', src: a.logo, alt: '' }) : null,
      el('div', { className: 'titles' }, el('h1', {}, a.name || 'ODE app'), sub ? el('p', { className: 'sub' }, sub) : null));
  }
  function bar(title, f) {
    return el('header', { className: 'bar', style: f && f.color ? '--accent:' + f.color : null },
      el('button', { type: 'button', className: 'back', 'aria-label': t('back'), onclick: back }, glyph('back'), el('span', {}, t('back'))),
      el('h2', {}, title));
  }
  function recordRow(o, f) {
    return el('button', { type: 'button', className: 'record', 'data-id': o.observationId, onclick: function () { go({ screen: 'record', formType: f.formType, id: o.observationId }); } },
      el('span', { className: 'rtext' },
        el('span', { className: 'rtitle' }, titleOf(o, f)),
        el('span', { className: 'rmeta' }, when(o.updatedAt || o.createdAt) + (o.isDraft ? ' · ' + t('drafts') : ''))),
      glyph('next'));
  }
  function openList(f) {
    var home = config.home || {};
    if (home.showRecords === false) return openForm(f.formType);
    go({ screen: 'list', formType: f.formType });
  }
  function homeForms() {
    return (config.forms || []).filter(function (f) { return f.onHome !== false; });
  }
  function startOfDay(d) { var x = new Date(d); x.setHours(0, 0, 0, 0); return x; }

  /* ---------- Screens ---------- */

  async function renderHome(seq) {
    var home = config.home || {};
    var forms = homeForms();
    var design = home.design || (home.layout === 'list' ? 'list' : 'grid');
    var lists = await Promise.all(forms.map(function (f) { return records(f.formType); }));
    if (seq !== renderSeq) return;
    var showCounts = home.showCounts !== false && !!api;
    var cards = forms.map(function (f, i) {
      return el('button', { type: 'button', className: 'card', style: f.color ? '--accent:' + f.color : null, 'data-form': f.formType, onclick: function () { if (!api) return toast(t('noApi'), 'bad'); openList(f); } },
        icon(f.icon),
        el('span', { className: 'text' },
          el('span', { className: 'name' }, f.title || f.formType),
          f.description ? el('span', { className: 'desc' }, f.description) : null),
        showCounts ? el('span', { className: 'count' }, lists[i].length + ' ' + t('saved')) : null);
    });
    var body;
    if (design === 'dashboard') {
      var all = [];
      lists.forEach(function (l, i) { l.forEach(function (o) { all.push({ o: o, f: forms[i] }); }); });
      (config.forms || []).forEach(function (f) {
        if (f.onHome === false && cache[f.formType]) cache[f.formType].forEach(function (o) { all.push({ o: o, f: f }); });
      });
      all.sort(function (a, b) { return new Date(b.o.updatedAt || b.o.createdAt || 0) - new Date(a.o.updatedAt || a.o.createdAt || 0); });
      var today = startOfDay(Date.now()), week = new Date(today.getTime() - 6 * 864e5);
      var nToday = all.filter(function (x) { return new Date(x.o.createdAt || x.o.updatedAt) >= today; }).length;
      var nWeek = all.filter(function (x) { return new Date(x.o.createdAt || x.o.updatedAt) >= week; }).length;
      body = [
        api ? el('section', { className: 'stats' },
          el('div', { className: 'stat' }, el('b', {}, String(nToday)), el('span', {}, t('today'))),
          el('div', { className: 'stat' }, el('b', {}, String(nWeek)), el('span', {}, t('week'))),
          el('div', { className: 'stat' }, el('b', {}, String(all.length)), el('span', {}, t('all')))) : null,
        el('h3', { className: 'section' }, t('start')),
        el('nav', { className: 'cards grid compact' }, cards),
        api && all.length ? el('h3', { className: 'section' }, t('recent')) : null,
        api && all.length ? el('div', { className: 'records' }, all.slice(0, 6).map(function (x) {
          var r = recordRow(x.o, x.f);
          r.querySelector('.rmeta').prepend(el('b', {}, (x.f.title || x.f.formType) + ' · '));
          return r;
        })) : null,
      ];
    } else {
      body = [el('nav', { className: 'cards ' + (design === 'list' ? 'list' : 'grid') }, cards)];
    }
    show(
      header(config.app && config.app.description),
      el('div', { className: 'page' },
        home.welcome ? el('p', { className: 'welcome' }, home.welcome) : null,
        !api ? el('p', { className: 'notice' }, t('noApi')) : null,
        forms.length ? body : el('p', { className: 'notice' }, t('noForms')),
        home.footer ? el('footer', {}, home.footer) : null));
  }

  async function renderList(seq, route) {
    var f = formConfig(route.formType);
    var list = await records(f.formType);
    if (seq !== renderSeq) return;
    var listBox = el('div', { className: 'records' });
    function draw(q) {
      q = String(q || '').toLowerCase();
      var shown = list.filter(function (o) { return !q || JSON.stringify(o.data || {}).toLowerCase().indexOf(q) !== -1 || titleOf(o, f).toLowerCase().indexOf(q) !== -1; });
      listBox.replaceChildren.apply(listBox, shown.length ? shown.map(function (o) { return recordRow(o, f); }) : [el('p', { className: 'notice' }, t('none'))]);
    }
    draw('');
    show(
      bar(f.title || f.formType, f),
      el('div', { className: 'page' },
        f.description ? el('p', { className: 'welcome' }, f.description) : null,
        el('button', { type: 'button', className: 'primary', 'data-action': 'new', style: f.color ? '--accent:' + f.color : null, onclick: function () { openForm(f.formType); } }, glyph('plus'), t('newRecord') + ': ' + (f.title || f.formType)),
        list.length > 6 ? el('label', { className: 'search' }, glyph('search'), el('input', { type: 'search', placeholder: t('search'), 'aria-label': t('search'), oninput: function (e) { draw(e.target.value); } })) : null,
        el('h3', { className: 'section' }, t('records') + ' (' + list.length + ')'),
        listBox));
  }

  async function renderRecord(seq, route) {
    var f = formConfig(route.formType);
    var list = await records(f.formType);
    var o = list.filter(function (x) { return x.observationId === route.id; })[0];
    var kids = childrenOf(f);
    var kidLists = await Promise.all(kids.map(function (c) { return records(c.formType); }));
    var parentRec = null, parentForm = null;
    if (o && f.parent) {
      parentForm = formConfig(f.parent.formType);
      var pl = await records(parentForm.formType);
      parentRec = pl.filter(function (x) { return x.observationId === (o.data || {})[f.parent.field]; })[0] || null;
    }
    if (seq !== renderSeq) return;
    if (!o) {
      show(bar(f.title || f.formType, f), el('div', { className: 'page' }, el('p', { className: 'notice' }, t('notFound'))));
      return;
    }
    var data = o.data || {};
    var names = (f.fields || []).map(function (x) { return x.name; });
    Object.keys(data).forEach(function (k) { if (names.indexOf(k) === -1) names.push(k); });
    var rows = [];
    names.forEach(function (n) {
      if (f.parent && n === f.parent.field) return;
      var v = display(f, n, data[n]);
      if (v === null) return;
      var fd = fieldOf(f, n);
      rows.push(el('div', { className: 'kv' }, el('dt', {}, fd && fd.label ? fd.label : n), el('dd', {}, v)));
    });
    var sections = kids.map(function (c, i) {
      var mine = kidLists[i].filter(function (x) { return (x.data || {})[c.parent.field] === o.observationId; });
      var prefill = {}; prefill[c.parent.field] = o.observationId;
      return el('section', { className: 'linked', style: c.color ? '--accent:' + c.color : null, 'data-child': c.formType },
        el('div', { className: 'linked-head' }, icon(c.icon), el('h3', {}, (c.title || c.formType) + ' (' + mine.length + ')'),
          el('button', { type: 'button', className: 'small-btn', 'data-action': 'new-child', onclick: function () { openForm(c.formType, prefill, null, prefill); } }, glyph('plus'), t('newRecord'))),
        mine.length ? el('div', { className: 'records' }, mine.map(function (x) { return recordRow(x, c); })) : el('p', { className: 'hint' }, t('none')));
    });
    show(
      bar(titleOf(o, f), f),
      el('div', { className: 'page detail' },
        el('div', { className: 'detail-main' },
          el('div', { className: 'formhead', style: f.color ? '--accent:' + f.color : null }, icon(f.icon),
            el('div', {}, el('b', {}, f.title || f.formType), el('small', {}, when(o.updatedAt || o.createdAt) + (o.isDraft ? ' · ' + t('drafts') : '')))),
          parentRec ? el('button', { type: 'button', className: 'record parent', onclick: function () { go({ screen: 'record', formType: parentForm.formType, id: parentRec.observationId }); } },
            icon(parentForm.icon), el('span', { className: 'rtext' }, el('span', { className: 'rmeta' }, parentForm.title), el('span', { className: 'rtitle' }, titleOf(parentRec, parentForm))), glyph('next')) : null,
          el('button', { type: 'button', className: 'primary', 'data-action': 'edit', style: f.color ? '--accent:' + f.color : null, onclick: function () { openForm(f.formType, o.data, o.observationId); } }, glyph('edit'), t('edit')),
          el('dl', { className: 'answers' }, rows)),
        sections.length ? el('div', { className: 'detail-side' }, sections) : null));
  }

  async function render() {
    var seq = ++renderSeq;
    var route = parseRoute(location.hash);
    try {
      if (route.screen === 'list' && api) await renderList(seq, route);
      else if (route.screen === 'record' && api) await renderRecord(seq, route);
      else await renderHome(seq);
    } catch (e) {
      show(header(), el('p', { className: 'notice' }, t('error') + ': ' + (e && e.message ? e.message : e)));
    }
  }

  async function start() {
    applyTheme();
    if (window.matchMedia) {
      var mq = window.matchMedia('(prefers-color-scheme: dark)');
      if (mq.addEventListener) mq.addEventListener('change', applyTheme);
    }
    // Always begin on the home screen as the first history entry, so back never skips past it.
    var initial = parseRoute(location.hash);
    try { history.replaceState({ ode: true, depth: 0 }, '', routeUrl({ screen: 'home' })); } catch (e) { /* ignore */ }
    await render(); // draw immediately, even before the API is ready
    try {
      if (typeof window.getFormulus === 'function') {
        api = await Promise.race([
          window.getFormulus(),
          new Promise(function (_, reject) { setTimeout(function () { reject(new Error('timeout')); }, 8000); }),
        ]);
      }
    } catch (e) {
      api = null;
    }
    if (api && initial.screen !== 'home') {
      if (initial.screen === 'record') { depth = 0; go({ screen: 'list', formType: initial.formType }); }
      go(initial);
    } else await render();
  }

  window.ODE_RUNTIME = { version: RUNTIME_VERSION, render: render, back: back, go: go };
  start();
})();
