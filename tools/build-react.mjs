// Builds the React starter (source-template/react) and copies the result into runtime/react/,
// so the builder can ship it and preview it like the Simple design. The CSS is bundled into
// runtime.js (one classic script, which also works when Formulus loads the app from file://).
// Run after changing source-template/react:  node tools/build-react.mjs  (then node tools/embed.mjs)
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, 'source-template/react');
const work = join(root, '.react-build');
const keep = existsSync(join(work, 'node_modules'));
if (keep) {
  for (const p of ['src', 'public', 'scripts', 'index.html', 'vite.config.ts', 'tsconfig.json', 'app']) rmSync(join(work, p), { recursive: true, force: true });
}
mkdirSync(work, { recursive: true });
cpSync(src, work, { recursive: true });
cpSync(join(root, 'runtime/simple/icons.js'), join(work, 'public/icons.js'));
const pkg = JSON.parse(readFileSync(join(src, 'package.json'), 'utf8'));
Object.assign(pkg, { name: 'ode-react-starter', version: '1.0.0', description: 'ODE App Builder React starter' });
writeFileSync(join(work, 'package.json'), JSON.stringify(pkg, null, 2));
const run = (cmd) => execSync(cmd, { cwd: work, stdio: 'inherit' });
if (!keep) run('npm install --no-audit --no-fund');
mkdirSync(join(work, 'app'), { recursive: true });
run('npx tsc --noEmit');
run('npx vite build');
const out = join(root, 'runtime/react');
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
for (const f of ['index.html', 'runtime.js', 'formulus-load.js', 'icons.js']) cpSync(join(work, 'app', f), join(out, f));
console.log('runtime/react updated');
