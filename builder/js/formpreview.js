/* ODE App Builder: try a form in the real ODE Formplayer (builder/formplayer/, copied from the
   ODE monorepo by tools/formplayer.mjs). Hosted the same way ODE Desktop's form preview does it:
   the Formplayer page in an iframe, with init data, a host stub and the Formulus bridge script
   injected, and this page answering the bridge's requests. Nothing is saved anywhere. */
(function (root) {
  'use strict';

  var BASE = 'formplayer/';
  var B = root.OdeBuilder;
  var htmlCache = null;
  var state = null; // { iframe, frameWin, onMsg, overlay }
  var seq = 0;

  function available() { return typeof fetch === 'function'; }

  function loadHtml() {
    if (htmlCache) return Promise.resolve(htmlCache);
    return fetch(BASE + 'index.html').then(function (r) {
      if (!r.ok) throw new Error('The form player is not installed on this site (' + r.status + ').');
      return r.text();
    }).then(function (t) {
      if (t.indexOf('Formulus Form Player') === -1) throw new Error('Unexpected form player page.');
      htmlCache = t;
      return t;
    });
  }

  /** byUser: the person closed it (close button, Escape, the device's Back), not the builder. */
  function close(byUser) {
    if (!state) return;
    byUser = byUser === true || (byUser && typeof byUser === 'object' && 'type' in byUser);
    window.removeEventListener('message', state.onMsg);
    document.removeEventListener('keydown', state.onKey);
    state.overlay.remove();
    document.body.classList.remove('fp-open');
    if (state.onClose) try { state.onClose(byUser); } catch (e) { /* ignore */ }
    var back = state.quiet ? null : state.returnFocus;
    state = null;
    if (back && back.focus) back.focus();
  }

  function el(tag, attrs, kids) {
    var n = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      if (k === 'text') n.textContent = attrs[k];
      else if (k.slice(0, 2) === 'on') n.addEventListener(k.slice(2), attrs[k]);
      else if (attrs[k] !== null && attrs[k] !== undefined) n.setAttribute(k, attrs[k]);
    });
    (kids || []).forEach(function (c) { if (c) n.append(c); });
    return n;
  }

  /** Open form f (with optional prefilled answers). opts: { dark, mount } — with mount, the form
   *  player fills that element (the preview phone) instead of the whole screen. */
  function open(project, f, data, opts) {
    opts = opts || {};
    close();
    var langs = [project.app.defaultLocale || 'en'].concat(f.languages || []).filter(function (l, i, a) { return a.indexOf(l) === i; });
    var lang = langs[0];
    var dark = !!opts.dark;

    var frame = el('iframe', { title: 'Form preview: ' + f.title, class: 'fp-frame' });
    var status = el('div', { class: 'fp-status', role: 'status' });
    var langSel = langs.length > 1 ? el('select', { class: 'fp-lang', 'aria-label': 'Form language', onchange: function (e) { lang = e.target.value; start(); } },
      langs.map(function (l) { var o = el('option', { value: l, text: (B.LOCALES[l] || l) }); if (l === lang) o.selected = true; return o; })) : null;
    var darkBtn = el('button', { type: 'button', class: 'ghost small', 'aria-pressed': dark ? 'true' : 'false', text: dark ? 'Light' : 'Dark', onclick: function () { dark = !dark; darkBtn.textContent = dark ? 'Light' : 'Dark'; darkBtn.setAttribute('aria-pressed', dark ? 'true' : 'false'); start(); } });
    var inline = !!opts.mount;
    var restart = el('button', { type: 'button', class: inline ? 'icon-btn' : 'ghost small', 'aria-label': 'Start again', title: 'Start again', text: inline ? null : 'Start again', onclick: function () { start(); } });
    if (inline) restart.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/></svg>';
    var closeBtn = el('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Close the form preview', 'data-role': 'fp-close', onclick: close });
    closeBtn.innerHTML = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>';
    var result = el('div', { class: 'fp-result', hidden: '' });
    var overlay = inline
      ? el('div', { class: 'fp-inline' + (dark ? ' dark' : ''), role: 'region', 'aria-label': 'Try the form: ' + f.title }, [
          el('div', { class: 'fp-bar' }, [closeBtn, el('div', { class: 'fp-title' }, [el('b', { text: f.title }), el('small', { text: 'Nothing is saved' })]), langSel, restart]),
          el('div', { class: 'fp-stage' }, [frame, status, result]),
        ])
      : el('div', { class: 'fp-overlay', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Try the form: ' + f.title }, [
          el('div', { class: 'fp-bar' }, [
            el('div', { class: 'fp-title' }, [el('b', { text: f.title }), el('small', { text: 'Real ODE form player. Nothing is saved.' })]),
            langSel, darkBtn, restart, closeBtn,
          ]),
          el('div', { class: 'fp-stage' }, [el('div', { class: 'fp-device' }, [frame, status]), result]),
        ]);
    if (inline) opts.mount.append(overlay);
    else { document.body.append(overlay); document.body.classList.add('fp-open'); }

    var schema, ui;
    try { schema = JSON.parse(f.schemaText); ui = JSON.parse(f.uiText); } catch (e) {
      status.textContent = 'The form files are not valid JSON yet.';
      return;
    }

    function reply(win, type, id, payload) {
      try {
        if (typeof win.__odeFormplayerDeliverBridgeResponse === 'function') { win.__odeFormplayerDeliverBridgeResponse(type, id, payload); return; }
      } catch (e) { /* fall through */ }
      try { win.postMessage(JSON.stringify(Object.assign({ type: type + '_response', messageId: id }, payload)), '*'); } catch (e) { /* ignore */ }
    }

    function showSaved(answers, kind) {
      result.hidden = false;
      result.replaceChildren(
        el('h3', { text: kind === 'update' ? 'Updated (preview)' : 'Saved (preview)' }),
        el('p', { class: 'hint', text: 'This is the record the form would save. Field names are the column names in your exports.' }),
        el('pre', { class: 'fp-json', text: JSON.stringify(answers, null, 2) }),
        el('div', { class: 'row' }, [
          el('button', { type: 'button', class: 'secondary', text: 'Fill it in again', onclick: function () { start(); } }),
          inline ? el('button', { type: 'button', class: 'ghost', text: 'Close', onclick: close }) : null]));
    }

    function onMsg(e) {
      if (!state || e.source !== frame.contentWindow) return;
      var d = e.data;
      if (typeof d === 'string') { try { d = JSON.parse(d); } catch (x) { return; } }
      if (!d || typeof d.type !== 'string') return;
      if (d.type === 'formplayerError') { status.textContent = 'The form player reported a problem: ' + (d.message || d.error || 'unknown'); return; }
      if (d.type === 'formplayerInitialized') { status.textContent = ''; return; }
      if (!d.messageId) return;
      var win = e.source, id = d.messageId, t = d.type;
      var unavailable = function (what) { reply(win, t, id, { error: what + ' is not available in the builder preview. It works on the phone.' }); };
      switch (t) {
        case 'getVersion': return reply(win, t, id, { result: '1.6.0' });
        case 'getAvailableForms': return reply(win, t, id, { result: project.forms.map(function (x) { return { formType: x.formType, name: x.title }; }) });
        case 'getObservations': return reply(win, t, id, { result: [] });
        case 'getObservationsByQuery': return reply(win, t, id, { result: [] });
        case 'submitObservation': showSaved(d.finalData || {}, 'submit'); return reply(win, t, id, { result: 'preview-' + (++seq) });
        case 'updateObservation': showSaved(d.finalData || {}, 'update'); return reply(win, t, id, { result: String(d.observationId || 'preview') });
        case 'persistObservation': return reply(win, t, id, { result: 'preview-' + (++seq) });
        case 'allocateSequence': return reply(win, t, id, { result: ++seq });
        case 'getThemeMode': return reply(win, t, id, { result: dark ? 'dark' : 'light' });
        case 'getCurrentUser': return reply(win, t, id, { result: { username: 'preview', displayName: 'Preview' } });
        case 'requestConnectivityStatus': case 'requestSyncStatus': return reply(win, t, id, {});
        case 'requestCamera': return unavailable('The camera');
        case 'requestLocation': return unavailable('GPS');
        case 'requestFile': return unavailable('Picking a file');
        case 'requestAudio': return unavailable('Audio recording');
        case 'requestVideo': return unavailable('Video recording');
        case 'requestQrcode': return unavailable('Scanning');
        case 'requestBiometric': return unavailable('Fingerprint');
        case 'openFormplayer': return unavailable('Opening another form');
        default: return reply(win, t, id, { error: 'Not available in the builder preview: ' + t });
      }
    }
    function onKey(e) { if (e.key === 'Escape') close(true); }

    state = { overlay: overlay, onMsg: onMsg, onKey: onKey, returnFocus: document.activeElement, onClose: opts.onClose, quiet: !!opts.quiet, formType: f.formType };
    window.addEventListener('message', onMsg);
    document.addEventListener('keydown', onKey);

    function start() {
      result.hidden = true;
      status.textContent = 'Loading the form player…';
      loadHtml().then(function (html) {
        var palette = B.makePalette(project.brand.primary, project.brand.secondary);
        var params = { profileId: 'builder_preview', darkMode: dark, themeColors: dark ? palette.dark : palette.light, locale: lang, formLocale: lang === langs[0] ? 'default' : lang };
        if (data && Object.keys(data).length) params.defaultData = data;
        var init = { formType: f.formType, observationId: null, params: params, savedData: {}, formSchema: schema, uiSchema: ui, skipDraftSelection: true, operationId: 'preview-' + Date.now() };
        var base = new URL(BASE, location.href).toString();
        var json = function (v) { return JSON.stringify(v).replace(/</g, '\\u003c'); };
        var stub = '<!--ode-formplayer-host-stub-->' +
          // Keep the form player's history to itself, so the browser's Back stays in the builder.
          '<script>(function(){var r=history.replaceState.bind(history);history.pushState=function(s,t,u){r(s,t,u)};})();</script>' +
          '<script>window.__odeProfileId="builder_preview";window.__odeLegacyWebStorageProfileId=null;window.__odeDeletedProfileIds=[];</script>' +
          '<script id="ode-formplayer-init-data" type="application/json">' + json(init) + '</script>' +
          '<script src="' + base + 'formplayer-host-stub.js"></script>' +
          '<script src="' + base + 'formulus-injection.js"></script>';
        // A fresh iframe each start, so restarting never adds to the browser's history
        var next = frame.cloneNode(false);
        next.srcdoc = html.replace(/<head[^>]*>/i, function (m) { return m + '<base href="' + base + '">' + stub; });
        frame.replaceWith(next);
        frame = next;
        setTimeout(function () { if (status.textContent.indexOf('Loading') === 0) status.textContent = ''; }, 6000);
      }).catch(function (e) {
        status.textContent = e.message;
      });
    }
    start();
    if (!opts.quiet) closeBtn.focus();
  }

  /** The form type open now, or null. */
  function current() { return state ? state.formType : null; }

  root.OdeFormPreview = { available: available, open: open, close: close, current: current };
})(typeof self !== 'undefined' ? self : this);
