/* ============================================================
   老年照护 / 生活质量 / 纪念
   老年不是病，但值得更密的观察
   ============================================================ */
import * as store from '../store.js';
import { esc, fmtDate, todayISO, toast, openModal, closeModal, field, copyText, printHTML } from '../ui.js';
import { openRecordForm } from '../record-forms.js';

const QOL_KEYS = [
  ['hurt', '疼痛 / 不适', '0 无痛', '10 剧痛'],
  ['hunger', '食欲', '0 不吃', '10 很好'],
  ['hydration', '饮水', '0 不足', '10 充足'],
  ['hygiene', '清洁', '0 很差', '10 很好'],
  ['happiness', '快乐', '0 低落', '10 很好'],
  ['mobility', '行动', '0 无法移动', '10 自如'],
  ['goodDays', '好日子', '0 全是坏日子', '10 全是好日子'],
];
const QOL_DEFAULT = { hurt: 2, hunger: 8, hydration: 8, hygiene: 8, happiness: 8, mobility: 8, goodDays: 8 };

function qolChart(list) {
  const asc = [...list].sort((a, b) => (a.date < b.date ? -1 : 1)).slice(-8);
  if (asc.length < 2) return '<div class="xs muted" style="margin-top:8px">记录两次以上可以看到趋势</div>';
  const W = 520, H = 110, P = 10;
  const stepX = (W - P * 2) / (asc.length - 1);
  const y = (v) => P + (H - P * 2) * (1 - Math.min(70, Math.max(0, v)) / 70);
  const pts = asc.map((q, i) => `${(P + stepX * i).toFixed(1)},${y(q.total).toFixed(1)}`);
  const line = `M${pts.join(' L')}`;
  return `<svg class="qol-chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="生活质量趋势">
    <path d="${line}" fill="none" stroke="var(--c-brand)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
    ${pts.map((p, i) => `<circle cx="${p.split(',')[0]}" cy="${p.split(',')[1]}" r="3.5" fill="var(--c-brand)"><title>${esc(fmtDate(asc[i].date, false))} · ${asc[i].total}/70</title></circle>`).join('')}
  </svg>`;
}

export function seniorSection(pet, after) {
  if (pet.deceased) return '';
  if (!pet.seniorMode && !store.isSenior(pet)) return '';
  const afterFn = after || (() => {});

  if (!pet.seniorMode) {
    return `
      <div class="section">
        <div class="card card--pad">
          <div class="row row--between row--wrap" style="gap:10px">
            <div>
              <div class="strong small">按年龄，${esc(pet.name)} 已进入老年阶段</div>
              <div class="xs muted" style="margin-top:3px">开启老年模式：用药、生活质量评分、复诊提醒会集中在这里。</div>
            </div>
            <button class="btn btn--primary btn--sm" id="senior-enable" type="button">开启老年模式</button>
          </div>
        </div>
      </div>`;
  }

  const qol = store.qolOf(pet.id);
  const latest = qol[0];
  const prev = qol[1];
  const delta = latest && prev ? latest.total - prev.total : null;
  const followUps = store.followUpsOf(pet.id);
  const meds = store.currentMedicationsOf(pet.id);
  const symptoms = store.symptomsOf(pet.id).slice(0, 1);

  return `
    <div class="section">
      <div class="section__head">
        <h2>老年照护</h2>
        <span class="tag tag--sun">老年模式</span>
      </div>
      <div class="grid grid--2">
        <div class="card card--pad">
          <div class="xs strong muted">生活质量</div>
          ${latest ? `
            <div class="row" style="align-items:baseline;gap:10px;margin-top:6px">
              <div class="qol-score">${latest.total}<small>/70</small></div>
              ${delta == null ? '' : `<div class="small ${delta >= 0 ? 'qol-up' : 'qol-down'}">较上次 ${delta > 0 ? '+' : ''}${delta}</div>`}
            </div>
            <div class="xs muted">${esc(fmtDate(latest.date))} · 记录 ${qol.length} 次 · 分数仅供参考</div>
            ${qolChart(qol)}
          ` : `<div class="empty" style="padding:18px 0"><div class="empty__ico">📋</div><div class="empty__title">还没有生活质量评分</div><div class="empty__text">每周花 1 分钟，和兽医一起看趋势</div></div>`}
          <div class="row row--wrap" style="gap:8px;margin-top:10px">
            <button class="btn btn--primary btn--sm" id="qol-add" type="button">记录本周评分</button>
            <button class="btn btn--ghost btn--sm" id="senior-symptom" type="button">记录症状</button>
          </div>
          ${qol.map((q) => `
            <div class="row row--between" style="gap:8px;margin-top:8px;padding-top:8px;border-top:1px dashed var(--c-line-soft)">
              <span class="small">${esc(fmtDate(q.date))} · <b>${q.total}/70</b></span>
              <button class="btn btn--ghost list__menu" data-qol-menu="${esc(q.id)}" title="编辑或删除" aria-label="编辑或删除评分">⋯</button>
            </div>`).join('')}
        </div>

        <div class="card card--pad">
          <div class="xs strong muted">复诊与用药</div>
          ${followUps.length ? followUps.map((f) => `
            <div class="row row--between" style="gap:8px;margin-top:8px;align-items:flex-start">
              <div class="grow">
                <div class="small strong">${esc(f.title)} · ${esc(f.sub || '—')}</div>
                <div class="xs muted">${esc(fmtDate(f.date))} · ${esc(f.text)}${f.hospital ? ` · ${esc(f.hospital)}` : ''}</div>
              </div>
              <span class="tag ${f.level === 'due' ? 'tag--rose' : f.level === 'soon' ? 'tag--sun' : 'tag--mint'}">${esc(f.text)}</span>
            </div>`).join('') : '<div class="xs muted" style="margin-top:8px">暂无复诊日期</div>'}
          ${meds.length ? `
            <div class="xs strong muted" style="margin-top:14px">当前用药</div>
            ${meds.map((m) => `<div class="small" style="margin-top:4px">💊 ${esc(m.name)} · ${esc(m.frequency || '按医嘱')}</div>`).join('')}
          ` : ''}
          ${symptoms.length ? `
            <div class="xs strong muted" style="margin-top:14px">最近症状</div>
            <div class="small muted" style="margin-top:4px">${esc(fmtDate(String(symptoms[0].at).slice(0, 10)))} · ${esc(symptoms[0].note || '已记录')}</div>
          ` : ''}
          <a class="btn btn--ghost btn--sm" href="#/health" style="margin-top:12px">去健康档案管理</a>
        </div>
      </div>
    </div>`;
}

