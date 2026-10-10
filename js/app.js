/* ============================================================
   入口 — 初始化数据、挂载路由、渲染宠物切换器
   ============================================================ */
import * as store from './store.js';
import * as router from './router.js';
import { esc, hydrateIcons, toast, openModal } from './ui.js';

import dashboard from './views/dashboard.js';
import health from './views/health.js';
import timeline from './views/timeline.js';
import nearby from './views/nearby.js';
import community from './views/community.js';
import petPage from './views/pet.js';
import me from './views/me.js';

const TITLES = {
  dashboard: '首页', health: '健康档案', timeline: '成长时光',
  nearby: '附近宠友', community: '社区', me: '我的', pet: '宠物档案',
};

/* ---------- 宠物切换器 ---------- */
function renderPetSwitchers() {
  const st = store.get();
  const html = st.pets.map((p) => `
    <button class="petswitch__item ${p.id === st.activePetId ? 'is-active' : ''}" data-switch="${esc(p.id)}" title="${esc(p.name)} 的档案">
      <span class="petavatar">${esc(p.emoji)}</span>
      <span>${esc(p.name)}</span>
    </button>`).join('');

  ['#petswitch', '#petswitch-mobile'].forEach((sel) => {
    const box = document.querySelector(sel);
    if (!box) return;
    box.innerHTML = html;
    box.querySelectorAll('[data-switch]').forEach((b) =>
      b.addEventListener('click', () => {
        const id = b.dataset.switch;
        // 再点一次当前宠物 → 进入它的档案页；否则先切换
        if (store.get().activePetId === id) router.go(`pet/${id}`);
        else { store.setActivePet(id); router.go(router.currentPath()); }
      }));
  });

  // 顶栏头像跟随「我」的 emoji
  const meBtn = document.getElementById('btn-me');
  if (meBtn) meBtn.textContent = st.me.emoji || '🙂';
}

/* ---------- 关于 ---------- */
function openAbout() {
  const panel = openModal({
    title: '关于爪迹 PawLog',
    footer: `<button class="btn btn--ghost" data-close>知道了</button>
             <button class="btn btn--ghost" id="go-me">数据备份</button>`,
    body: `
      <p class="small" style="color:var(--c-ink-2);line-height:1.85">
        <b>爪迹 PawLog</b> 把散落在疫苗本、聊天记录、相册里的养宠信息收拢到一处，
        并在**真正需要的时刻**能立刻拿出来。
      </p>
      <div class="card card--pad" style="background:var(--c-surface-2);box-shadow:none">
        <div class="strong small" style="margin-bottom:8px">核心能力</div>
        <ul class="small" style="color:var(--c-ink-2);line-height:2;padding-left:2px">
          <li>🚨 &nbsp;<b>就医模式</b>：一屏给出医生需要的全部信息（含过敏史）</li>
          <li>⚖️ &nbsp;体重曲线 + 品种标准区间对照，判断胖瘦</li>
          <li>💉 &nbsp;疫苗 / 驱虫到期倒计时，一键顺延下次日期</li>
          <li>📸 &nbsp;成长时间线自动汇入健康记录，里程碑生成分享卡片</li>
          <li>📍 &nbsp;按城市 / 区域匹配附近宠友，约遛宠局</li>
          <li>💬 &nbsp;社区动态、话题广场、点赞评论</li>
        </ul>
      </div>
      <p class="xs muted">
        当前为纯前端演示版本，数据保存在本机浏览器的 localStorage 中，不会上传到任何服务器。
        因为纯静态站点无法做到系统级推送，「疫苗到期提醒」需要你打开本页面才能看到——
        这一点在真实产品中会通过 App 推送解决。别忘了在「我的」里导出备份。
      </p>`,
  });
  panel.querySelector('#go-me')?.addEventListener('click', () => {
    location.hash = '#/me';
    document.getElementById('modal-root').innerHTML = '';
  });
}

/* ---------- 当天首次打开时，对待办做一次提示 ---------- */
function maybeNudge() {
  const pet = store.activePet();
  if (!pet) return;
  const due = store.reminders(pet.id).filter((r) => r.level === 'due');
  if (!due.length) return;

  const today = new Date().toISOString().slice(0, 10);
  const KEY = 'pawlog.nudged';
  try {
    if (localStorage.getItem(KEY) === today) return;
    localStorage.setItem(KEY, today);
  } catch { /* 隐私模式下每次都提示，可接受 */ }

  setTimeout(() => {
    toast(`${pet.name} 有 ${due.length} 项健康待办到期`, '⏰');
  }, 900);
}

/* ---------- 启动 ---------- */
function boot() {
  store.init();
  hydrateIcons();
  renderPetSwitchers();
  store.subscribe(renderPetSwitchers);

  router.define('dashboard', dashboard);
  router.define('health', health);
  router.define('timeline', timeline);
  router.define('nearby', nearby);
  router.define('community', community);
  router.define('me', me);
  router.define('pet/:id', petPage);
  router.fallback(dashboard);

  router.onRoute((path, base) => {
    document.querySelectorAll('[data-nav]').forEach((a) =>
      a.classList.toggle('is-active', a.dataset.nav === base));

    // 标题带待办数，切到别的标签页也能一眼看到
    const pet = store.activePet();
    const due = pet ? store.reminders(pet.id).filter((r) => r.level === 'due').length : 0;
    document.title = `${due ? `(${due}) ` : ''}${TITLES[base] || '首页'} · 爪迹 PawLog`;

    window.scrollTo({ top: 0 });
  });

  router.start();
  maybeNudge();

  document.getElementById('btn-about').addEventListener('click', openAbout);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
