// Unit tests for builder/js/core.js. Run: node --test tests/
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const JSZip = require('jszip');
const Ajv = require('ajv').default;
const core = require('../builder/js/core.js');
const templates = require('../builder/js/templates.js');
const examples = require('../builder/js/examples.js');

const OUT = path.join(__dirname, 'out');
fs.mkdirSync(OUT, { recursive: true });
const example = () => core.normalizeProject(JSON.parse(JSON.stringify(examples['community-health'])));
const codes = r => r.diagnostics.map(d => d.code);
const S = o => JSON.stringify(o);

test('slugify makes valid form ids', () => {
  assert.equal(core.slugify('BP Visit (follow-up)'), 'bp_visit_follow_up');
  assert.equal(core.slugify('2nd round'), 'f_2nd_round');
  assert.equal(core.slugify('Ação Saúde'), 'acao_saude');
  assert.ok(core.isValidFormType(core.slugify('!!!')));
});

test('palette has every Formulus theme role and readable text on primary', () => {
  const roles = ['primary','primaryLight','primaryDark','onPrimary','secondary','secondaryLight','secondaryDark','onSecondary','background','surface','onBackground','onSurface','error','errorLight','errorDark','onError','warning','success','info','divider'];
  for (const c of ['#0F766E', '#FFD600', '#000000', '#ffffff', '#C65A3A']) {
    const p = core.makePalette(c, '#B45309');
    for (const mode of ['light', 'dark']) {
      for (const r of roles) assert.match(p[mode][r], /^#[0-9A-F]{6}$/, `${mode}.${r} for ${c}`);
      assert.ok(core.contrast(p[mode].onBackground, p[mode].background) >= 7, `body text contrast ${mode} ${c}`);
    }
  }
});

test('example forms pass all checks', () => {
  const r = core.checkProject(example(), Ajv);
  assert.equal(r.ok, true, S(r.problems));
  assert.equal(r.problems.length, 0, S(r.problems));
});

test('validator catches the mistakes AI makes', () => {
  const schema = { type: 'object', version: '1', title: 'T', properties: { a: { type: 'string', title: 'A', oneOf: [{ const: '1', title: 'Y' }, { const: '2', title: 'N' }] }, b: { type: 'string', title: 'B' } }, required: ['a', 'b', 'zz'] };
  const ui = { type: 'VerticalLayout', elements: [
    { type: 'Control', scope: '#/properties/a' },
    { type: 'Control', scope: '#/properties/b', rule: { effect: 'SHOW', condition: { scope: '#/properties/a', schema: { const: 1 } } } },
    { type: 'Control', scope: '#/properties/missing' },
    { type: 'Control', scope: '#/properties/a', rule: { effect: 'BLINK', condition: { scope: '#/properties/nope', schema: { const: '1' } } } },
  ] };
  const r = core.validateForm(S(schema), S(ui), { formType: 'Bad Name', Ajv });
  const c = codes(r);
  for (const want of ['invalid_form_type', 'unknown_required', 'root_not_swipe_layout', 'rule_value_not_a_choice', 'invalid_scope', 'invalid_rule_effect', 'invalid_rule_scope', 'required_but_conditional'])
    assert.ok(c.includes(want), `expected ${want} in ${c}`);
  assert.equal(r.valid, false);
});

test('validator reports broken JSON and bad JSON Schema', () => {
  assert.ok(codes(core.validateForm('{', '{}', {})).includes('invalid_json'));
  const bad = core.validateForm(S({ type: 'object', properties: { a: { type: 'strin' } } }), S({ type: 'SwipeLayout', elements: [] }), { Ajv });
  assert.ok(codes(bad).includes('invalid_schema'), S(bad.diagnostics));
});

test('validator flags unknown formats, removed fields and missing linked forms', () => {
  const schema = { type: 'object', version: '2', properties: { a: { type: 'string', format: 'rainbow', title: 'A' }, kids: { type: 'array', format: 'sub-observation', linkedForm: 'child', title: 'Kids' } } };
  const ui = { type: 'SwipeLayout', elements: [{ type: 'VerticalLayout', elements: [{ type: 'Control', scope: '#/properties/a' }, { type: 'Control', scope: '#/properties/kids' }] }] };
  const r = core.validateForm(S(schema), S(ui), { knownForms: ['main'], previousFields: ['a', 'old_field'] });
  assert.ok(codes(r).includes('unknown_format'));
  assert.ok(codes(r).includes('missing_linked_form'));
  assert.ok(codes(r).includes('field_removed'));
});

test('extractForm pulls both files from a chatty AI answer', () => {
  const answer = 'Sure! Assumptions:\n- codes are yes/no\n\n```json schema.json\n{"type":"object","properties":{"a":{"type":"string"}}}\n```\n\nAnd:\n\n```json ui.json\n{"type":"SwipeLayout","elements":[]}\n```\nHope this helps.';
  const r = core.extractForm(answer);
  assert.equal(JSON.parse(r.schema).type, 'object');
  assert.equal(JSON.parse(r.ui).type, 'SwipeLayout');
  // Plain ```json fences, UI first
  const r2 = core.extractForm('```json\n{"type":"SwipeLayout","elements":[]}\n```\n```json\n{"type":"object","properties":{}}\n```');
  assert.equal(JSON.parse(r2.ui).type, 'SwipeLayout');
  assert.equal(JSON.parse(r2.schema).type, 'object');
  // Bare JSON objects without fences
  const r3 = core.extractForm('{"type":"object","properties":{"x":{"type":"string","title":"a { b"}}}\n\n{"type":"SwipeLayout","elements":[]}');
  assert.equal(JSON.parse(r3.schema).properties.x.title, 'a { b');
  assert.equal(JSON.parse(r3.ui).type, 'SwipeLayout');
});

test('prompt includes the brief, the rules, languages and the output contract', () => {
  const p = example();
  const prompt = core.buildPrompt(p, p.forms[1]);
  assert.match(prompt, /Form id \(folder name, do not change\): home_visit/);
  assert.match(prompt, /Is anyone sick today/);
  assert.match(prompt, /Kiswahili \(sw\)/);
  assert.match(prompt, /```json schema\.json/);
  assert.match(prompt, /SwipeLayout/);
  assert.match(prompt, /current version of this form/); // editing an existing form
  assert.doesNotMatch(core.buildPrompt(p, p.forms[1], { mode: 'new' }), /current version of this form/);
});

test('bundle has only app/ and forms/ at the top, with config and theme', async () => {
  const p = example();
  p.app.logo = { name: 'logo.png', dataUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==' };
  const zip = core.bundleZip(JSZip, p, templates);
  const names = Object.keys(zip.files).filter(n => !zip.files[n].dir);
  for (const n of names) assert.match(n, /^(app|forms)\//, n);
  for (const need of ['app/index.html', 'app/runtime.js', 'app/runtime.css', 'app/formulus-load.js', 'app/config.js', 'app/app.config.json', 'app/logo.png', 'app/odeapp.json', 'forms/household/schema.json', 'forms/household/ui.json', 'forms/home_visit/schema.json', 'forms/home_visit/ui.json'])
    assert.ok(names.includes(need), need);
  assert.ok(!names.includes('manifest.json'));
  const appCfg = JSON.parse(await zip.file('app/app.config.json').async('string'));
  assert.equal(appCfg.name, 'Community Health Visits');
  assert.ok(appCfg.theme.light.primary && appCfg.theme.dark.primary);
  const cfgJs = await zip.file('app/config.js').async('string');
  assert.match(cfgJs, /window\.ODE_APP_CONFIG = /);
  const buf = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
  fs.writeFileSync(path.join(OUT, core.fileNames(p).bundle), buf);
  const src = await core.sourceZip(JSZip, p, templates).generateAsync({ type: 'nodebuffer' });
  fs.writeFileSync(path.join(OUT, core.fileNames(p).source), src);
});

test('a bundle re-opens as the same project', async () => {
  const p = example();
  const buf = await core.bundleZip(JSZip, p, templates).generateAsync({ type: 'nodebuffer' });
  const back = await core.projectFromBundle(JSZip, buf);
  assert.equal(back.app.name, p.app.name);
  assert.equal(back.brand.primary, p.brand.primary);
  assert.deepEqual(back.forms.map(f => f.formType), p.forms.map(f => f.formType));
  assert.equal(back.forms[0].brief, p.forms[0].brief);
  assert.deepEqual(JSON.parse(back.forms[1].schemaText), JSON.parse(p.forms[1].schemaText));
  assert.ok(back.forms[0].lastUploadedFields.includes('village'));
});

test('an AnthroCollect-style bundle (app/forms) also opens', async () => {
  const z = new JSZip();
  z.file('app/index.html', '<html></html>');
  z.file('app/app.config.json', S({ name: 'Other', version: '2.0.0', theme: { light: { primary: '#C65A3A', secondary: '#7A6B5D' }, dark: {} } }));
  z.file('app/forms/visit/schema.json', S({ type: 'object', title: 'Visit', properties: { a: { type: 'string' } } }));
  z.file('app/forms/visit/ui.json', S({ type: 'SwipeLayout', elements: [] }));
  const p = await core.projectFromBundle(JSZip, await z.generateAsync({ type: 'nodebuffer' }));
  assert.equal(p.app.name, 'Other');
  assert.equal(p.brand.primary, '#C65A3A');
  assert.equal(p.forms[0].title, 'Visit');
});

test('names follow the project', () => {
  const p = example();
  p.app.name = 'BP Trial Tracker';
  p.app.version = '1.2.0';
  assert.deepEqual(core.fileNames(p), { bundle: 'bp-trial-tracker_v1.2.0_bundle.zip', source: 'bp-trial-tracker_v1.2.0_source.zip', project: 'bp-trial-tracker.odeapp.json' });
});
