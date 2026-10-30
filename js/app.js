/* ============================================================
   入口 — 初始化数据、挂载路由、渲染宠物切换器
   ============================================================ */
import * as store from './store.js';
import * as router from './router.js';
import { esc, hydrateIcons, toast, openModal, closeModal } from './ui.js';

import dashboard from './views/dashboard.js';
import health from './views/health.js';
import timeline from './views/timeline.js';
import nearby from './views/nearby.js';
import community from './views/community.js';
import petPage, { openEmergencyMode, closeEmergencyMode } from './views/pet.js';
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
          <li>✓ &nbsp;<b>3 秒打卡</b>：疫苗 / 驱虫到期，点一下顺延，连点只记一次</li>
          <li>🧾 &nbsp;费用台账 + 理赔材料包；🧓 老年模式与生活质量趋势</li>
          <li>🧳 &nbsp;出行证件包、寄养交接卡、走失海报</li>
          <li>📴 &nbsp;可安装到桌面，离线也能看档案与就医卡</li>
          <li>📅 &nbsp;提醒导出到系统日历，由日历负责通知</li>
        </ul>
      </div>
      <p class="xs muted">
        当前为纯前端演示版本，数据保存在本机浏览器，不会上传到任何服务器。
        纯静态站点无法做到系统级推送，因此到期提醒需要打开页面，或导出到系统日历。
        别忘了在「我的」里备份。
      </p>`,
  });
  panel.querySelector('#go-me')?.addEventListener('click', () => {
    closeModal();
    location.hash = '#/me';
  });
}

/* ---------- 标题待办数：任何写入后同步更新 ---------- */
function updateDocumentTitle() {
  const pet = store.activePet();
  const due = pet ? store.reminders(pet.id).filter((r) => r.level === 'due').length : 0;
  const base = router.baseOf(router.currentPath());
  document.title = `${due ? `(${due}) ` : ''}${TITLES[base] || '首页'} · 爪迹 PawLog`;
}

/* ---------- 写入失败时置顶提示（不自动消失） ---------- */
function initStorageUI() {
  const banner = document.getElementById('storage-banner');
  const text = document.getElementById('storage-banner-text');
  const close = document.getElementById('storage-banner-close');
  const action = document.getElementById('storage-banner-action');
  if (!banner) return;

  store.onStorageStatus((s) => {
    if (!s || s.ok) {
      banner.hidden = true;
      return;
    }
    if (text) text.textContent = s.message || '本次修改未保存';
    banner.hidden = false;
  });

  close?.addEventListener('click', () => { banner.hidden = true; });
  action?.addEventListener('click', () => { location.hash = '#/me'; });

  // 浏览器要求用户手势后才能申请持久化存储
  document.addEventListener('click', () => { store.requestPersistence(); }, { once: true });
}

/* ---------- PWA：离线提示 / Service Worker / 更新提示 ---------- */
function initPWA() {
  const banner = document.getElementById('offline-banner');
  const syncOffline = () => { if (banner) banner.hidden = navigator.onLine; };
  syncOffline();
  window.addEventListener('online', syncOffline);
  window.addEventListener('offline', syncOffline);

  if (!('serviceWorker' in navigator) || location.protocol === 'file:') return;

  let refreshing = false;
  let offered = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (refreshing) location.reload();
  });

  const offerUpdate = (worker) => {
    if (offered || !worker) return;
    offered = true;
    toast('新版本已就绪', '✨', {
      label: '刷新更新',
      onClick: () => {
        refreshing = true;
        worker.postMessage({ type: 'SKIP_WAITING' });
      },
    });
  };

  navigator.serviceWorker.register('./sw.js', { scope: './' }).then((reg) => {
    if (reg.waiting && navigator.serviceWorker.controller) offerUpdate(reg.waiting);
    reg.addEventListener('updatefound', () => {
      const worker = reg.installing;
      worker?.addEventListener('statechange', () => {
        // 第一次安装没有旧版本，不弹更新提示
        if (worker.state === 'installed' && navigator.serviceWorker.controller) offerUpdate(worker);
      });
    });
  }).catch(() => { /* 离线能力不可用不影响主流程 */ });
}

/* ---------- PWA：安装引导（浏览器支持时弹出安装） ---------- */
function initInstallPrompt() {
  window.__pawlogInstallPrompt = null;
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    window.__pawlogInstallPrompt = e;
  });
  window.addEventListener('appinstalled', () => { window.__pawlogInstallPrompt = null; });
  window.pawlogInstall = async () => {
    const prompt = window.__pawlogInstallPrompt;
    if (!prompt) return 'unavailable';
    prompt.prompt();
    const { outcome } = await prompt.userChoice;
    window.__pawlogInstallPrompt = null;
    return outcome;
  };
}

/* ---------- 当天首次打开时，对待办做一次提示 ---------- */
function maybeNudge() {
  const pet = store.activePet();
  if (!pet) return;
  const due = store.reminders(pet.id).filter((r) => r.level === 'due');
  if (!due.length) return;

  const today = store.todayISO();
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
  initStorageUI();
  initPWA();
  initInstallPrompt();
  renderPetSwitchers();
  store.subscribe(renderPetSwitchers);
  store.subscribe(updateDocumentTitle);
  const applyLargeText = () => document.body.classList.toggle('large-text', !!store.get().settings?.largeText);
  applyLargeText();
  store.subscribe(applyLargeText);
  let externalRefreshTimer = null;
  store.onExternalUpdate(() => {
    toast('另一标签页已更新，已同步最新数据', '🔄');
    if (document.querySelector('#modal-root .modal')) closeModal();
    clearTimeout(externalRefreshTimer);
    externalRefreshTimer = setTimeout(() => router.rerender(), 120);
  });

  router.define('dashboard', dashboard);
  router.define('health', health);
  router.define('timeline', timeline);
  router.define('nearby', nearby);
  router.define('community', community);
  router.define('me', me);
  router.define('pet/:id', petPage);
  router.fallback(dashboard);

  router.onRoute((path, base) => {
    closeModal();
    closeEmergencyMode();
    document.querySelectorAll('[data-nav]').forEach((a) => {
      const active = a.dataset.nav === base;
      a.classList.toggle('is-active', active);
      if (active) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    });

    // 标题带待办数，切到别的标签页也能一眼看到
    updateDocumentTitle();

    window.scrollTo({ top: 0 });
  });

  router.start();
  maybeNudge();
  store.requestPersistence();

  document.getElementById('btn-about').addEventListener('click', openAbout);
  document.getElementById('skip-link')?.addEventListener('click', (e) => {
    e.preventDefault();
    const view = document.getElementById('view');
    if (view) {
      view.focus();
      view.scrollIntoView({ block: 'start' });
    }
  });
  const openErx = () => {
    const path = router.currentPath();
    let pet = store.activePet();
    // 正在看某只宠物的档案时，急救必须打开这一只，而不是切换器里的激活宠物
    if (path.startsWith('pet/')) {
      const id = decodeURIComponent(path.slice(4));
      pet = store.petById(id) || pet;
    }
    if (!pet) { toast('先添加一只宠物，再使用急救卡', '🐾'); return; }
    if (pet.deceased) { toast(`${pet.name} 已进入纪念模式，不再显示就医卡`, '🕯️'); return; }
    openEmergencyMode(pet);
  };
  document.getElementById('btn-erx')?.addEventListener('click', openErx);
  document.getElementById('btn-erx-desktop')?.addEventListener('click', openErx);

  // 桌面图标「急救」快捷方式：./?erx=1#/dashboard
  if (new URLSearchParams(location.search).get('erx') === '1') {
    history.replaceState(null, '', `${location.pathname}${location.hash}`);
    setTimeout(openErx, 300);
  }

  // 写入失败时，离开页面前提醒一次
  window.addEventListener('beforeunload', (e) => {
    if (!store.getStorageStatus().ok) {
      e.preventDefault();
      e.returnValue = '';
    }
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
