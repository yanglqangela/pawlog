/* ============================================================
   Hash 路由 — 纯静态托管下刷新不 404，支持 :param 路径段
   ============================================================ */

const routes = new Map();
let notFound = null;
let onChange = null;

export function define(pattern, handler) { routes.set(pattern, handler); }
export function fallback(handler) { notFound = handler; }
export function onRoute(fn) { onChange = fn; }

/** 完整路径，如 "pet/p_buding"；空则为 "dashboard" */
export function currentPath() {
  const h = location.hash.replace(/^#\/?/, '').replace(/\/$/, '');
  return h || 'dashboard';
}

/** 一级路径段，用于导航高亮，如 "pet/p_buding" → "pet" */
export const baseOf = (path) => path.split('/')[0];

function match(path) {
  if (routes.has(path)) return { handler: routes.get(path), params: {} };

  const ap = path.split('/');
  for (const [pattern, handler] of routes) {
    const pp = pattern.split('/');
    if (pp.length !== ap.length) continue;
    const params = {};
    let ok = true;
    for (let i = 0; i < pp.length; i++) {
      if (pp[i].startsWith(':')) params[pp[i].slice(1)] = decodeURIComponent(ap[i]);
      else if (pp[i] !== ap[i]) { ok = false; break; }
    }
    if (ok) return { handler, params };
  }
  return null;
}

export function go(path) {
  const next = `#/${path}`;
  if (location.hash === next) { render(); return; }
  location.hash = next;
}

function render() {
  const path = currentPath();
  const hit = match(path);
  if (onChange) onChange(path, baseOf(path));
  const view = document.getElementById('view');
  if (hit) hit.handler(view, hit.params);
  else if (notFound) notFound(view, {});
}

export function start() {
  window.addEventListener('hashchange', render);
  render();
}
