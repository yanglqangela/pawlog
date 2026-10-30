/* ============================================================
   我的 — 资料 / 我的宠物 / 我的动态 / 数据备份
   ============================================================ */
import * as store from '../store.js';
import { listBackups, restoreBackup, backupStorageAvailable } from '../backup.js';
import { exportICS } from '../ics.js';
import { esc, relDate, todayISO, toast, openModal, closeModal, field, allergyStatus } from '../ui.js';
import { openAddPet } from './dashboard.js';
import { openEditPet } from './pet.js';

const MAX_IMPORT_BYTES = 8_000_000;
let statusUnsub = null;

function myPosts(st) {
  return st.posts.filter((p) => p.author === 'me');
}

export default function me(el) {
  const st = store.get();

  const render = () => {
    const s = store.get();
    const mine = myPosts(s);

    el.innerHTML = `
      <div class="page-head">
        <h1>我的</h1>
        <p>个人资料、我的宠物与数据备份</p>
      </div>

      <!-- 资料卡 -->
      <div class="card card--pad" style="margin-bottom:var(--sp-6)">
        <div class="row" style="gap:var(--sp-4)">
          <div class="avatar avatar--xl">${esc(s.me.emoji)}</div>
          <div class="grow">
            <div class="strong" style="font-size:17px">${esc(s.me.name)}</div>
            <div class="small muted">📍 ${esc(s.me.city)}·${esc(s.me.district)}</div>
            ${s.me.bio ? `<div class="small" style="color:var(--c-ink-2);margin-top:4px">${esc(s.me.bio)}</div>` : ''}
          </div>
          <button class="btn btn--ghost btn--sm" id="edit-me">编辑</button>
        </div>
      </div>

      <!-- 我的宠物 -->
      <div class="section">
        <div class="section__head">
          <h2>我的宠物</h2>
          <button class="btn btn--soft btn--sm" id="add-pet">＋ 添加</button>
        </div>
        <div class="grid grid--auto">
          ${s.pets.map((p) => {
            const recs = store.recordsOf(p.id);
            const w = recs.find((r) => r.type === 'weight');
            const allergyInfo = allergyStatus(p.allergies);
            const hasAllergy = allergyInfo.has;
            return `
            <div class="card card--pad">
              <div class="row" style="gap:var(--sp-3)">
                <div class="avatar avatar--lg">${esc(p.emoji)}</div>
                <div class="grow">
                  <div class="strong">${esc(p.name)}</div>
                  <div class="xs muted">${esc(p.breed)} · ${esc(store.ageText(p.birthday))}</div>
                </div>
                ${p.id === s.activePetId ? '<span class="tag tag--brand">当前</span>' : ''}
              </div>
              <div class="row" style="gap:6px;margin-top:var(--sp-3);flex-wrap:wrap">
                <span class="tag">${w ? w.value + 'kg' : '无体重'}</span>
                <span class="tag">${recs.length} 条记录</span>
                ${hasAllergy ? '<span class="tag tag--rose">⚠️ 过敏史</span>' : ''}
              </div>
              <div class="row" style="gap:6px;margin-top:var(--sp-4)">
                <a class="btn btn--soft btn--sm grow" href="#/pet/${esc(p.id)}">查看档案</a>
                <button class="btn btn--ghost btn--sm" data-set-active="${esc(p.id)}" ${p.id === s.activePetId ? 'disabled' : ''}>切换</button>
              </div>
            </div>`;
          }).join('')}
        </div>
      </div>

      <!-- 我的动态 -->
      <div class="section">
        <div class="section__head">
          <h2>我发布的动态</h2>
          <a class="section__more" href="#/community">去社区 →</a>
        </div>
        ${mine.length ? `<div class="card card--flush"><div class="list">${mine.map((p) => `
          <div class="list__item">
            <div class="list__ico">${esc((p.imgs || [])[0] || '💬')}</div>
            <div class="grow">
              <div class="list__title" style="font-weight:500;font-size:var(--fs-sm)">${esc((p.text || '').slice(0, 40))}${(p.text || '').length > 40 ? '…' : ''}</div>
              <div class="list__sub">❤️ ${esc(p.likes || 0)} · 💬 ${esc((p.comments || []).length)}</div>
            </div>
            <div class="list__right">${esc(relDate(p.time))}</div>
          </div>`).join('')}</div></div>`
        : `<div class="empty card card--pad"><div class="empty__ico">💬</div>
             <div class="empty__title">还没有发布过动态</div>
             <div class="empty__text">去社区分享一条养宠日常吧</div></div>`}
      </div>

      <!-- 数据备份 -->
      <div class="section">
        <div class="section__head"><h2>数据备份</h2></div>
        <div class="card card--pad">
          <div class="reminder reminder--soon" style="border:1px solid var(--c-line);margin-bottom:var(--sp-4)">
            <span class="reminder__ico">💾</span>
            <div class="grow">
              <div class="reminder__title">数据只存在这台设备的浏览器里</div>
              <div class="reminder__sub">清理浏览器缓存、换设备或换浏览器都会导致数据丢失。建议定期导出备份。</div>
            </div>
          </div>
          <div class="row row--wrap" style="gap:8px">
            <button class="btn btn--primary" id="backup-now">立即备份</button>
            <button class="btn btn--ghost" id="restore-last">恢复上次手动备份</button>
            <button class="btn btn--ghost" id="export">导出备份 (.json)</button>
            <button class="btn btn--ghost" id="import">从备份恢复</button>
            <button class="btn btn--ghost" id="reset">重置演示数据</button>
          </div>
          <p class="xs muted" id="storage-status" style="margin-top:var(--sp-3)"></p>
          <div class="xs strong" style="margin-top:var(--sp-4);color:var(--c-ink-2)">最近的本机快照</div>
          <div class="stack" id="backup-list" style="margin-top:8px;gap:8px">
            <div class="xs muted">读取中…</div>
          </div>
          <p class="xs muted" style="margin-top:var(--sp-3)">
            当前共 ${s.pets.length} 只宠物 · ${s.records.length} 条健康记录 · ${s.timeline.length} 个成长瞬间 · ${s.posts.length} 条动态
          </p>
        </div>
      </div>

      <!-- 安装与离线 -->
      <div class="section">
        <div class="section__head"><h2>安装与离线</h2></div>
        <div class="card card--pad">
          <p class="small" style="color:var(--c-ink-2);line-height:1.8">
            安装到桌面后，断网也能打开档案、待办和就医卡。
            纯静态站无法后台推送，提醒可以导出到手机日历，由系统日历负责提醒。
          </p>
          <div class="row row--wrap" style="gap:8px;margin-top:var(--sp-3)">
            <button class="btn btn--soft" id="install-app" type="button">安装到桌面</button>
            <button class="btn btn--ghost" id="export-ics" type="button">📅 导出提醒到日历 (.ics)</button>
          </div>
          <p class="xs muted" style="margin-top:10px">
            iPhone：Safari 分享 → 添加到主屏幕。Android / Chrome：菜单 → 安装应用。
            日历提醒会提前 3 天和当天 09:00 提醒。
          </p>
        </div>
      </div>

      <!-- 演示内容 -->
      <div class="section">
        <div class="section__head"><h2>演示内容</h2></div>
        <div class="card card--pad">
          <p class="small" style="color:var(--c-ink-2);line-height:1.8">
            宠友名片、社区动态、同城活动与示例地点都是演示数据，不会实时更新。
            清空它们不会删除你的宠物档案、健康记录或成长时光。
          </p>
          <button class="btn btn--ghost" id="clear-demo" style="margin-top:var(--sp-3)">清空演示内容</button>
        </div>
      </div>

      <!-- 无障碍 -->
      <div class="section">
        <div class="section__head"><h2>无障碍</h2></div>
        <div class="card card--pad">
          <label class="row" style="gap:10px;align-items:center;cursor:pointer">
            <input type="checkbox" id="large-text" style="width:auto" ${s.settings?.largeText ? 'checked' : ''}>
            <span class="small strong">大字模式</span>
          </label>
          <p class="xs muted" style="margin-top:8px">放大正文和辅助文字，适合长辈或视力不便时使用。</p>
        </div>
      </div>

      <!-- 关于 -->
      <div class="section">
        <div class="section__head"><h2>关于</h2></div>
        <div class="card card--pad">
          <p class="small" style="color:var(--c-ink-2);line-height:1.85">
            <b>爪迹 PawLog</b> — 把散落在疫苗本、聊天记录、相册里的养宠信息收拢到一处，并在关键时刻（就医、换医生、托付给朋友）能立刻拿出来。
          </p>
          <p class="xs muted" style="margin-top:var(--sp-3)">
            纯前端演示版本：无账号系统、无服务端，所有数据保存在本机浏览器。真实产品中会加入云端同步、多设备共享与疫苗到期推送提醒。
          </p>
        </div>
      </div>
    `;

    const reasonLabel = (r) => ({
      manual: '手动备份', 'before-import': '导入前', 'before-reset': '重置前',
      'before-restore': '恢复前', 'before-export': '导出前', auto: '自动',
    }[r] || r || '备份');

    const renderStorageStatus = () => {
      const st = store.getStorageStatus();
      const last = store.lastBackupInfo();
      const box = el.querySelector('#storage-status');
      if (!box) return;
      const persistText = st.persistent === true ? '已获得持久化存储'
        : st.persistent === false ? '浏览器未授予持久化存储'
          : '存储状态未确认';
      let backupNote = '';
      if (!last) backupNote = ' · 还没有手动备份';
      else {
        const days = Math.floor((Date.now() - last.at) / 86400000);
        if (days >= 7) backupNote = ` · 上次备份 ${days} 天前，建议立即备份`;
      }
      box.textContent = `存储：${st.ok ? '正常' : '写入失败'} · ${persistText}${last ? ` · 最近手动/操作前备份 ${new Date(last.at).toLocaleString('zh-CN', { hour12: false })}` : ''}${backupNote}`;
    };

    const refreshBackups = async () => {
      const box = el.querySelector('#backup-list');
      if (!box) return;
      const available = await backupStorageAvailable();
      if (!available) {
        box.innerHTML = '<div class="xs muted">本机快照存储不可用（可能是隐私模式或浏览器限制）。仍可导出 JSON 备份。</div>';
        return;
      }
      const list = await listBackups('prod');
      if (!list.length) {
        box.innerHTML = '<div class="xs muted">还没有本机快照；点「立即备份」创建第一份。</div>';
        return;
      }
      box.innerHTML = list.map((b) => `
        <div class="row row--between" style="gap:10px;align-items:center;padding:8px 10px;border:1px solid var(--c-line-soft);border-radius:var(--r-sm)">
          <div class="grow">
            <div class="small strong">${esc(new Date(b.at).toLocaleString('zh-CN', { hour12: false }))}</div>
            <div class="xs muted">${esc(reasonLabel(b.reason))} · ${b.state?.pets?.length || 0} 只宠物 · ${b.state?.records?.length || 0} 条记录</div>
          </div>
          <button class="btn btn--ghost btn--sm" data-restore="${esc(b.id)}">恢复</button>
        </div>`).join('');

      box.querySelectorAll('[data-restore]').forEach((btn) => btn.addEventListener('click', () => {
        const id = btn.dataset.restore;
        const meta = list.find((x) => x.id === id);
        if (!meta) return;
        openModal({
          title: '恢复这份备份？',
          submit: '确认恢复',
          body: `<p class="small" style="color:var(--c-ink-2);line-height:1.8">
            将用 <b>${esc(new Date(meta.at).toLocaleString('zh-CN', { hour12: false }))}</b> 的快照覆盖当前数据。
            恢复前会自动保存当前版本。</p>`,
          onSubmit() {
            restoreBackup(id).then((state) => {
              if (!state) { toast('备份内容不可用', '⚠️'); return; }
              store.restoreState(state);
              toast('已恢复到所选备份');
              render();
            }).catch((e) => toast(e.message || '恢复失败', '⚠️'));
          },
        });
      }));
    };

    renderStorageStatus();
    refreshBackups();
    if (statusUnsub) statusUnsub();
    statusUnsub = store.onStorageStatus(() => renderStorageStatus());

    el.querySelector('#edit-me').addEventListener('click', () => {
      openModal({
        title: '编辑我的资料',
        body:
          field('昵称', `<input name="name" value="${esc(s.me.name)}" required maxlength="12">`) +
          field('头像 emoji', `<input name="emoji" value="${esc(s.me.emoji)}" maxlength="4">`) +
          field('城市', `<input name="city" value="${esc(s.me.city)}" required maxlength="16">`) +
          field('区域', `<input name="district" value="${esc(s.me.district)}" required maxlength="16">`, '用于匹配同区宠友') +
          field('简介', `<textarea name="bio" maxlength="80">${esc(s.me.bio || '')}</textarea>`),
        onSubmit(d) {
          store.update((x) => { x.me = { ...x.me, ...d }; });
          toast('资料已更新');
          render();
        },
      });
    });

    el.querySelector('#add-pet').addEventListener('click', () => openAddPet(render));

    el.querySelectorAll('[data-set-active]').forEach((b) =>
      b.addEventListener('click', () => {
        store.setActivePet(b.dataset.setActive);
        toast('已切换当前宠物');
        render();
      }));

    /* ---- 立即备份 ---- */
    el.querySelector('#backup-now').addEventListener('click', async () => {
      const res = await store.backupNow('manual');
      renderStorageStatus();
      refreshBackups();
      if (!res?.ok) {
        const msg = res?.reason === 'idb' ? '备份失败：本机快照存储不可用'
          : res?.reason === 'no-state' ? '备份失败：还没有可备份的数据'
            : '备份失败：存储空间不足';
        toast(msg, '⚠️');
        return;
      }
      toast('已创建本机备份');
    });

    /* ---- 恢复上次手动备份 ---- */
    el.querySelector('#restore-last').addEventListener('click', () => {
      const info = store.lastBackupInfo();
      openModal({
        title: '恢复上次手动备份？',
        submit: '确认恢复',
        body: `<p class="small" style="color:var(--c-ink-2);line-height:1.8">
          ${info ? `将恢复到 <b>${esc(new Date(info.at).toLocaleString('zh-CN', { hour12: false }))}</b> 保存的手动/操作前快照。` : '还没有可恢复的本机备份。'}
          恢复前会自动保存当前版本。</p>`,
        onSubmit() {
          if (!info) { toast('还没有可恢复的本机备份', '⚠️'); return false; }
          try {
            store.restoreLastBackup();
            toast('已恢复上次手动备份');
            render();
          } catch (e) {
            toast(e.message || '恢复失败', '⚠️');
            return false;
          }
        },
      });
    });

    /* ---- 导出 ---- */
    el.querySelector('#export').addEventListener('click', () => {
      store.backupNow('before-export');
      const blob = new Blob([store.exportJSON()], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `pawlog-backup-${todayISO()}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast('备份已导出');
      renderStorageStatus();
    });

    /* ---- 导入 ---- */
    el.querySelector('#import').addEventListener('click', () => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'application/json,.json';
      input.addEventListener('change', () => {
        const file = input.files?.[0];
        if (!file) return;
        if (file.size > MAX_IMPORT_BYTES) {
          toast('文件过大（超过 8MB），已拒绝导入', '⚠️');
          return;
        }
        const reader = new FileReader();
        reader.onload = () => {
          const text = String(reader.result);
          let preview;
          try {
            preview = store.previewImport(text);
          } catch (err) {
            toast(err.message || '导入失败', '⚠️');
            return;
          }

          openModal({
            title: '导入备份',
            footer: `<button class="btn btn--ghost" data-close>取消</button>
                     <button class="btn btn--ghost" id="imp-merge">合并导入</button>
                     <button class="btn btn--primary" id="imp-replace">替换导入</button>`,
            body: `<p class="small" style="color:var(--c-ink-2);line-height:1.8">
              文件中有 <b>${preview.pets}</b> 只宠物、<b>${preview.records}</b> 条健康记录、<b>${preview.timeline}</b> 个成长瞬间、<b>${preview.medications}</b> 条用药、<b>${preview.symptoms}</b> 条症状、<b>${preview.expenses}</b> 笔费用、<b>${preview.policies}</b> 份保单、<b>${preview.qol}</b> 次生活质量评分、<b>${preview.places}</b> 个地点。
            </p>
            <p class="xs muted" style="margin-top:8px">
              「合并」保留现有数据，同一个 id 的记录以文件为准；「替换」会覆盖当前全部数据。导入前会自动备份当前版本。
            </p>`,
          });

          const root = document.getElementById('modal-root');
          const doImport = (mode) => {
            try {
              const r = store.importJSON(text, { mode });
              closeModal();
              toast(`导入成功：${r.pets} 只宠物 · ${r.records} 条记录`);
              render();
            } catch (err) {
              toast(err.message || '导入失败', '⚠️');
            }
          };
          root.querySelector('#imp-merge')?.addEventListener('click', () => doImport('merge'));
          root.querySelector('#imp-replace')?.addEventListener('click', () => doImport('replace'));
        };
        reader.onerror = () => toast('读取文件失败', '⚠️');
        reader.readAsText(file);
      });
      input.click();
    });

    /* ---- 清空演示内容 ---- */
    el.querySelector('#clear-demo').addEventListener('click', () => {
      openModal({
        title: '清空演示内容？',
        submit: '确认清空',
        body: `<p class="small" style="color:var(--c-ink-2);line-height:1.8">
          将移除示例宠友、动态、活动、示例地点和报名记录。宠物档案、健康记录、成长时光不受影响。</p>`,
        onSubmit() {
          store.clearDemoContent();
          toast('演示内容已清空');
          render();
        },
      });
    });

    /* ---- 安装到桌面 / 导出日历 ---- */
    el.querySelector('#install-app')?.addEventListener('click', async () => {
      if (window.matchMedia?.('(display-mode: standalone)').matches) {
        toast('已经在应用模式中打开');
        return;
      }
      const res = await window.pawlogInstall?.();
      if (res === 'accepted') toast('已安装到桌面');
      else if (res === 'dismissed') toast('已取消安装');
      else toast('请用浏览器菜单安装：Chrome「安装应用」/ iPhone「添加到主屏幕」', '📲');
    });
    el.querySelector('#export-ics')?.addEventListener('click', () => {
      const pet = store.activePet();
      if (!pet) { toast('先添加一只宠物', '🐾'); return; }
      exportICS(pet);
    });

    /* ---- 无障碍：大字模式 ---- */
    el.querySelector('#large-text').addEventListener('change', (e) => {
      store.update((x) => { x.settings = { ...(x.settings || {}), largeText: e.target.checked }; });
      document.body.classList.toggle('large-text', e.target.checked);
      toast(e.target.checked ? '已开启大字模式' : '已关闭大字模式');
    });

    /* ---- 重置 ---- */
    el.querySelector('#reset').addEventListener('click', () => {
      openModal({
        title: '重置演示数据？',
        submit: '确认重置',
        body: `<p class="small" style="color:var(--c-ink-2);line-height:1.8">
          这会清空你现有的全部记录，恢复到初始的示例数据。此操作不可撤销——如果没有备份，建议先导出。</p>`,
        onSubmit() {
          const res = store.reset();
          if (!res?.ok) {
            toast(res?.reason === 'backup-failed' ? '无法创建重置前备份，已取消重置' : '重置失败：存储写入异常', '⚠️');
            return false;
          }
          toast('已重置为演示数据');
          render();
        },
      });
    });
  };

  render();
}
