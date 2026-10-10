/* ============================================================
   通用 UI — 图标 / 弹窗 / Toast / 表单 / 格式化
   ============================================================ */

/** HTML 转义：所有插值到 innerHTML 的用户输入都必须过这里 */
export function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/* ---------- 图标（内联 SVG，经 CSS mask 上色，无外部依赖） ---------- */
const PATHS = {
  home:   'M3 10.4 12 3l9 7.4V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z',
  health: 'M12 20.5S3.5 15 3.5 9.1A4.6 4.6 0 0 1 12 6.5a4.6 4.6 0 0 1 8.5 2.6c0 5.9-8.5 11.4-8.5 11.4z',
  clock:  'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7.2V12l3.2 2',
  pin:    'M12 21.5s-7-6-7-11.2A7 7 0 1 1 19 10.3c0 5.2-7 11.2-7 11.2zM12 12.6a2.3 2.3 0 1 0 0-4.6 2.3 2.3 0 0 0 0 4.6z',
  chat:   'M21 11.7A8.4 8.4 0 0 1 12.2 20a9 9 0 0 1-2.8-.5L4 21l1.6-4.6A8.4 8.4 0 0 1 12.2 3.3 8.4 8.4 0 0 1 21 11.7z',
  user:   'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  me:     'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  plus:   'M12 5v14M5 12h14',
  close:  'M6 6l12 12M18 6L6 18',
  check:  'M20 6 9 17l-5-5',
  share:  'M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7M12 3v13M8 7l4-4 4 4',
};

export function icon(name, size = 20) {
  const d = PATHS[name] || PATHS.home;
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="${size}" height="${size}" ` +
    `fill="none" stroke="#000" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">` +
    `<path d="${d}"/></svg>`;
  const uri = `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
  return `<span class="nav__ico" style="-webkit-mask-image:${uri};mask-image:${uri}"></span>`;
}

/** 把图标注入所有 [data-nav] 元素（HTML 里只写了空占位） */
export function hydrateIcons(root = document) {
  root.querySelectorAll('[data-nav] .nav__ico').forEach((el) => {
    const name = el.closest('[data-nav]').dataset.nav;
    if (!PATHS[name]) return;
    const d = PATHS[name];
    const svg =
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#000" ` +
      `stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="${d}"/></svg>`;
    const uri = `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
    el.style.webkitMaskImage = uri;
    el.style.maskImage = uri;
  });
}

/* ---------- 格式化 ---------- */
export function fmtDate(iso, withYear = true) {
  const d = new Date(String(iso) + 'T00:00:00');
  if (Number.isNaN(d.getTime())) return iso || '—';
  const y = d.getFullYear(), m = d.getMonth() + 1, day = d.getDate();
  return withYear ? `${y}年${m}月${day}日` : `${m}月${day}日`;
}

export function relDate(iso) {
  const d = new Date(String(iso) + 'T00:00:00');
  if (Number.isNaN(d.getTime())) return '—';
  const t = new Date(); t.setHours(0, 0, 0, 0);
  const n = Math.round((t - d) / 86400000);
  if (n <= 0) return '今天';
  if (n === 1) return '昨天';
  if (n < 30) return `${n} 天前`;
  if (n < 365) return `${Math.floor(n / 30)} 个月前`;
  return `${Math.floor(n / 365)} 年前`;
}

/** 本地时区的今天 —— 不要用 toISOString()，那是 UTC 日期 */
export const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/* ---------- Toast ---------- */
export function toast(msg, ico = '✓') {
  const root = document.getElementById('toast-root');
  if (!root) return;
  const el = document.createElement('div');
  el.className = 'toast';
  el.innerHTML = `<span>${esc(ico)}</span><span>${esc(msg)}</span>`;
  root.appendChild(el);
  setTimeout(() => {
    el.classList.add('is-out');
    setTimeout(() => el.remove(), 220);
  }, 2200);
}

/* ---------- 弹窗 ---------- */
let escHandler = null;

export function closeModal() {
  const root = document.getElementById('modal-root');
  if (root) root.innerHTML = '';
  if (escHandler) { document.removeEventListener('keydown', escHandler); escHandler = null; }
  document.body.style.overflow = '';
}

/**
 * @param {object} o
 * @param {string} o.title      标题
 * @param {string} o.body       表单主体 HTML
 * @param {string} [o.submit]   提交按钮文案
 * @param {(data:object)=>void} [o.onSubmit] 提交回调，返回 false 则保持弹窗打开
 * @param {string} [o.footer]   自定义底部 HTML（覆盖默认按钮）
 */
export function openModal({ title, body, submit = '保存', onSubmit, footer }) {
  const root = document.getElementById('modal-root');
  root.innerHTML = `
    <div class="modal" data-backdrop>
      <div class="modal__panel" role="dialog" aria-modal="true" aria-label="${esc(title)}">
        <div class="modal__head">
          <h2>${esc(title)}</h2>
          <button class="btn btn--ghost btn--icon" data-close aria-label="关闭">✕</button>
        </div>
        <form class="modal__body" id="modal-form" data-form>
          <div class="stack" style="padding-bottom:20px">${body}</div>
        </form>
        <div class="modal__foot">
          ${footer ?? `
            <button type="button" class="btn btn--ghost" data-close>取消</button>
            <button type="submit" form="modal-form" class="btn btn--primary">${esc(submit)}</button>
          `}
        </div>
      </div>
    </div>`;

  document.body.style.overflow = 'hidden';

  const form = root.querySelector('[data-form]');

  root.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', closeModal));
  root.querySelector('[data-backdrop]').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeModal();
  });

  escHandler = (e) => { if (e.key === 'Escape') closeModal(); };
  document.addEventListener('keydown', escHandler);

  // 提交按钮在 form 之外，通过 form="modal-form" 关联；这里只补一次程序化提交兜底
  if (form && onSubmit) {
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const data = Object.fromEntries(new FormData(form).entries());
      const keep = onSubmit(data);
      if (keep !== false) closeModal();
    });
  }

  // 自动聚焦第一个输入
  const first = root.querySelector('input, textarea, select');
  if (first) setTimeout(() => first.focus(), 60);

  return root.querySelector('[data-form]')?.closest('.modal__panel') || root;
}

/** 生成一个字段块的 HTML */
export function field(label, inputHTML, hint) {
  return `<div class="field">
    <label>${esc(label)}</label>
    ${inputHTML}
    ${hint ? `<span class="field__hint">${esc(hint)}</span>` : ''}
  </div>`;
}

export function selectHTML(name, options, selected) {
  return `<select name="${name}">${options
    .map(([v, t]) => `<option value="${esc(v)}"${String(v) === String(selected) ? ' selected' : ''}>${esc(t)}</option>`)
    .join('')}</select>`;
}
