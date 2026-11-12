// Checks every form in forms/ with the same rules the ODE App Builder website uses.
// Usage: npm run check
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const core = require('./builder-core.cjs');
const Ajv = require('ajv').default;

const formsDir = 'forms';
const types = existsSync(formsDir)
  ? readdirSync(formsDir, { withFileTypes: true }).filter(d => d.isDirectory()).map(d => d.name)
  : [];
let errors = 0;
let warnings = 0;
if (!types.length) {
  console.error('No forms found in forms/.');
  process.exit(1);
}
for (const type of types) {
  const read = f => (existsSync(join(formsDir, type, f)) ? readFileSync(join(formsDir, type, f), 'utf8') : '');
  const r = core.validateForm(read('schema.json'), read('ui.json'), { formType: type, knownForms: types, Ajv });
  const shown = r.diagnostics.filter(d => d.severity !== 'info');
  console.log(`${r.valid ? 'OK  ' : 'FAIL'} ${type}${r.summary ? ` (${r.summary.questions} questions, ${r.summary.pages} pages, ${r.summary.rules} rules)` : ''}`);
  for (const d of shown) {
    console.log(`     ${d.severity}: [${d.file}${d.path ? ' ' + d.path : ''}] ${d.message}`);
    if (d.severity === 'error') errors++;
    else warnings++;
  }
}
console.log(`\n${types.length} form(s), ${errors} error(s), ${warnings} warning(s).`);
if (errors) process.exit(1);
