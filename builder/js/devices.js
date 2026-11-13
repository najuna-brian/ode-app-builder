/*
 * Device preview: the app on a real-looking phone or tablet.
 * Sizes match ODE Desktop's custom app viewport presets, so a test here matches a test there.
 * The screen is laid out at the device's true CSS size and the whole device is scaled to fit,
 * so switching device or rotating only resizes: nothing reloads.
 */
(function (root) {
  'use strict';

  var PRESETS = [
    { id: 'fit', label: 'Fit to panel', group: '' },
    { id: 'android-compact-phone', label: 'Compact phone 6.1″', w: 360, h: 780, kind: 'phone', group: 'Phones' },
    { id: 'android-medium-phone', label: 'Medium phone 6.5″', w: 393, h: 852, kind: 'phone', group: 'Phones' },
    { id: 'android-large-phone', label: 'Large phone 6.8″', w: 412, h: 915, kind: 'phone', group: 'Phones' },
    { id: 'iphone-se', label: 'iPhone SE', w: 375, h: 667, kind: 'phone', group: 'Phones', ios: true },
    { id: 'android-small-tablet', label: 'Small tablet 8″', w: 600, h: 960, kind: 'tablet', group: 'Tablets' },
    { id: 'android-standard-tablet', label: 'Standard tablet 10″', w: 800, h: 1280, kind: 'tablet', group: 'Tablets' },
    { id: 'android-large-tablet', label: 'Large tablet 12″', w: 1024, h: 1366, kind: 'tablet', group: 'Tablets' },
    { id: 'ipad-air', label: 'iPad Air', w: 820, h: 1180, kind: 'tablet', group: 'Tablets', ios: true },
  ];
  var DEFAULT = 'android-medium-phone';
  var KEY = 'ode-app-builder:device';
  // Frame thickness around the screen: [sides, top and bottom] in portrait
  var BEZEL = { phone: [11, 11], tablet: [20, 20], 'ios-phone': [14, 64], 'ios-tablet': [22, 22] };
  var BARS = { status: 26, nav: 44 };

  function byId(id) { return PRESETS.filter(function (p) { return p.id === id; })[0] || byId(DEFAULT); }
  function load() {
    try { var v = JSON.parse(localStorage.getItem(KEY) || 'null'); if (v && byId(v.id).id === v.id) return { id: v.id, landscape: !!v.landscape }; } catch (e) { /* ignore */ }
    return { id: DEFAULT, landscape: false };
  }
  function store(v) { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch (e) { /* ignore */ } }

  /**
   * opts: { stage, device, screen, select, rotate, meta, isBare(): bool, onBack(), onHome() }
   * stage: the element the device must fit in. device: the frame. screen: the scaled screen box.
   */
  function init(opts) {
    var state = load();
    var stage = opts.stage, device = opts.device, scaler = opts.scaler;

    // Device list, grouped like ODE Desktop's
    var sel = opts.select;
    var groups = {};
    PRESETS.forEach(function (p) {
      var o = document.createElement('option');
      o.value = p.id;
      o.textContent = p.label;
      if (!p.group) { sel.appendChild(o); return; }
      if (!groups[p.group]) { groups[p.group] = document.createElement('optgroup'); groups[p.group].label = p.group; sel.appendChild(groups[p.group]); }
      groups[p.group].appendChild(o);
    });
    sel.value = state.id;
    sel.addEventListener('change', function () { state.id = sel.value; if (state.id === 'fit') state.landscape = false; store(state); layout(); });
    opts.rotate.addEventListener('click', function () { if (state.id === 'fit') return; state.landscape = !state.landscape; store(state); layout(); });
    device.querySelector('[data-nav=back]').addEventListener('click', opts.onBack);
    device.querySelector('[data-nav=home]').addEventListener('click', opts.onHome);

    // Status bar clock, updated once a minute
    var clock = device.querySelector('.dv-time');
    function tick() { var d = new Date(); clock.textContent = d.getHours() + ':' + String(d.getMinutes()).padStart(2, '0'); }
    tick();
    setInterval(tick, 30000);

    var raf = 0;
    function layout() {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(doLayout);
    }
    function doLayout() {
      var p = byId(state.id);
      var bare = opts.isBare();
      var cs = getComputedStyle(stage);
      var availW = stage.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
      var availH = stage.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
      if (availW <= 0 || availH <= 0) return;
      var kind = bare ? 'bare' : p.kind || 'phone';
      var land = state.landscape && p.id !== 'fit' && !bare;
      var bz = bare ? [0, 0] : BEZEL[(p.ios ? 'ios-' : '') + kind] || BEZEL.phone;
      var bx = land ? bz[1] : bz[0], by = land ? bz[0] : bz[1];
      var w, h, scale;
      if (bare || p.id === 'fit') {
        w = Math.floor(availW - 2 * bx - (bare ? 0 : 6));
        h = Math.floor(availH - 2 * by);
        if (!bare) { w = Math.min(w, 480); }
        scale = 1;
      } else {
        w = land ? p.h : p.w;
        h = land ? p.w : p.h;
        scale = Math.min(1, (availW - 6) / (w + 2 * bx), availH / (h + 2 * by));
      }
      device.setAttribute('data-kind', kind);
      device.setAttribute('data-orient', land ? 'landscape' : 'portrait');
      device.classList.toggle('ios', !!p.ios && !bare);
      var fw = w + 2 * bx, fh = h + 2 * by;
      device.style.width = fw + 'px';
      device.style.height = fh + 'px';
      device.style.padding = by + 'px ' + bx + 'px';
      device.style.setProperty('--bezel', Math.min(bx, by) + 'px');
      device.style.transform = scale === 1 ? '' : 'scale(' + scale + ')';
      scaler.style.width = Math.round(fw * scale) + 'px';
      scaler.style.height = Math.round(fh * scale) + 'px';
      opts.rotate.disabled = p.id === 'fit' || bare;
      sel.value = state.id;
      if (opts.meta) {
        opts.meta.textContent = bare ? '' : p.id === 'fit'
          ? w + ' × ' + h
          : w + ' × ' + h + ' · ' + (state.landscape ? 'Landscape' : 'Portrait') + ' · ' + Math.round(scale * 100) + '%';
      }
    }
    if (root.ResizeObserver) new ResizeObserver(layout).observe(stage);
    root.addEventListener('resize', layout);
    layout();
    return { layout: layout, state: function () { return { id: state.id, landscape: state.landscape, preset: byId(state.id) }; } };
  }

  root.OdeDevice = { PRESETS: PRESETS, BARS: BARS, init: init };
})(typeof window !== 'undefined' ? window : globalThis);
