/* ============================================================
   成长时光 — 时间轴 / 里程碑 / 分享卡片
   ============================================================ */
import * as store from '../store.js';
import { esc, fmtDate, relDate, todayISO, toast, openModal, field } from '../ui.js';

let filter = 'all';   // all | milestone

function statsHTML(pet, list) {
  const days = Math.floor((Date.now() - new Date(pet.birthday).getTime()) / 86400000);
  const ms = list.filter((t) => t.milestone).length;
  return `
    <div class="grid grid--3" style="margin-bottom:var(--sp-5)">
      <div class="tile">
        <div class="tile__top"><span class="tile__label">陪伴天数</span><span class="tile__ico">📅</span></div>
        <div class="tile__value">${days}<small>天</small></div>
        <div class="tile__foot">${esc(fmtDate(pet.birthday))} 出生</div>
      </div>
      <div class="tile">
        <div class="tile__top"><span class="tile__label">成长瞬间</span><span class="tile__ico">📸</span></div>
        <div class="tile__value">${list.length}<small>条</small></div>
        <div class="tile__foot">${list.length ? `最近 ${esc(relDate(list[0].date))}` : '还没有记录'}</div>
      </div>
      <div class="tile">
        <div class="tile__top"><span class="tile__label">里程碑</span><span class="tile__ico">🏅</span></div>
        <div class="tile__value">${ms}<small>个</small></div>
        <div class="tile__foot">值得纪念的高光时刻</div>
      </div>
    </div>`;
}

export function shareCard(pet) {
  const list = store.timelineOf(pet.id);
  const ms = list.filter((t) => t.milestone);
  const days = Math.floor((Date.now() - new Date(pet.birthday).getTime()) / 86400000);
  const weights = store.recordsOf(pet.id, 'weight');
  const latest = weights[0];

  return `
    <div style="border-radius:20px;overflow:hidden;border:1px solid var(--c-line);background:var(--c-surface)">
      <div style="padding:26px 24px 22px;background:linear-gradient(135deg,#FFF3EC,#FFE6DC 60%,#F7EFE6);position:relative">
        <div style="font-size:11px;font-weight:700;letter-spacing:2px;color:var(--c-brand-deep);opacity:.75">PAWLOG · 成长报告</div>
        <div style="display:flex;align-items:center;gap:14px;margin-top:14px">
          <div style="width:64px;height:64px;border-radius:999px;background:#fff;display:grid;place-items:center;font-size:34px;box-shadow:0 2px 10px rgba(43,38,34,.08)">${esc(pet.emoji)}</div>
          <div>
            <div style="font-size:23px;font-weight:750;letter-spacing:-.4px">${esc(pet.name)}</div>
            <div style="font-size:12.5px;color:var(--c-ink-2);margin-top:2px">${esc(pet.breed)} · ${esc(store.ageText(pet.birthday))}</div>
          </div>
        </div>
        <div style="display:flex;gap:26px;margin-top:20px;padding-top:16px;border-top:1px dashed #EBD9CC">
          <div><div style="font-size:11px;color:var(--c-ink-3);font-weight:600">一起走过</div>
            <div style="font-size:19px;font-weight:730">${days} <span style="font-size:11px;color:var(--c-ink-3)">天</span></div></div>
          <div><div style="font-size:11px;color:var(--c-ink-3);font-weight:600">成长瞬间</div>
            <div style="font-size:19px;font-weight:730">${list.length} <span style="font-size:11px;color:var(--c-ink-3)">个</span></div></div>
          <div><div style="font-size:11px;color:var(--c-ink-3);font-weight:600">当前体重</div>
            <div style="font-size:19px;font-weight:730">${latest ? latest.value : '—'} <span style="font-size:11px;color:var(--c-ink-3)">kg</span></div></div>
        </div>
      </div>
      <div style="padding:18px 24px 22px">
        <div style="font-size:12px;font-weight:700;color:var(--c-ink-2);margin-bottom:12px">🏅 高光时刻</div>
        ${ms.length ? ms.slice(0, 4).map((m) => `
          <div style="display:flex;gap:10px;margin-bottom:11px;align-items:flex-start">
            <span style="font-size:15px;line-height:1.5">${esc((m.photos || [])[0] || '⭐')}</span>
            <div style="flex:1">
              <div style="font-size:13.5px;font-weight:650">${esc(m.title)}</div>
              <div style="font-size:11px;color:var(--c-ink-3)">${esc(fmtDate(m.date))}</div>
            </div>
          </div>`).join('')
        : `<div style="font-size:12.5px;color:var(--c-ink-3)">还没有标记里程碑</div>`}
        <div style="margin-top:16px;padding-top:14px;border-top:1px solid var(--c-line-soft);
                    display:flex;align-items:center;justify-content:space-between">
          <span style="font-size:11px;color:var(--c-ink-4)">爪迹 PawLog · 记录每一寸成长</span>
          <span style="font-size:18px">🐾</span>
        </div>
      </div>
    </div>`;
}

