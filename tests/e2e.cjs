// End-to-end: serves the builder, drives it in Chromium from a template to a download, and runs
// the downloaded app (plain and React) with a pretend Formulus. Run: node tests/e2e.cjs
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const JSZip = require('jszip');
const assert = require('assert/strict');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(__dirname, 'out');
const SHOTS = path.join(__dirname, 'shots');
fs.mkdirSync(OUT, { recursive: true });
const PORT = 5199;
const url = 'http://localhost:' + PORT + '/';
fs.mkdirSync(SHOTS, { recursive: true });

async function unzipTo(zip, dir) {
  fs.rmSync(dir, { recursive: true, force: true });
  for (const n of Object.keys(zip.files).filter(n => !zip.files[n].dir)) {
    const p = path.join(dir, n);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, await zip.file(n).async('nodebuffer'));
  }
}
const pretendFormulus = () => {
  window.__calls = [];
  const store = {
    household: [{ observationId: 'o1', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), data: { village: 'Kisenyi', head_name: 'Amina N.', members: 5 } }],
    visit: [{ observationId: 'v1', createdAt: new Date().toISOString(), data: { household_id: 'o1', visit_date: '2026-11-10', reason: 'routine' } }],
  };
  window.formulus = {
    getVersion: async () => '1.0.0',
    getAvailableForms: async () => [],
    getObservations: async t => store[t] || [],
    openFormplayer: async (t, params, saved, opts) => { window.__calls.push({ t, params, saved, opts }); return { status: 'form_submitted', formType: t, observationId: 'new' }; },
  };
};

/** The downloaded app on a phone: dashboard, list, record page with linked visits, back steps back. */
async function checkRuntime(browser, appDir, label, errors) {
  const phone = await browser.newPage({ viewport: { width: 390, height: 780 }, deviceScaleFactor: 1 });
  phone.on('pageerror', e => errors.push(label + ': ' + e.message));
  await phone.addInitScript(pretendFormulus);
  await phone.goto('file://' + path.join(appDir, 'app/index.html'));
  await phone.locator('[data-form=household]').waitFor();
  await phone.waitForFunction(() => document.querySelector('.card .count'));
  assert.equal(await phone.locator('.stat').count(), 3, label + ' dashboard stats');
  assert.match(await phone.locator('[data-form=household]').textContent(), /1 saved/);
  await phone.screenshot({ path: path.join(SHOTS, label + '-home.png') });
  await phone.locator('[data-form=household]').click();
  await phone.locator('[data-id=o1]').click();
  await phone.locator('[data-child=visit]').waitFor();
  assert.match(await phone.locator('[data-child=visit] h3').textContent(), /\(1\)/);
  assert.match(await phone.locator('.answers').textContent(), /Kisenyi/);
  await phone.screenshot({ path: path.join(SHOTS, label + '-record.png') });
  await phone.locator('[data-action=edit]').click();
  await phone.waitForFunction(() => window.__calls.length === 1);
  await phone.locator('[data-child=visit] [data-action=new-child]').click();
  await phone.waitForFunction(() => window.__calls.length === 2);
  const calls = await phone.evaluate(() => window.__calls);
  assert.deepEqual(calls[0].opts, { observationId: 'o1' });
  assert.equal(calls[0].saved.village, 'Kisenyi');
  assert.equal(calls[1].t, 'visit');
  assert.equal(calls[1].params.defaultData.household_id, 'o1');
  assert.equal(await phone.locator('#toast').textContent(), 'Saved');
  await phone.goBack();
  await phone.waitForFunction(() => location.hash === '#/f/household');
  await phone.locator('.bar .back').click();
  await phone.waitForFunction(() => location.hash === '#/');
  assert.equal(await phone.evaluate(() => document.documentElement.scrollWidth), 390);
  await phone.close();
}

