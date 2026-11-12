/*
 * {{APP_NAME}}: an ODE custom app (React starter from the ODE App Builder).
 *
 * Reads window.ODE_APP_CONFIG (app/config.js) and draws the home screen, a record list per
 * form and a details page per record with its linked records. Forms open in the ODE form
 * player through the Formulus API. Change anything you like: this is your app now.
 */
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { config } from './config';
import { connect } from './data';
import { lang } from './i18n';
import { go, parseRoute, resetToHome } from './router';

function applyTheme() {
  const theme = config.theme || {};
  const dark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  const colors = (dark ? theme.dark : theme.light) || theme.light || {};
  Object.entries(colors).forEach(([k, v]) => document.documentElement.style.setProperty('--' + k, v));
  document.title = config.app.name || 'ODE app';
  document.documentElement.lang = lang;
}

async function start() {
  if (import.meta.env.DEV && !window.ODE_APP_CONFIG) console.warn('app/config.js not found: run the ODE App Builder download, or copy config.js into app/.');
  if (import.meta.env.DEV) await import('./dev-mock');
  applyTheme();
  window.matchMedia?.('(prefers-color-scheme: dark)').addEventListener?.('change', applyTheme);
  const initial = parseRoute(location.hash);
  resetToHome();
  createRoot(document.getElementById('root')!).render(<App />);
  const api = await connect();
  if (api && initial.screen !== 'home') {
    if (initial.screen === 'record') go({ screen: 'list', formType: initial.formType });
    go(initial);
  }
}
start();
