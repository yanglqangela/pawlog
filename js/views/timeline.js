/* ============================================================
   成长时光 — 自动聚合健康记录 + 手动补充瞬间 + 里程碑
   ============================================================ */
import * as store from '../store.js';
import { esc, fmtDate, relDate, todayISO, toast, openModal, field } from '../ui.js';

let filter = 'all';   // all | milestone | health | moment

const FILTERS = [
  ['all', '全部'],
  ['milestone', '🏅 里程碑'],
  ['health', '健康记录'],
  ['moment', '我的记录'],
];

function applyFilter(list) {
  switch (filter) {
    case 'milestone': return list.filter((t) => !t.auto && t.milestone);
    case 'health':    return list.filter((t) => t.auto);
    case 'moment':    return list.filter((t) => !t.auto);
    default:          return list;
  }
}

function statsHTML(pet, all) {
  const days = Math.floor((Date.now() - new Date(pet.birthday).getTime()) / 86400000);
  const manual = all.filter((t) => !t.auto);
  const ms = manual.filter((t) => t.milestone).length;
  const auto = all.filter((t) => t.auto).length;

  const tile = (ico, label, value, unit, foot) => `
    <div class="tile">
      <div class="tile__top"><span class="tile__label">${esc(label)}</span><span class="tile__ico">${esc(ico)}</span></div>
      <div class="tile__value">${esc(value)}${unit ? `<small>${esc(unit)}</small>` : ''}</div>
      <div class="tile__foot">${esc(foot)}</div>
    </div>`;

  return `
    <div class="grid grid--3" style="margin-bottom:var(--sp-5)">
      ${tile('📅', '陪伴天数', days, '天', `${fmtDate(pet.birthday)} 出生`)}
      ${tile('📸', '我记录的瞬间', manual.length, '条', ms ? `其中 ${ms} 个里程碑` : '还没有里程碑')}
      ${tile('🔄', '自动汇入', auto, '条', '来自健康档案')}
    </div>`;
}