export function mountSenior(root, pet, after) {
  const rerender = () => { if (after) after(); };
  root.querySelector('#senior-enable')?.addEventListener('click', () => {
    store.updatePet(pet.id, { seniorMode: true });
    toast('已开启老年模式');
    rerender();
  });
  root.querySelector('#qol-add')?.addEventListener('click', () => openQolForm(pet, rerender));
  root.querySelector('#senior-symptom')?.addEventListener('click', () => openRecordForm(pet, 'symptom', rerender));
  root.querySelectorAll('[data-qol-menu]').forEach((b) => b.addEventListener('click', () => {
    const q = store.qolOf(pet.id).find((x) => x.id === b.dataset.qolMenu);
    if (q) openQolActions(pet, q, rerender);
  }));
}

function rangeField(key, label, lo, hi, value) {
  return `<div class="field">
    <label>${esc(label)}</label>
    <div class="row" style="gap:10px;align-items:center">
      <input type="range" min="0" max="10" step="1" name="${key}" value="${value}" class="grow">
      <output class="qol-out" data-out="${key}">${value}</output>
    </div>
    <span class="field__hint">${esc(lo)} — ${esc(hi)}</span>
  </div>`;
}

export function openQolForm(pet, after, record = null) {
  const base = record?.scores || { ...QOL_DEFAULT };
  openModal({
    title: record ? '编辑生活质量评分' : '记录生活质量评分',
    sheet: true,
    body:
      field('日期', `<input type="date" name="date" value="${esc(record?.date || todayISO())}" required>`) +
      QOL_KEYS.map(([key, label, lo, hi]) => rangeField(key, label, lo, hi, Number(base[key] ?? QOL_DEFAULT[key]))).join('') +
      field('备注', `<textarea name="note" maxlength="160" placeholder="这周的状态、食欲、睡眠……">${esc(record?.note || '')}</textarea>`) +
      '<p class="xs muted">评分用于和兽医沟通趋势，不构成诊断。</p>',
    onSubmit(d) {
      const scores = {};
      for (const [key] of QOL_KEYS) scores[key] = Number(d[key]) || 0;
      const sameDay = store.qolOf(pet.id).find((q) => q.date === d.date && q.id !== record?.id);
      if (sameDay) {
        toast('这一天已经记录过生活质量评分，请在下面历史里编辑', '⚠️');
        return false;
      }
      const data = { petId: pet.id, date: d.date, scores, note: d.note || '' };
      if (record) {
        store.updateQol(record.id, data);
        toast('生活质量评分已更新');
      } else {
        store.addQol(data);
        toast('生活质量评分已记录');
      }
      if (after) after();
    },
  });

  const form = document.getElementById('modal-form');
  form?.querySelectorAll('input[type="range"]').forEach((input) => {
    const out = form.querySelector(`[data-out="${input.name}"]`);
    const sync = () => { if (out) out.textContent = input.value; };
    input.addEventListener('input', sync);
  });
}

