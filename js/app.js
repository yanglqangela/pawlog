/* ============================================================
   入口 — 初始化数据、挂载路由、渲染宠物切换器
   ============================================================ */
import * as store from './store.js';
import * as router from './router.js';
import { esc, hydrateIcons, toast, openModal, field } from './ui.js';

import dashboard from './views/dashboard.js';
import health from './views/health.js';
import timeline from './views/timeline.js';
import nearby from './views/nearby.js';
import community from './views/community.js';

/* ---------- 宠物切换器 ---------- */
function renderPetSwitchers() {
  const st = store.get();
  const html = st.pets.map((p) => `
    <button class="petswitch__item ${p.id === st.activePetId ? 'is-active' : ''}" data-switch="${esc(p.id)}" title="${esc(p.name)}">
      <span class="petavatar">${esc(p.emoji)}</span>
      <span>${esc(p.name)}</span>
    </button>`).join('');

  ['#petswitch', '#petswitch-mobile'].forEach((sel) => {
    const box = document.querySelector(sel);
    if (!box) return;
    box.innerHTML = html;
    box.querySelectorAll('[data-switch]').forEach((b) =>
      b.addEventListener('click', () => {
        store.setActivePet(b.dataset.switch);
        router.go(router.currentPath());
      }));
  });
}

/* ---------- 关于 ---------- */
function openAbout() {
  openModal({
    title: '关于爪迹 PawLog',
    footer: `<button class="btn btn--ghost" data-close>知道了</button>
             <button class="btn btn--primary" id="reset-demo">重置演示数据</button>`,
    body: `
      <p class="small" style="color:var(--c-ink-2);line-height:1.85">
        <b>爪迹 PawLog</b> 是一个「养宠成长记录 + 社区」的产品原型，把散落在疫苗本、聊天记录、相册里的养宠信息收拢到一处。
      </p>
      <div class="card card--pad" style="background:var(--c-surface-2);box-shadow:none">
        <div class="strong small" style="margin-bottom:8px">核心能力</div>
        <ul class="small" style="color:var(--c-ink-2);line-height:2;padding-left:2px">
          <li>⚖️ &nbsp;体重曲线 + 品种标准区间对照，判断胖瘦</li>
          <li>💉 &nbsp;疫苗 / 驱虫到期自动倒计时提醒</li>
          <li>📸 &nbsp;成长时间线，标记里程碑，生成分享卡片</li>
          <li>📍 &nbsp;按城市 / 区域匹配附近宠友，约遛宠局</li>
          <li>💬 &nbsp;社区动态、话题广场、点赞评论</li>
        </ul>
      </div>
      <p class="xs muted">
        当前为纯前端演示版本，数据保存在本机浏览器的 localStorage 中，不会上传到任何服务器。
        首次打开时填充了一份示例数据，你可以随意增删改，点「重置演示数据」可恢复初始状态。
      </p>`,
  });
  document.getElementById('reset-demo').addEventListener('click', () => {
    store.reset();
    location.reload();
  });
}

/* ---------- 启动 ---------- */
function boot() {
  store.init();
  hydrateIcons();
  renderPetSwitchers();

  // 数据变化 → 重绘切换器
  store.subscribe(renderPetSwitchers);

  router.define('dashboard', dashboard);
  router.define('health', health);
  router.define('timeline', timeline);
  router.define('nearby', nearby);
  router.define('community', community);
  router.fallback(dashboard);

  router.onRoute((path) => {
    document.querySelectorAll('[data-nav]').forEach((a) => {
      a.classList.toggle('is-active', a.dataset.nav === path);
    });
    document.title = `${({ dashboard: '首页', health: '健康档案', timeline: '成长时光', nearby: '附近宠友', community: '社区' })[path] || '首页'} · 爪迹 PawLog`;
    window.scrollTo({ top: 0 });
  });

  router.start();

  document.getElementById('btn-about').addEventListener('click', openAbout);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