/* ---- 自动节点：来自健康档案，不可编辑 ---- */
function autoNodeHTML(t) {
  if (t.kind === 'weight') {
    return `
      <div class="tl__card tl__card--auto">
        <div class="row row--between" style="align-items:flex-start">
          <div class="grow">
            <div class="row" style="gap:7px;flex-wrap:wrap">
              <span class="tl__auto-badge">🔄 自动</span>
              <span class="tl__title">${esc(t.title)}</span>
            </div>
            <p class="tl__text">${esc(t.text)}</p>
            ${(t.weights || []).length ? `<div class="tl__weight-chips">
              ${t.weights.map((w) => `<span class="tl__weight-chip">${esc(fmtDate(w.date, false))} · ${w.value}kg</span>`).join('')}
            </div>` : ''}
          </div>
        </div>
      </div>`;
  }

  return `
    <div class="tl__card tl__card--auto">
      <div class="row row--between" style="align-items:flex-start;gap:10px">
        <div class="grow">
          <div class="row" style="gap:7px;flex-wrap:wrap">
            <span class="tl__auto-badge">🔄 自动</span>
            ${(t.tags || []).map((x) => `<span class="tag">#${esc(x)}</span>`).join('')}
          </div>
          <div class="tl__title" style="margin-top:7px">${esc(t.ico)} ${esc(t.title)}</div>
        </div>
      </div>
      ${t.text ? `<p class="tl__text">${esc(t.text)}</p>` : ''}
    </div>`;
}

/* ---- 手动节点 ---- */
function manualNodeHTML(t) {
  return `
    <div class="tl__card">
      <div class="row" style="gap:7px;flex-wrap:wrap">
        ${t.milestone ? '<span class="tag tag--sun">🏅 里程碑</span>' : ''}
        ${(t.tags || []).filter((x) => x !== '第一个里程碑').map((x) => `<span class="tag">#${esc(x)}</span>`).join('')}
      </div>
      <div class="tl__title" style="margin-top:7px">${esc(t.title)}</div>
      <p class="tl__text">${esc(t.text)}</p>
      ${(t.photos || []).length ? `<div class="tl__photos">${t.photos.map((p) => `<div class="tl__photo">${esc(p)}</div>`).join('')}</div>` : ''}
    </div>`;
}

function timelineHTML(list) {
  const shown = applyFilter(list);
  if (!shown.length) {
    const msg = {
      milestone: ['还没有标记里程碑', '记录瞬间时勾选「标记为里程碑」'],
      health: ['还没有健康记录', '去健康档案记一笔体重或疫苗，会自动出现在这里'],
      moment: ['还没有手写的成长记录', '记下第一个瞬间吧'],
      all: ['还没有成长记录', '记下第一个瞬间吧'],
    }[filter];
    return `<div class="empty card card--pad"><div class="empty__ico">📸</div>
      <div class="empty__title">${esc(msg[0])}</div><div class="empty__text">${esc(msg[1])}</div></div>`;
  }

  return `<div class="tl">${shown.map((t) => `
    <div class="tl__item">
      <div class="tl__dot ${t.milestone ? 'tl__dot--milestone' : ''}">${t.milestone ? '★' : ''}</div>
      <div class="tl__date">${esc(fmtDate(t.date))} · ${esc(relDate(t.date))}</div>
      ${t.auto ? autoNodeHTML(t) : manualNodeHTML(t)}
    </div>`).join('')}</div>`;
}

/* ---- 分享卡片 ---- */
export function shareCard(pet) {
  const all = store.timelineOf(pet.id);
  const ms = all.filter((t) => !t.auto && t.milestone);
  const manual = all.filter((t) => !t.auto);
  const days = Math.floor((Date.now() - new Date(pet.birthday).getTime()) / 86400000);
  const weights = store.recordsOf(pet.id, 'weight');
  const latest = weights[0];

  return `
    <div style="border-radius:20px;overflow:hidden;border:1px solid var(--c-line);background:var(--c-surface)">
      <div style="padding:26px 24px 22px;background:linear-gradient(135deg,#FFF3EC,#FFE6DC 60%,#F7EFE6)">
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
            <div style="font-size:19px;font-weight:730">${manual.length} <span style="font-size:11px;color:var(--c-ink-3)">个</span></div></div>
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

export default function timeline(el) {
  const st = store.get();
  const pet = st.pets.find((p) => p.id === st.activePetId) || st.pets[0];
  if (!pet) return;

  const all = store.timelineOf(pet.id);

  el.innerHTML = `
    <div class="page-head">
      <h1>成长时光</h1>
      <p>${esc(pet.emoji)} ${esc(pet.name)} 的每一个第一次</p>
    </div>

    ${st.pets.length > 1 ? `
    <div class="scroller" style="margin-bottom:var(--sp-4)">
      ${st.pets.map((p) => `<button class="chip ${p.id === pet.id ? 'is-active' : ''}" data-pet="${esc(p.id)}">${esc(p.emoji)} ${esc(p.name)}</button>`).join('')}
    </div>` : ''}

    ${statsHTML(pet, all)}

    <div class="card card--pad" style="margin-bottom:var(--sp-5);background:var(--c-surface-2);box-shadow:none">
      <div class="row row--between row--wrap" style="gap:10px">
        <div>
          <div class="strong small">🔄 健康记录会自动汇入时间线</div>
          <div class="xs muted" style="margin-top:3px">疫苗、驱虫、就诊、体重按月自动生成节点，不用重复手录</div>
        </div>
        <a class="btn btn--ghost btn--sm" href="#/health">去健康档案</a>
      </div>
    </div>

    <div class="row row--between row--wrap" style="gap:var(--sp-3);margin-bottom:var(--sp-5)">
      <div class="segmented">
        ${FILTERS.map(([k, t]) => `<button data-f="${k}" class="${filter === k ? 'is-active' : ''}">${esc(t)}</button>`).join('')}
      </div>
      <div class="row" style="gap:8px">
        <button class="btn btn--ghost" id="share">分享成长卡片</button>
        <button class="btn btn--primary" id="add-tl">＋ 记录瞬间</button>
      </div>
    </div>

    ${timelineHTML(all)}
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
      const manual = store.timelineOf(pet.id).filter((t) => !t.auto);
      const text = `来看看 ${pet.name} 的成长记录🐾 已经陪伴 ${Math.floor((Date.now() - new Date(pet.birthday).getTime()) / 86400000)} 天，记录了 ${manual.length} 个瞬间。— 来自爪迹 PawLog`;
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
      field('配图', `<input name="photos" maxlength="40" placeholder="贴几个 emoji，用空格分开">`, '比如 🐾 🎂 📸（M3 将支持上传真实照片）') +
      field('标签', `<input name="tags" maxlength="60" placeholder="用空格分开，比如：技能点 训练">`) +
      `<label class="row" style="gap:8px;cursor:pointer;align-items:center">
         <input type="checkbox" name="milestone" style="width:auto">
         <span class="small strong">标记为里程碑 🏅（会出现在分享卡片里）</span>
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