function openQolActions(pet, q, after) {
  const panel = openModal({
    title: '生活质量评分',
    footer: `<button class="btn btn--ghost" data-close>关闭</button>
             <button class="btn btn--danger" id="qol-del">删除</button>
             <button class="btn btn--primary" id="qol-edit">编辑</button>`,
    body: `<div class="card card--pad" style="background:var(--c-surface-2);box-shadow:none">
      <div class="strong">${esc(fmtDate(q.date))} · ${q.total}/70</div>
      ${q.note ? `<div class="small muted" style="margin-top:6px">${esc(q.note)}</div>` : ''}
    </div>`,
  });
  panel.querySelector('#qol-edit')?.addEventListener('click', () => {
    closeModal();
    openQolForm(pet, after, q);
  });
  panel.querySelector('#qol-del')?.addEventListener('click', () => {
    const deleted = store.deleteQol(q.id);
    closeModal();
    after();
    if (deleted) toast('已删除评分', '🗑️', { label: '撤销', onClick: () => { store.restoreQol(deleted); after(); toast('已恢复评分'); } });
  });
}

export function markDeceased(pet, after) {
  openModal({
    title: `和 ${pet.name} 说再见`,
    submit: '确认',
    body: `<p class="small" style="color:var(--c-ink-2);line-height:1.8">
      标记后，${esc(pet.name)} 会进入纪念模式：停止健康提醒，保留全部记录与成长时光。
      这个操作可以从档案里恢复吗？——可以，编辑档案把「已离开」取消即可。</p>
      ${field('离开日期', `<input type="date" name="date" value="${todayISO()}" required>`)}`,
    onSubmit(d) {
      store.updatePet(pet.id, { deceased: true, passedDate: d.date || todayISO() });
      toast('已进入纪念模式', '🕯️');
      if (after) after();
    },
  });
}

export function memorialBanner(pet) {
  if (!pet.deceased) return '';
  return `<div class="memorial-banner">
    <span class="memorial-banner__ico" aria-hidden="true">🕯️</span>
    <div class="grow">
      <div class="strong">${esc(pet.name)} 的纪念页</div>
      <div class="xs muted">${pet.passedDate ? `已于 ${esc(fmtDate(pet.passedDate))} 离开` : '已离开'} · 健康提醒已停止，成长时光会一直保留</div>
    </div>
    <a class="btn btn--ghost btn--sm" href="#/timeline">成长时光</a>
  </div>`;
}

export function openMemorialCard(pet) {
  const timeline = store.timelineOf(pet.id);
  const milestones = timeline.filter((t) => !t.auto && t.milestone).slice(0, 4);
  const days = store.togetherDays(pet);
  const card = `
    <div class="memorial-card">
      <div class="memorial-card__mark">🐾</div>
      <div class="memorial-card__name">${esc(pet.name)}</div>
      <div class="memorial-card__sub">${esc(pet.breed || '')}${pet.birthday ? ` · ${esc(fmtDate(pet.birthday))}` : ''}${pet.passedDate ? ` — ${esc(fmtDate(pet.passedDate))}` : ''}</div>
      ${days != null ? `<div class="memorial-card__days">一起走过 ${days} 天</div>` : ''}
      ${milestones.length ? `<div class="memorial-card__list">${milestones.map((m) => `<div>⭐ ${esc(m.title)} <span>${esc(fmtDate(m.date))}</span></div>`).join('')}</div>` : ''}
      <div class="memorial-card__foot">谢谢你来过。<br>爪迹 PawLog · 永远记得</div>
    </div>`;
  const text = `【${pet.name} 的纪念卡】\n${pet.birthday ? `${fmtDate(pet.birthday)}${pet.passedDate ? ` — ${fmtDate(pet.passedDate)}` : ''}\n` : ''}${days != null ? `一起走过 ${days} 天\n` : ''}${milestones.map((m) => `⭐ ${m.title}（${fmtDate(m.date)}）`).join('\n')}\n谢谢你来过。— 爪迹 PawLog`;
  const panel = openModal({
    title: `${pet.name} 的纪念卡`,
    footer: `<button class="btn btn--ghost" data-close>关闭</button>
             <button class="btn btn--ghost" id="mem-copy">复制文字</button>
             <button class="btn btn--primary" id="mem-print">打印 / PDF</button>`,
    body: card,
  });
  panel.querySelector('#mem-copy')?.addEventListener('click', () => copyText(text, '纪念卡文字已复制'));
  panel.querySelector('#mem-print')?.addEventListener('click', () => printHTML(card, `${pet.name} · 纪念卡`));
}