(async () => {
  const server = require('child_process').spawn(process.execPath, [path.join(ROOT, 'tools/serve.mjs')], { env: { ...process.env, PORT: String(PORT) }, stdio: 'ignore' });
  process.on('exit', () => server.kill());
  for (let i = 0; i < 50; i++) { try { await fetch(url); break; } catch { await new Promise(r => setTimeout(r, 100)); } }
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 }, deviceScaleFactor: 1, acceptDownloads: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });

  const appField = (k) => page.evaluate(k => { const ix = JSON.parse(localStorage.getItem('ode-app-builder:apps')); return JSON.parse(localStorage.getItem('ode-app-builder:app:' + ix[0].id)); }, k);
  await page.goto(url);
  await page.getByRole('heading', { name: 'Make an ODE app' }).waitFor();
  await page.screenshot({ path: path.join(SHOTS, '1-start.png') });

  // A new app from scratch: name, look, saved, then the first form
  await page.locator('[data-role=new-app]').click();
  await page.locator('[data-role=app-name]').fill('Bed Net Survey');
  await page.locator('[data-role=wiz-next]').click();
  await page.locator('[data-colour="#6D28D9"]').first().click();
  assert.match(await page.locator('[data-role=wiz-next]').textContent(), /Save app/);
  await page.locator('[data-role=wiz-next]').click();
  await page.getByRole('heading', { name: 'Bed Net Survey is ready' }).waitFor();
  let saved = await appField();
  assert.equal(saved.app.name, 'Bed Net Survey');
  assert.equal(saved.brand.primary, '#6D28D9');
  await page.locator('[data-role=first-form]').click();
  await page.locator('input[data-role=ask-text]').fill('Quick check');
  await page.locator('[data-role=ask-ok]').click();
  await page.locator('textarea.brief').waitFor();
  assert.match(await page.evaluate(() => location.hash), /^#\/app\/[^/]+\/forms\/0/);
  // Back goes one step: the forms list, then home with the app listed
  await page.goBack();
  await page.locator('.form-row[data-form=quick_check]').waitFor();
  await page.goBack();
  await page.locator('.app-row').first().waitFor();
  assert.match(await page.locator('.app-row').first().textContent(), /Bed Net Survey/);

  // Start from the community health template
  assert.equal(await page.locator('[data-gallery]').count(), 10);
  await page.locator('[data-gallery=health]').click();
  await page.locator('.gform').first().waitFor();
  assert.equal(await page.locator('.gform').count(), 3);
  await page.screenshot({ path: path.join(SHOTS, '1b-template.png') });
  await page.locator('[data-role=use-template]').click();
  await page.locator('.form-row[data-form]').first().waitFor();
  assert.deepEqual(await page.locator('.form-row .status').allTextContents(), ['Ready', 'Ready', 'Ready']);
  assert.equal(await page.locator('.app-row').count(), 0);
  const frame = page.frameLocator('#previewFrame');
  await frame.locator('.card').first().waitFor();
  assert.equal(await frame.locator('.card').count(), 1, 'members and visits open from the household page');
  assert.match(await frame.locator('h1').textContent(), /Community Health/);
  assert.doesNotMatch(await frame.locator('main').textContent(), /null|undefined/);
  assert.equal(await frame.locator('.card .icon svg').count(), 1);
  await page.screenshot({ path: path.join(SHOTS, '2-forms.png') });

  // App tab: change name and colour, see preview follow
  await page.locator('[data-apptab=app]').click();
  await page.locator('[data-section=name] summary').click();
  await page.locator('.field', { hasText: 'App name' }).locator('input').fill('Kampala Health Visits');
  await page.locator('[data-section=look] summary').click();
  await page.locator('[data-section=look] [data-colour="#6D28D9"]').first().click();
  await page.waitForTimeout(500);
  assert.match(await frame.locator('h1').textContent(), /Kampala Health Visits/);
  assert.equal(await frame.locator('.top').evaluate(el => getComputedStyle(el).backgroundColor), 'rgb(109, 40, 217)');
  await page.screenshot({ path: path.join(SHOTS, '3-app.png'), fullPage: true });

  // Add a new form with AI, paste an answer with a mistake, then a fixed one
  await page.locator('[data-apptab=forms]').click();
  await page.locator('[data-role=add-form]').click();
  await page.locator('input[data-role=ask-text]').fill('Bed net check');
  await page.locator('.method[data-method=ai]').click();
  await page.locator('[data-role=ask-ok]').click();
  await page.locator('textarea.brief').fill('- Number of nets (whole number)\n- Nets hung? Yes/No\n  - If no: why not');
  await page.waitForTimeout(400);
  assert.equal((await appField()).forms.pop().formType, 'bed_net_check');
  await page.locator('[data-role=brief-next]').click();
  await page.getByRole('button', { name: /Copy prompt/ }).click();
  const pasteBox = page.locator('textarea[placeholder^="Paste the whole AI answer"]');
  await pasteBox.waitFor();
  const bad = 'Here you go:\n```json schema.json\n{"type":"object","title":"Bed net check","version":"1","properties":{"nets":{"type":"integer","title":"Number of nets"},"hung":{"type":"string","title":"Nets hung?","oneOf":[{"const":"1","title":"Yes"},{"const":"2","title":"No"}]},"why":{"type":"string","title":"Why not?"}},"required":["nets","hung","why"]}\n```\n```json ui.json\n{"type":"SwipeLayout","elements":[{"type":"VerticalLayout","elements":[{"type":"Control","scope":"#/properties/nets"},{"type":"Control","scope":"#/properties/hung"},{"type":"Control","scope":"#/properties/why","rule":{"effect":"SHOW","condition":{"scope":"#/properties/hung","schema":{"const":2}}}}]}]}\n```';
  await pasteBox.fill(bad);
  await page.getByRole('button', { name: 'Check and use this answer' }).click();
  await page.locator('.problems li.error').first().waitFor();
  const probs = await page.locator('.problems li').allTextContents();
  assert.ok(probs.some(t => /can be hidden by a rule but is in the top-level "required"/.test(t)), probs.join('\n'));
  assert.ok(probs.some(t => /not one of its choices/.test(t)), probs.join('\n'));
  await page.getByRole('button', { name: /Copy fix-up prompt/ }).waitFor();
  await page.screenshot({ path: path.join(SHOTS, '4-problems.png'), fullPage: true });
  const good = bad.replace('"required":["nets","hung","why"]', '"required":["nets","hung"]').replace('"const":2}', '"const":"2"}');
  await page.locator('textarea[placeholder^="Paste the whole AI answer"]').fill(good);
  await page.getByRole('button', { name: 'Check and use this answer' }).click();
  await page.locator('.ai-done').waitFor();
  assert.equal(await page.locator('.formhead .status').textContent(), 'Ready');
  await page.locator('.ai-done summary').click();
  assert.match(await page.locator('.ai-done .outline').textContent(), /Shown only if "Nets hung\?" is No/);

  // Try it opens the form inside the preview phone
  await page.locator('[data-role=try-form]').click();
  await page.locator('#previewPane .fp-inline').waitFor();

  // The same form in the question editor
  await page.getByRole('tab', { name: /Questions/ }).click();
  await page.locator('.qcard').first().waitFor();
  assert.equal(await page.locator('.qcard').count(), 3);

  // Preview: two home cards now (household and the new form)
  await page.locator('.link-back').click();
  await page.waitForTimeout(400);
  assert.equal(await frame.locator('.card').count(), 2);

  // Publish tab
  await page.locator('[data-apptab=publish]').click();
  await page.screenshot({ path: path.join(SHOTS, '5-publish.png'), fullPage: true });
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: /Download app bundle/ }).click()]);
  assert.equal(dl.suggestedFilename(), 'kampala-health-visits_v1.0.0_bundle.zip');
  const bundlePath = path.join(OUT, dl.suggestedFilename());
  await dl.saveAs(bundlePath);
  const [dl2] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: /Source project/ }).click()]);
  assert.equal(dl2.suggestedFilename(), 'kampala-health-visits_v1.0.0_source.zip');
  await dl2.saveAs(path.join(OUT, dl2.suggestedFilename()));
  const [dl3] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: /Project file/ }).click()]);
  assert.equal(dl3.suggestedFilename(), 'kampala-health-visits.odeapp.json');

  const zip = await JSZip.loadAsync(fs.readFileSync(bundlePath));
  const names = Object.keys(zip.files).filter(n => !zip.files[n].dir).sort();
  console.log('bundle files:', names.join(', '));
  assert.ok(names.every(n => /^(app|forms)\//.test(n)));
  assert.ok(names.includes('forms/bed_net_check/schema.json'));
  assert.ok(names.includes('forms/visit/ui.json'));

  // Reload keeps the work (autosave), and both apps are listed at home
  await page.reload();
  await page.getByRole('heading', { name: 'Kampala Health Visits' }).waitFor();
  await page.locator('.brandmark').click();
  await page.locator('.app-row').first().waitFor();
  assert.equal(await page.locator('.app-row').count(), 2);
  assert.match(await page.locator('.app-row').first().textContent(), /Kampala Health Visits/);
  await page.locator('.app-row .app-open').first().click();
  await page.locator('[data-apptab=publish]').click();

  // Device preview: ODE Desktop sizes, rotate, and an Android Back that steps one screen
  await page.locator('[data-apptab=forms]').click();
  await page.selectOption('#pvDevice', 'android-standard-tablet');
  await page.waitForFunction(() => /^800 × 1280 · Portrait/.test(document.getElementById('pvMeta').textContent));
  await page.locator('#pvRotate').click();
  await page.waitForFunction(() => /^1280 × 800 · Landscape/.test(document.getElementById('pvMeta').textContent));
  await page.selectOption('#pvDevice', 'android-medium-phone');
  await page.locator('#pvRotate').click();
  await frame.locator('.card').first().click();
  await frame.locator('[data-id]').first().waitFor();
  const before = await page.evaluate(() => history.length);
  await page.locator('[data-nav=back]').click();
  await frame.locator('.card').first().waitFor();
  await page.locator('[data-nav=back]').click();
  await page.locator('.dv-toast:not([hidden])').waitFor();
  assert.equal(await page.evaluate(() => history.length), before, 'the preview never adds to the builder history');
  await page.locator('[data-apptab=publish]').click();

  // Phone layout: no sideways scroll on any screen
  const mob = await browser.newPage({ viewport: { width: 360, height: 780 } });
  await mob.goto(url);
  for (const sel of ['[data-role=new-app]', null]) {
    await mob.waitForTimeout(300);
    assert.equal(await mob.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1), false, 'no horizontal scroll on phones');
    if (sel) await mob.locator(sel).click();
  }
  await mob.close();

  // ---- Runtime from the downloaded bundle, with a pretend Formulus ----
  const appDir = path.join(OUT, 'unzipped');
  await unzipTo(zip, appDir);
  await checkRuntime(browser, appDir, '6-plain', errors);

  // ---- The React starter: same project, built with React ----
  await page.locator('[data-apptab=app]').click();
  await page.locator('[data-section=code] summary').click();
  await page.getByRole('radio', { name: /React starter/ }).click();
  await page.locator('[data-apptab=publish]').click();
  const [dlr] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: /Download app bundle/ }).click()]);
  const rzip = await JSZip.loadAsync(fs.readFileSync(await dlr.path()));
  assert.ok(rzip.file('app/runtime.js') && !rzip.file('app/runtime.css'));
  assert.match(await rzip.file('app/index.html').async('string'), /id="root"/);
  const reactDir = path.join(OUT, 'unzipped-react');
  await unzipTo(rzip, reactDir);
  await checkRuntime(browser, reactDir, '7-react', errors);
  const [dlrs] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: /Source project/ }).click()]);
  const rsrc = await JSZip.loadAsync(fs.readFileSync(await dlrs.path()));
  for (const f of ['src/App.tsx', 'src/router.ts', 'vite.config.ts', 'public/icons.js', 'app/runtime.js', 'app/config.js', 'forms/household/schema.json'])
    assert.ok(rsrc.file('kampala-health-visits/' + f), 'React source has ' + f);

  // Without Formulus: friendly message, no crash
  const plain = await browser.newPage();
  await plain.goto('file://' + path.join(appDir, 'app/index.html'));
  await plain.waitForTimeout(9000);
  assert.match(await plain.locator('main').textContent(), /Open this app in Formulus or ODE Desktop/);

  const real = errors.filter(e => !/getFormulus|Formulus API|favicon/i.test(e));
  assert.deepEqual(real, [], real.join('\n'));
  await browser.close();
  server.kill();
  console.log('E2E OK');
})().catch(e => { console.error(e); process.exit(1); });
