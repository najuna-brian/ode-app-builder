// Builds the app into app/ (the folder Formulus runs), keeping app/config.js, app.config.json
// and your logo, which the ODE App Builder writes there. One fixed file name (runtime.js, with
// the CSS inside it) so a rebuild replaces the old file instead of piling up hashed copies.
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { readFileSync, existsSync } from 'node:fs';
import { join, extname } from 'node:path';

/** In `npm run dev`, serve config.js, app.config.json and the logo from app/. */
function appSettings(): Plugin {
  const types: Record<string, string> = { '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.webp': 'image/webp' };
  return {
    name: 'ode-app-settings',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const path = decodeURIComponent((req.url || '').split('?')[0]).replace(/^\/+/, '');
        const file = join('app', path);
        const own = path === 'config.js' || path === 'app.config.json' || /^logo\.[a-z]+$/.test(path);
        if (!own || !existsSync(file)) return next();
        res.setHeader('content-type', types[extname(file)] || 'application/octet-stream');
        res.end(readFileSync(file));
      });
    },
  };
}

/**
 * Formulus may load the app from file://, where module scripts are blocked. The build is one
 * IIFE file, so load it as a classic deferred script instead.
 */
function classicScript(): Plugin {
  return {
    name: 'ode-classic-script',
    apply: 'build',
    enforce: 'post',
    transformIndexHtml(html) {
      return html.replace(/<script type="module" crossorigin src="([^"]+)"><\/script>/, '<script defer src="$1"></script>');
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [react(), appSettings(), classicScript()],
  build: {
    outDir: 'app',
    emptyOutDir: false,
    modulePreload: false,
    rollupOptions: {
      output: {
        format: 'iife',
        inlineDynamicImports: true,
        entryFileNames: 'runtime.js',
        assetFileNames: 'assets/[name][extname]',
      },
    },
  },
});
