// Copies a built ODE Formplayer into builder/formplayer/ so the builder can preview forms with
// the real form engine (the same build Formulus and ODE Desktop use).
// Usage: node tools/formplayer.mjs <path to ode monorepo>   (after `pnpm build` in formulus-formplayer)
import { cpSync, mkdirSync, readdirSync, rmSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const ode = process.argv[2];
if (!ode) { console.error('Usage: node tools/formplayer.mjs <path to ode repo>'); process.exit(1); }
const build = join(ode, 'formulus-formplayer/build');
if (!existsSync(join(build, 'index.html'))) { console.error('No build at ' + build + '. Run pnpm build in formulus-formplayer first.'); process.exit(1); }
const out = join(root, 'builder/formplayer');
rmSync(out, { recursive: true, force: true });
mkdirSync(join(out, 'public'), { recursive: true });
for (const f of ['index.html', 'formulus-load.js', 'dummyphoto.png']) if (existsSync(join(build, f))) cpSync(join(build, f), join(out, f));
for (const f of readdirSync(join(build, 'public'))) if (!f.endsWith('.map')) cpSync(join(build, 'public', f), join(out, 'public', f));
cpSync(join(ode, 'desktop/public/formplayer-host-stub.js'), join(out, 'formplayer-host-stub.js'));
cpSync(join(ode, 'desktop/public/formulus-injection.js'), join(out, 'formulus-injection.js'));
cpSync(join(ode, 'LICENSE'), join(out, 'LICENSE'));
let commit = 'unknown';
try { commit = execSync('git rev-parse --short HEAD', { cwd: ode }).toString().trim(); } catch (e) { /* not a git checkout */ }
const pkg = JSON.parse(readFileSync(join(ode, 'formulus-formplayer/package.json'), 'utf8'));
writeFileSync(join(out, 'VERSION.json'), JSON.stringify({ source: 'https://github.com/OpenDataEnsemble/ode', commit, formplayer: pkg.version, copied: new Date().toISOString().slice(0, 10) }, null, 2) + '\n');
console.log('Formplayer copied to builder/formplayer (ode ' + commit + ')');
