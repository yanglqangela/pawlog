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

/** 数字兜底：导入数据里的 value 可能是任意字符串 */
export function num(v, fallback = '—') {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * 过敏史显示：只有“整句就是简单否定”才归一化为「无已知过敏」。
 * 「无过敏史，但对鸡肉过敏」这类带补充说明的句子必须原样保留。
 */
export function allergyStatus(raw) {
  const text = String(raw ?? '').trim();
  if (!text) return { text: '未填写 · 请询问主人', unknown: true, has: false };
  if (/^(无|没有|暂无|无已知过敏|无过敏史|没有过敏|暂无过敏)[。.!！]?$/.test(text)) {
    return { text: '无已知过敏', unknown: false, has: false };
  }
  return { text, unknown: false, has: true };
}

/* ---------- Toast ---------- */
export function toast(msg, ico = '✓', action = null) {
  const root = document.getElementById('toast-root');
  if (!root) return;
  const el = document.createElement('div');
  el.className = 'toast';
  el.innerHTML = `<span>${esc(ico)}</span><span class="grow">${esc(msg)}</span>`;
  if (action?.label) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'toast__action';
    btn.textContent = action.label;
    btn.addEventListener('click', () => {
      try { action.onClick?.(); } finally { el.remove(); }
    });
    el.appendChild(btn);
  }
  root.appendChild(el);
  setTimeout(() => {
    el.classList.add('is-out');
    setTimeout(() => el.remove(), 220);
  }, action?.label ? 5000 : 2200);
}

/* ---------- 复制 / 分享 ---------- */
export async function copyText(text, okMsg = '已复制') {
  const fallback = () => {
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch { ok = false; }
    ta.remove();
    if (ok) {
      toast(okMsg);
      return true;
    }
    toast('复制失败，请长按选择文本', '⚠️');
    return false;
  };
  const p = navigator.clipboard?.writeText?.(text);
  if (p && typeof p.then === 'function') {
    try { await p; toast(okMsg); return true; }
    catch { return fallback(); }
  }
  return fallback();
}

export async function shareText({ title = '爪迹 PawLog', text, okMsg = '已复制，可粘贴分享' }) {
  if (navigator.share) {
    try { await navigator.share({ title, text }); return true; }
    catch { return false; } // 用户取消分享，不强行复制
  }
  return copyText(text, okMsg);
}

/* ---------- 打印指定 HTML（理赔材料包等） ---------- */
export function printHTML(html, title = '') {
  const old = document.getElementById('print-only');
  if (old) old.remove();
  const div = document.createElement('div');
  div.id = 'print-only';
  div.className = 'print-only';
  div.innerHTML = `<h1>${esc(title)}</h1>${html}`;
  document.body.appendChild(div);
  document.body.classList.add('printing-custom');
  const cleanup = () => {
    div.remove();
    document.body.classList.remove('printing-custom');
    window.removeEventListener('afterprint', cleanup);
  };
  window.addEventListener('afterprint', cleanup);
  setTimeout(() => {
    window.print();
    setTimeout(cleanup, 1500);
  }, 50);
}

/* ---------- 弹窗 ---------- */
let escHandler = null;
let trapHandler = null;
let focusGuard = null;
let lastFocus = null;

export function closeModal() {
  const root = document.getElementById('modal-root');
  if (root) root.innerHTML = '';
  if (escHandler) { document.removeEventListener('keydown', escHandler); escHandler = null; }
  if (trapHandler) { document.removeEventListener('keydown', trapHandler); trapHandler = null; }
  if (focusGuard) { document.removeEventListener('focusin', focusGuard); focusGuard = null; }
  // 还有全屏就医卡时不要解锁页面滚动
  if (!document.querySelector('.erx-screen')) document.body.style.overflow = '';
  if (lastFocus && typeof lastFocus.focus === 'function') {
    try { lastFocus.focus(); } catch { /* ignore */ }
  }
  lastFocus = null;
}

/**
 * @param {object} o
 * @param {string} o.title      标题
 * @param {string} o.body       表单主体 HTML
 * @param {string} [o.submit]   提交按钮文案
 * @param {(data:object)=>void} [o.onSubmit] 提交回调，返回 false 则保持弹窗打开
 * @param {string} [o.footer]   自定义底部 HTML（覆盖默认按钮）
 */
export function openModal({ title, body, submit = '保存', onSubmit, footer, sheet = false }) {
  const root = document.getElementById('modal-root');
  lastFocus = document.activeElement;
  root.innerHTML = `
    <div class="modal${sheet ? ' modal--sheet' : ''}" data-backdrop>
      <div class="modal__panel" role="dialog" aria-modal="true" aria-label="${esc(title)}" tabindex="-1">
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

  // 焦点陷阱：Tab 只在弹窗内循环
  const panel = root.querySelector('.modal__panel');
  trapHandler = (e) => {
    if (e.key !== 'Tab' || !panel) return;
    const items = [...panel.querySelectorAll(
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    )].filter((el) => el.offsetParent !== null);
    if (!items.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  };
  document.addEventListener('keydown', trapHandler);

  // 没有表单控件（确认框/海报）时，把焦点放到面板或第一个按钮
  const firstControl = root.querySelector('input, textarea, select');
  const firstButton = panel?.querySelector('button, a[href]');
  setTimeout(() => {
    if (firstControl) firstControl.focus();
    else if (firstButton) firstButton.focus();
    else panel?.focus();
  }, 60);

  // 焦点守卫：任何情况下都不允许 Tab/点击把焦点留在背景页
  focusGuard = (e) => {
    if (panel && !panel.contains(e.target)) {
      e.stopPropagation();
      (firstButton || panel).focus();
    }
  };
  document.addEventListener('focusin', focusGuard);

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

/** 生成一个字段块的 HTML（label 与第一个控件通过 id 关联） */
let fieldSeq = 0;
export function field(label, inputHTML, hint) {
  const html = String(inputHTML ?? '');
  const hasId = /\bid=/.test(html);
  const id = hasId ? null : `field-${++fieldSeq}`;
  const withId = id ? html.replace(/<(input|textarea|select)\b/i, `<$1 id="${id}"`) : html;
  return `<div class="field">
    <label${id ? ` for="${id}"` : ''}>${esc(label)}</label>
    ${withId}
    ${hint ? `<span class="field__hint">${esc(hint)}</span>` : ''}
  </div>`;
}

export function selectHTML(name, options, selected) {
  return `<select name="${name}">${options
    .map(([v, t]) => `<option value="${esc(v)}"${String(v) === String(selected) ? ' selected' : ''}>${esc(t)}</option>`)
    .join('')}</select>`;
}
