/* ============================================================
   我的 — 资料 / 我的宠物 / 我的动态 / 数据备份
   ============================================================ */
import * as store from '../store.js';
import { esc, relDate, todayISO, toast, openModal, field } from '../ui.js';
import { openAddPet } from './dashboard.js';
import { openEditPet } from './pet.js';

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
            const allergy = (p.allergies || '').trim();
            const hasAllergy = allergy && !/^(无|没有|暂无|无已知)/.test(allergy);
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
              <div class="list__title" style="font-weight:500;font-size:var(--fs-sm)">${esc(p.text.slice(0, 40))}${p.text.length > 40 ? '…' : ''}</div>
              <div class="list__sub">❤️ ${p.likes} · 💬 ${p.comments.length}</div>
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
            <button class="btn btn--primary" id="export">导出备份 (.json)</button>
            <button class="btn btn--ghost" id="import">从备份恢复</button>
            <button class="btn btn--ghost" id="reset">重置演示数据</button>
          </div>
          <p class="xs muted" style="margin-top:var(--sp-3)">
            当前共 ${s.pets.length} 只宠物 · ${s.records.length} 条健康记录 · ${s.timeline.length} 个成长瞬间 · ${s.posts.length} 条动态
          </p>
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

    /* ---- 导出 ---- */
    el.querySelector('#export').addEventListener('click', () => {
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
    });

    /* ---- 导入 ---- */
    el.querySelector('#import').addEventListener('click', () => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'application/json,.json';
      input.addEventListener('change', () => {
        const file = input.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
          try {
            const r = store.importJSON(String(reader.result));
            toast(`恢复成功：${r.pets} 只宠物 · ${r.records} 条记录`);
            render();
          } catch (err) {
            toast(err.message || '导入失败', '⚠️');
          }
        };
        reader.onerror = () => toast('读取文件失败', '⚠️');
        reader.readAsText(file);
      });
      input.click();
    });

    /* ---- 重置 ---- */
    el.querySelector('#reset').addEventListener('click', () => {
      openModal({
        title: '重置演示数据？',
        submit: '确认重置',
        body: `<p class="small" style="color:var(--c-ink-2);line-height:1.8">
          这会清空你现有的全部记录，恢复到初始的示例数据。此操作不可撤销——如果没有备份，建议先导出。</p>`,
        onSubmit() {
          store.reset();
          toast('已重置为演示数据');
          render();
        },
      });
    });
  };

  render();
}
