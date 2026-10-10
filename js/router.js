/* ============================================================
   Hash 路由 — 纯静态托管下刷新不 404
   ============================================================ */

const routes = new Map();
let notFound = null;
let onChange = null;

export function define(path, handler) { routes.set(path, handler); }
export function fallback(handler) { notFound = handler; }
export function onRoute(fn) { onChange = fn; }

export function currentPath() {
  const h = location.hash.replace(/^#\/?/, '').replace(/\/$/, '');
  return h || 'dashboard';
}

export function go(path) {
  const next = `#/${path}`;
  if (location.hash === next) { render(); return; }
  location.hash = next;
}

function render() {
  const path = currentPath();
  const handler = routes.get(path) || notFound;
  if (onChange) onChange(path);
  if (handler) handler(document.getElementById('view'), path);
}

export function start() {
  window.addEventListener('hashchange', render);
  render();
}

export const ROUTES = ['dashboard', 'health', 'timeline', 'nearby', 'community'];
