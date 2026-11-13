/* ODE App Builder: the website. Everything runs in the browser; nothing is sent anywhere. */
(function () {
  'use strict';

  var B = window.OdeBuilder;
  var FM = window.OdeFormModel;
  var _editor = null;
  function editor() {
    if (!_editor) _editor = window.OdeQuestionEditor.create({
      h: h, ic: ic, save: save, toast: toast, downloadBlob: downloadBlob, LOCALES: B.LOCALES,
      defaultLocale: function () { return project.app.defaultLocale || 'en'; },
      showTab: function (t) { goApp({ form: route.form, mode: t === 'questions' ? 'build' : t }, { replace: true, keepScroll: true }); },
      preview: null, // the form page has its own "Try it" button
    });
    return _editor;
  }
  var TEMPLATES = window.ODE_TEMPLATES;
  var EXAMPLES = window.ODE_EXAMPLES || {};
  var GALLERY = window.ODE_GALLERY || {};
  var Ajv = window.OdeAjv;
  var STORE_KEY = 'ode-app-builder:project'; // older one-app storage; moved into the apps list on first load
  var INDEX_KEY = 'ode-app-builder:apps';
  var APP_PREFIX = 'ode-app-builder:app:';
  var ICONS = window.ODE_FORM_ICONS || [];
  var DEFAULT_COLOUR = '#3B7A4B'; // ODE green

  var project = null; // the app that is open
  var appId = null;
  var route = parseHash();
  var content = document.getElementById('content');
  var aiState = {}; // which AI step is open, per form
  var openSection = null; // open section on the App tab

  /* ------------------------------------------------------------------ */
  /* Helpers                                                             */
  /* ------------------------------------------------------------------ */

  /** Line icon (Lucide) as an inline SVG element. Unknown names fall back to their text. */
  var SVGNS = 'http://www.w3.org/2000/svg';
  function ic(name, size, cls) {
    var paths = (window.ODE_ICONS || {})[name];
    if (!paths) return h('span', { class: 'ic-text' + (cls ? ' ' + cls : '') }, name || '');
    var svg = document.createElementNS(SVGNS, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('width', size || 18);
    svg.setAttribute('height', size || 18);
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '1.8');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('class', 'ico' + (cls ? ' ' + cls : ''));
    svg.innerHTML = paths;
    return svg;
  }
  function formIcon(f, size) {
    var el = h('span', { class: 'ficon', style: f && f.color ? '--fc:' + f.color : null });
    el.append(ic((f && f.icon) || 'clipboard-list', size || 20));
    return el;
  }

  function h(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) {
      for (var k in attrs) {
        var v = attrs[k];
        if (v === null || v === undefined || v === false) continue;
        if (k === 'class') node.className = v;
        else if (k === 'text') node.textContent = v;
        else if (k === 'html') node.innerHTML = v;
        else if (k.slice(0, 2) === 'on' && typeof v === 'function') node.addEventListener(k.slice(2), v);
        else if (k === 'value') node.value = v;
        else if (k === 'checked') node.checked = !!v;
        else node.setAttribute(k, v === true ? '' : v);
      }
    }
    for (var i = 2; i < arguments.length; i++) append(node, arguments[i]);
    return node;
  }
  function append(node, c) {
    if (c === null || c === undefined || c === false) return;
    if (Array.isArray(c)) return c.forEach(function (x) { append(node, x); });
    node.append(c && c.nodeType ? c : String(c));
  }

  /* ---------- Saved apps (kept in this browser) ---------- */

  function readIndex() {
    try { var a = JSON.parse(localStorage.getItem(INDEX_KEY) || '[]'); return Array.isArray(a) ? a : []; } catch (e) { return []; }
  }
  function writeIndex(list) {
    try { localStorage.setItem(INDEX_KEY, JSON.stringify(list)); } catch (e) { /* ignore */ }
  }
  function newId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
  function summaryOf(id, p) {
    var logo = p.app.logo && p.app.logo.dataUrl && p.app.logo.dataUrl.length < 80000 ? p.app.logo.dataUrl : null;
    return { id: id, name: p.app.name || 'Untitled app', forms: p.forms.length, color: p.brand.primary, logo: logo, updatedAt: new Date().toISOString() };
  }
  (function migrateOldStorage() {
    try {
      var raw = localStorage.getItem(STORE_KEY);
      if (!raw || readIndex().length) return;
      var p = B.parseProject(raw);
      if (!p.forms.length && p.app.name === B.newProject().app.name) return;
      var id = newId();
      localStorage.setItem(APP_PREFIX + id, JSON.stringify(p));
      writeIndex([summaryOf(id, p)]);
      localStorage.removeItem(STORE_KEY);
    } catch (e) { /* ignore */ }
  })();
  function loadApp(id) {
    if (project && appId === id) return true;
    try {
      var raw = localStorage.getItem(APP_PREFIX + id);
      if (!raw) return false;
      project = B.parseProject(raw);
      appId = id;
      return true;
    } catch (e) { return false; }
  }
  /** Keep a new app (blank, template or opened file) and make it the open one. */
  function adoptApp(p) {
    flush();
    project = p;
    appId = newId();
    flush();
    return appId;
  }
  function deleteApp(id) {
    try { localStorage.removeItem(APP_PREFIX + id); } catch (e) { /* ignore */ }
    writeIndex(readIndex().filter(function (x) { return x.id !== id; }));
    if (appId === id) { project = null; appId = null; }
  }
  var saveTimer = null;
  var persistAsked = false;
  /** Ask the browser not to clear saved apps when space runs low. */
  function askPersist() {
    if (persistAsked) return;
    persistAsked = true;
    try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(function () {}); } catch (e) { /* ignore */ }
  }
  function flush() {
    clearTimeout(saveTimer);
    if (!project || !appId) return;
    try {
      localStorage.setItem(APP_PREFIX + appId, JSON.stringify(project));
      if (String(project.app.name || '').trim()) {
        askPersist();
        var list = readIndex().filter(function (x) { return x.id !== appId; });
        list.unshift(summaryOf(appId, project));
        writeIndex(list);
      }
    } catch (e) { toast('This browser is out of space. Use "Save to file" to keep your app.'); }
  }
  window.addEventListener('pagehide', flush);
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'hidden') flush(); });
  function save() {
    if (!project) return;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(flush, 250);
    schedulePreview();
  }

  var toastTimer;
  function toast(msg) {
    var t = document.getElementById('toast');
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.hidden = true; }, 2600);
  }

  function copy(text, what) {
    function fallback() {
      var ta = h('textarea', { style: 'position:fixed;opacity:0' });
      ta.value = text;
      document.body.append(ta);
      ta.select();
      try { document.execCommand('copy'); } catch (e) { /* ignore */ }
      ta.remove();
    }
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).catch(fallback);
    else fallback();
    toast((what || 'Text') + ' copied. Paste it into your AI chat.');
  }

  function downloadBlob(blob, name) {
    var a = h('a', { href: URL.createObjectURL(blob), download: name });
    document.body.append(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }

  function dialog(nodes) {
    var d = document.getElementById('dialog');
    var body = document.getElementById('dialogBody');
    body.replaceChildren();
    append(body, nodes);
    append(body, h('div', { class: 'row', style: 'justify-content:flex-end;margin-top:18px' }, h('button', { type: 'button', class: 'primary', onclick: function () { d.close(); } }, 'Close')));
    d.showModal();
  }

  var fieldSeq = 0;
  function field(label, input, hint, optional) {
    // Tie the label to its input, so screen readers read it and tapping the label focuses the box.
    var target = input && input.nodeType === 1 ? (/^(INPUT|SELECT|TEXTAREA)$/.test(input.tagName) ? input : null) : null;
    var lab = h('label', {}, label, optional ? h('span', { class: 'opt' }, ' (optional)') : null);
    if (target) { if (!target.id) target.id = 'fld' + (++fieldSeq); lab.htmlFor = target.id; }
    else lab = h('div', { class: 'label' }, label, optional ? h('span', { class: 'opt' }, ' (optional)') : null);
    return h('div', { class: 'field' }, lab, input, hint ? h('p', { class: 'hint' }, hint) : null);
  }

  function textInput(obj, key, opts) {
    opts = opts || {};
    return h('input', {
      type: 'text',
      value: obj[key] || '',
      placeholder: opts.placeholder || '',
      maxlength: opts.max || null,
      oninput: function (e) {
        obj[key] = e.target.value;
        if (opts.after) opts.after(e.target.value);
        save();
      },
    });
  }

  function formStatus(form) {
    if (!form.schemaText && !form.uiText) return { cls: 'none', text: form.brief ? 'Not written yet' : 'Not started' };
    var r = B.validateForm(form.schemaText, form.uiText, { formType: form.formType, knownForms: project.forms.map(function (f) { return f.formType; }), Ajv: Ajv, previousFields: form.lastUploadedFields });
    if (form.model && window.OdeFormModel) {
      window.OdeFormModel.checkModel(form.model).forEach(function (p) { r.diagnostics.push({ severity: p.severity, code: 'editor', file: '', path: '', message: p.where + ': ' + p.message }); });
      if (r.diagnostics.some(function (d) { return d.severity === 'error'; })) r.valid = false;
    }
    if (form.parent && project.forms.some(function (x) { return x.formType === form.parent; })) {
      var lf = B.linkField(form.parent);
      var props = {};
      try { props = JSON.parse(form.schemaText).properties || {}; } catch (e) { /* reported */ }
      if (!props[lf]) r.diagnostics.push({ severity: 'error', code: 'missing_link', file: 'schema.json', path: '', message: 'This form belongs to "' + form.parent + '", so it needs a read-only text question named "' + lf + '". Use the question editor (it adds it), or ask the AI again.' });
    }
    var errs = r.diagnostics.filter(function (d) { return d.severity === 'error'; }).length;
    var warns = r.diagnostics.filter(function (d) { return d.severity === 'warning'; }).length;
    if (errs) return { cls: 'bad', text: errs + (errs === 1 ? ' problem' : ' problems'), result: r };
    if (warns) return { cls: 'warn', text: 'Ready, ' + warns + (warns === 1 ? ' note' : ' notes'), result: r };
    return { cls: 'ok', text: 'Ready', result: r };
  }

  /* ------------------------------------------------------------------ */
  /* Navigation: one browser history entry per screen, so the phone's    */
  /* back button steps back inside the builder too.                      */
  /* ------------------------------------------------------------------ */

  function parseHash() {
    var p = String(location.hash || '').replace(/^#\/?/, '').split('/').filter(Boolean);
    if (p[0] === 'new' && p[1]) return { view: 'new', id: p[1], step: Math.min(3, Math.max(1, +p[2] || 1)) };
    if (p[0] === 'app' && p[1]) {
      var r = { view: 'app', id: p[1], tab: ['forms', 'app', 'publish'].indexOf(p[2]) !== -1 ? p[2] : 'forms', form: null, mode: null };
      if (r.tab === 'forms' && /^\d+$/.test(p[3] || '')) { r.form = +p[3]; r.mode = p[4] || null; }
      return r;
    }
    return { view: 'home' };
  }
  function hashOf(r) {
    if (r.view === 'new') return '#/new/' + r.id + '/' + (r.step || 1);
    if (r.view === 'app') return '#/app/' + r.id + '/' + (r.tab || 'forms') + (r.form !== null && r.form !== undefined ? '/' + r.form + (r.mode ? '/' + r.mode : '') : '');
    return '#/';
  }
  function nav(r, opts) {
    opts = opts || {};
    route = Object.assign({ form: null, mode: null }, r);
    var hsh = hashOf(route);
    try {
      if (opts.replace) history.replaceState(null, '', hsh);
      else if (location.hash !== hsh) history.pushState(null, '', hsh);
    } catch (e) { /* file:// in some browsers */ }
    render();
    if (!opts.keepScroll) window.scrollTo(0, 0);
  }
  function goApp(patch, opts) {
    nav(Object.assign({ view: 'app', id: appId, tab: 'forms', form: null, mode: null }, patch), opts);
  }
  window.addEventListener('popstate', function () { route = parseHash(); render(); });
  window.addEventListener('hashchange', function () { if (location.hash !== hashOf(route)) { route = parseHash(); render(); } });

  function render() {
    var r = route;
    if (r.view !== 'home' && !loadApp(r.id)) {
      route = r = { view: 'home' };
      try { history.replaceState(null, '', '#/'); } catch (e) { /* ignore */ }
    }
    if (r.view === 'home' && project) { flush(); project = null; appId = null; }
    document.body.setAttribute('data-view', r.view);
    document.body.classList.toggle('in-form', r.view === 'app' && r.form !== null);
    var keepForm = r.view === 'app' && r.form !== null && project && project.forms[r.form] ? project.forms[r.form].formType : null;
    if (keepForm !== autoFormFor) autoFormOff = null;
    autoFormFor = keepForm;
    if (window.OdeFormPreview && window.OdeFormPreview.current() !== keepForm) window.OdeFormPreview.close();
    togglePreviewSheet(false);
    content.replaceChildren();
    append(content, r.view === 'new' ? renderWizard(r) : r.view === 'app' ? renderApp(r) : renderAppsHome());
    document.getElementById('btnSave').hidden = !project;
    document.getElementById('btnOpen').hidden = !!project;
    document.getElementById('btnPreview').hidden = !project;
    if (project) { document.title = (project.app.name || 'New app') + ' · ODE App Builder'; save(); setTimeout(showSelectedForm, 0); }
    else document.title = 'ODE App Builder';
  }

  function ago(iso) {
    var s = (Date.now() - new Date(iso).getTime()) / 1000;
    if (!isFinite(s)) return '';
    if (s < 90) return 'just now';
    if (s < 3600) return Math.round(s / 60) + ' min ago';
    if (s < 86400) return Math.round(s / 3600) + ' h ago';
    if (s < 86400 * 7) return Math.round(s / 86400) + (Math.round(s / 86400) === 1 ? ' day ago' : ' days ago');
    return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
  }
  function appBadge(logo, color, name, size) {
    if (logo) return h('img', { class: 'app-badge', src: logo, alt: '', width: size, height: size, style: 'width:' + size + 'px;height:' + size + 'px' });
    var initials = String(name || '?').split(/\s+/).filter(Boolean).slice(0, 2).map(function (w) { return w.charAt(0).toUpperCase(); }).join('') || '?';
    return h('span', { class: 'app-badge', style: 'width:' + size + 'px;height:' + size + 'px;background:' + (B.isHex(color) ? color : DEFAULT_COLOUR) + ';color:' + B.onColor(B.isHex(color) ? color : DEFAULT_COLOUR) }, initials);
  }

  /* ------------------------------------------------------------------ */
  /* Your apps                                                           */
  /* ------------------------------------------------------------------ */

  function renderAppsHome() {
    var apps = readIndex();
    var galleryCards = Object.keys(GALLERY).map(function (k) {
      var g = GALLERY[k], m = g.gallery;
      return h('button', { type: 'button', class: 'tpl', 'data-gallery': k, onclick: function () { galleryDetails(k); } },
        h('span', { class: 'tpl-ic', style: 'background:' + g.brand.primary + ';color:' + B.onColor(g.brand.primary) }, ic(m.icon, 20)),
        h('span', { class: 'tpl-t' }, h('b', {}, m.title), h('small', {}, m.sector)));
    });
    return h('div', { class: 'home' },
      h('section', { class: 'hero' },
        h('img', { src: 'img/ode-128.png', alt: '', class: 'hero-logo', width: 64, height: 64 }),
        h('div', {},
          h('h1', {}, apps.length ? 'Your apps' : 'Make an ODE app'),
          h('p', { class: 'lead' }, 'Make your app, add the forms your team fills in, then publish it to your Synkronus server. No code needed.'))),
      apps.length ? null : h('ol', { class: 'how3' },
        h('li', {}, h('b', {}, 'Make the app'), h('span', {}, 'Name, logo and colours.')),
        h('li', {}, h('b', {}, 'Add forms'), h('span', {}, 'Describe them; any AI writes them.')),
        h('li', {}, h('b', {}, 'Publish'), h('span', {}, 'Upload one zip to Synkronus.'))),
      h('div', { class: 'start-actions' },
        h('button', { type: 'button', class: 'primary big', 'data-role': 'new-app', onclick: newApp }, ic('plus', 18), 'New app'),
        h('button', { type: 'button', class: 'ghost big', title: 'A saved app file (.odeapp.json) or an app bundle zip', onclick: function () { document.getElementById('fileOpen').click(); } }, ic('folder-open', 18), 'Open a file')),
      apps.length ? h('div', { class: 'app-list' }, apps.map(function (a) {
        return h('div', { class: 'app-row' },
          h('button', { type: 'button', class: 'app-open', 'data-app': a.id, onclick: function () { nav({ view: 'app', id: a.id, tab: 'forms' }); } },
            appBadge(a.logo, a.color, a.name, 44),
            h('span', { class: 'app-t' }, h('b', {}, a.name), h('small', {}, a.forms + (a.forms === 1 ? ' form' : ' forms') + ' · edited ' + ago(a.updatedAt))),
            ic('chevron-right', 18, 'chev')),
          h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Delete ' + a.name, title: 'Delete', onclick: function () {
            if (!confirm('Delete "' + a.name + '" from this browser? Use "Save to file" first if you want to keep a copy.')) return;
            deleteApp(a.id);
            render();
            toast('Deleted ' + a.name + '.');
          } }, ic('trash-2', 17)));
      })) : null,
      h('h2', {}, 'Or start from a ready-made app'),
      h('p', { class: 'hint', style: 'margin:-4px 0 12px' }, 'Working apps for each sector, with linked forms, GPS, photos and follow-up. Change anything afterwards.'),
      h('div', { class: 'tpl-grid' }, galleryCards),
      h('p', { class: 'foot-note' }, 'Your apps are kept in this browser. Use "Save to file" to move one to another computer. Part of ', h('a', { href: 'https://opendataensemble.org/', target: '_blank', rel: 'noopener' }, 'Open Data Ensemble'), '.'));
  }

  function newApp() {
    var p = B.newProject();
    p.app.name = '';
    p.brand = { primary: DEFAULT_COLOUR, secondary: '#B7791F' };
    adoptApp(p);
    nav({ view: 'new', id: appId, step: 1 });
  }

  /* ------------------------------------------------------------------ */
  /* New app: three short screens                                        */
  /* ------------------------------------------------------------------ */

  function renderWizard(r) {
    var a = project.app;
    var body, next = null, back;
    if (r.step === 1) {
      var name = textInput(a, 'name', { placeholder: 'e.g. Malaria Household Survey', max: 60 });
      name.setAttribute('data-role', 'app-name');
      name.setAttribute('enterkeyhint', 'next');
      name.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); next(); } });
      if (!a.name) setTimeout(function () { name.focus(); }, 30);
      body = [
        h('h1', {}, 'Name your app'),
        h('p', { class: 'lead' }, 'This is what your team sees at the top of the app on their phones.'),
        field('App name', name),
        field('Short description', textInput(a, 'description', { placeholder: 'e.g. Household register and follow-up visits', max: 120 }), null, true),
        field('Main language', langSelect(), 'The language of the app\'s buttons and of your forms.'),
      ];
      back = function () { nav({ view: 'home' }); };
      next = function () {
        if (!String(a.name || '').trim()) { toast('Give your app a name.'); name.focus(); return; }
        a.name = a.name.trim();
        nav({ view: 'new', id: appId, step: 2 }, { replace: true });
      };
    } else if (r.step === 2) {
      body = [
        h('h1', {}, 'Make it yours'),
        h('p', { class: 'lead' }, 'Add your logo and pick a colour. You can change these at any time.'),
        field('Logo', logoField(), null, true),
        field('Main colour', swatchPicker(project.brand, 'primary')),
        field('Home screen', designPicker(project.home)),
      ];
      back = function () { nav({ view: 'new', id: appId, step: 1 }, { replace: true }); };
      next = function () { nav({ view: 'new', id: appId, step: 3 }, { replace: true }); };
    } else {
      flush();
      body = [
        h('div', { class: 'done-mark' }, ic('circle-check', 44)),
        h('h1', {}, a.name + ' is ready'),
        h('p', { class: 'lead' }, 'Your app is saved in this browser. Next, add the forms your team will fill in, like "Register household" or "Clinic visit".'),
        h('div', { class: 'stack' },
          h('button', { type: 'button', class: 'primary big', 'data-role': 'first-form', onclick: function () { nav({ view: 'app', id: appId, tab: 'forms' }, { replace: true }); openAddForm(); } }, ic('plus', 18), 'Add your first form'),
          h('button', { type: 'button', class: 'ghost big', onclick: function () { nav({ view: 'app', id: appId, tab: 'forms' }, { replace: true }); } }, 'Go to my app')),
      ];
    }
    return h('div', { class: 'wizard' },
      h('div', { class: 'wiz-top' },
        r.step < 3 ? h('button', { type: 'button', class: 'link-back', onclick: back }, ic('arrow-left', 16), r.step === 1 ? 'Your apps' : 'Back') : h('span'),
        h('div', { class: 'dots', role: 'img', 'aria-label': 'Step ' + r.step + ' of 3' }, [1, 2, 3].map(function (i) { return h('i', { class: i <= r.step ? 'on' : '' }); }))),
      h('div', { class: 'wiz-body' }, body),
      next ? h('div', { class: 'wiz-foot' },
        h('button', { type: 'button', class: 'primary big', 'data-role': 'wiz-next', onclick: next }, r.step === 2 ? 'Save app' : 'Next', ic('arrow-right', 18))) : null);
  }

  /* ------------------------------------------------------------------ */
  /* The app: Forms, App, Publish                                        */
  /* ------------------------------------------------------------------ */

  var APP_TABS = [['forms', 'Forms', 'list'], ['app', 'App', 'smartphone'], ['publish', 'Publish', 'upload']];

  function renderApp(r) {
    var tabBar = h('nav', { class: 'apptabs', 'aria-label': 'App sections' }, APP_TABS.map(function (t) {
      return h('button', { type: 'button', 'data-apptab': t[0], 'aria-current': r.tab === t[0] ? 'page' : null, onclick: function () { goApp({ tab: t[0] }); } },
        ic(t[2], 20), h('span', {}, t[1]));
    }));
    if (r.tab === 'forms' && r.form !== null) {
      var f = project.forms[r.form];
      if (f) return [renderFormPage(f, r), tabBar];
      route.form = null;
    }
    var n = project.forms.length;
    var head = h('div', { class: 'apphead' },
      h('button', { type: 'button', class: 'link-back', onclick: function () { nav({ view: 'home' }); } }, ic('arrow-left', 16), 'Your apps'),
      h('div', { class: 'appid' },
        appBadge(project.app.logo && project.app.logo.dataUrl, project.brand.primary, project.app.name, 48),
        h('div', { class: 'appid-t' }, h('h1', {}, project.app.name || 'Untitled app'),
          h('small', {}, n + (n === 1 ? ' form' : ' forms') + ' · version ' + (project.app.version || '1.0.0')))));
    var body = r.tab === 'app' ? renderAppTab() : r.tab === 'publish' ? renderPublish() : renderFormsTab();
    return [head, tabBar, h('div', { class: 'tab-body' }, body)];
  }

  /** Forms in tree order: each form followed by the forms that belong to it. */
  function treeOrder() {
    var out = [], seen = {};
    function add(f, depth) {
      if (seen[f.formType]) return;
      seen[f.formType] = true;
      out.push({ f: f, i: project.forms.indexOf(f), depth: depth });
      project.forms.filter(function (x) { return x.parent === f.formType; }).forEach(function (k) { add(k, depth + 1); });
    }
    project.forms.filter(function (f) { return !f.parent || !project.forms.some(function (x) { return x.formType === f.parent; }); }).forEach(function (f) { add(f, 0); });
    project.forms.forEach(function (f) { add(f, 0); });
    return out;
  }

  function renderFormsTab() {
    if (!project.forms.length) {
      return h('div', { class: 'empty-state' },
        h('span', { class: 'empty-ic' }, ic('clipboard-list', 30)),
        h('h2', {}, 'No forms yet'),
        h('p', { class: 'hint' }, 'A form is one thing your team fills in, like "Register household" or "Clinic visit".'),
        h('button', { type: 'button', class: 'primary big', 'data-role': 'add-form', onclick: openAddForm }, ic('plus', 18), 'Add your first form'));
    }
    return [
      h('div', { class: 'form-rows' }, treeOrder().map(function (x) {
        var st = formStatus(x.f);
        var parent = x.f.parent && project.forms.filter(function (p) { return p.formType === x.f.parent; })[0];
        var what = st.result && st.result.summary ? st.result.summary.questions + (st.result.summary.questions === 1 ? ' question' : ' questions') : x.f.brief ? 'Described, not written yet' : 'Empty';
        return h('button', { type: 'button', class: 'form-row', style: '--depth:' + x.depth, 'data-form': x.f.formType, onclick: function () { goApp({ form: x.i }); } },
          formIcon(x.f, 20),
          h('span', { class: 't' }, h('b', {}, x.f.title || x.f.formType), h('small', {}, (parent ? 'In ' + parent.title + ' · ' : '') + what)),
          h('span', { class: 'status ' + st.cls }, st.text),
          ic('chevron-right', 18, 'chev'));
      })),
      h('button', { type: 'button', class: 'add-q', 'data-role': 'add-form', onclick: openAddForm }, ic('plus', 18), 'Add a form'),
    ];
  }

  /** New form: a name and how to make it. */
  function openAddForm() {
    var d = document.getElementById('dialog');
    var body = document.getElementById('dialogBody');
    var method = 'ai';
    var METHODS = [
      ['ai', 'Describe it, AI writes it', 'message-square-text', 'Write the questions in your own words. Any AI chat turns them into the form.', true],
      ['build', 'Build it question by question', 'list-plus', 'Pick a question type, then type the question.'],
      ['excel', 'Import an Excel form', 'file-up', 'An .xlsx file in the XLSForm layout. Its name comes from the file.'],
    ];
    var inp = h('input', { type: 'text', maxlength: 60, placeholder: 'e.g. Household visit', 'data-role': 'ask-text', enterkeyhint: 'done' });
    var nameField = field('Form name', inp);
    var list = h('div', { class: 'method-list', role: 'radiogroup', 'aria-label': 'How do you want to make it?' });
    function draw() {
      list.replaceChildren();
      METHODS.forEach(function (m) {
        list.append(h('button', { type: 'button', class: 'method', role: 'radio', 'aria-checked': method === m[0] ? 'true' : 'false', 'data-method': m[0], onclick: function () { method = m[0]; nameField.hidden = method === 'excel'; draw(); } },
          h('span', { class: 'tt-ic' }, ic(m[2], 20)),
          h('span', { class: 'm-t' }, h('b', {}, m[1], m[4] ? h('span', { class: 'tag rec' }, 'Recommended') : null), h('small', {}, m[3])),
          h('span', { class: 'radio-dot', 'aria-hidden': 'true' })));
      });
    }
    draw();
    function ok() {
      if (method === 'excel') {
        d.close();
        return pickFiles('.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', false, function (files) { importXlsx(files[0]); });
      }
      var v = inp.value.trim();
      if (!v) { inp.focus(); return toast('Give the form a name.'); }
      d.close();
      var f = B.newForm(v);
      f.formType = uniqueId(B.slugify(v), f);
      if (method === 'build') f.model = FM.newModel(v);
      project.forms.push(f);
      save();
      goApp({ form: project.forms.length - 1, mode: method === 'build' ? 'build' : 'ai' });
      var b = content.querySelector('textarea.brief');
      if (b) b.focus();
    }
    inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); ok(); } });
    body.replaceChildren(
      h('div', { class: 'sheet-head' }, h('h2', {}, 'New form'), h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Close', onclick: function () { d.close(); } }, ic('x', 20))),
      nameField,
      h('div', { class: 'label' }, 'How do you want to make it?'),
      list,
      h('div', { class: 'sheet-foot' },
        h('button', { type: 'button', class: 'link', onclick: function () { d.close(); importFormFiles(); } }, 'Have ODE form files? Import them'),
        h('button', { type: 'button', class: 'primary big', 'data-role': 'ask-ok', onclick: ok }, 'Create form')));
    d.classList.add('sheet');
    d.addEventListener('close', function once() { d.classList.remove('sheet'); d.removeEventListener('close', once); });
    d.showModal();
    if (window.matchMedia('(min-width: 761px)').matches) setTimeout(function () { inp.focus(); }, 30);
  }

  function pickFiles(accept, multiple, done) {
    var inp = h('input', { type: 'file', accept: accept, multiple: multiple ? true : null });
    inp.addEventListener('change', function () { var files = Array.prototype.slice.call(inp.files); if (files.length) done(files); });
    inp.click();
  }

  /* ---------- One form ---------- */

  var FORM_MODES = [['ai', 'With AI', 'message-square-text'], ['build', 'Questions', 'list-plus'], ['translate', 'Languages', 'languages']];

  function renderFormPage(f, r) {
    var i = r.form;
    var mode = FORM_MODES.some(function (m) { return m[0] === r.mode; }) ? r.mode : (f.brief || !f.model ? 'ai' : 'build');
    var st = formStatus(f);
    var statusEl = h('span', { class: 'status ' + st.cls }, st.text);
    var tryBtn = h('button', { type: 'button', class: 'ghost', 'data-role': 'try-form', disabled: f.schemaText ? null : 'disabled', onclick: function () { previewForm(f); } }, ic('play', 16), h('span', {}, 'Try it'));
    function onChange() {
      var s = formStatus(f);
      statusEl.className = 'status ' + s.cls;
      statusEl.textContent = s.text;
      tryBtn.disabled = !f.schemaText;
      schedulePreview();
      clearTimeout(formRefreshTimer);
      formRefreshTimer = setTimeout(function () { showSelectedForm(true); }, 700);
    }
    var head = h('div', { class: 'formhead' },
      h('button', { type: 'button', class: 'link-back', onclick: function () { goApp({ tab: 'forms' }); } }, ic('arrow-left', 16), 'All forms'),
      h('div', { class: 'fh-main' },
        formIcon(f, 22),
        h('div', { class: 'fh-t' }, h('h1', {}, f.title || f.formType), statusEl),
        h('div', { class: 'fh-actions' }, tryBtn,
          h('button', { type: 'button', class: 'ghost', 'data-role': 'form-settings', onclick: function () { openFormSettings(f); } }, ic('settings-2', 16), h('span', {}, 'Settings')))));
    var modes = h('div', { class: 'modes', role: 'tablist', 'aria-label': 'How to edit this form' }, FORM_MODES.map(function (m) {
      return h('button', { type: 'button', role: 'tab', 'data-tab': m[0], 'aria-selected': mode === m[0] ? 'true' : 'false', onclick: function () { goApp({ form: i, mode: m[0] }, { replace: true, keepScroll: true }); } }, ic(m[2], 16), h('span', {}, m[1]));
    }));
    var body = mode === 'build' ? h('div', { class: 'panel' }, editor().questions(f, onChange))
      : mode === 'translate' ? h('div', { class: 'panel' }, editor().translations(f, onChange))
      : aiFlow(f, onChange);
    return h('div', { class: 'form-page' }, head, modes, body);
  }

  /** Describe, copy the prompt, paste the answer: one step open at a time. */
  function aiFlow(f, onChange) {
    var key = appId + ':' + f.formType;
    var s = formStatus(f);
    var ready = !!f.schemaText && (s.cls === 'ok' || s.cls === 'warn');
    var step = aiState[key] || (ready ? 'done' : f.schemaText ? 'paste' : f.brief ? 'prompt' : 'describe');
    var root = h('div', { class: 'aiflow' });
    function setStep(x) { aiState[key] = x; var n = aiFlow(f, onChange); root.replaceWith(n); }

    if (step === 'done') {
      var sm = s.result && s.result.summary;
      root.append(h('div', { class: 'panel ai-done' },
        h('div', { class: 'ok-line' }, h('span', { class: 'ok-ic' }, ic('circle-check', 24)),
          h('div', {}, h('b', {}, 'This form is ready'),
            sm ? h('small', {}, sm.questions + ' questions on ' + sm.pages + (sm.pages === 1 ? ' page' : ' pages') + (sm.rules ? ', ' + sm.rules + (sm.rules === 1 ? ' show/hide rule' : ' show/hide rules') : '')) : null)),
        s.cls === 'warn' ? renderCheckResult(f, s.result).slice(1, 2) : null,
        h('div', { class: 'row' },
          h('button', { type: 'button', class: 'primary', onclick: function () { previewForm(f); } }, ic('play', 16), 'Try it'),
          h('button', { type: 'button', class: 'ghost', 'data-role': 'change-ai', onclick: function () { setStep('describe'); } }, ic('message-square-text', 16), 'Change it with AI')),
        h('details', {}, h('summary', {}, 'What the form asks'), outline(f))));
      return root;
    }

    var STEPS = [
      ['describe', 'Describe the form', f.brief ? String(f.brief).trim().split('\n')[0].slice(0, 80) : 'Write the questions in your own words.'],
      ['prompt', 'Copy the prompt into an AI chat', 'Claude, ChatGPT, Gemini or any other.'],
      ['paste', 'Paste the answer back', f.schemaText ? s.text : 'The builder checks it for you.'],
    ];
    var at = STEPS.findIndex(function (x) { return x[0] === step; });
    STEPS.forEach(function (st, idx) {
      var on = idx === at, done = idx < at;
      root.append(h('section', { class: 'panel astep' + (on ? ' on' : '') + (done ? ' done' : ''), 'data-step': st[0] },
        h('button', { type: 'button', class: 'astep-h', 'aria-expanded': on ? 'true' : 'false', onclick: function () { if (!on) setStep(st[0]); } },
          h('span', { class: 'n' }, done ? ic('check', 14) : String(idx + 1)),
          h('span', { class: 'astep-t' }, h('b', {}, st[1]), on ? null : h('small', {}, st[2]))),
        on ? h('div', { class: 'astep-b' }, stepBody(st[0])) : null));
    });
    if (ready) root.append(h('button', { type: 'button', class: 'link', style: 'margin-top:4px', onclick: function () { setStep('done'); } }, 'Keep the form as it is'));
    return root;

    function stepBody(id) {
      if (id === 'describe') {
        var brief = h('textarea', { class: 'brief', placeholder: 'One question per line, in order. For example:\n\n- Village name (required)\n- How many people live here? (number 1 to 40)\n- Any children under 5? Yes/No\n  - If yes: how many?\n- Photo of the house', oninput: function (e) { f.brief = e.target.value; save(); } });
        brief.value = f.brief || '';
        var insert = function (text) { insertAtCursor(brief, text); f.brief = brief.value; save(); };
        return [
          h('p', { class: 'hint', style: 'margin-top:0' }, 'Say the answer type, which questions are required, and when a question should only show.' + (f.schemaText ? ' To change the form, write only what should change.' : '')),
          h('div', { class: 'snippets' },
            BRIEF_EXTRAS.map(function (x) { return h('button', { type: 'button', onclick: function () { insert(x[1]); } }, '+ ' + x[0]); }),
            h('button', { type: 'button', class: 'types-btn', onclick: function () { typesDialog(insert); } }, ic('shapes', 14), 'Question types')),
          brief,
          h('div', { class: 'row end' },
            h('button', { type: 'button', class: 'primary', 'data-role': 'brief-next', onclick: function () {
              if (!String(f.brief || '').trim()) { brief.focus(); return toast('Write at least one question first.'); }
              setStep('prompt');
            } }, 'Next', ic('arrow-right', 16))),
        ];
      }
      if (id === 'prompt') {
        return [
          h('p', { class: 'hint', style: 'margin-top:0' }, 'The prompt holds the ODE form rules, an example and your description. Paste it into a new chat.'),
          h('div', { class: 'row' },
            h('button', { type: 'button', class: 'primary big', onclick: function () {
              copy(B.buildPrompt(project, f), 'Prompt');
              setTimeout(function () { setStep('paste'); }, 600);
            } }, ic('copy', 18), 'Copy prompt'),
            h('button', { type: 'button', class: 'ghost', onclick: function () {
              dialog([h('h2', {}, 'Prompt for ' + f.title), h('textarea', { class: 'code', readonly: true, style: 'min-height:50vh;white-space:pre-wrap' }, B.buildPrompt(project, f))]);
            } }, 'See it')),
          h('div', { class: 'ai-links' },
            h('span', { class: 'hint', style: 'margin:0' }, 'Open:'),
            h('a', { href: 'https://claude.ai/new', target: '_blank', rel: 'noopener' }, 'Claude', ic('external-link', 13)),
            h('a', { href: 'https://chatgpt.com/', target: '_blank', rel: 'noopener' }, 'ChatGPT', ic('external-link', 13)),
            h('a', { href: 'https://gemini.google.com/app', target: '_blank', rel: 'noopener' }, 'Gemini', ic('external-link', 13))),
        ];
      }
      var pasteBox = h('textarea', { class: 'code', placeholder: 'Paste the whole AI answer here. The builder finds schema.json and ui.json in it.', style: 'min-height:140px' });
      function usePasted() {
        var got = B.extractForm(pasteBox.value);
        if (!got.schema && !got.ui) return toast('No form found. Paste the whole answer, including the code blocks.');
        if (got.schema) f.schemaText = got.schema;
        if (got.ui) f.uiText = got.ui;
        if (!got.schema || !got.ui) toast('Found only ' + (got.schema ? 'schema.json' : 'ui.json') + '. Ask the AI for both files.');
        editor().adoptFiles(f);
        if (f.parent && f.model) setParent(f, f.parent);
        save();
        onChange();
        var s2 = formStatus(f);
        var ok = s2.cls === 'ok' || s2.cls === 'warn';
        if (ok) toast('Form checked: ' + s2.text + '.');
        setStep(ok ? 'done' : 'paste');
      }
      return [
        pasteBox,
        h('div', { class: 'row', style: 'margin-top:10px' },
          h('button', { type: 'button', class: 'primary', onclick: usePasted }, ic('clipboard-paste', 16), 'Check and use this answer')),
        f.schemaText && s.result ? renderCheckResult(f, s.result) : null,
      ];
    }
  }

  function typesDialog(insert) {
    var d = document.getElementById('dialog');
    var body = document.getElementById('dialogBody');
    body.replaceChildren(
      h('div', { class: 'sheet-head' }, h('h2', {}, 'Question types'), h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Close', onclick: function () { d.close(); } }, ic('x', 20))),
      h('p', { class: 'hint' }, 'Every type ODE supports. Tap one to add an example line, then change the words.'),
      typeReference(function (t) { d.close(); insert(t); }));
    d.classList.add('sheet');
    d.addEventListener('close', function once() { d.classList.remove('sheet'); d.removeEventListener('close', once); });
    d.showModal();
  }

  /** Name, icon, colour, links and files of one form, in a sheet. */
  function openFormSettings(f) {
    var d = document.getElementById('dialog');
    var body = document.getElementById('dialogBody');
    var changed = false;
    function draw() {
      var i = project.forms.indexOf(f);
      var schemaArea = h('textarea', { class: 'code', spellcheck: 'false' });
      schemaArea.value = prettyOr(f.schemaText);
      var uiArea = h('textarea', { class: 'code', spellcheck: 'false' });
      uiArea.value = prettyOr(f.uiText);
      body.replaceChildren(
        h('div', { class: 'sheet-head' }, h('h2', {}, 'Form settings'), h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Close', onclick: function () { d.close(); } }, ic('x', 20))),
        formSettings(f, function () { changed = true; draw(); }, function () { changed = true; }),
        h('details', {}, h('summary', {}, 'Form files (advanced)'),
          h('div', { class: 'field', style: 'margin-top:10px' }, h('label', {}, 'schema.json'), schemaArea),
          h('div', { class: 'field' }, h('label', {}, 'ui.json'), uiArea),
          h('div', { class: 'row' },
            h('button', { type: 'button', class: 'secondary', onclick: function () {
              f.schemaText = schemaArea.value; f.uiText = uiArea.value;
              editor().adoptFiles(f);
              save(); changed = true; toast('Saved. ' + formStatus(f).text + '.');
            } }, 'Save and check'),
            h('button', { type: 'button', class: 'ghost', onclick: function () {
              downloadBlob(new Blob([prettyOr(f.schemaText)], { type: 'application/json' }), 'schema.json');
              setTimeout(function () { downloadBlob(new Blob([prettyOr(f.uiText)], { type: 'application/json' }), 'ui.json'); }, 300);
            } }, 'Download both'))),
        h('div', { class: 'sheet-foot' },
          h('div', { class: 'row' },
            h('button', { type: 'button', class: 'ghost', disabled: i === 0 ? 'disabled' : null, onclick: function () { move(-1); } }, ic('arrow-up', 15), 'Move up'),
            h('button', { type: 'button', class: 'ghost', disabled: i === project.forms.length - 1 ? 'disabled' : null, onclick: function () { move(1); } }, ic('arrow-down', 15), 'Move down')),
          h('button', { type: 'button', class: 'danger', onclick: function () {
            if (!confirm('Delete the form "' + f.title + '"? This cannot be undone.')) return;
            project.forms.forEach(function (x) { if (x.parent === f.formType) { x.parent = ''; x.onHome = true; } });
            project.forms.splice(project.forms.indexOf(f), 1);
            d.close();
            goApp({ tab: 'forms' }, { replace: true });
            toast('Form deleted.');
          } }, ic('trash-2', 15), 'Delete form')));
    }
    function move(dir) {
      var a = project.forms.indexOf(f), b = a + dir;
      project.forms[a] = project.forms[b];
      project.forms[b] = f;
      save(); changed = true; draw();
    }
    draw();
    d.classList.add('sheet');
    d.addEventListener('close', function once() {
      d.classList.remove('sheet');
      d.removeEventListener('close', once);
      if (changed && route.view === 'app' && project.forms.indexOf(f) !== -1) goApp({ form: project.forms.indexOf(f), mode: route.mode }, { replace: true, keepScroll: true });
    });
    d.showModal();
  }

  /* ---------- App tab ---------- */

  function renderAppTab() {
    var a = project.app;
    var design = (DESIGNS.filter(function (d) { return d[0] === (project.home.design || 'grid'); })[0] || DESIGNS[0])[1];
    var links = project.forms.filter(function (f) { return f.parent; }).length;
    var SECTIONS = [
      ['name', 'Name and language', 'type', (a.name || 'No name') + ' · ' + (B.LOCALES[a.defaultLocale] || a.defaultLocale), function () {
        return [
          field('App name', textInput(a, 'name', { placeholder: 'e.g. Malaria Household Survey', max: 60 })),
          field('Short description', textInput(a, 'description', { placeholder: 'e.g. Household register and follow-up visits', max: 120 }), null, true),
          h('div', { class: 'grid2' },
            field('Version', textInput(a, 'version', { placeholder: '1.0.0', max: 20 }), 'Raise it each time you publish again, e.g. 1.0.0 to 1.1.0.'),
            field('Main language', langSelect())),
        ];
      }],
      ['look', 'Logo and colours', 'palette', (a.logo ? 'Logo added' : 'No logo') + ' · ' + project.brand.primary, function () {
        paletteBox = h('div');
        setTimeout(updatePalette);
        return [
          field('Logo', logoField(), null, true),
          field('Main colour', swatchPicker(project.brand, 'primary'), 'Header, buttons and highlights.'),
          field('Second colour', swatchPicker(project.brand, 'secondary'), 'Small accents.'),
          h('div', { class: 'label' }, 'Light and dark mode'), paletteBox,
        ];
      }],
      ['home', 'Home screen', 'layout-grid', design, function () {
        var welcome = h('textarea', { rows: 3, placeholder: 'e.g. Register a household first, then record each visit.', oninput: function (e) { project.home.welcome = e.target.value; save(); } });
        welcome.value = project.home.welcome || '';
        welcome.style.minHeight = '80px';
        return [
          designPicker(project.home),
          field('Welcome message', welcome, null, true),
          toggle(project.home, 'showCounts', 'Show how many records are saved on each card'),
          toggle(project.home, 'showRecords', 'Open a list of saved records first', 'When off, tapping a card opens a new form straight away.'),
          field('Footer text', textInput(project.home, 'footer', { placeholder: 'e.g. Questions? Call your supervisor on 0700 000 000', max: 140 }), null, true),
        ];
      }],
      ['links', 'How forms connect', 'git-branch', links ? links + (links === 1 ? ' form belongs to another' : ' forms belong to others') : 'Each form stands on its own', function () {
        return [h('p', { class: 'hint', style: 'margin:0 0 14px' }, 'Make one form belong to another to follow things over time: register a household once, then add visits from its page. Each visit is linked to its household for you.'), workflowPanel()];
      }],
      ['tabs', 'Tabs at the bottom of Formulus', 'list', project.navigation.tabs.join(', '), function () {
        return [h('div', { class: 'chips' }, B.TABS.map(function (t) {
          return h('label', { class: 'chip' }, h('input', { type: 'checkbox', checked: project.navigation.tabs.indexOf(t) !== -1, disabled: t === 'Home' ? 'disabled' : null, onchange: function (e) {
            var set = project.navigation.tabs.filter(function (x) { return x !== t; });
            if (e.target.checked) set.push(t);
            project.navigation.tabs = B.TABS.filter(function (x) { return set.indexOf(x) !== -1 || x === 'Home'; });
            save();
          } }), t);
        })), h('p', { class: 'hint' }, 'Hide tabs your team does not need. Home always shows.')];
      }],
      ['code', 'How the app is built', 'code', (TEMPLATES[project.template] && TEMPLATES[project.template].meta.title) || 'Plain JavaScript', function () {
        return [h('p', { class: 'hint', style: 'margin:0 0 12px' }, 'Both look and work the same on the phone. Pick React if a developer will grow the app.'),
          h('div', { class: 'method-list' }, Object.keys(TEMPLATES).map(function (k) {
            var m = TEMPLATES[k].meta || { title: k };
            return h('button', { type: 'button', class: 'method', role: 'radio', 'aria-checked': project.template === k ? 'true' : 'false', onclick: function () { project.template = k; save(); goApp({ tab: 'app' }, { replace: true, keepScroll: true }); } },
              h('span', { class: 'tt-ic' }, ic(k === 'react' ? 'code' : 'smartphone', 20)), h('span', { class: 'm-t' }, h('b', {}, m.title), h('small', {}, m.description)), h('span', { class: 'radio-dot', 'aria-hidden': 'true' }));
          }))];
      }],
    ];
    return [
      h('div', { class: 'acc' }, SECTIONS.map(function (s) {
        var inner = h('div', { class: 'acc-b' });
        var item = h('details', { class: 'acc-item', 'data-section': s[0] },
          h('summary', {}, h('span', { class: 'tt-ic' }, ic(s[2], 18)), h('span', { class: 'acc-t' }, h('b', {}, s[1]), h('small', {}, s[3])), ic('chevron-down', 18, 'chev')),
          inner);
        item.addEventListener('toggle', function () {
          if (!item.open) { if (openSection === s[0]) openSection = null; return; }
          openSection = s[0];
          if (!inner.childNodes.length) append(inner, s[4]());
          content.querySelectorAll('.acc-item[open]').forEach(function (o) { if (o !== item) o.open = false; });
        });
        if (openSection === s[0]) { item.open = true; append(inner, s[4]()); }
        return item;
      })),
      h('div', { class: 'row', style: 'justify-content:space-between;margin-top:24px' },
        h('button', { type: 'button', class: 'ghost', onclick: saveProjectFile }, ic('save', 16), 'Save to file'),
        h('button', { type: 'button', class: 'danger', onclick: function () {
          if (!confirm('Delete "' + (a.name || 'this app') + '" from this browser? Use "Save to file" first if you want a copy.')) return;
          deleteApp(appId);
          nav({ view: 'home' }, { replace: true });
        } }, ic('trash-2', 15), 'Delete app')),
    ];
  }

  function langSelect() {
    var a = project.app;
    return h('select', { onchange: function (e) { a.defaultLocale = e.target.value; save(); } },
      Object.keys(B.LOCALES).map(function (l) { return h('option', { value: l, selected: a.defaultLocale === l ? 'selected' : null }, B.LOCALES[l]); }));
  }

  var SWATCHES = ['#3B7A4B', '#0F766E', '#0369A1', '#1D4ED8', '#6D28D9', '#BE185D', '#B91C1C', '#C2410C', '#B45309', '#4E3629', '#334155', '#18181B'];
  /** A row of good colours, with the full chart and a colour code behind "More colours". */
  function swatchPicker(obj, key) {
    var wrap = h('div', { class: 'swatch-pick' });
    function draw(open) {
      var cur = String(obj[key] || '').toUpperCase();
      wrap.replaceChildren(
        h('div', { class: 'swatches', role: 'group' }, SWATCHES.map(function (c) {
          return h('button', { type: 'button', class: 'sw' + (c === cur ? ' on' : ''), style: 'background:' + c, 'aria-label': c, 'aria-pressed': c === cur ? 'true' : 'false', 'data-colour': c, onclick: function () { set(c); } });
        })),
        h('details', { class: 'chart-wrap', open: open ? 'open' : null }, h('summary', {}, ic('swatch-book', 16), SWATCHES.indexOf(cur) === -1 && cur ? 'Your colour ' + cur : 'More colours'),
          colorPicker(obj, key, '', null, function () { draw(true); })));
    }
    function set(c) { obj[key] = c.toUpperCase(); save(); updatePalette(); draw(false); }
    draw(false);
    return wrap;
  }

  /** Logo upload with drop support. */
  function logoField() {
    var a = project.app;
    var box = h('div', { class: 'logo-drop' });
    var fileIn = h('input', { type: 'file', accept: 'image/png,image/jpeg,image/svg+xml,image/webp', hidden: true });
    function draw() {
      box.replaceChildren(
        a.logo && a.logo.dataUrl ? h('img', { src: a.logo.dataUrl, alt: 'Logo' }) : h('div', { class: 'ph' }, ic('image', 24)),
        h('div', { style: 'flex:1;min-width:0' }, h('div', { class: 'ellipsis' }, a.logo ? a.logo.name : 'Add a logo'), h('p', { class: 'hint', style: 'margin:2px 0 0' }, 'Square PNG, JPG or SVG works best.')),
        h('div', { class: 'row', style: 'flex-wrap:nowrap' },
          h('button', { type: 'button', class: 'ghost', onclick: function () { fileIn.click(); } }, a.logo ? 'Change' : 'Choose'),
          a.logo ? h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Remove logo', onclick: function () { a.logo = null; save(); draw(); } }, ic('x', 18)) : null),
        fileIn);
    }
    function take(file) {
      if (!file || !/^image\//.test(file.type)) return toast('Please choose an image file.');
      readLogo(file, function (logo) { a.logo = logo; save(); draw(); });
    }
    fileIn.addEventListener('change', function () { take(fileIn.files[0]); fileIn.value = ''; });
    box.addEventListener('dragover', function (e) { e.preventDefault(); box.classList.add('over'); });
    box.addEventListener('dragleave', function () { box.classList.remove('over'); });
    box.addEventListener('drop', function (e) { e.preventDefault(); box.classList.remove('over'); take(e.dataTransfer.files[0]); });
    draw();
    return box;
  }

  /* ---------- Publish tab ---------- */

  function renderPublish() {
    var check = B.checkProject(project, Ajv);
    var names = B.fileNames(project);
    var todo = [];
    if (!String(project.app.name || '').trim()) todo.push(h('li', {}, ic('circle-x', 18, 'bad'), h('span', {}, 'Give the app a name.'), h('button', { type: 'button', class: 'ghost small', onclick: function () { openSection = 'name'; goApp({ tab: 'app' }); } }, 'Fix')));
    if (!project.forms.length) todo.push(h('li', {}, ic('circle-x', 18, 'bad'), h('span', {}, 'Add at least one form.'), h('button', { type: 'button', class: 'ghost small', onclick: function () { goApp({ tab: 'forms' }); } }, 'Add')));
    project.forms.forEach(function (f, i) {
      var s = formStatus(f);
      if (s.cls === 'bad' || s.cls === 'none') todo.push(h('li', {}, ic('circle-x', 18, 'bad'), h('span', {}, h('b', {}, f.title), ': ' + s.text.toLowerCase()), h('button', { type: 'button', class: 'ghost small', onclick: function () { goApp({ form: i }); } }, 'Fix')));
    });
    check.problems.filter(function (p) { return /Two forms use/.test(p.message); }).forEach(function (p) { todo.push(h('li', {}, ic('circle-x', 18, 'bad'), h('span', {}, p.message))); });
    var notes = B.paletteWarnings(project).concat(project.forms.filter(function (f) { return formStatus(f).cls === 'warn'; }).map(function (f) { return f.title + ': ' + formStatus(f).text.toLowerCase(); }));
    var ready = check.ok && !todo.length;

    var bundleBtn = h('button', { type: 'button', class: 'primary big', disabled: ready ? null : 'disabled', onclick: function () {
      B.bundleZip(JSZip, project, TEMPLATES).generateAsync({ type: 'blob', compression: 'DEFLATE' }).then(function (blob) {
        downloadBlob(blob, names.bundle);
        project.forms.forEach(function (f) {
          try { f.lastUploadedFields = Object.keys(JSON.parse(f.schemaText).properties || {}); } catch (e) { /* ignore */ }
          try { f.shipped = { version: String(JSON.parse(f.schemaText).version || '1'), text: f.schemaText + f.uiText }; } catch (e) { /* ignore */ }
        });
        save();
        toast('Downloaded ' + names.bundle);
      }).catch(function (e) { toast('Could not build the zip: ' + e.message); });
    } }, ic('download', 18), 'Download app bundle');

    return [
      h('div', { class: 'panel pub-status ' + (ready ? 'ok' : 'bad') },
        h('span', { class: 'ok-ic' }, ic(ready ? 'circle-check' : 'circle-alert', 26)),
        h('div', {}, h('b', {}, ready ? 'Ready to publish' : 'Fix ' + todo.length + (todo.length === 1 ? ' thing' : ' things') + ' first'),
          h('small', {}, ready ? 'Checked with the same rules Synkronus and ODE Desktop use.' : 'Everything else checks out.'))),
      todo.length ? h('ul', { class: 'todo' }, todo) : null,
      notes.length ? h('details', {}, h('summary', {}, notes.length + (notes.length === 1 ? ' note' : ' notes') + ' to look at'), h('ul', { class: 'problems' }, notes.map(function (n) { return h('li', { class: 'warning' }, n); }))) : null,
      h('div', { class: 'panel pub-main' },
        h('h2', {}, 'App bundle'),
        h('p', { class: 'hint' }, 'The one file you upload to Synkronus.'),
        h('div', { class: 'fname' }, names.bundle),
        bundleBtn,
        h('ol', { class: 'steps-how' },
          h('li', {}, 'Open your Synkronus portal, go to ', h('b', {}, 'App bundles'), ', upload the zip and make it active.'),
          h('li', {}, 'On each phone, open Formulus and sync. The app appears with your name, colours and forms.')),
      ),
      h('div', { class: 'panel' },
        h('h3', {}, 'Other downloads'),
        h('div', { class: 'dl' },
          h('div', {}, h('b', {}, 'Source project'), h('p', { class: 'hint' }, 'For a developer, Git or ODE Desktop. ' + ((TEMPLATES[project.template] || {}).meta || {}).title + '.')),
          h('button', { type: 'button', class: 'secondary', onclick: function () {
            B.sourceZip(JSZip, project, TEMPLATES).generateAsync({ type: 'blob', compression: 'DEFLATE' }).then(function (blob) { downloadBlob(blob, names.source); toast('Downloaded ' + names.source); });
          } }, ic('download', 16), 'Source project')),
        h('div', { class: 'dl' },
          h('div', {}, h('b', {}, 'App file'), h('p', { class: 'hint' }, 'Everything you entered. Open it here on any computer to keep editing.')),
          h('button', { type: 'button', class: 'ghost', onclick: saveProjectFile }, ic('download', 16), 'Project file'))),
      h('p', { class: 'hint' }, 'Changing the app later? Raise the version under App, download again and upload. Keep question names the same so existing data still matches.'),
    ];
  }

  /** A template's forms, linked forms indented under their parent, with what each one asks. */
  function galleryDetails(k) {
    var g = GALLERY[k], m = g.gallery;
    var d = document.getElementById('dialog');
    var body = document.getElementById('dialogBody');
    function rows(parent, depth) {
      return g.forms.filter(function (f) { return (f.parent || '') === parent; }).map(function (f) {
        var qs = FM.allQuestions(f.model).filter(function (x) { return x.q.type !== 'note' && x.q.name !== B.linkField(f.parent); });
        var kinds = {};
        qs.forEach(function (x) { var t = FM.TYPES.filter(function (t) { return t.id === x.q.type; })[0]; if (t) kinds[t.id] = t; });
        return [h('div', { class: 'gform', style: '--depth:' + depth },
          h('span', { class: 'cicon small' }, ic(f.icon, 18)),
          h('div', {},
            h('b', {}, f.title), h('small', {}, (f.parent ? 'Each one belongs to a ' + g.forms.filter(function (p) { return p.formType === f.parent; })[0].title.toLowerCase() + '. ' : '') + qs.length + ' questions on ' + f.model.pages.length + ' page' + (f.model.pages.length === 1 ? '' : 's')),
            h('div', { class: 'gkinds' }, Object.keys(kinds).map(function (id) { return h('span', { title: kinds[id].name }, ic(kinds[id].icon, 13), kinds[id].name); })),
            h('p', { class: 'gqs' }, qs.slice(0, 8).map(function (x) { return x.q.label; }).join(' · ') + (qs.length > 8 ? ' · and ' + (qs.length - 8) + ' more' : '')))),
          rows(f.formType, depth + 1)];
      });
    }
    body.replaceChildren(
      h('div', { class: 'gtop' }, h('span', { class: 'cicon', style: 'background:' + g.brand.primary + ';color:#fff' }, ic(m.icon, 22)), h('span', { class: 'tag' }, m.sector)),
      h('h2', {}, m.title),
      h('p', { class: 'hint' }, m.blurb + ' The app is called "' + g.app.name + '"; you can rename it.'),
      h('div', { class: 'gtree' }, rows('', 0)),
      h('div', { class: 'row', style: 'justify-content:flex-end;margin-top:18px;position:sticky;bottom:0;background:var(--panel);padding-top:10px' },
        h('button', { type: 'button', class: 'ghost', onclick: function () { d.close(); } }, 'Back'),
        h('button', { type: 'button', class: 'primary', 'data-role': 'use-template', onclick: function () {
          d.close(); startFrom(g);
        } }, 'Use this template', ic('arrow-right', 16))));
    d.classList.add('sheet');
    d.showModal();
    d.addEventListener('close', function once() { d.classList.remove('sheet'); d.removeEventListener('close', once); });
  }

  function startFrom(example) {
    var p = B.normalizeProject(JSON.parse(JSON.stringify(example)));
    delete p.exampleTitle;
    delete p.exampleDescription;
    delete p.gallery;
    p.forms.forEach(function (f) {
      if (f.model && !f.schemaText) { var c = FM.compileForm(f.model); f.schemaText = c.schemaText; f.uiText = c.uiText; }
    });
    p.template = 'simple';
    adoptApp(p);
    nav({ view: 'app', id: appId, tab: 'forms' });
    toast('Template ready. Change anything you like.');
  }

  /* ------------------------------------------------------------------ */
  /* Step 2: Brand                                                       */
  /* ------------------------------------------------------------------ */

  /** The colour chart: rows of hues, columns of shades. Click a square to use that exact colour. */
  function colorChart(getCurrent, onPick) {
    var chart = window.ODE_COLOR_CHART;
    var wrap = h('div', { class: 'chart', role: 'group', 'aria-label': 'Colour chart' });
    function draw() {
      var cur = String(getCurrent() || '').toUpperCase();
      wrap.replaceChildren(h('div', { class: 'chart-grid', style: 'grid-template-columns: 64px repeat(' + chart.shades.length + ', 1fr)' },
        h('span'),
        chart.shades.map(function (s) { return h('span', { class: 'chart-shade' }, s); }),
        chart.hues.map(function (hue) {
          return [h('span', { class: 'chart-hue' }, hue.name)].concat(hue.shades.map(function (c, i) {
            return h('button', { type: 'button', class: 'chart-cell' + (c === cur ? ' on' : ''), style: 'background:' + c, title: hue.name + ' ' + chart.shades[i] + ' · ' + c, 'aria-label': hue.name + ' ' + chart.shades[i] + ' ' + c, onclick: function () { onPick(c); draw(); } });
          }));
        })));
    }
    draw();
    wrap.redraw = draw;
    return wrap;
  }

  function colorPicker(obj, key, label, hint, onChange) {
    var text = h('input', { type: 'text', value: obj[key] || '', maxlength: 7, spellcheck: 'false', 'aria-label': (label || 'Colour') + ' code' });
    var picker = h('input', { type: 'color', value: B.isHex(obj[key]) ? six(obj[key]) : '#000000', 'aria-label': label || 'Colour' });
    var chart;
    function set(v, from) {
      obj[key] = v.toUpperCase();
      if (from !== 'text') text.value = obj[key];
      if (from !== 'picker' && B.isHex(v)) picker.value = six(v);
      if (chart && from !== 'chart') chart.redraw();
      save();
      updatePalette();
      if (onChange && from !== 'text' && from !== 'picker') onChange();
    }
    picker.addEventListener('input', function () { set(picker.value, 'picker'); });
    picker.addEventListener('change', function () { if (onChange) onChange(); });
    text.addEventListener('input', function () {
      var v = text.value.trim();
      if (v && v.charAt(0) !== '#') v = '#' + v;
      if (/^#[0-9a-fA-F]{6}$/.test(v)) set(v, 'text');
    });
    text.addEventListener('change', function () { if (onChange) onChange(); });
    chart = colorChart(function () { return obj[key]; }, function (c) { set(c, 'chart'); });
    var inner = h('div', {}, h('div', { class: 'color-row' }, picker, text), chart);
    return label ? field(label, inner, hint) : inner;
  }

  function six(hex) {
    var h6 = String(hex).replace('#', '');
    if (h6.length === 3) h6 = h6.replace(/(.)/g, '$1$1');
    return '#' + h6.toLowerCase();
  }

  var paletteBox;
  function updatePalette() {
    if (!paletteBox || !paletteBox.isConnected) return;
    var p = B.makePalette(project.brand.primary, project.brand.secondary);
    var roles = ['primary', 'primaryDark', 'secondary', 'background', 'surface', 'divider'];
    paletteBox.replaceChildren(
      h('div', { class: 'palette' }, roles.map(function (r) {
        return h('div', { style: 'background:' + p.light[r] + ';color:' + B.onColor(p.light[r]) }, r);
      })),
      h('div', { class: 'palette' }, roles.map(function (r) {
        return h('div', { style: 'background:' + p.dark[r] + ';color:' + B.onColor(p.dark[r]) }, r);
      })),
      B.paletteWarnings(project).map(function (w) { return h('p', { class: 'hint', style: 'color:var(--warn)' }, ic('triangle-alert', 14), ' ' + w); }),
    );
  }


  function readLogo(file, done) {
    var reader = new FileReader();
    reader.onload = function () {
      var url = reader.result;
      if (file.type === 'image/svg+xml') return done({ name: file.name, dataUrl: url });
      var img = new Image();
      img.onload = function () {
        var max = 512, w = img.width, hgt = img.height;
        if (w <= max && hgt <= max && file.size < 300000) return done({ name: file.name, dataUrl: url });
        var s = Math.min(1, max / Math.max(w, hgt));
        var c = document.createElement('canvas');
        c.width = Math.round(w * s);
        c.height = Math.round(hgt * s);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        done({ name: file.name.replace(/\.\w+$/, '') + '.png', dataUrl: c.toDataURL('image/png') });
      };
      img.onerror = function () { toast('That image could not be read.'); };
      img.src = url;
    };
    reader.readAsDataURL(file);
  }

  /* ------------------------------------------------------------------ */
  /* Step 3: Home screen                                                 */
  /* ------------------------------------------------------------------ */

  function seg(obj, key, options) {
    var wrap = h('div', { class: 'seg', role: 'group' });
    function draw() {
      wrap.replaceChildren();
      options.forEach(function (o) {
        wrap.append(h('button', { type: 'button', 'aria-pressed': obj[key] === o[0] ? 'true' : 'false', onclick: function () { obj[key] = o[0]; save(); draw(); } }, o[1]));
      });
    }
    draw();
    return wrap;
  }

  function toggle(obj, key, label, hint) {
    return h('div', { class: 'field' }, h('label', { class: 'toggle' }, h('input', { type: 'checkbox', checked: obj[key] !== false, onchange: function (e) { obj[key] = e.target.checked; save(); } }), h('span', { class: 'track', 'aria-hidden': 'true' }), h('span', {}, label)), hint ? h('p', { class: 'hint' }, hint) : null);
  }

  var DESIGNS = [
    ['grid', 'Cards', 'Big tiles, one per form. Simple and clear.'],
    ['list', 'List', 'One row per form. Good for many forms.'],
    ['dashboard', 'Dashboard', 'Totals for today and this week, quick start buttons and recent records.'],
  ];

  function designPicker(hm) {
    var wrap = h('div', { class: 'designs' });
    function draw() {
      var cur = hm.design || (hm.layout === 'list' ? 'list' : 'grid');
      wrap.replaceChildren();
      DESIGNS.forEach(function (d) {
        wrap.append(h('button', { type: 'button', class: 'design' + (cur === d[0] ? ' on' : ''), 'aria-pressed': cur === d[0] ? 'true' : 'false', 'data-design': d[0], onclick: function () {
          hm.design = d[0]; hm.layout = d[0] === 'list' ? 'list' : 'grid'; save(); draw();
        } },
          h('span', { class: 'mini mini-' + d[0], 'aria-hidden': 'true' }, h('i', { class: 'mh' }), h('i'), h('i'), h('i'), h('i')),
          h('b', {}, d[1]), h('small', {}, d[2])));
      });
    }
    draw();
    return wrap;
  }

  /** "Belongs to" select for one form: makes it a child of another form (household -> visits). */
  function parentSelect(f, after) {
    var others = project.forms.filter(function (x) { return x !== f && x.parent !== f.formType; });
    return h('select', { 'aria-label': 'Belongs to', onchange: function (e) {
      setParent(f, e.target.value);
      if (after) after();
    } },
      h('option', { value: '' }, 'Nothing (stands on its own)'),
      others.map(function (x) { return h('option', { value: x.formType, selected: f.parent === x.formType ? 'selected' : null }, 'A ' + (x.title || x.formType) + ' record'); }));
  }

  /** Link a form to a parent; the question editor adds the read-only link question. */
  function setParent(f, parentType) {
    f.parent = parentType || '';
    f.onHome = !f.parent;
    if (f.parent) {
      var ed = editor();
      var st = ed.ensureModel(f);
      if (st.ok) {
        var lf = B.linkField(f.parent);
        var exists = FM.allQuestions(f.model).some(function (x) { return x.q.name === lf; });
        if (!exists) {
          var parent = project.forms.filter(function (x) { return x.formType === f.parent; })[0];
          var q = FM.newQuestion('text', [], (parent && parent.title) || f.parent);
          q.name = lf; q.readOnly = true; q._autoName = false;
          f.model.pages[0].questions.unshift(q);
        }
        ed.sync(f);
      } else toast('This form was written as files. Ask the AI to add a read-only "' + B.linkField(f.parent) + '" question.');
    }
    save();
  }

  function workflowPanel() {
    var box = h('div');
    function draw() {
      box.replaceChildren();
      if (project.forms.length < 2) {
        box.append(h('p', { class: 'hint' }, 'Add two or more forms to connect them, for example a "Household" form and a "Visit" form that belongs to a household.'));
        return;
      }
      var tops = project.forms.filter(function (f) { return !f.parent || !project.forms.some(function (x) { return x.formType === f.parent; }); });
      function node(f, depth) {
        var kids = project.forms.filter(function (x) { return x.parent === f.formType; });
        return h('li', { class: 'wf-node' },
          h('div', { class: 'wf-item' }, formIcon(f, 16), h('b', {}, f.title || f.formType),
            depth ? h('span', { class: 'hint', style: 'margin:0' }, 'opened from its ' + (project.forms.filter(function (x) { return x.formType === f.parent; })[0] || {}).title + ' page') : h('span', { class: 'hint', style: 'margin:0' }, 'card on the home screen')),
          kids.length ? h('ul', {}, kids.map(function (k) { return node(k, depth + 1); })) : null);
      }
      box.append(h('ul', { class: 'wf-tree' }, tops.map(function (f) { return node(f, 0); })));
      box.append(h('div', { class: 'wf-table' }, project.forms.map(function (f) {
        return h('label', { class: 'wf-row' }, h('span', {}, formIcon(f, 16), ' Each ', h('b', {}, f.title || f.formType), ' belongs to'), parentSelect(f, function () { draw(); schedulePreview(); }));
      })));
    }
    draw();
    return box;
  }


  /* ------------------------------------------------------------------ */
  /* Step 4: Forms                                                       */
  /* ------------------------------------------------------------------ */

  var BRIEF_EXTRAS = [
    ['Required', ' (required)'],
    ['Show only if…', '  - Only show this if the previous answer is "Yes"'],
    ['New page', '\nPage: <name of the page>'],
    ['Translate', '\nTranslate all labels and choices to Kiswahili.'],
  ];

  /** All question types ODE supports, as a reference that also inserts example lines. */
  function typeReference(onPick) {
    var groups = {};
    FM.TYPES.concat(FM.AI_ONLY_TYPES).forEach(function (t) { (groups[t.group] = groups[t.group] || []).push(t); });
    return h('div', { class: 'type-ref' }, Object.keys(groups).map(function (g) {
      return h('section', {}, h('h4', {}, g), h('ul', {}, groups[g].map(function (t) {
        var editorToo = !!FM.TYPE_BY_ID[t.id];
        return h('li', {},
          h('button', { type: 'button', class: 'tref', title: 'Add an example line to your description', onclick: function () { onPick('- ' + t.ask); } },
            h('span', { class: 'tt-ic' }, ic(t.icon, 18)),
            h('span', { class: 'tref-t' }, h('b', {}, t.name, editorToo ? null : h('span', { class: 'tag' }, 'AI only')), h('small', {}, t.what), h('code', {}, t.ask)),
            ic('plus', 16, 'tref-add')));
      })));
    }));
  }


  /** Small dialog with one text box. */


  /** Import a form: an Excel XLSForm (.xlsx), or schema.json + ui.json. */
  function importFormFiles() {
    var inp = h('input', { type: 'file', multiple: true, accept: '.xlsx,.json,application/json,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    inp.addEventListener('change', function () {
      var files = Array.prototype.slice.call(inp.files);
      if (!files.length) return;
      var xlsx = files.filter(function (f) { return /\.xlsx$/i.test(f.name); })[0];
      if (xlsx) return importXlsx(xlsx);
      Promise.all(files.map(function (f) { return f.text().then(function (t) { return { name: f.name, text: t }; }); })).then(function (all) {
        var schema = all.filter(function (x) { return /schema/i.test(x.name); })[0];
        var ui = all.filter(function (x) { return /ui/i.test(x.name); })[0];
        if (!schema || !ui) return toast('Choose both schema.json and ui.json together, or an Excel form (.xlsx).');
        var title = 'Imported form';
        try { title = JSON.parse(schema.text).title || title; } catch (e) { /* ignore */ }
        var f = B.newForm(title);
        f.formType = uniqueId(B.slugify(title), f);
        f.schemaText = schema.text;
        f.uiText = ui.text;
        editor().adoptFiles(f);
        project.forms.push(f);
        save();
        goApp({ form: project.forms.length - 1, mode: 'ai' });
        toast('Form imported. Check its id matches the server if it is already in use.');
      });
    });
    inp.click();
  }

  function importXlsx(file) {
    file.arrayBuffer().then(function (buf) { return window.OdeXlsForm.readXlsx(JSZip, buf); }).then(function (sheets) {
      var r = window.OdeXlsForm.fromSheets(sheets, { title: file.name.replace(/\.xlsx$/i, ''), defaultLocale: project.app.defaultLocale });
      var f = B.newForm(r.title);
      f.formType = uniqueId(r.formType || B.slugify(r.title), f);
      f.model = r.model;
      f.languages = r.languages.filter(function (l) { return B.LOCALES[l] && l !== (project.app.defaultLocale || 'en'); });
      editor().sync(f);
      project.forms.push(f);
      save();
      goApp({ form: project.forms.length - 1, mode: 'build' });
      var n = FM.fieldNames(f.model).length;
      dialog([
        h('h2', {}, ic('circle-check', 20), ' Imported "' + f.title + '"'),
        h('p', {}, n + ' question' + (n === 1 ? '' : 's') + ' on ' + f.model.pages.length + ' page' + (f.model.pages.length === 1 ? '' : 's') + (f.languages.length ? ', with ' + f.languages.map(function (l) { return B.LOCALES[l]; }).join(', ') + ' translations' : '') + '.'),
        r.warnings.length ? [h('p', { style: 'margin-bottom:0' }, h('b', {}, 'Please check:')), h('ul', { class: 'problems' }, r.warnings.map(function (w) { return h('li', { class: 'warning' }, w); }))] : h('p', { class: 'hint' }, 'Everything in the file was imported.'),
        h('p', { class: 'hint' }, 'Look through the questions, then use "Try it" to fill it in once.'),
      ]);
    }).catch(function (e) { toast('Could not read ' + file.name + ': ' + e.message); });
  }



  function formSettings(f, redraw, changed) {
    var idInput = h('input', { type: 'text', value: f.formType, class: 'mono', oninput: function (e) {
      var old = f.formType;
      f.formType = e.target.value.trim();
      project.forms.forEach(function (x) { if (x.parent === old) x.parent = f.formType; });
      f.idTouched = true;
      save(); changed();
    } });
    var titleInput = h('input', { type: 'text', value: f.title, 'data-role': 'form-title', maxlength: 60, oninput: function (e) {
      f.title = e.target.value;
      if (!f.idTouched && !f.lastUploadedFields) {
        var old = f.formType;
        f.formType = uniqueId(B.slugify(f.title), f);
        project.forms.forEach(function (x) { if (x.parent === old) x.parent = f.formType; });
        idInput.value = f.formType;
      }
      if (f.model) editor().sync(f);
      save(); changed();
    } });

    var icons = h('div', { class: 'icons' });
    function drawIcons() {
      icons.replaceChildren();
      ICONS.forEach(function (name) {
        icons.append(h('button', { type: 'button', 'aria-pressed': f.icon === name ? 'true' : 'false', 'aria-label': 'Icon ' + name, title: name.replace(/-/g, ' '), onclick: function () { f.icon = name; save(); changed(); drawIcons(); } }, ic(name, 20)));
      });
    }
    drawIcons();

    var fields = B.displayFields(f).filter(function (x) { return x.name !== B.linkField(f.parent); });
    var sumBox = h('div', { class: 'chips' }, fields.length ? fields.filter(function (x) { return ['photo', 'signature', 'select_file', 'audio', 'video', 'object'].indexOf(x.type) === -1; }).slice(0, 16).map(function (x) {
      return h('label', { class: 'chip' }, h('input', { type: 'checkbox', checked: (f.summaryFields || []).indexOf(x.name) !== -1, onchange: function (e) {
        f.summaryFields = (f.summaryFields || []).filter(function (n) { return n !== x.name; });
        if (e.target.checked) f.summaryFields.push(x.name);
        save();
      } }), x.label);
    }) : h('p', { class: 'hint', style: 'margin:0' }, 'Write the form first; then pick its questions here.'));

    var hasParent = f.parent && project.forms.some(function (x) { return x.formType === f.parent; });
    return h('div', { class: 'settings' },
      field('Form name', titleInput),
      field('Card subtitle', textInput(f, 'description', { placeholder: 'e.g. Once per household', max: 80, after: changed }), null, true),
      field('Icon', icons),
      field('Card colour', cardColour(f), null, true),
      project.forms.length > 1 ? field('Each record belongs to', parentSelect(f, redraw), 'For example, each visit belongs to a household. New ones are added from that household\'s page.', true) : null,
      hasParent ? toggle(f, 'onHome', 'Also show a card for this form on the home screen') : null,
      field('Name records in lists by', sumBox, 'Pick one or two questions, like a name and a village.', true),
      field('Form id', idInput, f.lastUploadedFields ? 'This form is already on a server. Keep the id the same, or it becomes a separate form.' : 'The folder name and the name in your data exports. Set from the form name.'));
  }


  function cardColour(f) {
    var wrap = h('div');
    function draw(keepOpen) {
      var chart = colorChart(function () { return f.color; }, function (c) { f.color = c; save(); draw(true); refreshAll(); });
      wrap.replaceChildren(
        h('div', { class: 'row' },
          h('span', { class: 'swatch-big', style: 'background:' + (f.color || project.brand.primary) }),
          h('span', { class: 'mono' }, f.color || 'Same as app'),
          f.color ? h('button', { type: 'button', class: 'ghost small', onclick: function () { f.color = ''; save(); draw(); refreshAll(); } }, 'Use app colour') : null),
        h('details', { class: 'chart-wrap', open: keepOpen ? 'open' : null }, h('summary', {}, ic('swatch-book', 16), 'Colour chart'), chart));
    }
    function refreshAll() { schedulePreview(); }
    draw();
    return wrap;
  }

  function uniqueId(base, self) {
    var id = base, n = 2;
    while (project.forms.some(function (x) { return x !== self && x.formType === id; })) id = base + '_' + n++;
    return id;
  }

  function prettyOr(t) {
    if (!t) return '';
    try { return JSON.stringify(JSON.parse(t), null, 2); } catch (e) { return t; }
  }

  function insertAtCursor(ta, text) {
    var start = ta.selectionStart || ta.value.length, end = ta.selectionEnd || ta.value.length;
    var before = ta.value.slice(0, start), after = ta.value.slice(end);
    var pre = before && !/\n$/.test(before) ? '\n' : '';
    ta.value = before + pre + text + after;
    var pos = (before + pre + text).length;
    ta.focus();
    ta.setSelectionRange(pos, pos);
  }

  function renderCheckResult(f, r) {
    var errs = r.diagnostics.filter(function (d) { return d.severity === 'error'; });
    var warns = r.diagnostics.filter(function (d) { return d.severity === 'warning'; });
    var infos = r.diagnostics.filter(function (d) { return d.severity === 'info'; });
    var out = [];
    if (r.summary) {
      var s = r.summary;
      out.push(h('div', { class: 'summary-line', style: 'margin-top:14px' },
        h('span', {}, h('b', {}, s.questions), ' questions'),
        h('span', {}, h('b', {}, s.pages), s.pages === 1 ? ' page' : ' pages'),
        h('span', {}, h('b', {}, s.required), ' required'),
        h('span', {}, h('b', {}, s.rules), s.rules === 1 ? ' show/hide rule' : ' show/hide rules'),
        s.languages.length ? h('span', {}, 'Languages: ', h('b', {}, s.languages.join(', '))) : null,
        s.version ? h('span', {}, 'Version ', h('b', {}, s.version)) : null));
    }
    if (errs.length || warns.length) {
      out.push(h('ul', { class: 'problems' }, errs.concat(warns).map(function (d) {
        return h('li', { class: d.severity }, h('b', {}, d.severity === 'error' ? 'Must fix:' : 'Check:'), d.message);
      })));
      out.push(h('div', { class: 'row', style: 'margin-top:10px' },
        h('button', { type: 'button', class: 'secondary', onclick: function () { copy(B.buildFixPrompt(f, r), 'Fix-up prompt'); } }, ic('copy', 16), 'Copy fix-up prompt'),
        h('span', { class: 'hint', style: 'margin:0' }, 'Paste it into the same AI chat, then paste the new answer above.')));
    } else if (r.valid) {
      out.push(h('p', { class: 'status ok', style: 'margin-top:10px' }, ic('circle-check', 15), 'The form follows the ODE rules.'));
    }
    if (infos.length) out.push(h('details', {}, h('summary', {}, infos.length + ' small note' + (infos.length === 1 ? '' : 's')), h('ul', { class: 'problems' }, infos.map(function (d) { return h('li', { class: 'info' }, d.message); }))));
    if (r.summary) {
      out.push(h('details', { open: errs.length ? null : 'open' }, h('summary', {}, 'What the form will ask'), outline(f)));
    }
    return out;
  }

  /* Form outline: pages, questions, answer types and show/hide rules in plain words. */
  function outline(f) {
    var schema, ui;
    try { schema = JSON.parse(f.schemaText); ui = JSON.parse(f.uiText); } catch (e) { return h('p', { class: 'hint' }, 'The form files are not valid JSON yet.'); }
    var props = schema.properties || {};
    var required = schema.required || [];
    function deref(n) {
      var d = 0;
      while (n && typeof n.$ref === 'string' && n.$ref.indexOf('#/') === 0 && d++ < 20) {
        n = n.$ref.slice(2).split('/').reduce(function (o, k) { return o && o[k]; }, schema);
      }
      return n || {};
    }
    function nameOf(scope) {
      var m = /#\/properties\/([^/]+)$/.exec(scope || '');
      return m ? m[1] : scope;
    }
    function choices(p) {
      p = deref(p);
      if (p.items) p = deref(p.items);
      if (Array.isArray(p.enum)) return p.enum.map(function (v) { return { v: v, t: String(v) }; });
      var l = p.oneOf || p.anyOf;
      if (Array.isArray(l)) return l.map(function (b) { b = deref(b); return { v: b.const, t: b.title || String(b.const) }; });
      return null;
    }
    function typeOf(p) {
      p = deref(p);
      if (p.format) return { date: 'date', 'date-time': 'date & time', time: 'time', photo: 'photo', gps: 'GPS', signature: 'signature', audio: 'audio', video: 'video', qrcode: 'QR scan', select_file: 'file', likert: 'rating scale', duration: 'timer', 'sub-observation': 'repeat group', email: 'email' }[p.format] || p.format;
      if (p.type === 'array') return choices(p) ? 'pick many' : 'list';
      if (choices(p)) return 'pick one';
      return { string: 'text', integer: 'whole number', number: 'number', boolean: 'yes/no' }[p.type] || p.type || '';
    }
    function condText(c) {
      if (!c) return '';
      if (Array.isArray(c.conditions)) return c.conditions.map(condText).join(c.type === 'OR' ? ' or ' : ' and ');
      var n = nameOf(c.scope), p = props[n] || {};
      var label = deref(p).title || n;
      var sc = c.schema || {};
      var ch = choices(p) || [];
      function title(v) { var m = ch.filter(function (x) { return JSON.stringify(x.v) === JSON.stringify(v); })[0]; return m ? m.t : JSON.stringify(v); }
      if (sc.contains && 'const' in sc.contains) return '"' + label + '" includes ' + title(sc.contains.const);
      if ('const' in sc) return '"' + label + '" is ' + title(sc.const);
      if (Array.isArray(sc.enum)) return '"' + label + '" is ' + sc.enum.map(title).join(' or ');
      if (sc.not && 'const' in sc.not) return '"' + label + '" is not ' + title(sc.not.const);
      if ('minimum' in sc) return '"' + label + '" is at least ' + sc.minimum;
      return '"' + label + '" matches a condition';
    }
    function ruleText(r) {
      if (!r) return null;
      var verb = { SHOW: 'Shown only if ', HIDE: 'Hidden if ', ENABLE: 'Can be answered only if ', DISABLE: 'Locked if ' }[r.effect] || 'Rule: ';
      return verb + condText(r.condition);
    }
    var pages = ui.type === 'SwipeLayout' ? (ui.elements || []) : [ui];
    var wrap = h('div', { class: 'outline' });
    pages.forEach(function (pg, i) {
      var items = [];
      (function walk(el) {
        if (!el || typeof el !== 'object') return;
        if (el.type === 'Control') items.push(el);
        else if (el.type === 'Label') items.push(el);
        else (el.elements || []).forEach(function (c) {
          if (el.rule && c && !c.rule) c = Object.assign({}, c, { _parentRule: el.rule });
          walk(c);
        });
      })(pg.type === 'Control' ? { elements: [pg] } : { type: 'Group', elements: pg.elements || [], rule: null });
      wrap.append(h('div', { class: 'page' },
        h('div', { class: 'page-h' }, h('span', {}, 'Page ' + (i + 1) + (pg.label ? ': ' + pg.label : '')), pg.rule ? h('span', { style: 'font-weight:400;color:var(--accent)' }, ruleText(pg.rule)) : null),
        h('ol', {}, items.map(function (c) {
          if (c.type === 'Label') return h('li', {}, h('i', {}, c.text || ''));
          var n = nameOf(c.scope), p = props[n] || {};
          var ch = choices(p);
          return h('li', {},
            c.label || deref(p).title || n,
            required.indexOf(n) !== -1 ? h('span', { class: 'req', title: 'Required' }, '*') : null,
            h('span', { class: 'type' }, typeOf(p)),
            ch ? h('span', { class: 'choices' }, ch.map(function (x) { return x.t; }).join(' · ')) : null,
            c.rule ? h('span', { class: 'cond' }, ruleText(c.rule)) : null);
        }))));
    });
    return wrap;
  }

  /* ------------------------------------------------------------------ */
  /* Step 5: Check & download                                            */
  /* ------------------------------------------------------------------ */


  function saveProjectFile() {
    downloadBlob(new Blob([B.projectFileText(project)], { type: 'application/json' }), B.fileNames(project).project);
    toast('Project saved as ' + B.fileNames(project).project);
  }

  /* ------------------------------------------------------------------ */
  /* Open files                                                          */
  /* ------------------------------------------------------------------ */

  document.getElementById('btnSave').addEventListener('click', saveProjectFile);
  document.getElementById('btnOpen').addEventListener('click', function () { document.getElementById('fileOpen').click(); });
  document.getElementById('fileOpen').addEventListener('change', function (e) {
    var file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    var isZip = /\.zip$/i.test(file.name) || file.type === 'application/zip';
    var p = isZip
      ? file.arrayBuffer().then(function (buf) { return B.projectFromBundle(JSZip, buf); })
      : file.text().then(B.parseProject);
    p.then(function (proj) {
      adoptApp(proj);
      nav({ view: 'app', id: appId, tab: 'forms' });
      toast('Opened ' + file.name + ' (' + proj.forms.length + ' form' + (proj.forms.length === 1 ? '' : 's') + ').');
    }).catch(function (err) {
      toast('Could not open ' + file.name + ': ' + err.message);
    });
  });

  /* ------------------------------------------------------------------ */
  /* Live preview: the real runtime, with a pretend Formulus             */
  /* ------------------------------------------------------------------ */

  var previewTimer;
  function schedulePreview() {
    clearTimeout(previewTimer);
    previewTimer = setTimeout(renderPreview, 200);
  }

  /** Pretend records so the preview shows lists, details pages and linked records. */
  function sampleRecords(cfg) {
    var out = {};
    var SAMPLE = { people: ['Grace Achieng', 'Peter Okello', 'Amina Hassan', 'John Mwangi', 'Fatuma Ali', 'Joseph Banda'], places: ['Kawempe', 'Nakawa', 'Mbale', 'Gulu', 'Kisumu', 'Arusha'] };
    var now = Date.now();
    function value(fd, i) {
      if (fd.choices) { var keys = Object.keys(fd.choices); return fd.type === 'array' ? [keys[i % keys.length]] : keys[i % keys.length]; }
      if (fd.type === 'integer' || fd.type === 'number' || fd.type === 'likert') return (i * 3 + 2) % 9 + 1;
      if (fd.type === 'date') return new Date(now - i * 864e5).toISOString().slice(0, 10);
      if (['photo', 'signature', 'select_file', 'gps', 'audio', 'video', 'qrcode', 'duration', 'adate', 'date-time', 'time', 'email'].indexOf(fd.type) !== -1) return undefined;
      var n = fd.name;
      if (/phone|tel|mobile/.test(n)) return '+256 7' + String(10000000 + ((i + 1) * 7919301) % 89999999);
      if (/(^|_)(group|site|school|market|asset|wp|point|plot|herd|team)(_|$)/.test(n)) return (fd.label || n).replace(/\s*(name|or number|\?).*$/i, '').replace(/^name of (the )?/i, '') + ' ' + (i + 1);
      if (/village|district|zone|parish|location|place|town|area|ward|address/.test(n)) return SAMPLE.places[(i + n.length) % SAMPLE.places.length];
      if (/name|head|leader|owner|teacher|officer|by$|person|learner|trader/.test(n)) return SAMPLE.people[(i + n.length) % SAMPLE.people.length];
      return undefined; // free text such as notes stays empty in the preview
    }
    cfg.forms.forEach(function (f, fi) {
      var n = f.parent ? 0 : (fi % 3) + 3;
      out[f.formType] = [];
      for (var i = 0; i < n; i++) {
        var data = {};
        (f.fields || []).forEach(function (fd) { var v = value(fd, i); if (v !== undefined) data[fd.name] = v; });
        out[f.formType].push({ observationId: f.formType + '-' + (i + 1), formType: f.formType, createdAt: new Date(now - i * 864e5 * 1.5).toISOString(), updatedAt: new Date(now - i * 864e5 * 1.5).toISOString(), data: data });
      }
    });
    cfg.forms.forEach(function (f) {
      if (!f.parent) return;
      var parents = out[f.parent.formType] || [];
      parents.forEach(function (p, pi) {
        for (var i = 0; i < ((pi + 1) % 3) + 1; i++) {
          var data = {};
          (f.fields || []).forEach(function (fd) { var v = value(fd, i + pi); if (v !== undefined) data[fd.name] = v; });
          data[f.parent.field] = p.observationId;
          out[f.formType].push({ observationId: f.formType + '-' + p.observationId + '-' + i, formType: f.formType, createdAt: new Date(now - (pi + i) * 864e5).toISOString(), updatedAt: new Date(now - (pi + i) * 864e5).toISOString(), data: data });
        }
      });
    });
    return out;
  }

  var lastPreviewHash = '#/';
  function previewError(msg) {
    var pane = document.querySelector('#previewPane .phone');
    var box = pane.querySelector('.preview-error');
    if (!msg) { if (box) box.remove(); return; }
    if (!box) { box = h('div', { class: 'preview-error', role: 'alert' }); pane.append(box); }
    box.replaceChildren(h('b', {}, 'The preview could not start.'), h('span', {}, String(msg).slice(0, 300)), h('button', { type: 'button', class: 'ghost small', onclick: function () { location.reload(); } }, ic('refresh-cw', 15), 'Reload the page'));
  }
  /** JSON that is safe inside a <script> tag, whatever text the user typed. */
  function safeJson(v) { return JSON.stringify(v).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029'); }
  function renderPreview() {
    try { drawPreview(); } catch (e) { previewError(e && e.message || e); }
  }
  function drawPreview() {
    if (!project) return;
    previewError(null);
    var frame = document.getElementById('previewFrame');
    var tpl = TEMPLATES[project.template] || TEMPLATES.simple;
    var cfg = B.makeRuntimeConfig(project);
    if (project.app.logo && project.app.logo.dataUrl) cfg.app.logo = project.app.logo.dataUrl;
    var dark = document.getElementById('previewDark').checked;
    var esc = function (s) { return String(s).replace(/<\/script/gi, '<\\/script'); };
    var mock =
      'window.onerror = function (m) { parent.postMessage({ odePreview: "error", message: String(m) }, "*"); };\n' +
      'window.addEventListener("unhandledrejection", function (e) { parent.postMessage({ odePreview: "error", message: String(e.reason && e.reason.message || e.reason) }, "*"); });\n' +
      'window.matchMedia = function (q) { return { matches: ' + (dark ? 'true' : 'false') + ' && /dark/.test(q), addEventListener: function () {} }; };\n' +
      'window.ODE_APP_CONFIG = ' + safeJson(cfg) + ';\n' +
      'var RECORDS = ' + safeJson(sampleRecords(cfg)) + ';\n' +
      'window.getFormulus = function () { return Promise.resolve(window.formulus); };\n' +
      'window.formulus = {\n' +
      '  getVersion: function () { return Promise.resolve("preview"); },\n' +
      '  getAvailableForms: function () { return Promise.resolve([]); },\n' +
      '  getObservations: function (t) { return Promise.resolve((RECORDS[t] || []).slice()); },\n' +
      '  openFormplayer: function (t, params, data, opts) { parent.postMessage({ odePreview: "openForm", formType: t, data: data || {}, params: params || {} }, "*"); return Promise.resolve({ status: "cancelled", formType: t }); }\n' +
      '};\n' +
      'function tell() { parent.postMessage({ odePreview: "route", hash: location.hash }, "*"); }\n' +
      // The preview keeps its own back stack, like Android's: Back steps one screen, and on the
      // first screen it would close the app. The builder's own browser history is never touched.
      'var _rep = history.replaceState, stack = [];\n' +
      'function at(u) { return u == null ? location.href : u; }\n' +
      'history.pushState = function (st, t, u) { _rep.call(history, st, t, at(u)); stack.push({ s: st, u: location.href }); tell(); };\n' +
      'history.replaceState = function (st, t, u) { _rep.call(history, st, t, at(u)); stack[stack.length - 1] = { s: st, u: location.href }; tell(); };\n' +
      'history.back = function () {\n' +
      '  if (stack.length < 2) { parent.postMessage({ odePreview: "atRoot" }, "*"); return; }\n' +
      '  stack.pop(); var e = stack[stack.length - 1]; _rep.call(history, e.s, "", e.u);\n' +
      '  dispatchEvent(new PopStateEvent("popstate", { state: e.s })); dispatchEvent(new HashChangeEvent("hashchange")); tell();\n' +
      '};\n' +
      'history.go = function (n) { if (n < 0) for (var i = 0; i < -n; i++) history.back(); };\n' +
      'addEventListener("message", function (e) { if (e.source === parent && e.data && e.data.odePreview === "back") history.back(); });\n' +
      'try { _rep.call(history, null, "", String(location.href).split("#")[0] + ' + JSON.stringify(lastPreviewHash) + '); } catch (e) {}\n' +
      'stack.push({ s: null, u: location.href });\n';
    var html = '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
      '<style>' + (tpl.runtime['runtime.css'] || '') + '</style><script>' + esc(tpl.runtime['icons.js'] || '') + '</script></head><body>' +
      (/id="root"/.test(tpl.runtime['index.html'] || '') ? '<div id="root"></div>' : '<main id="app"></main><div id="toast" hidden></div>') +
      '<script>' + esc(mock) + '</script><script>' + esc(tpl.runtime['runtime.js']) + '</script></body></html>';
    var dv = document.getElementById('pvDeviceFrame');
    dv.style.setProperty('--dv-bar', dark ? '#121212' : project.brand.primary);
    dv.style.setProperty('--dv-on', dark ? '#e8e8e8' : B.onColor(project.brand.primary));
    dv.classList.toggle('dark', dark);
    // A fresh iframe each time: reloading the old one would add an entry to the browser's history,
    // and Back would then step through preview reloads instead of builder screens.
    var next = frame.cloneNode(false);
    next.removeAttribute('srcdoc');
    next.srcdoc = html;
    frame.replaceWith(next);
  }

  window.addEventListener('message', function (e) {
    var d = e.data;
    if (d && d.odePreview === 'route' && typeof d.hash === 'string') { lastPreviewHash = d.hash || '#/'; return; }
    if (d && d.odePreview === 'atRoot' && e.source === document.getElementById('previewFrame').contentWindow) { deviceToast('Back on the first screen closes the app.'); return; }
    if (d && d.odePreview === 'error' && e.source === document.getElementById('previewFrame').contentWindow) { previewError(d.message); return; }
    if (!d || d.odePreview !== 'openForm') return;
    var f = project.forms.filter(function (x) { return x.formType === d.formType; })[0];
    if (!f) return;
    previewForm(f, d.data);
  });

  /** Try a form: the real ODE Formplayer when it is available, otherwise a plain outline. */
  function previewForm(f, data) {
    var st = formStatus(f);
    if (!f.schemaText || !st.result || !st.result.summary) {
      dialog([h('h2', { class: 'row' }, formIcon(f, 20), f.title), h('p', {}, 'This form has no questions yet. Describe it with AI, or add questions.')]);
      return;
    }
    if (window.OdeFormPreview && window.OdeFormPreview.available()) {
      var pane = document.getElementById('previewPane');
      if (!pane.getClientRects().length || getComputedStyle(pane).display === 'none') togglePreviewSheet(true);
      autoFormOff = null;
      return window.OdeFormPreview.open(project, f, data, { dark: document.getElementById('previewDark').checked, mount: pane.querySelector('.phone'), onClose: formClosed(f) });
    }
    dialog([
      h('h2', { class: 'row' }, formIcon(f, 20), f.title),
      h('p', { class: 'hint' }, 'On a phone this opens the form full screen in Formulus, one page at a time.'),
      outline(f),
    ]);
  }

  /* The device shows the form you are working on, and follows your edits. */
  var autoFormOff = null; // a form the person closed in the device: stay on the app until they move on
  var autoFormFor = null;
  var formRefreshTimer;
  function formClosed(f) { return function (byUser) { if (byUser) autoFormOff = f.formType; }; }
  function previewShowing() {
    var pane = document.getElementById('previewPane');
    return !!pane.getClientRects().length && getComputedStyle(pane).display !== 'none';
  }
  function showSelectedForm(refresh) {
    if (!project || !window.OdeFormPreview || !window.OdeFormPreview.available()) return;
    if (route.view !== 'app' || route.form === null) return;
    var f = project.forms[route.form];
    if (!f || autoFormOff === f.formType || !previewShowing()) return;
    var open = window.OdeFormPreview.current() === f.formType;
    if (open && !refresh) return;
    var st = formStatus(f);
    if (!f.schemaText || !st.result || !st.result.summary) { if (open) window.OdeFormPreview.close(); return; }
    window.OdeFormPreview.open(project, f, null, { dark: document.getElementById('previewDark').checked, mount: document.querySelector('#previewPane .phone'), quiet: true, onClose: formClosed(f) });
  }

  /* Phones and tablets: the preview opens full screen from the Preview button in the top bar. */
  function togglePreviewSheet(open) {
    var o = open === undefined ? !document.body.classList.contains('preview-open') : open;
    if (o === document.body.classList.contains('preview-open')) return;
    document.body.classList.toggle('preview-open', o);
    document.getElementById('btnPreview').setAttribute('aria-expanded', o ? 'true' : 'false');
    if (!o && window.OdeFormPreview) window.OdeFormPreview.close();
    if (o) { renderPreview(); showSelectedForm(); }
  }
  document.getElementById('btnPreview').addEventListener('click', function () { togglePreviewSheet(); });
  document.getElementById('previewClose').addEventListener('click', function () {
    if (document.body.classList.contains('preview-full')) { document.getElementById('pvExpand').click(); return; }
    togglePreviewSheet(false);
  });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && document.body.classList.contains('preview-open') && !document.querySelector('.fp-inline')) togglePreviewSheet(false); });

  document.getElementById('previewDark').addEventListener('change', function () {
    var open = window.OdeFormPreview && window.OdeFormPreview.current();
    renderPreview();
    if (!open) return;
    var f = project.forms.filter(function (x) { return x.formType === open; })[0];
    if (f) window.OdeFormPreview.open(project, f, null, { dark: this.checked, mount: document.querySelector('#previewPane .phone'), quiet: true, onClose: formClosed(f) });
  });

  /* The device around the preview: size, rotation, and the Android Back and Home buttons. */
  var toastTimerDv;
  function deviceToast(msg) {
    var t = document.querySelector('#pvDeviceFrame .dv-toast');
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toastTimerDv);
    toastTimerDv = setTimeout(function () { t.hidden = true; }, 2200);
  }
  function previewHome() {
    if (window.OdeFormPreview) window.OdeFormPreview.close(true);
    lastPreviewHash = '#/';
    renderPreview();
  }
  var narrow = window.matchMedia('(max-width: 760px)');
  var deviceView = window.OdeDevice.init({
    stage: document.getElementById('pvStage'),
    scaler: document.getElementById('pvScaler'),
    device: document.getElementById('pvDeviceFrame'),
    select: document.getElementById('pvDevice'),
    rotate: document.getElementById('pvRotate'),
    meta: document.getElementById('pvMeta'),
    isBare: function () { return narrow.matches; },
    onBack: function () {
      if (document.querySelector('#previewPane .fp-inline')) { window.OdeFormPreview.close(true); return; }
      var w = document.getElementById('previewFrame').contentWindow;
      if (w) w.postMessage({ odePreview: 'back' }, '*');
    },
    onHome: previewHome,
  });
  if (narrow.addEventListener) narrow.addEventListener('change', deviceView.layout);
  document.getElementById('pvRestart').addEventListener('click', function () {
    var open = window.OdeFormPreview && window.OdeFormPreview.current();
    if (!open) return previewHome();
    renderPreview();
    var f = project.forms.filter(function (x) { return x.formType === open; })[0];
    if (f) window.OdeFormPreview.open(project, f, null, { dark: document.getElementById('previewDark').checked, mount: document.querySelector('#previewPane .phone'), quiet: true, onClose: formClosed(f) });
  });
  document.getElementById('pvExpand').addEventListener('click', function () {
    var on = document.body.classList.toggle('preview-full');
    this.setAttribute('aria-pressed', on ? 'true' : 'false');
    this.setAttribute('aria-label', on ? 'Smaller preview' : 'Bigger preview');
    this.title = on ? 'Smaller preview' : 'Bigger preview';
  });
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape' || !document.body.classList.contains('preview-full') || document.querySelector('.fp-inline')) return;
    document.getElementById('pvExpand').click();
  });

  if (location.hash !== hashOf(route)) { try { history.replaceState(null, '', hashOf(route)); } catch (e) { /* ignore */ } }
  render();
})();
