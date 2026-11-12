// One browser history entry per screen. Formulus watches history.pushState, so the Android
// back button steps back one screen inside the app and only offers to exit on the home screen.
import { useEffect, useState } from 'react';

export type Route =
  | { screen: 'home' }
  | { screen: 'list'; formType: string }
  | { screen: 'record'; formType: string; id: string };

let depth = 0; // screens pushed this session; 0 = the first screen
const listeners = new Set<() => void>();
const notify = () => listeners.forEach(l => l());

export function parseRoute(hash: string): Route {
  const p = String(hash || '').replace(/^#\/?/, '').split('/').map(decodeURIComponent);
  if (p[0] === 'f' && p[1]) return { screen: 'list', formType: p[1] };
  if (p[0] === 'r' && p[1] && p[2]) return { screen: 'record', formType: p[1], id: p[2] };
  return { screen: 'home' };
}
export function routeHash(r: Route): string {
  if (r.screen === 'list') return '#/f/' + encodeURIComponent(r.formType);
  if (r.screen === 'record') return '#/r/' + encodeURIComponent(r.formType) + '/' + encodeURIComponent(r.id);
  return '#/';
}
/** Full URL: a bare "#/..." resolves against <base> or the parent page in some hosts. */
const routeUrl = (r: Route) => String(location.href).split('#')[0] + routeHash(r);

export function go(r: Route) {
  try {
    history.pushState({ ode: true, depth: depth + 1 }, '', routeUrl(r));
  } catch {
    location.hash = routeHash(r);
  }
  depth++;
  notify();
  window.scrollTo(0, 0);
}
export function back() {
  if (depth > 0) return history.back();
  const r = parseRoute(location.hash);
  // Opened straight on an inner screen: step up one level instead of leaving the app.
  const up: Route = r.screen === 'record' ? { screen: 'list', formType: r.formType } : { screen: 'home' };
  try {
    history.replaceState({ ode: true, depth: 0 }, '', routeUrl(up));
    notify();
  } catch {
    location.hash = routeHash(up);
  }
}
/** Start on the home screen as the first history entry, so back never skips past it. */
export function resetToHome() {
  try { history.replaceState({ ode: true, depth: 0 }, '', routeUrl({ screen: 'home' })); } catch { /* ignore */ }
  depth = 0;
  notify();
}

window.addEventListener('popstate', e => {
  depth = e.state && typeof e.state.depth === 'number' ? e.state.depth : Math.max(0, depth - 1);
  notify();
});
window.addEventListener('hashchange', notify);

export function useRoute(): Route {
  const [route, setRoute] = useState(() => parseRoute(location.hash));
  useEffect(() => {
    const l = () => setRoute(parseRoute(location.hash));
    listeners.add(l);
    return () => { listeners.delete(l); };
  }, []);
  return route;
}
