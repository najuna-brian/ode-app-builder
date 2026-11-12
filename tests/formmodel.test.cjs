const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const FM = require('../builder/js/formmodel.js');
const core = require('../builder/js/core.js');
const Ajv = require('ajv').default;

function build() {
  const m = FM.newModel('Farm visit');
  m.titles.sw = 'Ziara ya shamba';
  const p1 = m.pages[0];
  const names = () => FM.fieldNames(m);
  const a = FM.newQuestion('text', names(), 'Farmer name'); a.required = true; a.labels.sw = 'Jina la mkulima'; p1.questions.push(a);
  const b = FM.newQuestion('select_one', names(), 'Has crops?'); b.required = true; b.choices[0].labels.sw = 'Ndiyo'; p1.questions.push(b);
  const c = FM.newQuestion('select_many', names(), 'Which crops'); c.choices = [{ value: 'maize', label: 'Maize', labels: {} }, { value: 'beans', label: 'Beans', labels: {} }];
  c.showIf = { match: 'all', rules: [{ q: b.name, op: 'eq', value: 'yes' }] }; c.required = true; c.min = 1; p1.questions.push(c);
  const p2 = FM.newPage('Maize'); p2.showIf = { match: 'all', rules: [{ q: c.name, op: 'includes', value: 'maize' }] }; m.pages.push(p2);
  const d = FM.newQuestion('decimal', names(), 'Maize area (acres)'); d.required = true; d.min = 0; d.max = 500; p2.questions.push(d);
  const e = FM.newQuestion('note', names(), 'Thank the farmer.'); p2.questions.push(e);
  const f = FM.newQuestion('photo', names(), 'Photo of the field'); f.showIf = { match: 'any', rules: [{ q: d.name, op: 'gt', value: 2 }, { q: a.name, op: 'answered' }] }; p2.questions.push(f);
  return m;
}

test('compiled form passes the ODE checks', () => {
  const m = build();
  assert.deepStrictEqual(FM.checkModel(m), []);
  const c = FM.compileForm(m);
  const v = core.validateForm(c.schemaText, c.uiText, { formType: 'farm_visit', Ajv });
  assert.ok(v.valid, JSON.stringify(v.diagnostics));
  assert.deepStrictEqual(c.schema.required, ['farmer_name', 'has_crops']);
  assert.strictEqual(c.schema.allOf.length, 2);
  assert.strictEqual(c.ui.translations.sw.headerTitle, 'Ziara ya shamba');
  assert.strictEqual(c.ui.elements[1].rule.condition.schema.contains.const, 'maize');
  assert.strictEqual(c.ui.elements[1].elements[3].rule.condition.type, 'OR');
});

test('conditional required behaves like the rules', () => {
  const c = FM.compileForm(build());
  const ajv = new Ajv({ strict: false });
  const ok = ajv.compile(c.schema);
  assert.ok(ok({ farmer_name: 'A', has_crops: 'no' }));
  assert.ok(!ok({ farmer_name: 'A', has_crops: 'yes' }));
  assert.ok(ok({ farmer_name: 'A', has_crops: 'yes', which_crops: ['beans'] }));
  assert.ok(!ok({ farmer_name: 'A', has_crops: 'yes', which_crops: ['maize'] }));
  assert.ok(ok({ farmer_name: 'A', has_crops: 'yes', which_crops: ['maize'], maize_area_acres: 1.5 }));
});

test('round trip keeps the model', () => {
  const m = build();
  const c = FM.compileForm(m);
  const p = FM.parseForm(c.schemaText, c.uiText);
  assert.deepStrictEqual(p.problems, []);
  const c2 = FM.compileForm(p.model);
  assert.strictEqual(c2.schemaText, c.schemaText);
  assert.strictEqual(c2.uiText, c.uiText);
});

test('example forms read into the editor and compile back valid', () => {
  for (const f of ['household', 'home_visit']) {
    const dir = path.join(__dirname, '../examples/community-health/forms', f);
    const p = FM.parseForm(fs.readFileSync(dir + '/schema.json', 'utf8'), fs.readFileSync(dir + '/ui.json', 'utf8'));
    assert.deepStrictEqual(p.problems, [], f);
    const c = FM.compileForm(p.model);
    assert.ok(core.validateForm(c.schemaText, c.uiText, { formType: f, Ajv }).valid, f);
  }
});

test('unsupported features are reported, not lost', () => {
  const s = { type: 'object', properties: { x: { type: 'string', format: 'likert' } } };
  const u = { type: 'SwipeLayout', elements: [{ type: 'VerticalLayout', elements: [{ type: 'Control', scope: '#/properties/x' }] }] };
  const p = FM.parseForm(JSON.stringify(s), JSON.stringify(u));
  assert.strictEqual(p.model, null);
  assert.ok(p.problems[0].includes('likert'));
});

