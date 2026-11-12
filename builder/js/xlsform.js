/*
 * ODE App Builder: import an Excel form in the widely used XLSForm layout
 * (sheets "survey", "choices", "settings") into the builder's form model.
 *
 *   readXlsx(JSZip, arrayBuffer)  -> { sheetName: [ {column: value} ] }   (browser: uses DOMParser)
 *   fromSheets(sheets, opts)      -> { title, formType, model, languages, warnings }
 *
 * Supports text, numbers, choices, dates, media, GPS, barcode, notes, groups as pages,
 * required, simple "relevant" conditions, simple number constraints and translations.
 * Anything else is listed in `warnings` so the person knows what to check.
 */
(function (root, factory) {
  var lib = factory(root.OdeFormModel || (typeof require === 'function' ? require('./formmodel.js') : null));
  if (typeof module === 'object' && module.exports) module.exports = lib;
  else root.OdeXlsForm = lib;
})(typeof self !== 'undefined' ? self : this, function (FM) {
  'use strict';

  /* ---------------- Reading .xlsx (a zip of XML files) ---------------- */

  function colIndex(ref) {
    var m = /^([A-Z]+)/.exec(ref || '');
    if (!m) return -1;
    var n = 0;
    for (var i = 0; i < m[1].length; i++) n = n * 26 + (m[1].charCodeAt(i) - 64);
    return n - 1;
  }
  function textOf(node) {
    if (!node) return '';
    var ts = node.getElementsByTagName('t');
    var out = '';
    for (var i = 0; i < ts.length; i++) out += ts[i].textContent;
    return out;
  }

  async function readXlsx(JSZip, data, DOMParserImpl) {
    var Parser = DOMParserImpl || (typeof DOMParser !== 'undefined' ? DOMParser : null);
    if (!Parser) throw new Error('No XML parser available');
    var zip = await JSZip.loadAsync(data);
    function xml(path) {
      var f = zip.file(path);
      return f ? f.async('string').then(function (t) { return new Parser().parseFromString(t, 'application/xml'); }) : Promise.resolve(null);
    }
    var wb = await xml('xl/workbook.xml');
    if (!wb) throw new Error('This is not an Excel (.xlsx) file.');
    var rels = await xml('xl/_rels/workbook.xml.rels');
    var target = {};
    if (rels) Array.prototype.forEach.call(rels.getElementsByTagName('Relationship'), function (r) { target[r.getAttribute('Id')] = r.getAttribute('Target'); });
    var sst = await xml('xl/sharedStrings.xml');
    var shared = sst ? Array.prototype.map.call(sst.getElementsByTagName('si'), textOf) : [];
    var sheets = {};
    var list = wb.getElementsByTagName('sheet');
    for (var i = 0; i < list.length; i++) {
      var name = String(list[i].getAttribute('name') || '').trim().toLowerCase();
      var rid = list[i].getAttribute('r:id') || list[i].getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id');
      var t = target[rid] || ('worksheets/sheet' + (i + 1) + '.xml');
      var path = t.charAt(0) === '/' ? t.slice(1) : 'xl/' + t.replace(/^\.\//, '');
      var doc = await xml(path);
      if (!doc) continue;
      var rows = [];
      Array.prototype.forEach.call(doc.getElementsByTagName('row'), function (row) {
        var cells = [];
        Array.prototype.forEach.call(row.getElementsByTagName('c'), function (c) {
          var idx = colIndex(c.getAttribute('r'));
          if (idx < 0) idx = cells.length;
          var type = c.getAttribute('t');
          var v = c.getElementsByTagName('v')[0];
          var val;
          if (type === 's') val = shared[parseInt(v ? v.textContent : '0', 10)] || '';
          else if (type === 'inlineStr') val = textOf(c.getElementsByTagName('is')[0]);
          else if (type === 'b') val = v && v.textContent === '1' ? 'TRUE' : 'FALSE';
          else val = v ? v.textContent : '';
          cells[idx] = val;
        });
        rows.push(cells);
      });
      sheets[name] = tableToObjects(rows);
    }
    return sheets;
  }

  /** First row is the header; returns one object per row keyed by trimmed header text. */
  function tableToObjects(rows) {
    var head = (rows[0] || []).map(function (h) { return String(h === undefined ? '' : h).trim(); });
    var out = [];
    for (var r = 1; r < rows.length; r++) {
      var o = {}, any = false;
      head.forEach(function (h, i) {
        if (!h) return;
        var v = rows[r][i];
        v = v === undefined || v === null ? '' : String(v).trim();
        o[h] = v;
        if (v) any = true;
      });
      if (any) out.push(o);
    }
    return out;
  }

  /* ---------------- Converting to the form model ---------------- */

  var LANG_NAMES = { english: 'en', en: 'en', french: 'fr', 'français': 'fr', francais: 'fr', fr: 'fr', portuguese: 'pt', 'português': 'pt', portugues: 'pt', pt: 'pt', swahili: 'sw', kiswahili: 'sw', sw: 'sw' };

  /** "label::English (en)" -> { base: 'label', lang: 'en' }; "label" -> { base: 'label', lang: null } */
  function splitColumn(col) {
    var parts = String(col).split('::');
    var base = parts[0].trim().toLowerCase();
    if (parts.length < 2) return { base: base, lang: null };
    var l = parts.slice(1).join('::').trim();
    var code = /\(([A-Za-z]{2,3})(?:[-_][A-Za-z]+)?\)\s*$/.exec(l);
    var lang = code ? code[1].toLowerCase() : LANG_NAMES[l.toLowerCase()] || l.toLowerCase().slice(0, 2);
    return { base: base, lang: lang };
  }

  function texts(row, base) {
    var out = { plain: '', byLang: {} };
    Object.keys(row).forEach(function (k) {
      var s = splitColumn(k);
      if (s.base !== base || !row[k]) return;
      if (s.lang) out.byLang[s.lang] = row[k];
      else out.plain = row[k];
    });
    return out;
  }

  function yes(v) { return /^(yes|true|1|true\(\))$/i.test(String(v || '').trim()); }

  function cleanName(n, taken) {
    var s = String(n || '').trim().replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '');
    if (!/^[a-z]/.test(s)) s = 'q_' + s;
    if (/^core_/.test(s)) s = 'f_' + s;
    s = s.slice(0, 60);
    var name = s, i = 2;
    while (taken.indexOf(name) !== -1) name = s + '_' + i++;
    return name;
  }

  var META = ['start', 'end', 'today', 'deviceid', 'subscriberid', 'simserial', 'phonenumber', 'username', 'email', 'audit', 'start-geopoint', 'background-audio'];

  /** Parse simple relevance like "${a} = 'yes' and selected(${b}, 'x')". Returns showIf or null. */
  function parseRelevant(expr, names) {
    var e = String(expr || '').trim();
    if (!e) return { showIf: null };
    var joiner = / and /i.test(e) && / or /i.test(e) ? null : / or /i.test(e) ? 'any' : 'all';
    if (!joiner) return { error: true };
    var parts = e.split(/ and | or /i);
    var rules = [];
    for (var i = 0; i < parts.length; i++) {
      var p = parts[i].trim().replace(/^\(+|\)+$/g, function (m) { return m; });
      var m;
      if ((m = /^selected\(\s*\$\{([^}]+)\}\s*,\s*['"]([^'"]*)['"]\s*\)$/.exec(p))) {
        if (!names[m[1]]) return { error: true };
        rules.push({ q: names[m[1]], op: 'includes', value: m[2] });
      } else if ((m = /^not\(\s*selected\(\s*\$\{([^}]+)\}\s*,\s*['"]([^'"]*)['"]\s*\)\s*\)$/.exec(p))) {
        return { error: true };
      } else if ((m = /^\$\{([^}]+)\}\s*(!=|>=|<=|=|>|<)\s*(?:'([^']*)'|"([^"]*)"|(-?\d+(?:\.\d+)?))$/.exec(p))) {
        if (!names[m[1]]) return { error: true };
        var op = { '=': 'eq', '!=': 'neq', '>': 'gt', '>=': 'gte', '<': 'lt', '<=': 'lte' }[m[2]];
        var str = m[3] !== undefined ? m[3] : m[4];
        if (str === '' && op === 'neq') { rules.push({ q: names[m[1]], op: 'answered', value: '' }); continue; }
        if (str === undefined && m[5] === undefined) return { error: true };
        rules.push({ q: names[m[1]], op: op, value: str !== undefined ? str : Number(m[5]), numeric: str === undefined });
      } else return { error: true };
    }
    return { showIf: { match: joiner, rules: rules } };
  }

  function parseConstraint(expr) {
    var e = String(expr || '').replace(/\s+/g, ' ').trim();
    if (!e) return {};
    var out = {};
    var ok = e.split(/ and /i).every(function (p) {
      var m = /^\.\s*(>=|<=|>|<)\s*(-?\d+(?:\.\d+)?)$/.exec(p.trim());
      if (!m) return false;
      var n = Number(m[2]);
      if (m[1] === '>=') out.min = n; else if (m[1] === '>') out.min = n; else if (m[1] === '<=') out.max = n; else out.max = n;
      return true;
    });
    return ok ? out : { error: true };
  }

  function fromSheets(sheets, opts) {
    opts = opts || {};
    var warnings = [];
    var survey = sheets.survey;
    if (!survey || !survey.length) throw new Error('No "survey" sheet found. The file needs sheets named survey and choices.');
    var settings = (sheets.settings && sheets.settings[0]) || {};
    var choicesRows = sheets.choices || [];

    // Languages: default from settings, else the first labelled language, else plain "label".
    var langSet = {};
    survey.concat(choicesRows).forEach(function (r) { Object.keys(r).forEach(function (k) { var s = splitColumn(k); if ((s.base === 'label' || s.base === 'hint') && s.lang && r[k]) langSet[s.lang] = true; }); });
    var dl = settings.default_language ? splitColumn('label::' + settings.default_language).lang : null;
    var hasPlain = survey.some(function (r) { return r.label || r.Label; });
    var base = dl || (hasPlain ? null : Object.keys(langSet)[0] || null);
    var mainLang = base || opts.defaultLocale || 'en';
    function pick(t) {
      var main = base ? t.byLang[base] || t.plain : t.plain || t.byLang[mainLang] || '';
      var others = {};
      Object.keys(t.byLang).forEach(function (l) { if (l !== base && l !== mainLang) others[l] = t.byLang[l]; });
      if (!base && t.plain && t.byLang[mainLang] && t.byLang[mainLang] !== t.plain) { /* plain wins */ }
      return { main: main, others: others };
    }
    var languages = Object.keys(langSet).filter(function (l) { return l !== mainLang; });

    // Choice lists
    var lists = {};
    choicesRows.forEach(function (r) {
      var ln = r.list_name || r['list name'] || r.list;
      if (!ln || r.name === undefined || r.name === '') return;
      var t = pick(texts(r, 'label'));
      (lists[ln] = lists[ln] || []).push({ value: String(r.name), label: t.main || String(r.name), labels: t.others });
    });

    var model = FM.newModel(settings.form_title || opts.title || 'Imported form');
    model.pages = [];
    if (settings.version) model.version = String(settings.version).replace(/[^0-9]/g, '').slice(0, 9) || '1';
    var page = null;
    var depth = 0; // group nesting
    var repeatDepth = 0;
    var names = {}; // xlsform name -> model name
    var taken = [];
    function newPage(title, titles) { page = FM.newPage(title || ''); page.titles = titles || {}; model.pages.push(page); return page; }
    function curPage() { return page || newPage(''); }
    var skippedMeta = [], skipped = [];

    survey.forEach(function (r, i) {
      var row = i + 2;
      var type = String(r.type || '').trim().replace(/\s+/g, ' ');
      if (!type) return;
      var tl = type.toLowerCase();
      var lab = pick(texts(r, 'label'));
      var hint = pick(texts(r, 'hint'));
      if (tl === 'begin group' || tl === 'begin_group') {
        depth++;
        if (depth === 1 && repeatDepth === 0) {
          var pg = newPage(lab.main, lab.others);
          var rel = parseRelevant(r.relevant, names);
          if (rel.error) warnings.push('Row ' + row + ': the group "' + (lab.main || r.name) + '" has a condition the builder could not read (' + r.relevant + '). It always shows.');
          else if (rel.showIf) pg.showIf = rel.showIf;
        } else if (r.relevant) warnings.push('Row ' + row + ': conditions on groups inside groups are not imported (' + r.relevant + ').');
        return;
      }
      if (tl === 'end group' || tl === 'end_group') { depth = Math.max(0, depth - 1); if (depth === 0 && repeatDepth === 0) page = null; return; }
      if (tl === 'begin repeat' || tl === 'begin_repeat') { repeatDepth++; warnings.push('Row ' + row + ': the repeat "' + (lab.main || r.name) + '" was not imported. In ODE, make a separate form for the repeated part and link it, or ask the AI for a repeating-records question.'); return; }
      if (tl === 'end repeat' || tl === 'end_repeat') { repeatDepth = Math.max(0, repeatDepth - 1); return; }
      if (repeatDepth) return;
      if (META.indexOf(tl) !== -1) { skippedMeta.push(tl); return; }

      var parts = tl.split(' ');
      var kind = parts[0];
      var appearance = String(r.appearance || '').toLowerCase();
      var q = null;
      var map = { text: 'text', integer: 'integer', int: 'integer', decimal: 'decimal', date: 'date', time: 'time', datetime: 'datetime', geopoint: 'gps', image: 'photo', photo: 'photo', audio: 'audio', video: 'video', file: 'file', barcode: 'qrcode', note: 'note', range: 'integer', acknowledge: 'select_one', select_one: 'select_one', select_multiple: 'select_many', select_one_from_file: null, select_multiple_from_file: null, geotrace: 'gps', geoshape: 'gps', calculate: null, hidden: null, rank: null };
      var t = map[kind];
      if (t === undefined) { skipped.push('row ' + row + ' (' + type + ')'); return; }
      if (t === null) {
        if (kind === 'calculate') warnings.push('Row ' + row + ': calculation "' + (r.name || '') + '" was not imported. Ask the AI to add it if you need it.');
        else skipped.push('row ' + row + ' (' + type + ')');
        return;
      }
      if (kind === 'geotrace' || kind === 'geoshape') warnings.push('Row ' + row + ': "' + type + '" became a single GPS point.');
      if (t === 'text' && /multiline/.test(appearance)) t = 'longtext';
      if (t === 'text' && /numbers/.test(appearance)) t = 'phone';
      if (kind === 'image' && /signature/.test(appearance)) t = 'signature';
      if (kind === 'date' && /(year|month-year)/.test(appearance)) t = 'adate';
      if (kind === 'select_one' && /likert/.test(appearance)) t = 'select_one';
      q = { name: '', type: t, label: lab.main, labels: lab.others, hint: hint.main, hints: hint.others, required: yes(r.required), showIf: null };
      if (t === 'note') { q.name = ''; q.required = false; }
      else { q.name = cleanName(r.name || lab.main || 'q', taken); taken.push(q.name); names[r.name] = q.name; }
      if (t === 'select_one' || t === 'select_many') {
        if (kind === 'acknowledge') q.choices = [{ value: 'OK', label: 'OK', labels: {} }];
        else {
          var ln = parts[1];
          if (!lists[ln]) { warnings.push('Row ' + row + ': choice list "' + ln + '" was not found on the choices sheet.'); q.choices = [{ value: 'yes', label: 'Yes', labels: {} }, { value: 'no', label: 'No', labels: {} }]; }
          else q.choices = JSON.parse(JSON.stringify(lists[ln]));
          if (parts[2] === 'or_other') { q.choices.push({ value: 'other', label: 'Other', labels: {} }); warnings.push('Row ' + row + ': "or_other" became an "Other" choice. Add a question for the other answer if you need it.'); }
        }
        if (r.choice_filter) warnings.push('Row ' + row + ': the choice filter (' + r.choice_filter + ') was not imported; all choices show.');
      }
      if (kind === 'range') {
        var pm = {};
        String(r.parameters || '').split(/\s+/).forEach(function (kv) { var a = kv.split('='); if (a.length === 2) pm[a[0]] = Number(a[1]); });
        if (!isNaN(pm.start)) q.min = pm.start;
        if (!isNaN(pm.end)) q.max = pm.end;
      }
      if (r.constraint) {
        var c = parseConstraint(r.constraint);
        if (c.error || !(t === 'integer' || t === 'decimal')) warnings.push('Row ' + row + ': the check "' + r.constraint + '" on "' + (lab.main || r.name) + '" was not imported.');
        else { if (c.min !== undefined) q.min = c.min; if (c.max !== undefined) q.max = c.max; }
      }
      if (yes(r.read_only) || yes(r.readonly)) q.readOnly = true;
      if (r.relevant) {
        var rv = parseRelevant(r.relevant, names);
        if (rv.error) warnings.push('Row ' + row + ': the condition on "' + (lab.main || r.name) + '" could not be read (' + r.relevant + '). It always shows; set "Show only if" in Questions.');
        else q.showIf = rv.showIf;
      }
      if (r.default) warnings.push('Row ' + row + ': the default value of "' + (lab.main || r.name) + '" was not imported.');
      if (!q.label && t !== 'note') q.label = r.name || 'Question';
      curPage().questions.push(q);
    });

    // Rule values must match the type of the question they point at.
    var byName = {};
    FM.allQuestions(model).forEach(function (x) { byName[x.q.name] = x.q; });
    function fix(s) {
      if (!s) return;
      s.rules.forEach(function (r) {
        var q = byName[r.q];
        if (q && (q.type === 'integer' || q.type === 'decimal') && r.op !== 'answered') r.value = Number(r.value);
        if (q && q.type === 'select_many' && r.op === 'eq') r.op = 'includes';
        delete r.numeric;
      });
    }
    model.pages.forEach(function (p) { fix(p.showIf); p.questions.forEach(function (q) { fix(q.showIf); }); });
    model.pages = model.pages.filter(function (p) { return p.questions.length; });
    if (!model.pages.length) model.pages.push(FM.newPage());
    if (skippedMeta.length) warnings.push('Skipped automatic fields (' + skippedMeta.join(', ') + '). ODE records time, device and user for every record already.');
    if (skipped.length) warnings.push('Skipped question types the builder does not have: ' + skipped.slice(0, 8).join(', ') + (skipped.length > 8 ? '…' : '') + '.');
    var titles = {};
    if (settings.form_title) { /* translated titles are rare; keep the main one */ }
    model.titles = titles;
    return {
      title: model.title,
      formType: settings.form_id ? cleanName(settings.form_id, []) : null,
      model: model,
      languages: languages,
      mainLanguage: mainLang,
      warnings: warnings,
    };
  }

  return { readXlsx: readXlsx, fromSheets: fromSheets, tableToObjects: tableToObjects, parseRelevant: parseRelevant, splitColumn: splitColumn };
});
