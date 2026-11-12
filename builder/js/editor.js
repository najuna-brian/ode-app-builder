/* ODE App Builder: click-to-build question editor and translations table.
   Works on the form model in formmodel.js; every change recompiles schema.json + ui.json. */
(function (root) {
  'use strict';

  var FM = root.OdeFormModel;

  function create(d) {
    var h = d.h, ic = d.ic, save = d.save, toast = d.toast;
    var openQ = null; // the question card that is expanded (one at a time keeps phones tidy)
    var openPageRule = null;

    /* ---------------------------------------------------------------- */
    /* Model <-> files                                                   */
    /* ---------------------------------------------------------------- */

    /** Make sure the form has a model. Returns { ok, problems }. */
    function ensureModel(f) {
      if (f.model) return { ok: true, problems: [] };
      if (!f.schemaText && !f.uiText) {
        f.model = FM.newModel(f.title);
        return { ok: true, problems: [] };
      }
      var p = FM.parseForm(f.schemaText, f.uiText);
      if (p.model) { f.model = p.model; return { ok: true, problems: [] }; }
      return { ok: false, problems: p.problems, partial: p.partial };
    }

    /** After a paste or a files edit: take the files into the editor when it can show them. */
    function adoptFiles(f) {
      var p = FM.parseForm(f.schemaText, f.uiText);
      f.model = p.model || null;
      return p;
    }

    function sync(f) {
      if (!f.model) return;
      f.model.title = f.title || f.model.title;
      var c = FM.compileForm(f.model);
      // A form that already went out in a bundle gets a new version when its files change.
      if (f.shipped && f.shipped.version === String(f.model.version) && f.shipped.text !== c.schemaText + c.uiText) {
        f.model.version = String((parseInt(f.model.version, 10) || 1) + 1);
        c = FM.compileForm(f.model);
      }
      if (f.shipped && f.shipped.text === c.schemaText + c.uiText) { /* unchanged since download */ }
      f.schemaText = c.schemaText;
      f.uiText = c.uiText;
    }

    function locked(f, name) {
      return !!(f.lastUploadedFields && f.lastUploadedFields.indexOf(name) !== -1);
    }

    /* ---------------------------------------------------------------- */
    /* Small pieces                                                      */
    /* ---------------------------------------------------------------- */

    function typeName(q) { var t = FM.TYPE_BY_ID[q.type]; return t ? t.name : q.type; }
    function typeIcon(q) { var t = FM.TYPE_BY_ID[q.type]; return t ? t.icon : 'circle-help'; }

    function iconBtn(icon, label, onclick, opts) {
      opts = opts || {};
      return h('button', { type: 'button', class: 'icon-btn' + (opts.cls ? ' ' + opts.cls : ''), title: label, 'aria-label': label, disabled: opts.disabled ? 'disabled' : null, onclick: onclick }, ic(icon, 18));
    }

    function labelled(text, input, hint) {
      return h('div', { class: 'field' }, h('label', {}, text), input, hint ? h('p', { class: 'hint' }, hint) : null);
    }

    function toggleRow(checked, text, onchange, hint) {
      return h('label', { class: 'toggle' },
        h('input', { type: 'checkbox', checked: !!checked, onchange: function (e) { onchange(e.target.checked); } }),
        h('span', { class: 'track', 'aria-hidden': 'true' }),
        h('span', { class: 'tl' }, text, hint ? h('small', {}, hint) : null));
    }

    /* ---------------------------------------------------------------- */
    /* Type picker                                                       */
    /* ---------------------------------------------------------------- */

    function pickType(title, current, done) {
      var dlg = document.getElementById('dialog');
      var body = document.getElementById('dialogBody');
      var groups = {};
      FM.TYPES.forEach(function (t) { (groups[t.group] = groups[t.group] || []).push(t); });
      body.replaceChildren(
        h('div', { class: 'sheet-head' }, h('h2', {}, title), iconBtn('x', 'Close', function () { dlg.close(); })),
        h('div', { class: 'type-groups' }, Object.keys(groups).map(function (g) {
          return h('section', {}, h('h3', {}, g), h('div', { class: 'type-grid' }, groups[g].map(function (t) {
            return h('button', { type: 'button', class: 'type-tile', 'aria-pressed': current === t.id ? 'true' : 'false', 'data-type': t.id, onclick: function () { dlg.close(); done(t.id); } },
              h('span', { class: 'tt-ic' }, ic(t.icon, 20)), h('span', {}, t.name));
          })));
        })));
      dlg.classList.add('sheet');
      dlg.addEventListener('close', function once() { dlg.classList.remove('sheet'); dlg.removeEventListener('close', once); });
      dlg.showModal();
    }

    /* ---------------------------------------------------------------- */
    /* Show-if editor                                                    */
    /* ---------------------------------------------------------------- */

    function opsFor(q) {
      if (!q) return ['answered'];
      if (q.type === 'select_one') return ['eq', 'neq', 'answered'];
      if (q.type === 'likert') return ['eq', 'gte', 'lte', 'answered'];
      if (q.type === 'select_many') return ['includes', 'answered'];
      if (q.type === 'integer' || q.type === 'decimal') return ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'answered'];
      if (q.type === 'text' || q.type === 'phone' || q.type === 'email' || q.type === 'qrcode') return ['eq', 'neq', 'answered'];
      return ['answered'];
    }

    /** sources: questions that can be used (they come earlier). getShowIf/setShowIf read and write it. */
    function firstValue(q) {
      if (!q || !q.choices || !q.choices[0]) return '';
      return q.type === 'likert' ? Number(q.choices[0].value) : q.choices[0].value;
    }
    function showIfEditor(model, sources, getShowIf, setShowIf, changed) {
      var wrap = h('div', { class: 'showif' });
      function draw() {
        var s = getShowIf();
        wrap.replaceChildren();
        if (!sources.length) {
          wrap.append(h('p', { class: 'hint' }, 'Add a question before this one to make it depend on an answer.'));
          return;
        }
        if (!s || !s.rules || !s.rules.length) {
          wrap.append(h('button', { type: 'button', class: 'ghost', onclick: function () {
            var src = sources[sources.length - 1];
            var ops = opsFor(src);
            setShowIf({ match: 'all', rules: [{ q: src.name, op: ops[0], value: firstValue(src) }] });
            changed(); draw();
          } }, ic('git-branch', 16), 'Show only if…'));
          return;
        }
        if (s.rules.length > 1) {
          var m = h('select', { 'aria-label': 'Match', onchange: function (e) { s.match = e.target.value; changed(); } },
            h('option', { value: 'all', selected: s.match !== 'any' ? 'selected' : null }, 'all of these are true'),
            h('option', { value: 'any', selected: s.match === 'any' ? 'selected' : null }, 'any of these is true'));
          wrap.append(h('div', { class: 'row', style: 'gap:8px' }, h('span', { class: 'hint', style: 'margin:0' }, 'Show when'), m));
        } else wrap.append(h('div', { class: 'hint', style: 'margin:0 0 6px' }, 'Show only when'));
        s.rules.forEach(function (r, i) {
          var src = sources.filter(function (x) { return x.name === r.q; })[0];
          var qSel = h('select', { 'aria-label': 'Question', onchange: function (e) {
            r.q = e.target.value;
            var nq = sources.filter(function (x) { return x.name === r.q; })[0];
            r.op = opsFor(nq)[0];
            r.value = firstValue(nq);
            changed(); draw();
          } }, sources.map(function (x) { return h('option', { value: x.name, selected: x.name === r.q ? 'selected' : null }, x.label || x.name); }),
            src ? null : h('option', { value: r.q, selected: 'selected' }, r.q + ' (missing)'));
          var opSel = h('select', { 'aria-label': 'Condition', onchange: function (e) { r.op = e.target.value; changed(); draw(); } },
            opsFor(src).map(function (o) { return h('option', { value: o, selected: o === r.op ? 'selected' : null }, FM.OPS[o]); }));
          var val = h('span');
          if (r.op !== 'answered') {
            if (src && src.choices) {
              val = h('select', { 'aria-label': 'Answer', onchange: function (e) { r.value = src.type === 'likert' ? Number(e.target.value) : e.target.value; changed(); } },
                src.choices.map(function (c) { return h('option', { value: c.value, selected: String(r.value) === c.value ? 'selected' : null }, c.label || c.value); }));
            } else {
              var numeric = src && (src.type === 'integer' || src.type === 'decimal');
              val = h('input', { type: numeric ? 'number' : 'text', 'aria-label': 'Answer', value: r.value === undefined ? '' : String(r.value), placeholder: 'answer', oninput: function (e) {
                r.value = numeric ? (e.target.value === '' ? '' : Number(e.target.value)) : e.target.value;
                changed();
              } });
            }
          }
          wrap.append(h('div', { class: 'rule-row' }, qSel, opSel, val,
            iconBtn('x', 'Remove this condition', function () { s.rules.splice(i, 1); if (!s.rules.length) setShowIf(null); changed(); draw(); })));
        });
        wrap.append(h('button', { type: 'button', class: 'ghost small', onclick: function () {
          var src2 = sources[sources.length - 1];
          s.rules.push({ q: src2.name, op: opsFor(src2)[0], value: firstValue(src2) });
          changed(); draw();
        } }, ic('plus', 15), 'Add condition'));
      }
      draw();
      return wrap;
    }

    /* ---------------------------------------------------------------- */
    /* Choices editor                                                    */
    /* ---------------------------------------------------------------- */

    function choicesEditor(f, q, changedOuter) {
      var wrap = h('div', { class: 'choices-ed' + (q.type === 'likert' ? ' scale' : '') });
      function changed() {
        if (q.type === 'likert') q.choices.forEach(function (c, i) { c.value = String(i + 1); c._auto = false; });
        changedOuter();
      }
      function valueTaken(v, self) { return q.choices.some(function (c) { return c !== self && c.value === v; }); }
      function autoValue(label, self) {
        var taken = q.choices.filter(function (c) { return c !== self; }).map(function (c) { return c.value; });
        return FM.slugName(label, taken).replace(/^q_/, 'c_');
      }
      function draw(focusIndex) {
        wrap.replaceChildren();
        var list = h('ol', { class: 'choice-list' });
        q.choices.forEach(function (c, i) {
          var fixed = locked(f, q.name) && c.value && !c._new;
          var labelIn = h('input', { type: 'text', value: c.label || '', placeholder: 'Choice ' + (i + 1), 'aria-label': 'Choice ' + (i + 1), oninput: function (e) {
            var was = c.label;
            c.label = e.target.value;
            if (!fixed && (c._auto || !c.value || c.value === autoValue(was, c))) {
              c._auto = true;
              c.value = autoValue(c.label, c);
              valIn.value = c.value;
            }
            changed();
          }, onkeydown: function (e) {
            if (e.key === 'Enter') { e.preventDefault(); q.choices.splice(i + 1, 0, { value: '', label: '', labels: {}, _auto: true, _new: true }); changed(); draw(i + 1); }
          } });
          var valIn = h('input', { type: 'text', class: 'mono', value: c.value, 'aria-label': 'Saved value', title: 'Saved value', readonly: fixed ? 'readonly' : null, oninput: function (e) {
            c.value = e.target.value.trim(); c._auto = false;
            valIn.classList.toggle('bad', !c.value || valueTaken(c.value, c));
            changed();
          } });
          list.append(h('li', {},
            h('span', { class: 'n' }, String(i + 1)),
            labelIn,
            h('span', { class: 'cv' }, valIn),
            iconBtn('arrow-up', 'Move up', function () { q.choices.splice(i - 1, 0, q.choices.splice(i, 1)[0]); changed(); draw(); }, { disabled: i === 0 }),
            iconBtn('x', 'Remove choice', function () { q.choices.splice(i, 1); changed(); draw(); }, { disabled: q.choices.length <= 1 })));
          if (focusIndex === i) setTimeout(function () { labelIn.focus(); }, 0);
        });
        var paste = h('details', { class: 'paste-list' }, h('summary', {}, 'Paste a list'),
          h('textarea', { rows: 4, placeholder: 'One choice per line' }),
          h('button', { type: 'button', class: 'secondary small', onclick: function () {
            var lines = paste.querySelector('textarea').value.split(/\r?\n/).map(function (s) { return s.trim(); }).filter(Boolean);
            if (!lines.length) return;
            var keep = q.choices.filter(function (c) { return c.label; });
            q.choices = keep;
            lines.forEach(function (l) { q.choices.push({ value: autoValue(l, null), label: l, labels: {}, _auto: true, _new: true }); });
            changed(); draw();
          } }, 'Add these'));
        wrap.append(list,
          h('div', { class: 'row' },
            h('button', { type: 'button', class: 'ghost small', onclick: function () { q.choices.push({ value: '', label: '', labels: {}, _auto: true, _new: true }); changed(); draw(q.choices.length - 1); } }, ic('plus', 15), 'Add choice'),
            h('button', { type: 'button', class: 'ghost small', onclick: function () { wrap.classList.toggle('show-values'); } }, 'Show saved values')),
          paste);
      }
      draw();
      return wrap;
    }

    /* ---------------------------------------------------------------- */
    /* Question card                                                     */
    /* ---------------------------------------------------------------- */

    function questionCard(f, page, pi, q, qi, ctx) {
      var model = f.model;
      var isOpen = openQ === q;
      var t = FM.TYPE_BY_ID[q.type] || {};
      var head = h('button', { type: 'button', class: 'qhead', 'aria-expanded': isOpen ? 'true' : 'false', onclick: function () { openQ = isOpen ? null : q; ctx.redraw(); } },
        h('span', { class: 'qt-ic' }, ic(typeIcon(q), 18)),
        h('span', { class: 'qtext' },
          h('b', { class: 'qlabel' }, q.label || (q.type === 'note' ? 'Empty note' : 'Untitled question')),
          h('small', {}, typeName(q),
            q.required ? h('span', { class: 'tag req' }, 'Required') : null,
            q.readOnly ? h('span', { class: 'tag' }, 'Read only') : null,
            q.showIf && q.showIf.rules && q.showIf.rules.length ? h('span', { class: 'tag cond' }, ic('git-branch', 12), 'If ' + FM.describeShowIf(model, q.showIf)) : null)),
        ic(isOpen ? 'chevron-up' : 'chevron-down', 18, 'chev'));
      var card = h('li', { class: 'qcard' + (isOpen ? ' open' : ''), 'data-name': q.name });
      card.append(head);
      if (!isOpen) return card;

      function changed() { ctx.changed(); }
      function relabel() {
        var lbl = card.querySelector('.qlabel');
        if (lbl) lbl.textContent = q.label || 'Untitled question';
      }

      var label = h(q.type === 'note' ? 'textarea' : 'input', { type: 'text', rows: q.type === 'note' ? 3 : null, value: q.label || '', 'data-role': 'q-label', placeholder: q.type === 'note' ? 'Text shown to the collector' : 'The question, as the collector reads it', oninput: function (e) {
        var was = q.label;
        q.label = e.target.value;
        if (q.type !== 'note' && !locked(f, q.name) && (q._autoName !== false) && (q._autoName || q.name === FM.slugName(was, FM.fieldNames(model).filter(function (n) { return n !== q.name; })))) {
          q._autoName = true;
          q.name = FM.slugName(q.label || typeName(q), FM.fieldNames(model).filter(function (n) { return n !== q.name; }));
          nameIn.value = q.name;
        }
        relabel();
        changed();
      } });
      if (q.type === 'note') label.value = q.label || '';

      var body = h('div', { class: 'qbody' });
      body.append(labelled(q.type === 'note' ? 'Note text' : 'Question', label));

      var typeBtn = h('button', { type: 'button', class: 'secondary type-btn', onclick: function () {
        pickType('Change answer type', q.type, function (nt) {
          if (nt === q.type) return;
          var nT = FM.TYPE_BY_ID[nt];
          q.type = nt;
          delete q.schemaExtra; delete q.uiOptions;
          if (nT.choices && !q.choices) q.choices = [{ value: 'yes', label: 'Yes', labels: {} }, { value: 'no', label: 'No', labels: {} }];
          if (!nT.choices) delete q.choices;
          if (!nT.range) { delete q.min; delete q.max; }
          if (nT.note) { q.required = false; q.name = ''; }
          else if (!q.name) q.name = FM.slugName(q.label || nT.name, FM.fieldNames(model));
          changed(); ctx.redraw();
        });
      } }, ic(typeIcon(q), 16), typeName(q), ic('chevron-down', 14));
      body.append(labelled('Answer type', typeBtn, locked(f, q.name) ? 'This question is already on a server. Changing its type can break existing data.' : null));

      if (q.type !== 'note') {
        body.append(labelled('Help text', h('input', { type: 'text', value: q.hint || '', placeholder: 'Optional hint under the question', oninput: function (e) { q.hint = e.target.value; changed(); } })));
      }

      if (q.choices) body.append(labelled('Choices', choicesEditor(f, q, changed)));

      if (t.range) {
        var many = q.type === 'select_many';
        body.append(h('div', { class: 'grid2' },
          labelled(many ? 'Pick at least' : 'Smallest allowed', h('input', { type: 'number', value: q.min === undefined ? '' : q.min, oninput: function (e) { q.min = e.target.value === '' ? undefined : Number(e.target.value); changed(); } })),
          labelled(many ? 'Pick at most' : 'Largest allowed', h('input', { type: 'number', value: q.max === undefined ? '' : q.max, oninput: function (e) { q.max = e.target.value === '' ? undefined : Number(e.target.value); changed(); } }))));
      }

      if (q.type !== 'note') {
        body.append(h('div', { class: 'toggles' },
          toggleRow(q.required, 'Required', function (v) { q.required = v; changed(); ctx.redrawHead(card, q); }, q.showIf ? 'Only when it is shown' : null),
          toggleRow(q.readOnly, 'Read only', function (v) { q.readOnly = v; changed(); ctx.redrawHead(card, q); }, 'Filled in by the app, e.g. a link to a household')));
      }

      var earlier = ctx.before(q).filter(function (x) { return x.type !== 'note'; });
      body.append(labelled('Show this question', showIfEditor(model, earlier, function () { return q.showIf; }, function (v) { q.showIf = v; }, function () { changed(); ctx.redrawHead(card, q); })));

      var nameIn = h('input', { type: 'text', class: 'mono', value: q.name, readonly: locked(f, q.name) ? 'readonly' : null, oninput: function (e) { q.name = e.target.value.trim(); q._autoName = false; changed(); } });
      if (q.type !== 'note') {
        body.append(h('details', { class: 'adv' }, h('summary', {}, 'Data name: ', h('span', { class: 'mono' }, q.name)),
          labelled('Data name', nameIn, locked(f, q.name) ? 'Already on a server, so it stays the same.' : 'The column name in exports. Set from the question; a-z, 0-9 and _ only.')));
      }

      var pages = model.pages;
      body.append(h('div', { class: 'qactions' },
        iconBtn('arrow-up', 'Move up', function () { ctx.move(q, -1); }, { disabled: pi === 0 && qi === 0 }),
        iconBtn('arrow-down', 'Move down', function () { ctx.move(q, 1); }, { disabled: pi === pages.length - 1 && qi === page.questions.length - 1 }),
        iconBtn('copy', 'Duplicate', function () {
          var c = JSON.parse(JSON.stringify(q));
          c.name = q.type === 'note' ? '' : FM.slugName(q.label || typeName(q), FM.fieldNames(model));
          c._autoName = true;
          page.questions.splice(qi + 1, 0, c);
          openQ = c; changed(); ctx.redraw();
        }),
        h('span', { style: 'flex:1' }),
        h('button', { type: 'button', class: 'danger small', onclick: function () {
          if (locked(f, q.name) && !confirm('"' + (q.label || q.name) + '" is already on a server. Removing it hides it from new records. Remove it?')) return;
          page.questions.splice(qi, 1);
          openQ = null; changed(); ctx.redraw();
        } }, ic('trash-2', 15), 'Remove')));
      card.append(body);
      return card;
    }

    /* ---------------------------------------------------------------- */
    /* Questions tab                                                     */
    /* ---------------------------------------------------------------- */

    function questions(f, onChange) {
      var root = h('div', { class: 'qb' });
      var st = ensureModel(f);
      if (!st.ok) {
        root.append(h('div', { class: 'notice' },
          h('p', {}, h('b', {}, 'This form uses things the question editor cannot show yet:')),
          h('ul', {}, st.problems.slice(0, 6).map(function (p) { return h('li', {}, p); })),
          h('p', { class: 'hint' }, 'Keep editing it with the AI step or as files (it still works in the app), or rebuild it here. Rebuilding drops the parts listed above.'),
          h('div', { class: 'row' },
            h('button', { type: 'button', class: 'secondary', onclick: function () { d.showTab('ai'); } }, 'Edit with AI or files'),
            h('button', { type: 'button', class: 'ghost', onclick: function () {
              if (!confirm('Rebuild this form in the question editor? The parts listed will be removed.')) return;
              f.model = st.partial || FM.newModel(f.title);
              sync(f); save(); onChange(); d.showTab('questions');
            } }, 'Rebuild in the editor'))));
        return root;
      }
      var model = f.model;
      var timer;
      function changed() {
        clearTimeout(timer);
        timer = setTimeout(function () { sync(f); save(); onChange(); drawProblems(); }, 150);
      }
      var problemsBox = h('div', { class: 'qb-problems' });
      function drawProblems() {
        var probs = FM.checkModel(model);
        problemsBox.replaceChildren();
        if (!probs.length) return;
        problemsBox.append(h('ul', { class: 'problems' }, probs.slice(0, 8).map(function (p) {
          return h('li', { class: p.severity }, h('b', {}, p.where + ':'), p.message);
        })));
      }
      function before(q) {
        var out = [];
        for (var i = 0; i < model.pages.length; i++) {
          var qs = model.pages[i].questions;
          for (var j = 0; j < qs.length; j++) { if (qs[j] === q) return out; out.push(qs[j]); }
        }
        return out;
      }
      function move(q, dir) {
        var flat = [];
        model.pages.forEach(function (p, pi) { p.questions.forEach(function (x, qi) { flat.push({ p: p, pi: pi, qi: qi, q: x }); }); });
        var idx = flat.findIndex(function (x) { return x.q === q; });
        var cur = flat[idx];
        if (dir < 0) {
          if (cur.qi > 0) cur.p.questions.splice(cur.qi - 1, 0, cur.p.questions.splice(cur.qi, 1)[0]);
          else if (cur.pi > 0) { cur.p.questions.splice(0, 1); model.pages[cur.pi - 1].questions.push(q); }
        } else {
          if (cur.qi < cur.p.questions.length - 1) cur.p.questions.splice(cur.qi + 1, 0, cur.p.questions.splice(cur.qi, 1)[0]);
          else if (cur.pi < model.pages.length - 1) { cur.p.questions.splice(cur.qi, 1); model.pages[cur.pi + 1].questions.unshift(q); }
        }
        changed(); redraw();
        var el = root.querySelector('.qcard.open');
        if (el && el.scrollIntoView) el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
      function redrawHead(card, q) {
        var tmpOpen = openQ; openQ = null;
        var fresh = questionCard(f, null, 0, q, 0, ctx).querySelector('.qhead');
        openQ = tmpOpen;
        fresh.setAttribute('aria-expanded', 'true');
        fresh.onclick = null;
        fresh.addEventListener('click', function () { openQ = null; redraw(); });
        fresh.querySelector('.chev').replaceWith(ic('chevron-up', 18, 'chev'));
        card.querySelector('.qhead').replaceWith(fresh);
      }
      var ctx = { changed: changed, redraw: redraw, before: before, move: move, redrawHead: redrawHead };

      function addQuestion(page, at) {
        pickType('Add a question', null, function (type) {
          var q = FM.newQuestion(type, FM.fieldNames(model), '');
          q._autoName = true;
          if (FM.TYPE_BY_ID[type].note) q.name = '';
          page.questions.splice(at === undefined ? page.questions.length : at, 0, q);
          openQ = q;
          changed(); redraw();
          var inp = root.querySelector('.qcard.open [data-role=q-label]');
          if (inp) { inp.focus(); if (inp.scrollIntoView) inp.scrollIntoView({ block: 'center', behavior: 'smooth' }); }
        });
      }

      function pageBlock(page, pi) {
        var pages = model.pages;
        var count = page.questions.length;
        var titleIn = h('input', { type: 'text', class: 'page-title', value: page.title || '', placeholder: 'Page ' + (pi + 1) + ' title (optional)', 'aria-label': 'Page ' + (pi + 1) + ' title', oninput: function (e) { page.title = e.target.value; changed(); } });
        var ruleOpen = openPageRule === page;
        var hasRule = page.showIf && page.showIf.rules && page.showIf.rules.length;
        var earlier = [];
        for (var i = 0; i < pi; i++) pages[i].questions.forEach(function (x) { if (x.type !== 'note') earlier.push(x); });
        var sec = h('section', { class: 'qpage' },
          h('div', { class: 'qpage-head' },
            h('span', { class: 'pnum' }, String(pi + 1)),
            titleIn,
            iconBtn('git-branch', 'Show this page only if…', function () { openPageRule = ruleOpen ? null : page; redraw(); }, { cls: hasRule ? 'on' : '' }),
            iconBtn('arrow-up', 'Move page up', function () { pages.splice(pi - 1, 0, pages.splice(pi, 1)[0]); changed(); redraw(); }, { disabled: pi === 0 }),
            iconBtn('trash-2', 'Delete page', function () {
              if (pages.length === 1) return toast('A form needs at least one page.');
              if (count && !confirm('Delete page ' + (pi + 1) + ' and its ' + count + ' question' + (count === 1 ? '' : 's') + '?')) return;
              pages.splice(pi, 1); changed(); redraw();
            })),
          hasRule && !ruleOpen ? h('p', { class: 'page-cond' }, ic('git-branch', 13), 'Shown only if ' + FM.describeShowIf(model, page.showIf)) : null,
          ruleOpen ? h('div', { class: 'page-rule' }, showIfEditor(model, earlier, function () { return page.showIf; }, function (v) { page.showIf = v; }, changed)) : null);
        var list = h('ol', { class: 'qlist' });
        page.questions.forEach(function (q, qi) { list.append(questionCard(f, page, pi, q, qi, ctx)); });
        sec.append(list);
        if (!count) sec.append(h('p', { class: 'hint empty' }, 'No questions on this page yet.'));
        sec.append(h('button', { type: 'button', class: 'add-q', onclick: function () { addQuestion(page); } }, ic('plus', 18), 'Add question'));
        return sec;
      }

      function redraw() {
        root.replaceChildren();
        var n = FM.fieldNames(model).length;
        root.append(h('div', { class: 'qb-top' },
          h('span', { class: 'hint', style: 'margin:0' }, n + ' question' + (n === 1 ? '' : 's') + ' on ' + model.pages.length + ' page' + (model.pages.length === 1 ? '' : 's') + ' · version ' + model.version),
          h('span', { style: 'flex:1' }),
          d.preview ? h('button', { type: 'button', class: 'secondary small', onclick: function () { d.preview(f); } }, ic('play', 15), 'Try the form') : null));
        model.pages.forEach(function (p, pi) { root.append(pageBlock(p, pi)); });
        root.append(h('button', { type: 'button', class: 'ghost add-page', onclick: function () { model.pages.push(FM.newPage()); changed(); redraw(); } }, ic('file-plus', 16), 'Add page'));
        root.append(problemsBox);
        drawProblems();
      }
      redraw();
      return root;
    }

    /* ---------------------------------------------------------------- */
    /* Translations                                                      */
    /* ---------------------------------------------------------------- */

    function textRows(f) {
      var m = f.model, rows = [];
      rows.push({ key: 'form:title', what: 'Form name', get: function (l) { return l ? m.titles[l] : f.title; }, set: function (l, v) { if (l) setMap(m, 'titles', l, v); else { f.title = v; } } });
      m.pages.forEach(function (p, pi) {
        if (p.title) rows.push({ key: 'page:' + (pi + 1), what: 'Page ' + (pi + 1) + ' title', get: function (l) { return l ? (p.titles || {})[l] : p.title; }, set: function (l, v) { if (l) setMap(p, 'titles', l, v); else p.title = v; } });
        p.questions.forEach(function (q, qi) {
          var id = q.name || ('note' + (pi + 1) + '_' + (qi + 1));
          rows.push({ key: 'q:' + id, what: q.type === 'note' ? 'Note' : 'Question', group: true, get: function (l) { return l ? (q.labels || {})[l] : q.label; }, set: function (l, v) { if (l) setMap(q, 'labels', l, v); else q.label = v; } });
          if (q.hint) rows.push({ key: 'q:' + id + ':hint', what: 'Help text', get: function (l) { return l ? (q.hints || {})[l] : q.hint; }, set: function (l, v) { if (l) setMap(q, 'hints', l, v); else q.hint = v; } });
          (q.choices || []).forEach(function (c) {
            rows.push({ key: 'q:' + id + ':choice:' + c.value, what: 'Choice', get: function (l) { return l ? (c.labels || {})[l] : c.label; }, set: function (l, v) { if (l) setMap(c, 'labels', l, v); else c.label = v; } });
          });
        });
      });
      return rows;
    }
    function setMap(obj, key, l, v) {
      obj[key] = obj[key] || {};
      if (v) obj[key][l] = v; else delete obj[key][l];
    }

    function csvCell(s) { s = s === undefined || s === null ? '' : String(s); return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }
    function parseCsv(text) {
      var rows = [], row = [], cell = '', q = false;
      text = text.replace(/^﻿/, '');
      for (var i = 0; i < text.length; i++) {
        var ch = text[i];
        if (q) {
          if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
          else if (ch === '"') q = false;
          else cell += ch;
        } else if (ch === '"') q = true;
        else if (ch === ',' || ch === ';' || ch === '\t') { row.push(cell); cell = ''; }
        else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
        else cell += ch;
      }
      if (cell || row.length) { row.push(cell); rows.push(row); }
      return rows.filter(function (r) { return r.some(function (c) { return c !== ''; }); });
    }

    function translations(f, onChange) {
      var root = h('div', { class: 'tr' });
      var st = ensureModel(f);
      var base = d.defaultLocale();
      var LOCALES = d.LOCALES;
      var timer;
      function changed() { clearTimeout(timer); timer = setTimeout(function () { sync(f); save(); onChange(); }, 200); }

      var chips = h('div', { class: 'chips' }, Object.keys(LOCALES).filter(function (l) { return l !== base; }).map(function (l) {
        return h('label', { class: 'chip' }, h('input', { type: 'checkbox', checked: (f.languages || []).indexOf(l) !== -1, onchange: function (e) {
          f.languages = (f.languages || []).filter(function (x) { return x !== l; });
          if (e.target.checked) f.languages.push(l);
          save(); draw();
        } }), LOCALES[l]);
      }));
      root.append(h('div', { class: 'field' }, h('label', {}, 'Languages'), h('p', { class: 'hint', style: 'margin-top:0' }, 'The form is written in ' + LOCALES[base] + '. Tick the other languages collectors can switch to in Formulus.'), chips));
      var body = h('div');
      root.append(body);

      function draw() {
        body.replaceChildren();
        if (!st.ok) { body.append(h('p', { class: 'notice' }, 'This form was written outside the question editor, so its translations are edited in the AI step or in the files.')); return; }
        var langs = (f.languages || []).filter(function (l) { return l !== base && LOCALES[l]; });
        if (!langs.length) { body.append(h('p', { class: 'hint' }, 'Tick a language above to translate this form.')); return; }
        var rows = textRows(f);
        var missing = {};
        langs.forEach(function (l) { missing[l] = rows.filter(function (r) { return r.get(null) && !r.get(l); }).length; });
        body.append(h('div', { class: 'row tr-tools' },
          langs.map(function (l) { return h('span', { class: 'status ' + (missing[l] ? 'warn' : 'ok') }, LOCALES[l] + ': ' + (missing[l] ? missing[l] + ' missing' : 'complete')); }),
          h('span', { style: 'flex:1' }),
          h('button', { type: 'button', class: 'ghost small', onclick: function () {
            var lines = [['key', 'what', base].concat(langs).map(csvCell).join(',')];
            rows.forEach(function (r) { lines.push([r.key, r.what, r.get(null)].concat(langs.map(function (l) { return r.get(l) || ''; })).map(csvCell).join(',')); });
            d.downloadBlob(new Blob(['﻿' + lines.join('\r\n') + '\r\n'], { type: 'text/csv' }), f.formType + '_translations.csv');
          } }, ic('download', 15), 'Download CSV'),
          h('button', { type: 'button', class: 'ghost small', onclick: function () {
            var inp = h('input', { type: 'file', accept: '.csv,text/csv' });
            inp.addEventListener('change', function () {
              var file = inp.files[0]; if (!file) return;
              file.text().then(function (t) {
                var data = parseCsv(t);
                var head = data.shift() || [];
                var byKey = {}; rows.forEach(function (r) { byKey[r.key] = r; });
                var n = 0;
                data.forEach(function (line) {
                  var r = byKey[line[0]]; if (!r) return;
                  head.forEach(function (col, ci) {
                    if (ci < 3 || !LOCALES[col] || col === base) return;
                    var v = (line[ci] || '').trim();
                    if (v && v !== r.get(col)) { r.set(col, v); n++; }
                    if (v && (f.languages || []).indexOf(col) === -1) f.languages.push(col);
                  });
                });
                sync(f); save(); onChange(); draw();
                toast(n ? n + ' translation' + (n === 1 ? '' : 's') + ' added.' : 'No new translations found in that file.');
              });
            });
            inp.click();
          } }, ic('upload', 15), 'Upload CSV')));
        var table = h('div', { class: 'tr-table', role: 'table', style: '--cols:' + (langs.length + 1) });
        table.append(h('div', { class: 'tr-row tr-head', role: 'row' }, h('span', { role: 'columnheader' }, LOCALES[base]), langs.map(function (l) { return h('span', { role: 'columnheader' }, LOCALES[l]); })));
        rows.forEach(function (r) {
          var src = r.get(null) || '';
          table.append(h('div', { class: 'tr-row' + (r.group ? ' grp' : ''), role: 'row' },
            h('span', { class: 'tr-src', role: 'cell' }, h('small', {}, r.what), src || h('i', {}, '(empty)')),
            langs.map(function (l) {
              var v = r.get(l) || '';
              var long = src.length > 60;
              return h('label', { class: 'tr-cell', role: 'cell' }, h('small', {}, LOCALES[l]),
                h(long ? 'textarea' : 'input', { type: 'text', rows: long ? 2 : null, value: v, placeholder: src ? '' : '', class: v || !src ? '' : 'missing', 'aria-label': r.what + ' in ' + LOCALES[l], oninput: function (e) {
                  r.set(l, e.target.value.trim()); e.target.classList.toggle('missing', !e.target.value.trim() && !!src); changed();
                } }));
            })));
        });
        table.querySelectorAll('textarea').forEach(function (ta) {
          var row = rows[Array.prototype.indexOf.call(table.children, ta.closest('.tr-row')) - 1];
          if (row) { var lang = langs[Array.prototype.indexOf.call(ta.closest('.tr-row').querySelectorAll('.tr-cell'), ta.closest('.tr-cell'))]; ta.value = row.get(lang) || ''; }
        });
        body.append(table);
      }
      draw();
      return root;
    }

    return { questions: questions, translations: translations, ensureModel: ensureModel, adoptFiles: adoptFiles, sync: sync, parseCsv: parseCsv };
  }

  root.OdeQuestionEditor = { create: create };
})(typeof self !== 'undefined' ? self : this);
