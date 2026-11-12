/*
 * ODE App Builder form model: a simple, editable description of a form that turns into
 * ODE's schema.json + ui.json (compileForm) and is read back from them (parseForm).
 *
 * model = {
 *   title, titles: {lang: text}, version: "1",
 *   pages: [{ title, titles, showIf, questions: [question] }]
 * }
 * question = {
 *   name, type, label, labels: {lang}, hint, hints: {lang}, required, readOnly,
 *   choices: [{ value, label, labels: {lang} }], min, max, showIf,
 *   schemaExtra: {...}, uiOptions: {...}   // kept as-is so nothing is lost on a round trip
 * }
 * showIf = { match: 'all' | 'any', rules: [{ q, op, value }] }
 *   op: eq, neq, includes, gt, gte, lt, lte, answered
 *
 * Runs in the browser (window.OdeFormModel) and in Node (module.exports).
 */
(function (root, factory) {
  var lib = factory();
  if (typeof module === 'object' && module.exports) module.exports = lib;
  else root.OdeFormModel = lib;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* Question types people can pick. `group` drives the picker; `schema` is the base node. */
  var TYPES = [
    { id: 'text', name: 'Short text', group: 'Text', icon: 'type', schema: { type: 'string' }, what: 'A name, a village, a short answer.', ask: 'Name of the person (short text)' },
    { id: 'longtext', name: 'Long text', group: 'Text', icon: 'align-left', schema: { type: 'string' }, ui: { multi: true }, what: 'Several lines: comments, a description.', ask: 'Comments (long text)' },
    { id: 'phone', name: 'Phone number', group: 'Text', icon: 'phone', schema: { type: 'string', pattern: '^[+0-9 ()-]{6,20}$' }, what: 'Digits, spaces and + only.', ask: 'Phone number (phone)' },
    { id: 'email', name: 'Email', group: 'Text', icon: 'mail', schema: { type: 'string', format: 'email' }, what: 'Checked to look like an email address.', ask: 'Email address (email)' },
    { id: 'note', name: 'Note', group: 'Text', icon: 'info', note: true, what: 'Text only, no answer: instructions or a summary. Can show earlier answers, like {{village}}.', ask: 'Note: "Explain the purpose of the visit before you start."' },
    { id: 'integer', name: 'Whole number', group: 'Numbers', icon: 'hash', schema: { type: 'integer' }, range: true, what: 'Counts and ages, with an optional smallest and largest value. Shows + and − buttons.', ask: 'Age in years (whole number from 0 to 120)' },
    { id: 'decimal', name: 'Decimal number', group: 'Numbers', icon: 'percent', schema: { type: 'number' }, range: true, what: 'Weights, sizes, money.', ask: 'Weight in kg (decimal, 0.5 to 200)' },
    { id: 'select_one', name: 'Pick one', group: 'Choices', icon: 'circle-dot', choices: true, what: 'One answer from a list. Yes / No is a pick-one with two choices.', ask: 'Main water source (pick one: tap, borehole, river, other)' },
    { id: 'select_many', name: 'Pick several', group: 'Choices', icon: 'list-checks', choices: true, range: true, what: 'Any number of answers from a list.', ask: 'Symptoms (pick all that apply: fever, cough, rash, other)' },
    { id: 'likert', name: 'Rating scale', group: 'Choices', icon: 'gauge', choices: true, numeric: true, schema: { type: 'integer', format: 'likert' }, what: 'Agreement, satisfaction or a 1 to 5 score, shown as a row of buttons.', ask: 'How satisfied are you with the service? (rating scale 1 to 5, very dissatisfied to very satisfied)' },
    { id: 'date', name: 'Date', group: 'Date and time', icon: 'calendar', schema: { type: 'string', format: 'date' }, what: 'A calendar date.', ask: 'Date of visit (date)' },
    { id: 'time', name: 'Time', group: 'Date and time', icon: 'clock', schema: { type: 'string', format: 'time' }, what: 'A time of day.', ask: 'Time of arrival (time)' },
    { id: 'datetime', name: 'Date and time', group: 'Date and time', icon: 'calendar-clock', schema: { type: 'string', format: 'date-time' }, what: 'A date with a time.', ask: 'When did it happen? (date and time)' },
    { id: 'adate', name: 'Approximate date', group: 'Date and time', icon: 'calendar-range', schema: { type: 'string', format: 'adate' }, what: 'For when only the year, or year and month, are known, like a date of birth.', ask: 'Date of birth (approximate date)' },
    { id: 'duration', name: 'Timer', group: 'Date and time', icon: 'timer', schema: { type: 'number', format: 'duration', minimum: 0, duration: { mode: 'stopwatch', unit: 'seconds', allowManualEntry: true } }, what: 'A stopwatch the collector starts and stops, or a typed duration.', ask: 'Time taken to walk to the water point (timer)' },
    { id: 'photo', name: 'Photo', group: 'Media and location', icon: 'camera', schema: { type: 'object', format: 'photo' }, what: 'Take a picture with the camera.', ask: 'Photo of the house (photo)' },
    { id: 'gps', name: 'GPS location', group: 'Media and location', icon: 'map-pin', schema: { type: 'string', format: 'gps' }, what: 'Records where the collector is standing.', ask: 'Location of the house (GPS)' },
    { id: 'signature', name: 'Signature', group: 'Media and location', icon: 'pen-line', schema: { type: 'object', format: 'signature' }, what: 'Sign with a finger on the screen.', ask: 'Signature of the respondent (signature)' },
    { id: 'audio', name: 'Audio recording', group: 'Media and location', icon: 'mic', schema: { type: 'string', format: 'audio' }, what: 'Record sound with the microphone.', ask: 'Voice note (audio)' },
    { id: 'video', name: 'Video', group: 'Media and location', icon: 'video', schema: { type: 'string', format: 'video' }, what: 'Record a short video.', ask: 'Video of the demonstration (video)' },
    { id: 'qrcode', name: 'Barcode / QR scan', group: 'Media and location', icon: 'scan-line', schema: { type: 'string', format: 'qrcode' }, what: 'Scan a QR code or barcode with the camera.', ask: 'Scan the ID card (QR / barcode scan)' },
    { id: 'file', name: 'File', group: 'Media and location', icon: 'paperclip', schema: { type: 'object', format: 'select_file' }, what: 'Attach a document from the phone.', ask: 'Attach the referral letter (file)' },
  ];
  /* ODE question types the AI can write but the question editor does not build (yet). */
  var AI_ONLY_TYPES = [
    { id: 'repeat', name: 'Repeating records', group: 'Structure', icon: 'layers', what: 'A list of entries inside one record, each filled with another form. For example, every member of a household.', ask: 'Household members (repeat the "person" form for each member)' },
    { id: 'dynamic', name: 'Choices from saved records', group: 'Structure', icon: 'list', what: 'A pick-one whose choices are records already saved on the phone, like picking a household.', ask: 'Which household? (pick one from saved "household" records, show the head of household name)' },
  ];
  var TYPE_BY_ID = {};
  TYPES.forEach(function (t) { TYPE_BY_ID[t.id] = t; });

  var OPS = {
    eq: 'is',
    neq: 'is not',
    includes: 'includes',
    gt: 'is more than',
    gte: 'is at least',
    lt: 'is less than',
    lte: 'is at most',
    answered: 'is answered',
  };

  function clone(x) { return x === undefined ? undefined : JSON.parse(JSON.stringify(x)); }
  function isEmptyObj(o) { return !o || typeof o !== 'object' || Object.keys(o).length === 0; }
  function nonEmpty(o) {
    var out = {};
    Object.keys(o || {}).forEach(function (k) { if (o[k] !== undefined && o[k] !== null && o[k] !== '') out[k] = o[k]; });
    return out;
  }

  function slugName(text, taken) {
    var base = String(text || '')
      .normalize('NFKD').replace(/[̀-ͯ]/g, '')
      .toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
      .split('_').slice(0, 5).join('_').slice(0, 40).replace(/_+$/, '');
    if (!base || !/^[a-z]/.test(base)) base = 'q_' + (base || '1');
    var name = base, i = 2;
    while (taken && taken.indexOf(name) !== -1) name = base + '_' + i++;
    return name;
  }

  function newModel(title) {
    return { title: title || 'New form', titles: {}, version: '1', pages: [newPage()] };
  }
  function newPage(title) {
    return { title: title || '', titles: {}, showIf: null, questions: [] };
  }
  function newQuestion(type, taken, label) {
    var t = TYPE_BY_ID[type] || TYPE_BY_ID.text;
    var q = { name: '', type: t.id, label: label || '', labels: {}, hint: '', hints: {}, required: false, showIf: null };
    if (t.id === 'likert') q.choices = ['Very poor', 'Poor', 'Fair', 'Good', 'Very good'].map(function (l, i) { return { value: String(i + 1), label: l, labels: {} }; });
    else if (t.choices) q.choices = [{ value: 'yes', label: 'Yes', labels: {} }, { value: 'no', label: 'No', labels: {} }];
    q.name = slugName(label || t.name, taken);
    return q;
  }
  function allQuestions(model) {
    var out = [];
    (model.pages || []).forEach(function (p, pi) {
      (p.questions || []).forEach(function (q) { out.push({ q: q, page: p, pageIndex: pi }); });
    });
    return out;
  }
  function fieldNames(model) {
    return allQuestions(model).filter(function (x) { return x.q.type !== 'note'; }).map(function (x) { return x.q.name; });
  }

  /* ------------------------------------------------------------------ */
  /* Compile                                                             */
  /* ------------------------------------------------------------------ */

  function ruleSchema(r) {
    var v = r.value;
    switch (r.op) {
      case 'eq': return { const: v };
      case 'neq': return { not: { const: v } };
      case 'includes': return { contains: { const: v } };
      case 'gt': return { exclusiveMinimum: Number(v) };
      case 'gte': return { minimum: Number(v) };
      case 'lt': return { exclusiveMaximum: Number(v) };
      case 'lte': return { maximum: Number(v) };
      case 'answered': return {};
      default: return { const: v };
    }
  }
  function cleanRules(showIf) {
    if (!showIf || !Array.isArray(showIf.rules)) return [];
    return showIf.rules.filter(function (r) { return r && r.q && r.op && (r.op === 'answered' || (r.value !== undefined && r.value !== '')); });
  }
  function uiCondition(showIf) {
    var rules = cleanRules(showIf);
    if (!rules.length) return null;
    var conds = rules.map(function (r) {
      return { scope: '#/properties/' + r.q, schema: ruleSchema(r), failWhenUndefined: true };
    });
    if (conds.length === 1) return conds[0];
    return { type: showIf.match === 'any' ? 'OR' : 'AND', conditions: conds };
  }
  /* The same condition, as a JSON Schema "if", for conditional required. */
  function schemaIf(showIfs) {
    var parts = [];
    showIfs.forEach(function (s) {
      var rules = cleanRules(s);
      if (!rules.length) return;
      var each = rules.map(function (r) {
        var p = {}; p[r.q] = ruleSchema(r);
        return { properties: p, required: [r.q] };
      });
      parts.push(each.length === 1 ? each[0] : s.match === 'any' ? { anyOf: each } : { allOf: each });
    });
    if (!parts.length) return null;
    return parts.length === 1 ? parts[0] : { allOf: parts };
  }
  function andShowIf(a, b) {
    var ra = cleanRules(a), rb = cleanRules(b);
    if (!ra.length) return rb.length ? b : null;
    if (!rb.length) return a;
    return [a, b];
  }

  function translationsBlock(q, langs, labelKey) {
    var tr = {};
    langs.forEach(function (l) {
      var b = {};
      if (q.labels && q.labels[l]) b[labelKey] = q.labels[l];
      if (q.hints && q.hints[l]) b.description = q.hints[l];
      if (q.choices && q.choices.some(function (c) { return c.labels && c.labels[l]; })) {
        b.options = { oneOf: q.choices.filter(function (c) { return c.labels && c.labels[l]; }).map(function (c) { return { const: q.type === 'likert' ? Number(c.value) : c.value, title: c.labels[l] }; }) };
      }
      if (!isEmptyObj(b)) tr[l] = b;
    });
    return tr;
  }

  function modelLanguages(model) {
    var set = {};
    function scan(o) { Object.keys(o || {}).forEach(function (k) { if (o[k]) set[k] = true; }); }
    scan(model.titles);
    (model.pages || []).forEach(function (p) {
      scan(p.titles);
      (p.questions || []).forEach(function (q) {
        scan(q.labels); scan(q.hints);
        (q.choices || []).forEach(function (c) { scan(c.labels); });
      });
    });
    return Object.keys(set).sort();
  }

  function compileForm(model, opts) {
    opts = opts || {};
    var langs = modelLanguages(model);
    var schema = { $schema: 'http://json-schema.org/draft-07/schema#', title: model.title || 'Form', version: String(model.version || '1'), type: 'object', properties: {} };
    var required = [];
    var conditional = [];
    var swipe = { type: 'SwipeLayout', options: { headerTitle: model.title || 'Form' }, elements: [] };
    var headTr = {};
    langs.forEach(function (l) { if (model.titles && model.titles[l]) headTr[l] = { headerTitle: model.titles[l] }; });
    if (!isEmptyObj(headTr)) swipe.translations = headTr;

    (model.pages || []).forEach(function (page) {
      var layout = { type: 'VerticalLayout', elements: [] };
      var pageCond = uiCondition(page.showIf);
      if (pageCond) layout.rule = { effect: 'SHOW', condition: pageCond };
      if (page.title) {
        var pl = { type: 'Label', text: page.title, options: { odePageTitle: true } };
        var ptr = {};
        langs.forEach(function (l) { if (page.titles && page.titles[l]) ptr[l] = { text: page.titles[l] }; });
        if (!isEmptyObj(ptr)) pl.translations = ptr;
        layout.elements.push(pl);
      }
      (page.questions || []).forEach(function (q) {
        var t = TYPE_BY_ID[q.type] || TYPE_BY_ID.text;
        var el;
        if (t.note) {
          el = { type: 'Label', text: q.label || '' };
          var ntr = {};
          langs.forEach(function (l) { if (q.labels && q.labels[l]) ntr[l] = { text: q.labels[l] }; });
          if (!isEmptyObj(ntr)) el.translations = ntr;
        } else {
          var node = clone(t.schema) || {};
          if (t.choices) {
            var one = (q.choices || []).map(function (c) { return { const: t.numeric ? Number(c.value) : c.value, title: c.label || c.value }; });
            if (q.type === 'likert') { node = clone(t.schema); node.oneOf = one; }
            else if (q.type === 'select_one') node = { type: 'string', oneOf: one };
            else node = { type: 'array', uniqueItems: true, items: { type: 'string', oneOf: one } };
          }
          node.title = q.label || q.name;
          if (q.hint) node.description = q.hint;
          if (t.range) {
            var isMany = q.type === 'select_many';
            if (q.min !== undefined && q.min !== null && q.min !== '') node[isMany ? 'minItems' : 'minimum'] = Number(q.min);
            if (q.max !== undefined && q.max !== null && q.max !== '') node[isMany ? 'maxItems' : 'maximum'] = Number(q.max);
          }
          if (q.schemaExtra) Object.keys(q.schemaExtra).forEach(function (k) { if (!(k in node)) node[k] = clone(q.schemaExtra[k]); });
          schema.properties[q.name] = node;

          el = { type: 'Control', scope: '#/properties/' + q.name, label: q.label || q.name };
          var options = Object.assign({}, t.ui || {}, q.uiOptions || {});
          if (q.readOnly) options.readonly = true;
          if (!isEmptyObj(options)) el.options = options;
          var tr = translationsBlock(q, langs, 'label');
          if (!isEmptyObj(tr)) el.translations = tr;

          if (q.required) {
            var cond = andShowIf(page.showIf, q.showIf);
            if (!cond) required.push(q.name);
            else conditional.push({ name: q.name, cond: Array.isArray(cond) ? cond : [cond] });
          }
        }
        var qc = uiCondition(q.showIf);
        if (qc) el.rule = { effect: 'SHOW', condition: qc };
        layout.elements.push(el);
      });
      swipe.elements.push(layout);
    });

    if (required.length) schema.required = required;
    if (conditional.length) {
      schema.allOf = conditional.map(function (c) { return { if: schemaIf(c.cond), then: { required: [c.name] } }; });
    }
    return { schema: schema, ui: swipe, schemaText: JSON.stringify(schema, null, 2) + '\n', uiText: JSON.stringify(swipe, null, 2) + '\n' };
  }

  /* ------------------------------------------------------------------ */
  /* Parse                                                               */
  /* ------------------------------------------------------------------ */

  var FM_RANGE = { integer: true, decimal: true };
  var KNOWN_SCHEMA_KEYS = ['type', 'title', 'description', 'format', 'oneOf', 'enum', 'enumNames', 'items', 'uniqueItems', 'minimum', 'maximum', 'minItems', 'maxItems'];

  function choicesFrom(node) {
    if (Array.isArray(node.oneOf) && node.oneOf.every(function (c) { return c && c.const !== undefined; }))
      return node.oneOf.map(function (c) { return { value: String(c.const), label: c.title || String(c.const), labels: {} }; });
    if (Array.isArray(node.enum))
      return node.enum.map(function (v, i) { return { value: String(v), label: (node.enumNames && node.enumNames[i]) || String(v), labels: {} }; });
    return null;
  }

  function typeOf(node) {
    if (!node || typeof node !== 'object') return null;
    var f = node.format;
    if (node.type === 'array') {
      if (node.items && choicesFrom(node.items) && !f) return 'select_many';
      return null;
    }
    if (f === 'likert') return choicesFrom(node) ? 'likert' : null;
    if (f === 'duration') return 'duration';
    if (choicesFrom(node) && node.type !== 'object') return node.type === 'string' || !node.type ? 'select_one' : null;
    if (node.type === 'object') return f === 'photo' ? 'photo' : f === 'signature' ? 'signature' : f === 'select_file' ? 'file' : null;
    if (node.type === 'integer' && !f) return 'integer';
    if (node.type === 'number' && !f) return 'decimal';
    if (node.type === 'string' || !node.type) {
      if (!f || f === 'text') return node.pattern === TYPE_BY_ID.phone.schema.pattern ? 'phone' : 'text';
      var map = { adate: 'adate', date: 'date', time: 'time', 'date-time': 'datetime', email: 'email', gps: 'gps', audio: 'audio', video: 'video', qrcode: 'qrcode', textarea: 'longtext', multiline: 'longtext' };
      return map[f] || null;
    }
    return null;
  }

  function scopeName(scope) {
    var m = /^#\/properties\/([^/]+)$/.exec(scope || '');
    return m ? m[1] : null;
  }

  function parseRule(cond) {
    var name = scopeName(cond.scope);
    var s = cond.schema;
    if (!name || !s || typeof s !== 'object') return null;
    var keys = Object.keys(s);
    if (keys.length === 0) return { q: name, op: 'answered', value: '' };
    if (keys.length !== 1) return null;
    var k = keys[0];
    if (k === 'const') return { q: name, op: 'eq', value: s.const };
    if (k === 'enum' && s.enum.length === 1) return { q: name, op: 'eq', value: s.enum[0] };
    if (k === 'not' && s.not && s.not.const !== undefined) return { q: name, op: 'neq', value: s.not.const };
    if (k === 'contains' && s.contains && s.contains.const !== undefined) return { q: name, op: 'includes', value: s.contains.const };
    var num = { exclusiveMinimum: 'gt', minimum: 'gte', exclusiveMaximum: 'lt', maximum: 'lte' };
    if (num[k]) return { q: name, op: num[k], value: s[k] };
    return null;
  }

  function parseCondition(c) {
    if (!c) return null;
    if ((c.type === 'AND' || c.type === 'OR') && Array.isArray(c.conditions)) {
      var rules = c.conditions.map(parseRule);
      if (rules.some(function (r) { return !r; })) return undefined;
      return { match: c.type === 'OR' ? 'any' : 'all', rules: rules };
    }
    var r = parseRule(c);
    return r ? { match: 'all', rules: [r] } : undefined;
  }

  function parseForm(schemaText, uiText) {
    var problems = [];
    var schema, ui;
    try { schema = typeof schemaText === 'string' ? JSON.parse(schemaText) : schemaText; } catch (e) { return { model: null, problems: ['schema.json is not valid JSON'] }; }
    try { ui = typeof uiText === 'string' ? JSON.parse(uiText) : uiText; } catch (e) { return { model: null, problems: ['ui.json is not valid JSON'] }; }
    if (!schema || typeof schema !== 'object' || !schema.properties) return { model: null, problems: ['schema.json has no questions'] };
    if (!ui || typeof ui !== 'object') return { model: null, problems: ['ui.json is empty'] };
    if (schema.definitions || schema.$defs) problems.push('uses shared definitions ($ref)');

    var model = { title: schema.title || (ui.options && ui.options.headerTitle) || 'Form', titles: {}, version: String(schema.version || '1'), pages: [] };
    if (ui.translations) Object.keys(ui.translations).forEach(function (l) { if (ui.translations[l] && ui.translations[l].headerTitle) model.titles[l] = ui.translations[l].headerTitle; });

    var used = {};
    var pagesUi;
    if (ui.type === 'SwipeLayout' || ui.type === 'Categorization') {
      pagesUi = ui.elements || [];
    } else if (ui.type === 'VerticalLayout') {
      pagesUi = [ui];
    } else {
      return { model: null, problems: ['the screen layout is not one ODE pages can show'] };
    }

    pagesUi.forEach(function (pu) {
      var page = newPage();
      var elements;
      if (pu.type === 'Control' || pu.type === 'Label') elements = [pu];
      else if (pu.type === 'VerticalLayout' || pu.type === 'Category' || pu.type === 'Group') {
        elements = pu.elements || [];
        if (pu.label && pu.type !== 'VerticalLayout') page.title = pu.label;
        if (pu.rule) {
          if (pu.rule.effect !== 'SHOW') problems.push('a page uses a ' + pu.rule.effect + ' rule');
          else {
            var pc = parseCondition(pu.rule.condition);
            if (pc === undefined) problems.push('a page has a show-if rule the editor cannot show');
            else page.showIf = pc;
          }
        }
      } else { problems.push('a page uses ' + pu.type); return; }

      elements.forEach(function (el, idx) {
        if (el.type === 'Label') {
          var titles = {};
          if (el.translations) Object.keys(el.translations).forEach(function (l) { if (el.translations[l] && el.translations[l].text) titles[l] = el.translations[l].text; });
          if (idx === 0 && el.options && el.options.odePageTitle) { page.title = el.text || ''; page.titles = titles; return; }
          var note = { name: '', type: 'note', label: el.text || '', labels: titles, hint: '', hints: {}, required: false, showIf: null };
          if (el.rule) {
            var nc = el.rule.effect === 'SHOW' ? parseCondition(el.rule.condition) : undefined;
            if (nc === undefined) problems.push('a note has a rule the editor cannot show');
            else note.showIf = nc;
          }
          page.questions.push(note);
          return;
        }
        if (el.type !== 'Control') { problems.push('uses a ' + el.type + ' inside a page'); return; }
        var name = scopeName(el.scope);
        if (!name) { problems.push('a question points at a nested field (' + el.scope + ')'); return; }
        var node = schema.properties[name];
        if (!node) { problems.push('a question points at a field that does not exist (' + name + ')'); return; }
        if (node.$ref) { problems.push('"' + name + '" uses $ref'); return; }
        var type = typeOf(node);
        if (!type) { problems.push('"' + name + '" is a ' + (node.format || node.type) + ' question, which the editor does not have yet'); return; }
        used[name] = true;
        var q = { name: name, type: type, label: el.label || node.title || name, labels: {}, hint: node.description || '', hints: {}, required: false, showIf: null };
        var ch = type === 'select_many' ? choicesFrom(node.items) : type === 'select_one' || type === 'likert' ? choicesFrom(node) : null;
        if (ch) q.choices = ch;
        if (type === 'integer' || type === 'decimal') {
          if (node.minimum !== undefined) q.min = node.minimum;
          if (node.maximum !== undefined) q.max = node.maximum;
        }
        if (type === 'select_many') {
          if (node.minItems !== undefined) q.min = node.minItems;
          if (node.maxItems !== undefined) q.max = node.maxItems;
        }
        var extra = {};
        Object.keys(node).forEach(function (k) {
          if (KNOWN_SCHEMA_KEYS.indexOf(k) !== -1 && !((k === 'minimum' || k === 'maximum') && !FM_RANGE[type])) return;
          if (k === 'pattern' && type === 'phone') return;
          extra[k] = clone(node[k]);
        });
        if (type === 'text' && node.format === 'text') extra.format = 'text';
        if (!isEmptyObj(extra)) q.schemaExtra = extra;
        var opts = Object.assign({}, el.options || {});
        if (opts.readonly) { q.readOnly = true; delete opts.readonly; }
        if (type === 'longtext' && opts.multi) delete opts.multi;
        if (opts.multi && type === 'text') { q.type = 'longtext'; delete opts.multi; }
        if (!isEmptyObj(opts)) q.uiOptions = opts;
        if (el.translations) {
          Object.keys(el.translations).forEach(function (l) {
            var b = el.translations[l] || {};
            if (b.label) q.labels[l] = b.label;
            if (b.description) q.hints[l] = b.description;
            if (b.options && Array.isArray(b.options.oneOf) && q.choices) {
              b.options.oneOf.forEach(function (o) {
                var c = q.choices.filter(function (c) { return c.value === String(o.const); })[0];
                if (c && o.title) c.labels[l] = o.title;
              });
            }
          });
        }
        if (el.rule) {
          var c = el.rule.effect === 'SHOW' ? parseCondition(el.rule.condition) : undefined;
          if (c === undefined) problems.push('"' + name + '" has a ' + (el.rule.effect || '') + ' rule the editor cannot show');
          else q.showIf = c;
        }
        page.questions.push(q);
      });
      model.pages.push(page);
    });

    // required (top level, or conditional through allOf if/then)
    (schema.required || []).forEach(function (n) {
      allQuestions(model).forEach(function (x) { if (x.q.name === n) x.q.required = true; });
    });
    (schema.allOf || []).forEach(function (part) {
      if (part && part.if && part.then && Array.isArray(part.then.required) && Object.keys(part.then).length === 1) {
        part.then.required.forEach(function (n) {
          allQuestions(model).forEach(function (x) { if (x.q.name === n) x.q.required = true; });
        });
      } else problems.push('uses a schema rule (allOf) the editor cannot show');
    });
    ['anyOf', 'oneOf', 'if', 'dependencies', 'patternProperties'].forEach(function (k) {
      if (schema[k]) problems.push('uses "' + k + '" at the top of schema.json');
    });

    Object.keys(schema.properties).forEach(function (n) {
      if (used[n]) return;
      var node = schema.properties[n];
      var type = typeOf(node);
      if (!type) { problems.push('"' + n + '" is not on any page and its type is not in the editor'); return; }
      if (!model.pages.length) model.pages.push(newPage());
      var q = { name: n, type: type, label: node.title || n, labels: {}, hint: node.description || '', hints: {}, required: (schema.required || []).indexOf(n) !== -1, showIf: null };
      var ch = type === 'select_many' ? choicesFrom(node.items) : type === 'select_one' || type === 'likert' ? choicesFrom(node) : null;
      if (ch) q.choices = ch;
      model.pages[model.pages.length - 1].questions.push(q);
    });
    if (!model.pages.length) model.pages.push(newPage());

    return { model: problems.length ? null : model, partial: model, problems: problems };
  }

  /* Plain-language text for a condition, e.g. "Consent is No". */
  function describeShowIf(model, showIf) {
    var rules = cleanRules(showIf);
    if (!rules.length) return '';
    var byName = {};
    allQuestions(model).forEach(function (x) { byName[x.q.name] = x.q; });
    var parts = rules.map(function (r) {
      var q = byName[r.q];
      var label = q ? (q.label || q.name) : r.q;
      var val = r.value;
      if (q && q.choices) {
        var c = q.choices.filter(function (c) { return c.value === String(r.value); })[0];
        if (c) val = c.label || c.value;
      }
      return '"' + label + '" ' + OPS[r.op] + (r.op === 'answered' ? '' : ' ' + val);
    });
    return parts.join(showIf.match === 'any' ? ' or ' : ' and ');
  }

  /* Problems a person can fix in the editor (empty labels, duplicates, broken show-if). */
  function checkModel(model) {
    var out = [];
    var seen = {};
    var order = allQuestions(model);
    var before = {};
    order.forEach(function (x, i) {
      var q = x.q;
      var where = 'Page ' + (x.pageIndex + 1) + ', question ' + (x.page.questions.indexOf(q) + 1);
      if (q.type !== 'note') {
        if (!q.label) out.push({ severity: 'error', where: where, message: 'This question has no wording.' });
        if (!/^[a-z][a-z0-9_]{0,63}$/.test(q.name)) out.push({ severity: 'error', where: where, message: 'The data name "' + q.name + '" must start with a letter and use only a-z, 0-9 and _.' });
        else if (/^core_/.test(q.name)) out.push({ severity: 'error', where: where, message: 'Data names cannot start with core_.' });
        if (seen[q.name]) out.push({ severity: 'error', where: where, message: 'Two questions share the data name "' + q.name + '".' });
        seen[q.name] = true;
        if (q.choices) {
          if (!q.choices.length) out.push({ severity: 'error', where: where, message: 'Add at least one choice.' });
          var vals = {};
          q.choices.forEach(function (c) {
            if (!c.value) out.push({ severity: 'error', where: where, message: 'A choice has no value.' });
            if (vals[c.value]) out.push({ severity: 'error', where: where, message: 'Two choices share the value "' + c.value + '".' });
            vals[c.value] = true;
          });
        }
        if (q.min !== undefined && q.max !== undefined && q.min !== '' && q.max !== '' && Number(q.min) > Number(q.max))
          out.push({ severity: 'error', where: where, message: 'The smallest value is bigger than the largest.' });
      } else if (!q.label) out.push({ severity: 'warning', where: where, message: 'This note is empty.' });
      cleanRules(q.showIf).forEach(function (r) {
        if (!before[r.q]) out.push({ severity: 'error', where: where, message: 'Its show-if uses a question that does not come before it.' });
      });
      before[q.name] = q;
    });
    (model.pages || []).forEach(function (p, pi) {
      var first = p.questions[0];
      cleanRules(p.showIf).forEach(function (r) {
        var ok = order.some(function (x) { return x.pageIndex < pi && x.q.name === r.q; });
        if (!ok) out.push({ severity: 'error', where: 'Page ' + (pi + 1), message: 'The page show-if uses a question that is not on an earlier page.' });
      });
      if (!p.questions.length) out.push({ severity: 'warning', where: 'Page ' + (pi + 1), message: 'This page is empty.' });
      void first;
    });
    return out;
  }

  return {
    TYPES: TYPES,
    TYPE_BY_ID: TYPE_BY_ID,
    AI_ONLY_TYPES: AI_ONLY_TYPES,
    OPS: OPS,
    newModel: newModel,
    newPage: newPage,
    newQuestion: newQuestion,
    slugName: slugName,
    allQuestions: allQuestions,
    fieldNames: fieldNames,
    modelLanguages: modelLanguages,
    compileForm: compileForm,
    parseForm: parseForm,
    describeShowIf: describeShowIf,
    checkModel: checkModel,
  };
});
