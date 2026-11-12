const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const url = 'file://' + path.join(__dirname, '..', 'builder/index.html');
  await p.goto(url); await p.evaluate(() => localStorage.clear()); await p.reload();
  await p.waitForTimeout(400);
  await p.screenshot({ path: path.join(__dirname, 'shots/a-start.png') });
  await p.getByRole('button', { name: /Example: Community health visits/ }).click();
  await p.locator('.chart-wrap summary').first().click();
  await p.waitForTimeout(500);
  await p.screenshot({ path: path.join(__dirname, 'shots/b-brand.png'), fullPage: true });
  await p.getByRole('button', { name: /Forms/ }).first().click();
  await p.waitForTimeout(600);
  await p.screenshot({ path: path.join(__dirname, 'shots/c-forms.png') });
  await b.close();
})();