function timelineHTML(pet, list) {
  const shown = filter === 'milestone' ? list.filter((t) => t.milestone) : list;
  if (!shown.length) {
    return `<div class="empty card card--pad"><div class="empty__ico">📸</div>
      <div class="empty__title">${filter === 'milestone' ? '还没有标记里程碑' : '还没有成长记录'}</div>
      <div class="empty__text">记下第一个瞬间吧</div></div>`;
  }

  return `<div class="tl">${shown.map((t) => `
    <div class="tl__item">
      <div class="tl__dot ${t.milestone ? 'tl__dot--milestone' : ''}">${t.milestone ? '★' : ''}</div>
      <div class="tl__date">${esc(fmtDate(t.date))} · ${esc(relDate(t.date))}</div>
      <div class="tl__card">
        <div class="row row--between" style="align-items:flex-start;gap:10px">
          <div class="grow">
            <div class="row" style="gap:7px;flex-wrap:wrap">
              ${t.milestone ? '<span class="tag tag--sun">🏅 里程碑</span>' : ''}
              ${(t.tags || []).filter((x) => x !== '第一个里程碑').map((x) => `<span class="tag">#${esc(x)}</span>`).join('')}
            </div>
            <div class="tl__title" style="margin-top:7px">${esc(t.title)}</div>
          </div>
        </div>
        <p class="tl__text">${esc(t.text)}</p>
        ${(t.photos || []).length ? `<div class="tl__photos">${t.photos.map((p) => `<div class="tl__photo">${esc(p)}</div>`).join('')}</div>` : ''}
      </div>
    </div>`).join('')}</div>`;
}

export default function timeline(el) {
  const st = store.get();
  const pet = st.pets.find((p) => p.id === st.activePetId) || st.pets[0];
  if (!pet) return;

  const list = store.timelineOf(pet.id);

  el.innerHTML = `
    <div class="page-head">
      <h1>成长时光</h1>
      <p>${esc(pet.emoji)} ${esc(pet.name)} 的每一个第一次</p>
    </div>

    ${st.pets.length > 1 ? `
    <div class="scroller" style="margin-bottom:var(--sp-4)">
      ${st.pets.map((p) => `<button class="chip ${p.id === pet.id ? 'is-active' : ''}" data-pet="${esc(p.id)}">${esc(p.emoji)} ${esc(p.name)}</button>`).join('')}
    </div>` : ''}

    ${statsHTML(pet, list)}

    <div class="row row--between row--wrap" style="gap:var(--sp-3);margin-bottom:var(--sp-5)">
      <div class="segmented">
        <button data-f="all" class="${filter === 'all' ? 'is-active' : ''}">全部</button>
        <button data-f="milestone" class="${filter === 'milestone' ? 'is-active' : ''}">里程碑</button>
      </div>
      <div class="row" style="gap:8px">
        <button class="btn btn--ghost" id="share">分享成长卡片</button>
        <button class="btn btn--primary" id="add-tl">＋ 记录瞬间</button>
      </div>
    </div>

    ${timelineHTML(pet, list)}
  `;

  el.querySelectorAll('[data-pet]').forEach((b) =>
    b.addEventListener('click', () => { store.setActivePet(b.dataset.pet); timeline(el); }));
  el.querySelectorAll('[data-f]').forEach((b) =>
    b.addEventListener('click', () => { filter = b.dataset.f; timeline(el); }));

  el.querySelector('#add-tl').addEventListener('click', () => openAddMoment(pet, () => timeline(el)));

  el.querySelector('#share').addEventListener('click', () => {
    openModal({
      title: '成长报告',
      footer: `<button class="btn btn--ghost" data-close>关闭</button>
               <button class="btn btn--primary" id="copy-share">复制分享文案</button>`,
      body: shareCard(pet),
    });
    document.getElementById('copy-share').addEventListener('click', () => {
      const text = `来看看 ${pet.name} 的成长记录🐾 已经陪伴 ${Math.floor((Date.now() - new Date(pet.birthday).getTime()) / 86400000)} 天，记录了 ${list.length} 个瞬间。— 来自爪迹 PawLog`;
      navigator.clipboard?.writeText(text).then(
        () => toast('分享文案已复制'),
        () => toast('复制失败，请手动选择', '⚠️'),
      );
    });
  });
}

export function openAddMoment(pet, after) {
  openModal({
    title: `记录 ${pet.name} 的瞬间`,
    submit: '保存',
    body:
      field('标题', `<input name="title" required maxlength="24" placeholder="比如：第一次学会握手">`) +
      field('日期', `<input type="date" name="date" value="${todayISO()}" required>`) +
      field('记录点什么', `<textarea name="text" maxlength="300" placeholder="当时发生了什么？它的反应是什么样的？"></textarea>`) +
      field('配图', `<input name="photos" maxlength="40" placeholder="贴几个 emoji，用空格分开">`, '比如 🐾 🎂 📸（M2 将支持上传真实照片）') +
      field('标签', `<input name="tags" maxlength="60" placeholder="用空格分开，比如：技能点 训练">`) +
      `<label class="row" style="gap:8px;cursor:pointer;align-items:center">
         <input type="checkbox" name="milestone" style="width:auto">
         <span class="small strong">标记为里程碑 🏅</span>
       </label>`,
    onSubmit(d) {
      if (!d.title) { toast('请填写标题', '⚠️'); return false; }
      store.addTimeline({
        petId: pet.id,
        date: d.date,
        title: d.title,
        text: d.text || '',
        photos: (d.photos || '').split(/\s+/).filter(Boolean).slice(0, 4),
        tags: (d.tags || '').split(/\s+/).filter(Boolean),
        milestone: d.milestone === 'on',
      });
      toast('已加入成长时光 📸');
      if (after) after();
    },
  });
}
