// Builds the Synkronus app bundle: a zip with app/ and forms/ side by side.
// Also writes build/desktop/ (app files with forms/ inside) for ODE Desktop developer mode.
// Usage: npm run bundle
import { readFileSync, readdirSync, statSync, mkdirSync, writeFileSync, rmSync, cpSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';
import JSZip from 'jszip';

const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
const name = `${pkg.name}_v${pkg.version}_bundle.zip`;

function walk(dir) {
  return readdirSync(dir).flatMap(n => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

if (!existsSync('app/index.html')) throw new Error('app/index.html is missing. Run npm run build first.');
const zip = new JSZip();
const date = new Date('2026-01-01T00:00:00Z');
for (const top of ['app', 'forms', 'renderers']) {
  if (!existsSync(top)) continue;
  for (const file of walk(top)) {
    if (file.endsWith('BRIEF.md') || file.endsWith('.DS_Store')) continue;
    zip.file(relative('.', file).split('\\').join('/'), readFileSync(file), { date });
  }
}
mkdirSync('build', { recursive: true });
writeFileSync(join('build', name), await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' }));

rmSync('build/desktop', { recursive: true, force: true });
cpSync('app', 'build/desktop', { recursive: true });
if (existsSync('forms')) cpSync('forms', 'build/desktop/forms', { recursive: true });

console.log(`Wrote build/${name} (upload this to Synkronus)`);
console.log('Wrote build/desktop/ (point ODE Desktop developer mode at this folder)');