test('checkModel finds broken show-if and duplicates', () => {
  const m = build();
  m.pages[0].questions[1].name = 'farmer_name';
  m.pages[0].questions[0].showIf = { match: 'all', rules: [{ q: 'maize_area_acres', op: 'gt', value: 1 }] };
  const msgs = FM.checkModel(m).map((x) => x.message).join('\n');
  assert.match(msgs, /share the data name/);
  assert.match(msgs, /does not come before/);
});

test('every editor question type compiles valid and round-trips', () => {
  const m = FM.newModel('All types');
  for (const t of FM.TYPES) m.pages[0].questions.push(FM.newQuestion(t.id, FM.fieldNames(m), t.name));
  const lik = m.pages[0].questions.find((q) => q.type === 'likert');
  const last = FM.newQuestion('text', FM.fieldNames(m), 'Why');
  last.showIf = { match: 'all', rules: [{ q: lik.name, op: 'lte', value: 2 }] };
  m.pages[0].questions.push(last);
  m.pages[0].questions.forEach((q) => { if (q.type === 'note') q.name = ''; });
  assert.deepStrictEqual(FM.checkModel(m), []);
  const c = FM.compileForm(m);
  const v = core.validateForm(c.schemaText, c.uiText, { formType: 'all_types', Ajv });
  assert.ok(v.valid, JSON.stringify(v.diagnostics.filter((d) => d.severity === 'error')));
  assert.strictEqual(c.schema.properties.rating_scale.oneOf[0].const, 1);
  assert.strictEqual(c.schema.properties.timer.duration.mode, 'stopwatch');
  const p = FM.parseForm(c.schemaText, c.uiText);
  assert.deepStrictEqual(p.problems, []);
  assert.strictEqual(FM.compileForm(p.model).schemaText, c.schemaText);
});

test('XLSForm sheets import into a valid ODE form', () => {
  const X = require('../builder/js/xlsform.js');
  const { SHEETS } = require('./fixtures/make-xlsform.cjs');
  const asObjects = {};
  for (const k of Object.keys(SHEETS)) asObjects[k] = X.tableToObjects(SHEETS[k]);
  const r = X.fromSheets(asObjects);
  assert.strictEqual(r.title, 'Farm visit');
  assert.strictEqual(r.formType, 'farm_visit');
  assert.deepStrictEqual(r.languages, ['sw']);
  const m = r.model;
  assert.strictEqual(m.pages.length, 2);
  assert.strictEqual(m.pages[0].title, 'The farmer');
  assert.strictEqual(m.pages[0].titles.sw, 'Mkulima');
  const q = Object.fromEntries(FM.allQuestions(m).map((x) => [x.q.name, x.q]));
  assert.strictEqual(q.farmer_name.labels.sw, 'Jina la mkulima');
  assert.strictEqual(q.farmer_name.hint, 'As on the ID card');
  assert.strictEqual(q.age.min, 18);
  assert.strictEqual(q.crops.type, 'select_many');
  assert.strictEqual(q.notes.type, 'longtext');
  assert.deepStrictEqual(q.maize_acres.showIf.rules[0], { q: 'crops', op: 'includes', value: 'maize' });
  assert.deepStrictEqual(m.pages[1].showIf.rules[0], { q: 'has_plot', op: 'eq', value: 'yes' });
  assert.ok(r.warnings.some((w) => /calculation "total"/.test(w)));
  assert.ok(r.warnings.some((w) => /Skipped automatic fields \(start\)/.test(w)));
  const c = FM.compileForm(m);
  const v = core.validateForm(c.schemaText, c.uiText, { formType: 'farm_visit', Ajv });
  assert.ok(v.valid, JSON.stringify(v.diagnostics.filter((d) => d.severity === 'error')));
});

test('templates gallery: every sector app compiles, validates and links', async () => {
  const { buildGallery } = await import('../tools/gallery.mjs');
  const Ajv = require('ajv').default;
  const core = require('../builder/js/core.js');
  const g = buildGallery(require('fs').readFileSync(require('path').join(__dirname, '../gallery/templates.txt'), 'utf8'));
  assert.ok(Object.keys(g).length >= 10);
  for (const [id, p] of Object.entries(g)) {
    const r = core.checkProject(p, Ajv);
    const bad = (r.problems || r).filter(x => x.severity === 'error' || x.severity === 'warning');
    assert.deepStrictEqual(bad, [], id);
    for (const f of p.forms) {
      const back = FM.parseForm(f.schemaText, f.uiText);
      assert.ok(back.model && !back.problems.length, id + '/' + f.formType);
      if (f.parent) assert.ok(FM.fieldNames(f.model).includes(core.linkField(f.parent)), id + '/' + f.formType + ' link');
    }
  }
});
