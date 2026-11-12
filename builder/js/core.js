/*
 * ODE App Builder core: everything that is not UI. Runs in the browser (window.OdeBuilder)
 * and in Node (module.exports) so the tests exercise the same code the site uses.
 *
 *  - project model and defaults
 *  - colour palette for app.config.json (Formulus theme roles)
 *  - form checks (a port of the main rules in ODE Desktop's `ode forms validate`)
 *  - AI prompt generation and paste-back parsing
 *  - bundle zip (app/ + forms/), source project zip, project file
 */
(function (root, factory) {
  var lib = factory();
  if (typeof module === 'object' && module.exports) module.exports = lib;
  else root.OdeBuilder = lib;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var BUILDER_VERSION = '0.1.0';
  var PROJECT_FORMAT = 1;
  var LOCALES = { en: 'English', pt: 'Português', fr: 'Français', sw: 'Kiswahili' };
  var TABS = ['Home', 'Forms', 'Observations', 'Sync', 'More'];

  /* ------------------------------------------------------------------ */
  /* Project model                                                       */
  /* ------------------------------------------------------------------ */

  function newProject() {
    return {
      format: PROJECT_FORMAT,
      builderVersion: BUILDER_VERSION,
      template: 'simple',
      app: {
        name: 'My ODE app',
        description: '',
        version: '1.0.0',
        defaultLocale: 'en',
        logo: null, // { dataUrl, name, type }
      },
      brand: { primary: '#1565C0', secondary: '#00897B' },
      navigation: { tabs: TABS.slice() },
      home: { welcome: '', design: 'grid', layout: 'grid', showCounts: true, showRecords: true, footer: '' },
      forms: [],
    };
  }

  function newForm(title) {
    return {
      title: title || 'New form',
      formType: slugify(title || 'new_form'),
      description: '',
      icon: 'clipboard-list',
      color: '',
      languages: [],
      brief: '', // plain-language description for the AI
      schemaText: '',
      uiText: '',
      lastUploadedFields: null, // field names known to be on a server (core field guard)
      model: null, // question editor model (formmodel.js); null when the form is kept as files
      parent: '', // formType this form belongs to (e.g. a visit belongs to a household)
      onHome: true, // show a card on the home screen
      summaryFields: [], // fields that name a record in lists
    };
  }

  function slugify(text) {
    var s = String(text || '')
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');
    if (!s) s = 'form';
    if (/^[0-9]/.test(s)) s = 'f_' + s;
    return s.slice(0, 48);
  }

  function isValidFormType(s) {
    return /^[a-z][a-z0-9_]{0,63}$/.test(s);
  }

  /* ------------------------------------------------------------------ */
  /* Colour                                                              */
  /* ------------------------------------------------------------------ */

  function hexToRgb(hex) {
    var h = String(hex || '').trim().replace('#', '');
    if (h.length === 3) h = h.replace(/(.)/g, '$1$1');
    if (!/^[0-9a-fA-F]{6}$/.test(h)) return null;
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  }
  function rgbToHex(rgb) {
    return (
      '#' +
      rgb
        .map(function (v) {
          var x = Math.max(0, Math.min(255, Math.round(v))).toString(16);
          return x.length === 1 ? '0' + x : x;
        })
        .join('')
        .toUpperCase()
    );
  }
  function rgbToHsl(rgb) {
    var r = rgb[0] / 255, g = rgb[1] / 255, b = rgb[2] / 255;
    var max = Math.max(r, g, b), min = Math.min(r, g, b);
    var h = 0, s = 0, l = (max + min) / 2;
    if (max !== min) {
      var d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
      else if (max === g) h = (b - r) / d + 2;
      else h = (r - g) / d + 4;
      h /= 6;
    }
    return [h * 360, s * 100, l * 100];
  }
  function hslToRgb(hsl) {
    var h = (((hsl[0] % 360) + 360) % 360) / 360, s = clamp(hsl[1], 0, 100) / 100, l = clamp(hsl[2], 0, 100) / 100;
    if (s === 0) return [l * 255, l * 255, l * 255];
    function hue(p, q, t) {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    }
    var q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
    return [hue(p, q, h + 1 / 3) * 255, hue(p, q, h) * 255, hue(p, q, h - 1 / 3) * 255];
  }
  function clamp(v, a, b) {
    return Math.max(a, Math.min(b, v));
  }
  function shade(hex, dl, ds) {
    var hsl = rgbToHsl(hexToRgb(hex));
    return rgbToHex(hslToRgb([hsl[0], hsl[1] + (ds || 0), hsl[2] + dl]));
  }
  function setL(hex, l, sMax) {
    var hsl = rgbToHsl(hexToRgb(hex));
    return rgbToHex(hslToRgb([hsl[0], sMax === undefined ? hsl[1] : Math.min(hsl[1], sMax), l]));
  }
  function luminance(hex) {
    var c = hexToRgb(hex).map(function (v) {
      v /= 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  }
  function contrast(a, b) {
    var x = luminance(a), y = luminance(b);
    return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
  }
  function onColor(bg) {
    return contrast(bg, '#FFFFFF') >= contrast(bg, '#111111') ? '#FFFFFF' : '#111111';
  }
  function isHex(c) {
    return !!hexToRgb(c);
  }

  /** Full Formulus theme (light + dark) from two brand colours. Roles match formulus/src/types/AppConfig.ts. */
  function makePalette(primary, secondary) {
    if (!isHex(primary)) primary = '#1565C0';
    if (!isHex(secondary)) secondary = primary;
    var hue = rgbToHsl(hexToRgb(primary))[0];
    var tint = function (l, s) {
      return rgbToHex(hslToRgb([hue, s, l]));
    };
    var light = {
      primary: rgbToHex(hexToRgb(primary)),
      primaryLight: shade(primary, 14),
      primaryDark: shade(primary, -12),
      onPrimary: onColor(primary),
      secondary: rgbToHex(hexToRgb(secondary)),
      secondaryLight: shade(secondary, 14),
      secondaryDark: shade(secondary, -12),
      onSecondary: onColor(secondary),
      background: tint(97, 18),
      surface: '#FFFFFF',
      onBackground: tint(11, 12),
      onSurface: tint(34, 8),
      error: '#BA1A1A',
      errorLight: '#FF5449',
      errorDark: '#93000A',
      onError: '#FFFFFF',
      warning: '#8C5000',
      success: '#1B7F3A',
      info: '#0061A4',
      divider: tint(85, 10),
    };
    // Dark mode: lift the brand colours so they read on a dark surface.
    var pD = setL(primary, Math.max(rgbToHsl(hexToRgb(primary))[2], 68), 85);
    var sD = setL(secondary, Math.max(rgbToHsl(hexToRgb(secondary))[2], 66), 80);
    var dark = {
      primary: pD,
      primaryLight: shade(pD, 10),
      primaryDark: light.primary,
      onPrimary: onColor(pD),
      secondary: sD,
      secondaryLight: shade(sD, 10),
      secondaryDark: light.secondary,
      onSecondary: onColor(sD),
      background: tint(9, 14),
      surface: tint(14, 12),
      onBackground: tint(95, 12),
      onSurface: tint(80, 8),
      error: '#FF5449',
      errorLight: '#FF897D',
      errorDark: '#BA1A1A',
      onError: '#690005',
      warning: '#FFB77C',
      success: '#6CDB8A',
      info: '#A0CAFF',
      divider: tint(28, 10),
    };
    return { light: light, dark: dark };
  }

  function paletteWarnings(project) {
    var out = [];
    var p = project.brand.primary;
    if (!isHex(p)) out.push('Primary colour is not a valid colour like #1565C0.');
    else if (contrast(p, onColor(p)) < 4.5)
      out.push('Text on the primary colour is hard to read (contrast ' + contrast(p, onColor(p)).toFixed(1) + ':1). A darker or lighter shade will read better.');
    if (project.brand.secondary && !isHex(project.brand.secondary)) out.push('Secondary colour is not a valid colour like #00897B.');
    return out;
  }

  /* ------------------------------------------------------------------ */
  /* Generated config files                                              */
  /* ------------------------------------------------------------------ */

  function logoFileName(project) {
    var l = project.app.logo;
    if (!l || !l.dataUrl) return null;
    var m = /^data:image\/(png|jpe?g|svg\+xml|webp|gif)/i.exec(l.dataUrl);
    var ext = m ? m[1].toLowerCase().replace('jpeg', 'jpg').replace('svg+xml', 'svg') : 'png';
    return 'logo.' + ext;
  }

  /** app/app.config.json: read by Formulus to theme its own header, tabs and Formplayer. */
  function makeAppConfig(project) {
    var cfg = {
      $schema: 'https://ode.dev/schemas/app-config-v1.json',
      name: project.app.name,
      version: project.app.version || '1.0.0',
      theme: makePalette(project.brand.primary, project.brand.secondary),
    };
    var tabs = (project.navigation && project.navigation.tabs) || TABS;
    var ordered = TABS.filter(function (t) { return tabs.indexOf(t) !== -1; });
    if (ordered.length && ordered.length !== TABS.length) cfg.navigation = { tabs: ordered };
    else cfg.navigation = { tabs: TABS.slice() };
    if (project.app.defaultLocale && project.app.defaultLocale !== 'en') cfg.defaultLocale = project.app.defaultLocale;
    return cfg;
  }

  /** Name of the field that links a child record to its parent, e.g. household_id. */
  function linkField(parentType) {
    return String(parentType || '').slice(0, 60) + '_id';
  }

  /** What the runtime needs to show a form's records: field labels, types and choice labels. */
  function displayFields(form) {
    var schema, ui;
    try { schema = JSON.parse(form.schemaText); } catch (e) { return []; }
    try { ui = JSON.parse(form.uiText); } catch (e) { ui = null; }
    var labels = {};
    (function walk(el) {
      if (!el || typeof el !== 'object') return;
      if (el.type === 'Control' && typeof el.scope === 'string' && el.label) {
        var m = /^#\/properties\/([^/]+)$/.exec(el.scope);
        if (m) labels[m[1]] = el.label;
      }
      (el.elements || []).forEach(walk);
    })(ui);
    var props = (schema && schema.properties) || {};
    var order = [];
    (function walk(el) {
      if (!el || typeof el !== 'object') return;
      if (el.type === 'Control' && typeof el.scope === 'string') {
        var m = /^#\/properties\/([^/]+)$/.exec(el.scope);
        if (m && props[m[1]] && order.indexOf(m[1]) === -1) order.push(m[1]);
      }
      (el.elements || []).forEach(walk);
    })(ui);
    Object.keys(props).forEach(function (k) { if (order.indexOf(k) === -1) order.push(k); });
    return order.map(function (name) {
      var node = deref(schema, props[name]) || {};
      var out = { name: name, label: labels[name] || node.title || name, type: node.format || node.type || 'string' };
      var src = node.type === 'array' ? deref(schema, node.items) || {} : node;
      var list = src.oneOf || src.anyOf;
      var choices = null;
      if (Array.isArray(list)) list.forEach(function (c) { c = deref(schema, c); if (c && 'const' in c) { choices = choices || {}; choices[String(c.const)] = c.title || String(c.const); } });
      if (Array.isArray(src.enum)) src.enum.forEach(function (v, i) { choices = choices || {}; choices[String(v)] = (src.enumNames && src.enumNames[i]) || String(v); });
      if (choices) out.choices = choices;
      return out;
    });
  }

  function designOf(project) {
    var d = project.home.design || project.home.layout;
    return d === 'list' || d === 'dashboard' ? d : 'grid';
  }

  /** app/config.js: read by the runtime (a script, so it also works where fetch() of local files does not). */
  function makeRuntimeConfig(project) {
    var appCfg = makeAppConfig(project);
    var types = project.forms.map(function (f) { return f.formType; });
    return {
      builder: { version: BUILDER_VERSION, template: project.template || 'simple', projectFormat: PROJECT_FORMAT },
      app: {
        name: project.app.name,
        description: project.app.description || '',
        version: project.app.version || '1.0.0',
        defaultLocale: project.app.defaultLocale || 'en',
        logo: logoFileName(project),
      },
      theme: appCfg.theme,
      home: {
        welcome: project.home.welcome || '',
        design: designOf(project),
        layout: designOf(project) === 'list' ? 'list' : 'grid',
        showCounts: project.home.showCounts !== false,
        showRecords: project.home.showRecords !== false,
        footer: project.home.footer || '',
      },
      forms: project.forms.map(function (f) {
        var hasParent = f.parent && f.parent !== f.formType && types.indexOf(f.parent) !== -1;
        var out = {
          formType: f.formType,
          title: f.title,
          description: f.description || '',
          icon: f.icon || 'clipboard-list',
          color: isHex(f.color) ? f.color : '',
          onHome: hasParent ? f.onHome === true : f.onHome !== false,
          fields: displayFields(f),
        };
        if (f.summaryFields && f.summaryFields.length) out.summaryFields = f.summaryFields.slice(0, 3);
        if (hasParent) out.parent = { formType: f.parent, field: linkField(f.parent) };
        return out;
      }),
    };
  }

  function configJs(project) {
    return (
      '// Written by the ODE App Builder. Edit in the builder and download again, or edit by hand.\n' +
      'window.ODE_APP_CONFIG = ' +
      JSON.stringify(makeRuntimeConfig(project), null, 2) +
      ';\n'
    );
  }

  /* ------------------------------------------------------------------ */
  /* Form checks                                                         */
  /* ------------------------------------------------------------------ */

  var RULE_EFFECTS = ['SHOW', 'HIDE', 'ENABLE', 'DISABLE'];
  var ODE_FORMATS = [
    'text', 'date', 'date-time', 'time', 'email', 'uri', 'password', 'int', 'adate', 'native_enum',
    'photo', 'audio', 'video', 'gps', 'signature', 'qrcode', 'select_file', 'likert', 'duration',
    'sub-observation', 'ranking', 'html', 'textarea', 'multiline',
  ];
  var LAYOUTS = ['SwipeLayout', 'VerticalLayout', 'HorizontalLayout', 'Group', 'Categorization', 'Category', 'Label', 'Control', 'FinalizeLayout'];

  function parseJson(text, file, out) {
    if (text === null || text === undefined || String(text).trim() === '') {
      out.push(diag('error', 'missing_file', file, '', file + ' is empty. Paste it in.'));
      return null;
    }
    try {
      return JSON.parse(text);
    } catch (e) {
      out.push(diag('error', 'invalid_json', file, '', file + ' is not valid JSON: ' + e.message));
      return null;
    }
  }

  function diag(severity, code, file, path, message) {
    return { severity: severity, code: code, file: file, path: path, message: message };
  }

  function pointer(rootDoc, ptr) {
    if (ptr === '' || ptr === '/') return rootDoc;
    var parts = ptr.split('/').slice(1).map(function (s) {
      return s.replace(/~1/g, '/').replace(/~0/g, '~');
    });
    var node = rootDoc;
    for (var i = 0; i < parts.length; i++) {
      if (node === null || typeof node !== 'object' || !(parts[i] in node)) return undefined;
      node = node[parts[i]];
    }
    return node;
  }

  function resolve(rootDoc, node, segments, depth) {
    if (depth > 32 || node === null || typeof node !== 'object') return undefined;
    if (typeof node.$ref === 'string' && node.$ref.charAt(0) === '#') {
      node = pointer(rootDoc, node.$ref.slice(1));
      if (node === undefined) return undefined;
    }
    if (!segments.length) return node;
    var first = segments[0], rest = segments.slice(1);
    if (node[first] !== undefined) {
      var found = resolve(rootDoc, node[first], rest, depth + 1);
      if (found !== undefined) return found;
    }
    var keys = ['allOf', 'anyOf', 'oneOf'];
    for (var k = 0; k < keys.length; k++) {
      var arr = node[keys[k]];
      if (!Array.isArray(arr)) continue;
      for (var j = 0; j < arr.length; j++) {
        var f = resolve(rootDoc, arr[j], segments, depth + 1);
        if (f !== undefined) return f;
      }
    }
    var cond = ['if', 'then', 'else'];
    for (var c = 0; c < cond.length; c++) {
      if (node[cond[c]]) {
        var g = resolve(rootDoc, node[cond[c]], segments, depth + 1);
        if (g !== undefined) return g;
      }
    }
    return undefined;
  }

  function resolveScope(schema, scope) {
    if (typeof scope !== 'string' || scope.charAt(0) !== '#') return undefined;
    var segs = scope
      .slice(1)
      .split('/')
      .filter(Boolean)
      .map(function (s) {
        return s.replace(/~1/g, '/').replace(/~0/g, '~');
      });
    return resolve(schema, schema, segs, 0);
  }

  function deref(schema, node) {
    var d = 0;
    while (node && typeof node.$ref === 'string' && node.$ref.charAt(0) === '#' && d++ < 32) node = pointer(schema, node.$ref.slice(1));
    return node;
  }

  function choicesOf(schema, node) {
    node = deref(schema, node);
    if (!node || typeof node !== 'object') return null;
    if (Array.isArray(node.enum)) return node.enum.slice();
    var list = node.oneOf || node.anyOf;
    if (Array.isArray(list) && list.length) {
      var vals = [];
      for (var i = 0; i < list.length; i++) {
        var b = deref(schema, list[i]);
        if (!b || !('const' in b)) return null;
        vals.push(b.const);
      }
      return vals;
    }
    return null;
  }

  function sameValue(a, b) {
    return JSON.stringify(a) === JSON.stringify(b);
  }

  /** Collect schema properties (one level, plus nested objects) as dotted paths. */
  function fieldsOf(schema) {
    var out = [];
    function walk(node, prefix, depth) {
      node = deref(schema, node);
      if (!node || depth > 6 || typeof node.properties !== 'object') return;
      Object.keys(node.properties).forEach(function (k) {
        var p = deref(schema, node.properties[k]) || {};
        var path = prefix ? prefix + '.' + k : k;
        out.push({ path: path, node: p });
        if (p.type === 'object' && p.properties && !p.format) walk(p, path, depth + 1);
      });
    }
    walk(schema, '', 0);
    return out;
  }

  /**
   * Check one form. Mirrors ODE Desktop's validator (validate.rs) and adds checks that matter
   * for AI-written forms. Returns { valid, diagnostics, summary }.
   * opts: { formType, knownForms: [..], Ajv: constructor (optional), previousFields: [..] }
   */
  function validateForm(schemaText, uiText, opts) {
    opts = opts || {};
    var out = [];
    var schema = parseJson(schemaText, 'schema.json', out);
    var ui = parseJson(uiText, 'ui.json', out);
    if (opts.formType !== undefined && !isValidFormType(opts.formType)) {
      out.push(diag('error', 'invalid_form_type', 'folder', '', 'Form id "' + opts.formType + '" must start with a letter and use only a-z, 0-9 and _.'));
    }
    if (!schema || !ui) return finish(out, null, null);
    if (typeof schema !== 'object' || Array.isArray(schema)) {
      out.push(diag('error', 'invalid_schema', 'schema.json', '', 'schema.json must be a JSON object.'));
      return finish(out, null, null);
    }

    // JSON Schema itself
    if (opts.Ajv) {
      try {
        var ajv = new opts.Ajv({ strict: false, allErrors: true, validateFormats: false });
        ajv.compile(schema);
      } catch (e) {
        out.push(diag('error', 'invalid_schema', 'schema.json', '', 'schema.json is not a valid JSON Schema: ' + e.message));
      }
    }
    if (schema.type !== 'object') out.push(diag('error', 'root_not_object', 'schema.json', '/type', 'The top of schema.json must have "type": "object".'));
    if (!schema.properties || typeof schema.properties !== 'object' || !Object.keys(schema.properties).length)
      out.push(diag('error', 'no_properties', 'schema.json', '/properties', 'schema.json has no questions ("properties" is empty).'));

    var hasV = 'version' in schema, hasSV = 'schemaVersion' in schema;
    if (!hasV && !hasSV) out.push(diag('warning', 'missing_version', 'schema.json', '', 'Add a top-level "version" (e.g. "1") and bump it on every change to the form.'));
    if (hasV && hasSV && !sameValue(schema.version, schema.schemaVersion))
      out.push(diag('warning', 'version_mismatch', 'schema.json', '/schemaVersion', '"schemaVersion" takes precedence over "version"; keep only one.'));
    ['version', 'schemaVersion'].forEach(function (k) {
      if (k in schema && typeof schema[k] !== 'string') out.push(diag('warning', 'version_not_string', 'schema.json', '/' + k, '"' + k + '" should be a string, e.g. "2".'));
    });

    if (Array.isArray(schema.required)) {
      schema.required.forEach(function (name, i) {
        if (typeof name === 'string' && resolve(schema, schema, ['properties', name], 0) === undefined)
          out.push(diag('error', 'unknown_required', 'schema.json', '/required/' + i, '"' + name + '" is required but is not a question in the form.'));
      });
    }

    var fields = fieldsOf(schema);
    fields.forEach(function (f) {
      var key = f.path.split('.').pop();
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key))
        out.push(diag('warning', 'field_name', 'schema.json', '/properties/' + f.path.replace(/\./g, '/properties/'), 'Field name "' + key + '" should use only letters, digits and _ (snake_case).'));
      if (/^core_/.test(key))
        out.push(diag('warning', 'core_prefix', 'schema.json', '', 'Field "' + key + '" starts with core_, which Synkronus treats as protected.'));
      if (f.node.format && ODE_FORMATS.indexOf(f.node.format) === -1)
        out.push(diag('warning', 'unknown_format', 'schema.json', '', 'Question "' + f.path + '" uses format "' + f.node.format + '", which ODE does not ship. It needs a custom question type, or another format.'));
      if (f.node.format === 'sub-observation') {
        var linked = f.node.linkedForm;
        if (!linked) out.push(diag('error', 'missing_linked_form', 'schema.json', '', 'Sub-observation "' + f.path + '" needs "linkedForm".'));
        else if (opts.knownForms && opts.knownForms.indexOf(linked) === -1)
          out.push(diag('error', 'missing_linked_form', 'schema.json', '', 'Sub-observation "' + f.path + '" links to form "' + linked + '", which is not in this app.'));
      }
      if (!f.node.title && f.path.indexOf('.') === -1)
        out.push(diag('info', 'missing_title', 'schema.json', '', 'Question "' + f.path + '" has no "title" (label).'));
    });

    if (opts.previousFields && opts.previousFields.length) {
      var now = fields.map(function (f) { return f.path; });
      opts.previousFields.forEach(function (p) {
        if (now.indexOf(p) === -1)
          out.push(diag('warning', 'field_removed', 'schema.json', '', 'Field "' + p + '" was in the version already on the server and is now gone. Keep old field names so existing data still matches.'));
      });
    }

    // UI
    if (typeof ui !== 'object' || Array.isArray(ui)) {
      out.push(diag('error', 'invalid_ui', 'ui.json', '', 'ui.json must be a JSON object.'));
      return finish(out, schema, null);
    }
    if (ui.type !== 'SwipeLayout')
      out.push(diag('warning', 'root_not_swipe_layout', 'ui.json', '/type', 'ODE forms should use "SwipeLayout" as the root of ui.json (found ' + (ui.type ? '"' + ui.type + '"' : 'none') + '). Each page is a layout inside it.'));

    var scoped = {};
    var hidden = {};
    function checkCondition(cond, ptr, depth) {
      if (depth > 32 || !cond || typeof cond !== 'object') return;
      if (Array.isArray(cond.conditions)) {
        cond.conditions.forEach(function (c, i) { checkCondition(c, ptr + '/conditions/' + i, depth + 1); });
        return;
      }
      if (typeof cond.scope !== 'string') {
        out.push(diag('error', 'invalid_rule_scope', 'ui.json', ptr, 'A rule condition has no "scope".'));
        return;
      }
      var target = resolveScope(schema, cond.scope);
      if (target === undefined) {
        out.push(diag('error', 'invalid_rule_scope', 'ui.json', ptr + '/scope', 'A rule looks at "' + cond.scope + '", which is not a question in schema.json.'));
        return;
      }
      if (!('schema' in cond)) {
        if (!('expectedValue' in cond)) out.push(diag('error', 'missing_rule_schema', 'ui.json', ptr, 'A rule condition needs a "schema", e.g. {"const": "1"}.'));
        return;
      }
      var t = deref(schema, target) || {};
      if (t.items) t = t.items;
      var choices = choicesOf(schema, t);
      if (!choices) return;
      var cs = cond.schema && cond.schema.contains ? cond.schema.contains : cond.schema || {};
      var vals = [];
      if ('const' in cs) vals.push(cs.const);
      if (Array.isArray(cs.enum)) vals = vals.concat(cs.enum);
      vals.forEach(function (v) {
        if (!choices.some(function (c) { return sameValue(c, v); }))
          out.push(diag('warning', 'rule_value_not_a_choice', 'ui.json', ptr + '/schema', 'A rule on "' + ((deref(schema, target) || {}).title || cond.scope.replace('#/properties/', '')) + '" checks for ' + JSON.stringify(v) + ', which is not one of its choices (' + choices.map(function (c) { return JSON.stringify(c); }).join(', ') + '). Check the type, e.g. 1 vs "1".'));
      });
    }
    function checkRule(rule, ptr) {
      if (RULE_EFFECTS.indexOf(rule.effect) === -1)
        out.push(diag('error', 'invalid_rule_effect', 'ui.json', ptr + '/effect', 'Rule effect must be one of ' + RULE_EFFECTS.join(', ') + ' (found ' + (rule.effect ? '"' + rule.effect + '"' : 'none') + ').'));
      if (!rule.condition) out.push(diag('error', 'missing_rule_condition', 'ui.json', ptr, 'A rule has no "condition".'));
      else checkCondition(rule.condition, ptr + '/condition', 0);
    }
    function walk(el, ptr, depth, conditional) {
      if (depth > 32 || !el || typeof el !== 'object') return;
      if (!el.type) out.push(diag('error', 'missing_type', 'ui.json', ptr, 'A UI element has no "type".'));
      else if (LAYOUTS.indexOf(el.type) === -1) out.push(diag('info', 'unknown_ui_type', 'ui.json', ptr, 'UI element type "' + el.type + '" is not a standard ODE layout.'));
      var cond = conditional || (el.rule && (el.rule.effect === 'SHOW' || el.rule.effect === 'HIDE'));
      if (el.type === 'Control') {
        if (typeof el.scope !== 'string') out.push(diag('error', 'missing_scope', 'ui.json', ptr, 'A Control has no "scope".'));
        else if (resolveScope(schema, el.scope) === undefined)
          out.push(diag('error', 'invalid_scope', 'ui.json', ptr + '/scope', 'Control "' + el.scope + '" does not match a question in schema.json.'));
        else {
          var m = /^#\/properties\/([^/]+)$/.exec(el.scope);
          if (m) {
            scoped[m[1]] = true;
            if (cond) hidden[m[1]] = true;
          }
        }
      }
      if (el.rule) checkRule(el.rule, ptr + '/rule');
      if (Array.isArray(el.elements)) el.elements.forEach(function (c, i) { walk(c, ptr + '/elements/' + i, depth + 1, cond); });
    }
    walk(ui, '', 0, false);

    if (Array.isArray(schema.required)) {
      schema.required.forEach(function (name) {
        if (hidden[name])
          out.push(diag('error', 'required_but_conditional', 'schema.json', '/required', '"' + name + '" can be hidden by a rule but is in the top-level "required". Collectors could get stuck. Move it into an if/then "required" instead.'));
      });
    }
    Object.keys(schema.properties || {}).forEach(function (k) {
      var p = deref(schema, schema.properties[k]) || {};
      if (!scoped[k] && !p.readOnly)
        out.push(diag('info', 'not_on_screen', 'ui.json', '', 'Question "' + k + '" is in schema.json but not shown in ui.json.'));
    });

    return finish(out, schema, ui);
  }

  function finish(out, schema, ui) {
    var summary = null;
    if (schema && ui) summary = summarizeForm(schema, ui);
    return {
      valid: !out.some(function (d) { return d.severity === 'error'; }),
      diagnostics: out,
      summary: summary,
    };
  }

  function summarizeForm(schema, ui) {
    var pages = 0, rules = 0, langs = {};
    function walk(el, depth) {
      if (!el || typeof el !== 'object' || depth > 32) return;
      if (depth === 1 && el.type !== 'Control') pages++;
      if (el.rule) rules++;
      if (el.translations && typeof el.translations === 'object') Object.keys(el.translations).forEach(function (l) { langs[l] = true; });
      (el.elements || []).forEach(function (c) { walk(c, depth + 1); });
    }
    walk(ui, 0);
    if (ui.type !== 'SwipeLayout') pages = 1;
    var fields = fieldsOf(schema).filter(function (f) { return f.path.indexOf('.') === -1; });
    return {
      title: schema.title || '',
      version: schema.version || schema.schemaVersion || '',
      pages: Math.max(pages, 1),
      questions: fields.length,
      required: Array.isArray(schema.required) ? schema.required.length : 0,
      rules: rules,
      languages: Object.keys(langs),
      fields: fields.map(function (f) {
        return { name: f.path, title: f.node.title || '', type: f.node.format || f.node.type || (choicesOf(schema, f.node) ? 'choice' : '') };
      }),
    };
  }

  /* ------------------------------------------------------------------ */
  /* AI prompt and paste-back                                            */
  /* ------------------------------------------------------------------ */

  var EXAMPLE_SCHEMA = {
    $schema: 'http://json-schema.org/draft-07/schema#',
    title: 'My first form',
    version: '1',
    type: 'object',
    properties: {
      visit_date: { type: 'string', format: 'date', title: 'Visit date' },
      consent: { type: 'string', title: 'Does the household agree to take part?', oneOf: [{ const: '1', title: 'Yes' }, { const: '2', title: 'No' }] },
      reason_no_consent: { type: 'string', title: 'Why not?' },
      household_size: { type: 'integer', minimum: 1, maximum: 50, title: 'How many people live in the household?' },
    },
    required: ['visit_date', 'consent'],
  };
  var EXAMPLE_UI = {
    type: 'SwipeLayout',
    options: { headerTitle: 'My first form' },
    translations: { pt: { headerTitle: 'Meu primeiro formulário' } },
    elements: [
      {
        type: 'VerticalLayout',
        elements: [
          { type: 'Control', scope: '#/properties/visit_date', label: 'Visit date', translations: { pt: { label: 'Data da visita' } } },
          { type: 'Control', scope: '#/properties/consent', label: 'Does the household agree to take part?', translations: { pt: { label: 'O agregado aceita participar?' } } },
          {
            type: 'Control',
            scope: '#/properties/reason_no_consent',
            label: 'Why not?',
            rule: { effect: 'SHOW', condition: { scope: '#/properties/consent', schema: { const: '2' } } },
          },
        ],
      },
      {
        type: 'VerticalLayout',
        rule: { effect: 'SHOW', condition: { scope: '#/properties/consent', schema: { const: '1' } } },
        elements: [{ type: 'Control', scope: '#/properties/household_size', label: 'How many people live in the household?' }],
      },
    ],
  };

  var RULES_TEXT = [
    '1. Return exactly two files for the form: schema.json (JSON Schema draft-07: what is collected) and ui.json (JSON Forms UI schema: how it is shown).',
    '2. schema.json: top-level "type": "object", "$schema": "http://json-schema.org/draft-07/schema#", a "title", and a string "version" (start at "1"; when changing an existing form, add 1).',
    '3. Field names: short snake_case, letters/digits/_ only, never starting with core_. They become data column names, so make them meaningful and stable.',
    '4. Every question has a "title" (its label in the main language).',
    '5. Single choice: "type": "string" with "oneOf": [{"const": "code", "title": "Label"}, ...]. Use short stable codes. Multiple choice: "type": "array", "uniqueItems": true, "items": {"type": "string", "oneOf": [...]}.',
    '6. Numbers: "type": "integer" or "number" with "minimum"/"maximum" where it makes sense. Text: "type": "string" (use "maxLength" if useful).',
    '7. ODE question types use "format": date, date-time, time, email, photo (type object), signature (type object), select_file (type object), audio (type string), video (type string), gps (type string), qrcode (type string), likert (type integer, with a "likert" object such as {"preset": "agreement"}), duration, sub-observation (type array, with "linkedForm"). Do not invent other formats.',
    '8. ui.json root is {"type": "SwipeLayout", "options": {"headerTitle": "..."}, "elements": [...]} . Each element of the root is one page (screen): a "VerticalLayout" (optionally "Group" with a "label") holding "Control" elements. Keep pages short: about 3 to 7 questions.',
    '9. Every Control has "scope": "#/properties/<field>" pointing at a real field, and a "label".',
    '10. Skip logic goes on the Control or page in ui.json: "rule": {"effect": "SHOW", "condition": {"scope": "#/properties/<field>", "schema": {"const": "<code>"}}}. Effects: SHOW, HIDE, ENABLE, DISABLE. The value must match the choice code AND its type ("1" is not 1). Combine with {"type": "AND" | "OR", "conditions": [...]}. For multiple choice use {"contains": {"const": "<code>"}}.',
    '11. A question that can be hidden by a rule must NOT be in the top-level "required". If it must be answered whenever shown, use "allOf": [{"if": {...}, "then": {"required": [...]}}] in schema.json.',
    '12. Translations: for each extra language, add "translations": {"<lang>": {"label": "..."}} on Controls (and {"headerTitle": "..."} on the root). Translate choice labels with "options": {"oneOf": [{"const": "...", "title": "..."}]} inside that language\'s entry.',
    '13. Do not rename or remove fields of a form that is already in use; add new fields instead, and never reuse a choice code with a new meaning.',
  ].join('\n');

  function buildPrompt(project, form, opts) {
    opts = opts || {};
    var langs = [project.app.defaultLocale || 'en'].concat(form.languages || []).filter(function (l, i, a) { return a.indexOf(l) === i; });
    var editing = !!(form.schemaText && form.uiText && opts.mode !== 'new');
    var lines = [];
    lines.push('You are helping me write a data collection form for an Open Data Ensemble (ODE) app. ODE forms run in the Formulus mobile app (Formplayer). Please write the form files following the ODE rules below exactly.');
    lines.push('');
    lines.push('## The form');
    lines.push('- App: ' + project.app.name);
    lines.push('- Form id (folder name, do not change): ' + form.formType);
    lines.push('- Form title: ' + form.title);
    lines.push('- Main language: ' + langName(langs[0]) + ' (' + langs[0] + ')');
    if (langs.length > 1)
      lines.push('- Also translate into: ' + langs.slice(1).map(function (l) { return langName(l) + ' (' + l + ')'; }).join(', '));
    if (form.parent) {
      var lf = linkField(form.parent);
      lines.push('- Each record of this form belongs to one "' + form.parent + '" record. The app fills in the link: keep a text field "' + lf + '" (type string, title "' + form.parent.replace(/_/g, ' ') + '") as the first question on page 1, with "options": { "readonly": true } on its Control, and do not make it required.');
    }
    lines.push('');
    lines.push('## What the form should do (my description)');
    lines.push((form.brief || '').trim() || '(No description written yet.)');
    lines.push('');
    if (editing) {
      lines.push('## The current version of this form');
      lines.push('Change it as described above. Keep existing field names and choice codes, and increase "version" by 1.');
      lines.push('');
      lines.push('```json schema.json');
      lines.push(prettyJson(form.schemaText));
      lines.push('```');
      lines.push('');
      lines.push('```json ui.json');
      lines.push(prettyJson(form.uiText));
      lines.push('```');
      lines.push('');
    }
    lines.push('## ODE form rules');
    lines.push(RULES_TEXT);
    lines.push('');
    lines.push('## A correct example (another form, for the shape only)');
    lines.push('```json schema.json');
    lines.push(JSON.stringify(EXAMPLE_SCHEMA, null, 2));
    lines.push('```');
    lines.push('```json ui.json');
    lines.push(JSON.stringify(EXAMPLE_UI, null, 2));
    lines.push('```');
    lines.push('');
    lines.push('## How to answer');
    lines.push('- If something important in my description is unclear (for example the choices for a question), make a sensible choice and list your assumptions in one short list.');
    lines.push('- Then give exactly two code blocks: first one starting with ```json schema.json and then one starting with ```json ui.json . Each must be complete, valid JSON with no comments.');
    lines.push('- Reference: https://opendataensemble.org/docs/reference/form-specifications');
    return lines.join('\n');
  }

  function buildFixPrompt(form, result) {
    var lines = ['The ODE App Builder found problems in the form files you wrote for "' + form.title + '" (' + form.formType + '). Please fix them and send both complete files again, as two code blocks: ```json schema.json and ```json ui.json . Keep everything else the same.', ''];
    result.diagnostics
      .filter(function (d) { return d.severity !== 'info'; })
      .forEach(function (d) {
        lines.push('- [' + d.file + (d.path ? ' ' + d.path : '') + '] ' + d.message);
      });
    return lines.join('\n');
  }

  function langName(l) {
    return LOCALES[l] || l;
  }

  function prettyJson(text) {
    try {
      return JSON.stringify(JSON.parse(text), null, 2);
    } catch (e) {
      return String(text || '');
    }
  }

  /**
   * Pull schema.json and ui.json out of whatever the person pasted: a whole AI answer with code
   * blocks, or the bare JSON of one file. Returns { schema, ui } as strings (either may be null).
   */
  function extractForm(text) {
    text = String(text || '');
    var res = { schema: null, ui: null };
    var blocks = [];
    var re = /```([^\n`]*)\n([\s\S]*?)```/g;
    var m;
    while ((m = re.exec(text))) blocks.push({ info: m[1].toLowerCase(), body: m[2].trim() });
    if (!blocks.length) {
      var objs = topLevelObjects(text);
      blocks = objs.map(function (o) { return { info: '', body: o }; });
    }
    var before = '';
    blocks.forEach(function (b) {
      var json;
      try {
        json = JSON.parse(b.body);
      } catch (e) {
        json = null;
      }
      var info = b.info;
      var isUi = /ui\.json|\bui\b/.test(info) || (json && typeof json.type === 'string' && /Layout|Control/.test(json.type));
      var isSchema = /schema\.json|\bschema\b/.test(info) && !/ui/.test(info) || (json && json.type === 'object' && json.properties);
      if (isUi && !res.ui) res.ui = b.body;
      else if (isSchema && !res.schema) res.schema = b.body;
      before = info;
    });
    return res;
  }

  function topLevelObjects(text) {
    var out = [], depth = 0, start = -1, inStr = false, esc = false;
    for (var i = 0; i < text.length; i++) {
      var ch = text[i];
      if (inStr) {
        if (esc) esc = false;
        else if (ch === '\\') esc = true;
        else if (ch === '"') inStr = false;
        continue;
      }
      if (ch === '"') inStr = depth > 0;
      else if (ch === '{') {
        if (depth === 0) start = i;
        depth++;
      } else if (ch === '}' && depth > 0) {
        depth--;
        if (depth === 0 && start >= 0) out.push(text.slice(start, i + 1));
      }
    }
    return out;
  }

  /* ------------------------------------------------------------------ */
  /* Whole-app checks                                                    */
  /* ------------------------------------------------------------------ */

  function checkProject(project, Ajv) {
    var problems = [];
    if (!String(project.app.name || '').trim()) problems.push({ severity: 'error', where: 'Brand', message: 'Give the app a name.' });
    paletteWarnings(project).forEach(function (m) { problems.push({ severity: 'warning', where: 'Brand', message: m }); });
    if (!project.forms.length) problems.push({ severity: 'error', where: 'Forms', message: 'Add at least one form.' });
    var seen = {};
    var known = project.forms.map(function (f) { return f.formType; });
    var formResults = {};
    project.forms.forEach(function (f) {
      if (seen[f.formType]) problems.push({ severity: 'error', where: f.title, message: 'Two forms use the id "' + f.formType + '". Each form needs its own id.' });
      seen[f.formType] = true;
      var r = validateForm(f.schemaText, f.uiText, { formType: f.formType, knownForms: known, Ajv: Ajv, previousFields: f.lastUploadedFields });
      formResults[f.formType] = r;
      if (f.parent && known.indexOf(f.parent) !== -1 && f.parent !== f.formType) {
        var lf = linkField(f.parent), props = {};
        try { props = JSON.parse(f.schemaText).properties || {}; } catch (e) { /* reported above */ }
        if (!props[lf]) problems.push({ severity: 'error', where: f.title, message: 'This form belongs to "' + f.parent + '", so it needs a read-only text question named "' + lf + '". The question editor adds it for you.', form: f.formType });
      }
      if (f.parent && known.indexOf(f.parent) === -1) problems.push({ severity: 'warning', where: f.title, message: 'It belongs to "' + f.parent + '", which is not in this app any more.', form: f.formType });
      r.diagnostics.forEach(function (d) {
        if (d.severity !== 'info') problems.push({ severity: d.severity, where: f.title, message: d.message, form: f.formType });
      });
    });
    return {
      ok: !problems.some(function (p) { return p.severity === 'error'; }),
      problems: problems,
      forms: formResults,
    };
  }

  /* ------------------------------------------------------------------ */
  /* Files and zips                                                      */
  /* ------------------------------------------------------------------ */

  function dataUrlToBytes(dataUrl) {
    var m = /^data:([^;,]+)?(;base64)?,(.*)$/.exec(dataUrl || '');
    if (!m) return null;
    if (m[2]) {
      var bin = typeof atob === 'function' ? atob(m[3]) : Buffer.from(m[3], 'base64').toString('binary');
      var bytes = new Uint8Array(bin.length);
      for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      return bytes;
    }
    var s = decodeURIComponent(m[3]);
    return typeof TextEncoder !== 'undefined' ? new TextEncoder().encode(s) : Buffer.from(s, 'utf8');
  }

  function formJson(text) {
    return JSON.stringify(JSON.parse(text), null, 2) + '\n';
  }

  /**
   * Files of the Synkronus app bundle: { path: string | Uint8Array }.
   * Layout: app/ (runtime + config + logo) and forms/<formType>/{schema,ui}.json as siblings.
   */
  function bundleFiles(project, templates) {
    var tpl = templates[project.template || 'simple'];
    if (!tpl) throw new Error('Unknown app template "' + project.template + '".');
    var files = {};
    Object.keys(tpl.runtime).forEach(function (p) {
      files['app/' + p] = tpl.runtime[p];
    });
    files['app/config.js'] = configJs(project);
    files['app/app.config.json'] = JSON.stringify(makeAppConfig(project), null, 2) + '\n';
    files['app/odeapp.json'] = projectFileText(project, { stripForms: true });
    var logo = logoFileName(project);
    if (logo) files['app/' + logo] = dataUrlToBytes(project.app.logo.dataUrl);
    project.forms.forEach(function (f) {
      files['forms/' + f.formType + '/schema.json'] = formJson(f.schemaText);
      files['forms/' + f.formType + '/ui.json'] = formJson(f.uiText);
    });
    return files;
  }

  /** Files of the source project (custom_app template layout, ready for git and npm). */
  function sourceFiles(project, templates) {
    var tpl = templates[project.template || 'simple'];
    var files = {};
    var vars = {
      APP_NAME: project.app.name,
      APP_SLUG: slugify(project.app.name).replace(/_/g, '-'),
      APP_DESCRIPTION: project.app.description || 'ODE custom app made with the ODE App Builder',
      APP_VERSION: project.app.version || '1.0.0',
      BUILDER_VERSION: BUILDER_VERSION,
      FORM_LIST: project.forms.map(function (f) { return '| `' + f.formType + '` | ' + f.title + ' |'; }).join('\n') || '| (none yet) | |',
    };
    Object.keys(tpl.source).forEach(function (p) {
      var c = tpl.source[p];
      if (typeof c === 'string')
        c = c.replace(/\{\{(\w+)\}\}/g, function (all, k) {
          return k in vars ? vars[k] : all;
        });
      files[p] = c;
    });
    Object.keys(tpl.runtime).forEach(function (p) {
      files['app/' + p] = tpl.runtime[p];
    });
    files['app/config.js'] = configJs(project);
    files['app/app.config.json'] = JSON.stringify(makeAppConfig(project), null, 2) + '\n';
    var logo = logoFileName(project);
    if (logo) files['app/' + logo] = dataUrlToBytes(project.app.logo.dataUrl);
    project.forms.forEach(function (f) {
      files['forms/' + f.formType + '/schema.json'] = f.schemaText ? formJson(f.schemaText) : '{}\n';
      files['forms/' + f.formType + '/ui.json'] = f.uiText ? formJson(f.uiText) : '{}\n';
      if (f.brief) files['forms/' + f.formType + '/BRIEF.md'] = '# ' + f.title + '\n\nPlain-language description used to write this form.\n\n' + f.brief.trim() + '\n';
    });
    files['odeapp.json'] = projectFileText(project);
    return files;
  }

  function addToZip(zip, files, prefix) {
    var date = new Date('2026-01-01T00:00:00Z');
    Object.keys(files)
      .sort()
      .forEach(function (p) {
        zip.file((prefix || '') + p, files[p], { date: date, createFolders: false });
      });
    return zip;
  }

  function fileBase(project) {
    var name = slugify(project.app.name).replace(/_/g, '-');
    var v = String(project.app.version || '1.0.0').replace(/[^0-9A-Za-z.-]+/g, '-');
    return name + '_v' + v;
  }
  function fileNames(project) {
    var b = fileBase(project);
    return { bundle: b + '_bundle.zip', source: b + '_source.zip', project: slugify(project.app.name).replace(/_/g, '-') + '.odeapp.json' };
  }

  function bundleZip(JSZip, project, templates) {
    return addToZip(new JSZip(), bundleFiles(project, templates));
  }

  function sourceZip(JSZip, project, templates) {
    var dir = slugify(project.app.name).replace(/_/g, '-') + '/';
    return addToZip(new JSZip(), sourceFiles(project, templates), dir);
  }

  function projectFileText(project, opts) {
    var copy = JSON.parse(JSON.stringify(project));
    copy.format = PROJECT_FORMAT;
    copy.builderVersion = BUILDER_VERSION;
    copy.savedAt = new Date().toISOString();
    if (opts && opts.stripForms) {
      // Inside the bundle: the forms are already in forms/, keep only the briefs and settings.
      copy.forms.forEach(function (f) {
        delete f.schemaText;
        delete f.uiText;
      });
      if (copy.app.logo) copy.app.logo = { name: copy.app.logo.name, inBundle: logoFileName(project) };
    }
    return JSON.stringify(copy, null, 2) + '\n';
  }

  function parseProject(text) {
    var p = JSON.parse(text);
    if (!p || typeof p !== 'object' || !p.app || !Array.isArray(p.forms)) throw new Error('This is not an ODE App Builder project file.');
    return normalizeProject(p);
  }

  // Projects made before line icons used emoji; map the ones the builder offered.
  var EMOJI_ICONS = { '📝': 'clipboard-list', '🏠': 'house', '🩺': 'stethoscope', '💉': 'syringe', '🧪': 'test-tube', '👶': 'baby', '👩': 'user', '👨‍🌾': 'user', '🌾': 'wheat', '🐄': 'milk', '🐟': 'fish', '💧': 'droplets', '🦟': 'bug', '🏫': 'school', '📚': 'book-open', '🏥': 'hospital', '💊': 'pill', '📍': 'map-pin', '🗺️': 'map', '📷': 'camera', '📦': 'package', '💰': 'wallet', '🛒': 'shopping-cart', '🌳': 'trees', '♻️': 'recycle', '⚡': 'zap', '🚰': 'droplets', '📋': 'clipboard-list', '✅': 'clipboard-check', '⭐': 'star' };

  function normalizeProject(p) {
    var base = newProject();
    var out = Object.assign(base, p);
    out.app = Object.assign(newProject().app, p.app || {});
    out.brand = Object.assign(newProject().brand, p.brand || {});
    out.home = Object.assign(newProject().home, p.home || {});
    if (!p.home || !p.home.design) out.home.design = out.home.layout === 'list' ? 'list' : 'grid';
    out.navigation = Object.assign(newProject().navigation, p.navigation || {});
    out.forms = (p.forms || []).map(function (f) {
      var nf = Object.assign(newForm(f.title), f);
      if (EMOJI_ICONS[nf.icon]) nf.icon = EMOJI_ICONS[nf.icon];
      return nf;
    });
    return out;
  }

  /**
   * Re-open a bundle zip (made by the builder or any ODE bundle). Reads forms from forms/ or
   * app/forms/, settings from app/odeapp.json or app/app.config.json.
   */
  async function projectFromBundle(JSZip, data) {
    var zip = await JSZip.loadAsync(data);
    var names = Object.keys(zip.files);
    var project = newProject();
    var saved = zip.file('app/odeapp.json');
    if (saved) project = parseProject(await saved.async('string'));
    else {
      var cfgFile = zip.file('app/app.config.json');
      if (cfgFile) {
        try {
          var cfg = JSON.parse(await cfgFile.async('string'));
          if (cfg.name) project.app.name = cfg.name;
          if (cfg.version) project.app.version = cfg.version;
          if (cfg.defaultLocale) project.app.defaultLocale = cfg.defaultLocale;
          if (cfg.theme && cfg.theme.light) {
            project.brand.primary = cfg.theme.light.primary || project.brand.primary;
            project.brand.secondary = cfg.theme.light.secondary || project.brand.secondary;
          }
          if (cfg.navigation && Array.isArray(cfg.navigation.tabs)) project.navigation.tabs = cfg.navigation.tabs;
        } catch (e) { /* ignore */ }
      }
      project.forms = [];
    }
    if (project.app.logo && project.app.logo.inBundle) {
      var lf = zip.file('app/' + project.app.logo.inBundle);
      if (lf) {
        var b64 = await lf.async('base64');
        var ext = project.app.logo.inBundle.split('.').pop();
        var mime = ext === 'svg' ? 'image/svg+xml' : ext === 'jpg' ? 'image/jpeg' : 'image/' + ext;
        project.app.logo = { name: project.app.logo.name || project.app.logo.inBundle, dataUrl: 'data:' + mime + ';base64,' + b64 };
      } else project.app.logo = null;
    }
    var formTypes = {};
    names.forEach(function (n) {
      var m = /^(?:app\/)?forms\/([^/]+)\/(schema|ui)\.json$/.exec(n);
      if (m) formTypes[m[1]] = true;
    });
    for (var ft in formTypes) {
      var sf = zip.file('forms/' + ft + '/schema.json') || zip.file('app/forms/' + ft + '/schema.json');
      var uf = zip.file('forms/' + ft + '/ui.json') || zip.file('app/forms/' + ft + '/ui.json');
      var schemaText = sf ? await sf.async('string') : '';
      var uiText = uf ? await uf.async('string') : '';
      var form = project.forms.filter(function (f) { return f.formType === ft; })[0];
      if (!form) {
        var title = ft;
        try { title = JSON.parse(schemaText).title || ft; } catch (e) { /* ignore */ }
        form = newForm(title);
        form.formType = ft;
        project.forms.push(form);
      }
      form.schemaText = schemaText;
      form.uiText = uiText;
      try {
        var s = JSON.parse(schemaText);
        form.lastUploadedFields = fieldsOf(s).map(function (f) { return f.path; });
      } catch (e) { /* ignore */ }
    }
    project.forms = project.forms.filter(function (f) { return formTypes[f.formType] || f.schemaText; });
    return project;
  }

  return {
    BUILDER_VERSION: BUILDER_VERSION,
    LOCALES: LOCALES,
    TABS: TABS,
    ODE_FORMATS: ODE_FORMATS,
    newProject: newProject,
    newForm: newForm,
    linkField: linkField,
    displayFields: displayFields,
    normalizeProject: normalizeProject,
    slugify: slugify,
    isValidFormType: isValidFormType,
    makePalette: makePalette,
    contrast: contrast,
    onColor: onColor,
    isHex: isHex,
    paletteWarnings: paletteWarnings,
    makeAppConfig: makeAppConfig,
    makeRuntimeConfig: makeRuntimeConfig,
    configJs: configJs,
    validateForm: validateForm,
    summarizeForm: summarizeForm,
    checkProject: checkProject,
    buildPrompt: buildPrompt,
    buildFixPrompt: buildFixPrompt,
    extractForm: extractForm,
    bundleFiles: bundleFiles,
    sourceFiles: sourceFiles,
    bundleZip: bundleZip,
    sourceZip: sourceZip,
    projectFileText: projectFileText,
    parseProject: parseProject,
    projectFromBundle: projectFromBundle,
    logoFileName: logoFileName,
    fileNames: fileNames,
  };
});
