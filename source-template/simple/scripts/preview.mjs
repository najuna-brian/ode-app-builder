// Opens the app in your browser with a pretend Formulus, so you can see the home screen.
// Forms do not open here; use ODE Desktop or Formulus for that.
// Usage: npm run preview   then open http://localhost:5178
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.webp': 'image/webp' };
const mock = `<script>
window.formulus = {
  getVersion: async () => 'preview',
  getAvailableForms: async () => (window.ODE_APP_CONFIG.forms || []).map(f => ({ formType: f.formType, name: f.title })),
  getObservations: async () => [],
  openFormplayer: async (formType) => { alert('In Formulus this opens the form "' + formType + '".'); return { status: 'cancelled', formType }; },
};
</script>`;
createServer(async (req, res) => {
  try {
    let path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (path === '/') path = '/index.html';
    const file = normalize(join('app', path));
    if (!file.startsWith('app')) throw new Error('bad path');
    let body = await readFile(file);
    if (path === '/index.html') body = body.toString().replace('<script src="formulus-load.js"></script>', mock + '<script src="formulus-load.js"></script>');
    res.writeHead(200, { 'content-type': types[extname(file)] || 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404);
    res.end('Not found');
  }
}).listen(5178, () => console.log('Preview on http://localhost:5178'));
