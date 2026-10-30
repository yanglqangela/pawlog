/* ============================================================
   健康档案 — 体重曲线 / 疫苗 / 驱虫 / 就诊
   ============================================================ */
import * as store from '../store.js';
import { esc, fmtDate, relDate, todayISO, toast, openModal, closeModal, num, copyText, printHTML } from '../ui.js';
import { openRecordForm, openExpenseForm, openPolicyForm } from '../record-forms.js';
import { openAddPet } from './dashboard.js';

/* 常见品种的标准体重区间（kg）——用于「我家是不是太胖了」的对照 */
const BREED_RANGE = {
  '中华田园猫（橘）': [3.8, 5.0],
  '中华田园猫':       [3.5, 5.0],
  '英国短毛猫':       [4.0, 6.5],
  '布偶猫':           [4.5, 8.0],
  '威尔士柯基犬':     [9.0, 12.0],
  '柴犬':             [8.0, 11.0],
  '金毛寻回犬':       [25, 34],
};

function rangeOf(pet) {
  if (BREED_RANGE[pet.breed]) return BREED_RANGE[pet.breed];
  if (pet.species === '猫') return [3.5, 5.5];
  if (pet.species === '狗') return [8, 15];
  return null;
}

/* ---------- 体重折线图（纯手写 SVG，零依赖） ---------- */
function weightChart(points, range, breedName = '该品种') {
  if (points.length < 2) {
    return `<div class="empty"><div class="empty__ico">📈</div>
      <div class="empty__title">至少记录两次体重才能画曲线</div>
      <div class="empty__text">坚持记录，就能看到它的成长轨迹</div></div>`;
  }

  const W = 720, H = 240, PL = 42, PR = 18, PT = 18, PB = 32;
  const iw = W - PL - PR, ih = H - PT - PB;

  const asc = [...points].sort((a, b) => (a.date < b.date ? -1 : 1));
  const ts = asc.map((p) => new Date(p.date + 'T00:00:00').getTime());
  const t0 = ts[0], t1 = ts[ts.length - 1];
  const span = t1 - t0 || 1;

  const vals = asc.map((p) => p.value);
  const all = range ? vals.concat(range) : vals;
  let lo = Math.min(...all), hi = Math.max(...all);
  const padY = Math.max((hi - lo) * 0.28, 0.35);
  lo -= padY; hi += padY;

  const X = (t) => PL + ((t - t0) / span) * iw;
  const Y = (v) => PT + ih - ((v - lo) / (hi - lo)) * ih;

  // 网格与 Y 轴刻度
  let grid = '';
  const ticks = 4;
  for (let i = 0; i <= ticks; i++) {
    const v = lo + ((hi - lo) * i) / ticks;
    const y = Y(v);
    grid += `<line class="chart__grid" x1="${PL}" y1="${y.toFixed(1)}" x2="${W - PR}" y2="${y.toFixed(1)}"/>`;
    grid += `<text class="chart__label" x="${PL - 8}" y="${(y + 3.5).toFixed(1)}" text-anchor="end">${v.toFixed(1)}</text>`;
  }

  // 标准区间带
  let band = '';
  if (range) {
    const [rlo, rhi] = range;
    const yTop = Y(Math.min(rhi, hi)), yBot = Y(Math.max(rlo, lo));
    if (yBot - yTop > 1) {
      band = `<rect class="chart__band" x="${PL}" y="${yTop.toFixed(1)}" width="${iw}" height="${(yBot - yTop).toFixed(1)}" rx="4"/>`;
    }
  }

  const pts = asc.map((p) => [X(new Date(p.date + 'T00:00:00').getTime()), Y(p.value)]);
  const line = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const area = `${line} L${pts[pts.length - 1][0].toFixed(1)},${(PT + ih).toFixed(1)} L${pts[0][0].toFixed(1)},${(PT + ih).toFixed(1)} Z`;

  const dots = pts.map(([x, y], i) =>
    `<circle class="chart__dot" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="4.5"><title>${esc(fmtDate(asc[i].date))} · ${asc[i].value}kg</title></circle>`
  ).join('');

  const xLabels = `
    <text class="chart__label" x="${PL}" y="${H - 10}" text-anchor="start">${esc(fmtDate(asc[0].date, false))}</text>
    <text class="chart__label" x="${W - PR}" y="${H - 10}" text-anchor="end">${esc(fmtDate(asc[asc.length - 1].date, false))}</text>`;

  return `
    <svg class="chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="体重变化曲线">
      <defs>
        <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stop-color="#F2734F" stop-opacity=".20"/>
          <stop offset="100%" stop-color="#F2734F" stop-opacity="0"/>
        </linearGradient>
      </defs>
      ${band}${grid}
      <path class="chart__area" d="${area}"/>
      <path class="chart__line" d="${line}"/>
      ${dots}${xLabels}
    </svg>
    <div class="chart__legend">
      <span><i style="background:var(--c-brand)"></i>体重曲线</span>
      ${range ? `<span><i class="band" style="background:var(--c-mint-soft);border:1px solid #BFE5DC"></i>${esc(breedName)}标准区间 ${range[0]}–${range[1]}kg</span>` : ''}
    </div>`;
}

/* ---------- 各分区渲染 ---------- */
function weightSection(pet) {
  const recs = store.recordsOf(pet.id, 'weight');
  const range = rangeOf(pet);

  const latest = recs[0];
  const prev = recs[1];
  const delta = latest && prev ? (latest.value - prev.value) : null;
  const evalText = latest && range
    ? latest.value < range[0] ? '偏轻' : latest.value > range[1] ? '偏重' : '理想'
    : '—';
  const evalColor = evalText === '理想' ? 'var(--c-mint)' : evalText === '—' ? 'var(--c-ink-3)' : 'var(--c-sun)';

  return `
    <div class="grid grid--3" style="margin-bottom:var(--sp-4)">
      <div class="tile">
        <div class="tile__top"><span class="tile__label">当前体重</span><span class="tile__ico">⚖️</span></div>
        <div class="tile__value">${esc(num(latest?.value))}<small>kg</small></div>
        <div class="tile__foot">${
          delta === null ? '暂无对比' :
          delta === 0 ? '与上次持平' :
          `较上次 <b style="color:${delta > 0 ? 'var(--c-sun)' : 'var(--c-mint)'}">${delta > 0 ? '+' : ''}${delta.toFixed(1)}kg</b>`
        }</div>
      </div>
      <div class="tile">
        <div class="tile__top"><span class="tile__label">体态评估</span><span class="tile__ico">🩺</span></div>
        <div class="tile__value" style="color:${evalColor}">${esc(evalText)}</div>
        <div class="tile__foot">${range ? `标准 ${range[0]}–${range[1]}kg` : '暂无该品种参照'}</div>
      </div>
      <div class="tile">
        <div class="tile__top"><span class="tile__label">记录次数</span><span class="tile__ico">📌</span></div>
        <div class="tile__value">${recs.length}<small>次</small></div>
        <div class="tile__foot">${latest ? `最近 ${esc(relDate(latest.date))}` : '还没有记录'}</div>
      </div>
    </div>

    <div class="card card--pad" style="margin-bottom:var(--sp-4)">${weightChart(recs, range, pet.breed)}</div>

    <div class="card card--flush">
      <div class="list">
        ${recs.length ? recs.map((r) => `
          <div class="list__item">
            <div class="list__ico">⚖️</div>
            <div class="grow">
              <div class="list__title">${esc(num(r.value))} kg</div>
              <div class="list__sub">${esc(fmtDate(r.date))}</div>
            </div>
            <div class="row" style="gap:6px;align-items:center;flex:none">
              <div class="list__right">${esc(relDate(r.date))}</div>
              <button class="btn btn--ghost list__menu" data-menu="${esc(r.id)}" title="编辑或删除" aria-label="编辑或删除这条记录">⋯</button>
            </div>
          </div>`).join('')
        : `<div class="empty"><div class="empty__ico">⚖️</div><div class="empty__title">还没有体重记录</div></div>`}
      </div>
    </div>`;
}

function vaccineSection(pet) {
  const recs = store.recordsOf(pet.id, 'vaccine');
  const actionableId = recs.find((r) => r.nextDate)?.id;
  return recs.length ? `<div class="card card--flush"><div class="list">${recs.map((r) => {
    const d = r.nextDate ? store.dueText(r.nextDate) : null;
    const color = d ? (d.level === 'due' ? 'var(--c-rose)' : d.level === 'soon' ? 'var(--c-sun)' : 'var(--c-mint)') : 'var(--c-ink-3)';
    return `
      <div class="list__item">
        <div class="list__ico" style="background:var(--c-sky-soft)">💉</div>
        <div class="grow">
          <div class="list__title">${esc(r.name)}</div>
          <div class="list__sub">${esc(fmtDate(r.date))} · ${esc(r.hospital || '—')}${r.batch ? ` · 批号 ${esc(r.batch)}` : ''}</div>
          ${d ? `<div class="xs" style="color:${color};font-weight:650;margin-top:4px">下次接种 ${esc(fmtDate(r.nextDate, false))} · ${esc(d.text)}</div>` : ''}
        </div>
        <div class="col" style="align-items:flex-end;gap:6px;flex:none">
          ${d && r.id === actionableId ? `<button class="btn btn--soft btn--sm" data-done="${esc(r.id)}">今天打了 ✓</button>` : ''}
          <button class="btn btn--ghost list__menu" data-menu="${esc(r.id)}" title="编辑或删除" aria-label="编辑或删除这条记录">⋯</button>
        </div>
      </div>`;
  }).join('')}</div></div>`
    : `<div class="empty card card--pad"><div class="empty__ico">💉</div>
        <div class="empty__title">还没有疫苗记录</div><div class="empty__text">记下接种日期，到期前会自动提醒</div></div>`;
}

function dewormSection(pet) {
  const recs = store.recordsOf(pet.id, 'deworm');
  const actionable = new Set(['体内', '体外']
    .map((k) => recs.find((r) => r.kind === k && r.nextDate)?.id)
    .filter(Boolean));
  return recs.length ? `<div class="card card--flush"><div class="list">${recs.map((r) => {
    const d = r.nextDate ? store.dueText(r.nextDate) : null;
    const isIn = r.kind === '体内';
    return `
      <div class="list__item">
        <div class="list__ico" style="background:${isIn ? 'var(--c-lilac-soft)' : 'var(--c-mint-soft)'}">🐛</div>
        <div class="grow">
          <div class="row" style="gap:6px">
            <span class="list__title">${esc(r.kind)}驱虫</span>
            <span class="tag tag--${isIn ? 'lilac' : 'mint'}">${esc(r.kind)}</span>
          </div>
          <div class="list__sub">${esc(fmtDate(r.date))} · ${esc(r.product || '—')}</div>
          ${d ? `<div class="xs" style="color:${d.level === 'due' ? 'var(--c-rose)' : d.level === 'soon' ? 'var(--c-sun)' : 'var(--c-mint)'};font-weight:650;margin-top:4px">
            下次 ${esc(fmtDate(r.nextDate, false))} · ${esc(d.text)}</div>` : ''}
        </div>
        <div class="col" style="align-items:flex-end;gap:6px;flex:none">
          ${d && actionable.has(r.id) ? `<button class="btn btn--soft btn--sm" data-done="${esc(r.id)}">今天做了 ✓</button>` : ''}
          <button class="btn btn--ghost list__menu" data-menu="${esc(r.id)}" title="编辑或删除" aria-label="编辑或删除这条记录">⋯</button>
        </div>
      </div>`;
  }).join('')}</div></div>`
    : `<div class="empty card card--pad"><div class="empty__ico">🐛</div>
        <div class="empty__title">还没有驱虫记录</div><div class="empty__text">体内外驱虫建议按月记录</div></div>`;
}

function vetSection(pet) {
  const recs = store.recordsOf(pet.id, 'vet');
  return recs.length ? `<div class="card card--flush"><div class="list">${recs.map((r) => `
      <div class="list__item">
        <div class="list__ico" style="background:var(--c-rose-soft)">🏥</div>
        <div class="grow">
          <div class="list__title">${esc(r.diagnosis)}</div>
          <div class="list__sub">症状：${esc(r.symptom)}</div>
          <div class="list__sub">${esc(fmtDate(r.date))} · ${esc(r.hospital)}</div>
        </div>
        <div class="row" style="gap:6px;align-items:center;flex:none">
          ${r.cost ? `<div class="list__right">¥${esc(num(r.cost))}</div>` : ''}
          <button class="btn btn--ghost list__menu" data-menu="${esc(r.id)}" title="编辑或删除" aria-label="编辑或删除这条记录">⋯</button>
        </div>
      </div>`).join('')}</div></div>`
    : `<div class="empty card card--pad"><div class="empty__ico">🏥</div>
        <div class="empty__title">还没有就诊记录</div><div class="empty__text">希望永远用不上 🍀</div></div>`;
}

const fmtDT = (value) => {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value || '—');
  return d.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false });
};

function symptomText(s) {
  const parts = [];
  if (s.vomiting && s.vomiting !== '无') parts.push(`呕吐 ${s.vomiting}`);
  if (s.diarrhea && s.diarrhea !== '无') parts.push(`腹泻 ${s.diarrhea}`);
  if (s.appetite && s.appetite !== '正常') parts.push(`食欲 ${s.appetite}`);
  if (s.energy && s.energy !== '正常') parts.push(`精神 ${s.energy}`);
  if (s.water && s.water !== '正常') parts.push(`饮水 ${s.water}`);
  if (s.urination && s.urination !== '正常') parts.push(`排尿 ${s.urination}`);
  if (s.breathing && s.breathing !== '正常') parts.push(`呼吸 ${s.breathing}`);
  if (Number(s.pain) > 0) parts.push(`疼痛 ${s.pain}/5`);
  if (s.note) parts.push(s.note);
  return parts.join(' · ') || '已记录';
}

function symptomSection(pet) {
  const list = store.symptomsOf(pet.id).slice(0, 5);
  return `
    <div class="section" style="margin-top:var(--sp-6)">
      <div class="section__head">
        <h2>最近症状</h2>
        <button class="btn btn--soft btn--sm" id="symptom-add" type="button">＋ 记录症状</button>
      </div>
      ${list.length ? `<div class="card card--flush"><div class="list">${list.map((s) => `
        <div class="list__item">
          <div class="list__ico" style="background:var(--c-sun-soft)">🌡️</div>
          <div class="grow">
            <div class="list__title">${esc(fmtDT(s.at))}</div>
            <div class="list__sub">${esc(symptomText(s))}</div>
            ${(s.redFlags || []).length ? `<div class="tag tag--rose" style="margin-top:5px">🚨 ${esc(s.redFlags[0])}</div>` : ''}
          </div>
          <button class="btn btn--ghost list__menu" data-sy-menu="${esc(s.id)}" title="编辑或删除" aria-label="编辑或删除这条症状">⋯</button>
        </div>`).join('')}</div></div>`
      : `<div class="empty card card--pad"><div class="empty__ico">🌡️</div>
          <div class="empty__title">还没有症状记录</div><div class="empty__text">呕吐、食欲、精神变化都可以记一笔</div></div>`}
    </div>`;
}

function medicationSection(pet) {
  const meds = store.medicationsOf(pet.id);
  const today = todayISO();
  const todayLogs = store.medicationLogsOf(pet.id, today);
  const current = meds.filter((m) => m.active && (!m.endDate || m.endDate >= today));
  const inactive = meds.filter((m) => !m.active || (m.endDate && m.endDate < today));
  const card = (m) => {
    const taken = todayLogs.some((l) => l.medId === m.id);
    const expired = m.endDate && m.endDate < today;
    const tagText = !m.active ? '已停用' : expired ? '已到期' : '使用中';
    const tagClass = !m.active ? '' : expired ? 'tag--sun' : 'tag--mint';
    const meta = [m.dose ? `${m.dose}${m.unit || ''}` : '', m.frequency, m.times?.[0], m.reason]
      .filter(Boolean).join(' · ');
    return `
      <div class="card card--pad">
        <div class="row row--between" style="gap:10px;align-items:flex-start">
          <div class="grow">
            <div class="row" style="gap:6px;flex-wrap:wrap">
              <span class="strong">${esc(m.name)}</span>
              <span class="tag ${tagClass}">${tagText}</span>
            </div>
            <div class="small muted" style="margin-top:4px">${esc(meta || '—')}</div>
            ${m.endDate ? `<div class="xs muted" style="margin-top:2px">至 ${esc(fmtDate(m.endDate))}</div>` : ''}
            ${m.prescriber ? `<div class="xs muted" style="margin-top:2px">开药：${esc(m.prescriber)}</div>` : ''}
          </div>
          <div class="col" style="align-items:flex-end;gap:6px;flex:none">
            ${m.active && !expired ? `<button class="btn btn--${taken ? 'soft' : 'primary'} btn--sm" data-med-toggle="${esc(m.id)}" type="button">${taken ? '今日已服 ✓' : '今日服药打卡'}</button>` : ''}
            <button class="btn btn--ghost list__menu" data-med-menu="${esc(m.id)}" title="编辑或删除" aria-label="编辑或删除这条用药">⋯</button>
          </div>
        </div>
      </div>`;
  };

  return `
    <div class="stack">
      ${current.length ? current.map(card).join('')
        : `<div class="empty card card--pad"><div class="empty__ico">💊</div>
            <div class="empty__title">没有正在使用的药</div><div class="empty__text">按兽医处方记录，复诊时一屏交给医生</div></div>`}
      ${inactive.length ? `<div class="xs strong muted" style="margin-top:var(--sp-3)">已停用 / 已到期</div>${inactive.map(card).join('')}` : ''}
    </div>
    <p class="xs muted" style="margin-top:var(--sp-4)">请按兽医处方使用；本应用不提供剂量建议。</p>`;
}

function costChart(entries, year) {
  const months = Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, '0')}`);
  const sums = months.map((m) => entries.filter((e) => e.date.startsWith(m)).reduce((a, e) => a + e.amount, 0));
  const max = Math.max(...sums, 1);
  const W = 720, H = 190, PL = 34, PR = 14, PT = 14, PB = 28;
  const iw = W - PL - PR, ih = H - PT - PB;
  const step = iw / 12;
  const bw = step * 0.58;
  const bars = sums.map((v, i) => {
    const h = (v / max) * ih;
    const x = PL + step * i + (step - bw) / 2;
    const y = PT + ih - h;
    return `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${bw.toFixed(1)}" height="${Math.max(h, 1).toFixed(1)}" rx="3" fill="var(--c-brand)" opacity="${v ? '.85' : '.12'}"><title>${i + 1} 月 · ¥${v}</title></rect>`;
  }).join('');
  const labels = sums.map((v, i) => i % 2 === 0
    ? `<text class="chart__label" x="${(PL + step * i + step / 2).toFixed(1)}" y="${H - 8}" text-anchor="middle">${i + 1}月</text>`
    : '').join('');
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="年度费用柱状图">
    <line class="chart__grid" x1="${PL}" y1="${PT + ih}" x2="${W - PR}" y2="${PT + ih}"/>
    ${bars}${labels}
  </svg>`;
}

function costSection(pet) {
  const entries = store.costEntries(pet.id);
  const policies = store.policiesOf(pet.id);
  const years = [...new Set(entries.map((e) => e.date.slice(0, 4)))].sort().reverse();
  if (!years.includes(String(costYear))) costYear = Number(years[0] || new Date().getFullYear());
  const year = costYear;
  const yearEntries = entries.filter((e) => e.date.startsWith(String(year)));
  const total = yearEntries.reduce((a, e) => a + e.amount, 0);
  const monthKey = todayISO().slice(0, 7);
  const monthTotal = yearEntries.filter((e) => e.date.startsWith(monthKey)).reduce((a, e) => a + e.amount, 0);
  const latest = yearEntries[0];

  const cats = new Map();
  for (const e of yearEntries) cats.set(e.category, (cats.get(e.category) || 0) + e.amount);
  const catRows = [...cats.entries()].sort((a, b) => b[1] - a[1]);
  const catHTML = catRows.length ? catRows.map(([k, v]) => `
    <div class="cost-cat">
      <div class="row row--between"><span class="small">${esc(k)}</span><b class="small">¥${v}</b></div>
      <div class="cost-cat__bar"><i style="width:${total ? Math.max(2, (v / total) * 100) : 0}%"></i></div>
    </div>`).join('') : '<div class="xs muted">本年暂无费用记录</div>';

  const catIcon = { 就诊: '🏥', 药品: '💊', 检查: '🧪', 疫苗: '💉', 驱虫: '🐛', 寄养: '🏠', 其他: '🧾' };
  const entryRows = yearEntries.slice(0, 8).map((e) => `
    <div class="list__item">
      <div class="list__ico">${catIcon[e.category] || '🧾'}</div>
      <div class="grow">
        <div class="list__title">${esc(e.category)} · ¥${e.amount}</div>
        <div class="list__sub">${esc(fmtDate(e.date))}${e.note ? ` · ${esc(e.note)}` : ''}${e.hospital ? ` · ${esc(e.hospital)}` : ''}</div>
      </div>
      <button class="btn btn--ghost list__menu" data-cost-menu="${esc(e.id)}" title="编辑或删除" aria-label="编辑或删除这条费用">⋯</button>
    </div>`).join('');

  return `
    <div class="row row--between" style="margin-bottom:var(--sp-4)">
      <div class="xs strong muted">费用统计</div>
      <select id="cost-year" class="select-inline" aria-label="费用年份">
        ${(years.length ? years : [String(year)]).map((y) => `<option value="${y}" ${Number(y) === year ? 'selected' : ''}>${y} 年</option>`).join('')}
      </select>
    </div>

    <div class="grid grid--3" style="margin-bottom:var(--sp-4)">
      <div class="tile"><div class="tile__top"><span class="tile__label">${year} 年合计</span><span class="tile__ico">🧾</span></div>
        <div class="tile__value">¥${total}</div><div class="tile__foot">${yearEntries.length} 笔</div></div>
      <div class="tile"><div class="tile__top"><span class="tile__label">本月</span><span class="tile__ico">📅</span></div>
        <div class="tile__value">¥${monthTotal}</div><div class="tile__foot">${monthKey}</div></div>
      <div class="tile"><div class="tile__top"><span class="tile__label">最近一次</span><span class="tile__ico">💳</span></div>
        <div class="tile__value">${latest ? `¥${latest.amount}` : '—'}</div><div class="tile__foot">${latest ? esc(fmtDate(latest.date)) : '还没有记录'}</div></div>
    </div>

    <div class="card card--pad" style="margin-bottom:var(--sp-4)">${costChart(yearEntries, year)}</div>

    <div class="grid grid--2" style="margin-bottom:var(--sp-5)">
      <div class="card card--pad">
        <div class="xs strong muted" style="margin-bottom:10px">按类别</div>
        <div class="stack" style="gap:10px">${catHTML}</div>
      </div>
      <div class="card card--pad">
        <div class="xs strong muted" style="margin-bottom:10px">理赔与保单</div>
        <div class="row row--wrap" style="gap:8px">
          <button class="btn btn--primary btn--sm" id="claim-open" type="button">理赔材料包</button>
          <button class="btn btn--ghost btn--sm" id="policy-add" type="button">＋ 保单</button>
        </div>
        ${policies.length ? `<div class="stack" style="gap:8px;margin-top:12px">${policies.map((p) => {
          const expired = p.end && p.end < todayISO();
          const soon = p.end && !expired && p.end <= store.addDays(todayISO(), 30);
          return `
          <div class="row row--between" style="gap:8px;align-items:center;padding:9px 10px;border:1px solid var(--c-line-soft);border-radius:var(--r-sm)">
            <div class="grow">
              <div class="small strong">${esc(p.company)} ${expired ? '<span class="tag tag--rose">已过期</span>' : soon ? '<span class="tag tag--sun">30 天内到期</span>' : ''}</div>
              <div class="xs muted">${esc(p.policyNo || '—')}${p.end ? ` · 至 ${esc(fmtDate(p.end, false))}` : ''}</div>
            </div>
            <button class="btn btn--ghost list__menu" data-policy-menu="${esc(p.id)}" title="编辑或删除" aria-label="编辑或删除保单">⋯</button>
          </div>`;
        }).join('')}</div>` : `<div class="xs muted" style="margin-top:10px">未记录保单</div>`}
        <p class="xs muted" style="margin-top:10px">仅记录材料，不销售保险，不构成投保建议。</p>
      </div>
    </div>

    <div class="card card--flush">
      <div class="list">
        ${entryRows || `<div class="empty card card--pad"><div class="empty__ico">🧾</div><div class="empty__title">还没有费用记录</div><div class="empty__text">就诊费用会自动计入，也可以手动补录</div></div>`}
      </div>
    </div>`;
}

function openSymptomActions(pet, sy, after) {
  const panel = openModal({
    title: '症状记录',
    footer: `<button class="btn btn--ghost" data-close>关闭</button>
             <button class="btn btn--danger" id="sy-del">删除</button>
             <button class="btn btn--primary" id="sy-edit">编辑</button>`,
    body: `<div class="card card--pad" style="background:var(--c-surface-2);box-shadow:none">
      <div class="strong">${esc(fmtDT(sy.at))}</div>
      <div class="small muted" style="margin-top:6px">${esc(symptomText(sy))}</div>
    </div>`,
  });
  panel.querySelector('#sy-edit')?.addEventListener('click', () => {
    closeModal();
    openRecordForm(pet, 'symptom', after, sy);
  });
  panel.querySelector('#sy-del')?.addEventListener('click', () => {
    const deleted = store.deleteSymptom(sy.id);
    closeModal();
    after();
    if (deleted) toast('已删除症状记录', '🗑️', { label: '撤销', onClick: () => { store.restoreSymptom(deleted); after(); toast('已恢复记录'); } });
  });
}

function openMedicationActions(pet, med, after) {
  const panel = openModal({
    title: '用药记录',
    footer: `<button class="btn btn--ghost" data-close>关闭</button>
             <button class="btn btn--danger" id="med-del">删除</button>
             <button class="btn btn--primary" id="med-edit">编辑</button>`,
    body: `<div class="card card--pad" style="background:var(--c-surface-2);box-shadow:none">
      <div class="strong">${esc(med.name)}</div>
      <div class="small muted" style="margin-top:6px">${esc([med.dose && `${med.dose}${med.unit || ''}`, med.frequency, med.reason].filter(Boolean).join(' · ') || '—')}</div>
    </div>`,
  });
  panel.querySelector('#med-edit')?.addEventListener('click', () => {
    closeModal();
    openRecordForm(pet, 'medication', after, med);
  });
  panel.querySelector('#med-del')?.addEventListener('click', () => {
    const deleted = store.deleteMedication(med.id);
    closeModal();
    after();
    if (deleted) toast('已删除用药', '🗑️', { label: '撤销', onClick: () => { store.restoreMedication(deleted); after(); toast('已恢复用药'); } });
  });
}

function openCostActions(pet, entry, after) {
  const panel = openModal({
    title: entry.source === 'vet' ? '就诊费用' : '费用记录',
    footer: `<button class="btn btn--ghost" data-close>关闭</button>
             <button class="btn btn--danger" id="cost-del">删除</button>
             <button class="btn btn--primary" id="cost-edit">编辑</button>`,
    body: `<div class="card card--pad" style="background:var(--c-surface-2);box-shadow:none">
      <div class="strong">${esc(entry.category)} · ¥${entry.amount}</div>
      <div class="small muted" style="margin-top:6px">${esc(fmtDate(entry.date))}${entry.note ? ` · ${esc(entry.note)}` : ''}</div>
    </div>`,
  });
  panel.querySelector('#cost-edit')?.addEventListener('click', () => {
    closeModal();
    if (entry.source === 'vet') {
      const rec = store.get().records.find((r) => r.id === entry.sourceId);
      if (rec) openRecordForm(pet, 'vet', after, rec);
    } else {
      const exp = store.get().expenses.find((e) => e.id === entry.id);
      if (exp) openExpenseForm(pet, after, exp);
    }
  });
  panel.querySelector('#cost-del')?.addEventListener('click', () => {
    closeModal();
    if (entry.source === 'vet') {
      const deleted = store.deleteRecord(entry.sourceId);
      after();
      if (deleted) toast('已删除就诊记录', '🗑️', { label: '撤销', onClick: () => { store.restoreRecord(deleted); after(); toast('已恢复记录'); } });
    } else {
      const deleted = store.deleteExpense(entry.id);
      after();
      if (deleted) toast('已删除费用', '🗑️', { label: '撤销', onClick: () => { store.restoreExpense(deleted); after(); toast('已恢复费用'); } });
    }
  });
}

function openPolicyActions(pet, policy, after) {
  const panel = openModal({
    title: '保单',
    footer: `<button class="btn btn--ghost" data-close>关闭</button>
             <button class="btn btn--danger" id="pol-del">删除</button>
             <button class="btn btn--primary" id="pol-edit">编辑</button>`,
    body: `<div class="card card--pad" style="background:var(--c-surface-2);box-shadow:none">
      <div class="strong">${esc(policy.company)} · ${esc(policy.policyNo || '—')}</div>
      <div class="small muted" style="margin-top:6px">${policy.end ? `至 ${esc(fmtDate(policy.end))}` : '未填写到期日'}${policy.claimPhone ? ` · 理赔 ${esc(policy.claimPhone)}` : ''}</div>
    </div>`,
  });
  panel.querySelector('#pol-edit')?.addEventListener('click', () => {
    closeModal();
    openPolicyForm(pet, after, policy);
  });
  panel.querySelector('#pol-del')?.addEventListener('click', () => {
    const deleted = store.deletePolicy(policy.id);
    closeModal();
    after();
    if (deleted) toast('已删除保单', '🗑️', { label: '撤销', onClick: () => { store.addPolicy(deleted); after(); toast('已恢复保单'); } });
  });
}

function openClaimPack(pet, year = costYear) {
  const allEntries = store.costEntries(pet.id);
  const entries = allEntries.filter((e) => e.date.startsWith(String(year)));
  const policies = store.policiesOf(pet.id);
  const total = entries.reduce((a, e) => a + e.amount, 0);
  const rows = entries.map((e) => `
    <tr>
      <td>${esc(fmtDate(e.date))}</td>
      <td>${esc(e.category)}</td>
      <td>${esc(e.note || e.hospital || '—')}</td>
      <td style="text-align:right">¥${e.amount}</td>
    </tr>`).join('');
  const policyHTML = policies.length
    ? policies.map((p) => `<p>${esc(p.company)} · ${esc(p.policyNo || '—')}${p.end ? ` · 至 ${esc(fmtDate(p.end))}` : ''}${p.claimPhone ? ` · 理赔电话 ${esc(p.claimPhone)}` : ''}</p>`).join('')
    : '<p>未记录保单</p>';

  const claimHTML = `
    <p>宠物：${esc(pet.name)}（${esc(pet.species || '')}${pet.breed ? ` · ${esc(pet.breed)}` : ''}）</p>
    <p>费用年度：${year} 年${entries.length ? `（${esc(fmtDate(entries[entries.length - 1].date))} 至 ${esc(fmtDate(entries[0].date))}）` : '（无记录）'}</p>
    <h2>费用明细</h2>
    <table><thead><tr><th>日期</th><th>类别</th><th>说明</th><th style="text-align:right">金额</th></tr></thead><tbody>${rows || '<tr><td colspan="4">无费用记录</td></tr>'}</tbody></table>
    <p><b>合计：¥${total}</b></p>
    <h2>保单</h2>${policyHTML}
    <h2>需要准备</h2>
    <p>发票 / 收据、费用清单、病历摘要、保单信息、主人身份信息；具体以保险公司要求为准。</p>
    <p class="muted">由爪迹 PawLog 生成，仅整理本机记录，不构成保险或医疗建议。</p>`;

  const text = [
    `【${pet.name} · ${year} 年理赔材料包】`,
    `费用明细：`,
    ...entries.map((e) => `${fmtDate(e.date)} ${e.category} ${e.note || e.hospital || ''} ¥${e.amount}`),
    `合计：¥${total}`,
    `保单：${policies.length ? policies.map((p) => `${p.company} ${p.policyNo || ''}`).join('；') : '未记录'}`,
    `需要准备：发票/收据、费用清单、病历摘要、保单信息、身份信息。`,
    `— 由爪迹 PawLog 生成，仅供参考`,
  ].join('\n');

  const panel = openModal({
    title: `${year} 年理赔材料包`,
    footer: `<button class="btn btn--ghost" data-close>关闭</button>
             <button class="btn btn--ghost" id="claim-copy">复制文本</button>
             <button class="btn btn--primary" id="claim-print">打印 / PDF</button>`,
    body: `<p class="small" style="color:var(--c-ink-2);line-height:1.8">
      共 ${entries.length} 笔费用，合计 <b>¥${total}</b>。打印前请确认发票与病历齐全。
    </p>
    <div class="card card--pad" style="margin-top:var(--sp-4);background:var(--c-surface-2);box-shadow:none">
      <div class="xs strong">材料清单</div>
      <ul class="small" style="margin:8px 0 0;padding-left:18px;line-height:1.9;color:var(--c-ink-2)">
        <li>费用明细（本页）</li><li>发票 / 收据</li><li>病历摘要</li><li>保单信息</li><li>主人身份信息</li>
      </ul>
    </div>`,
  });
  panel.querySelector('#claim-copy')?.addEventListener('click', () => copyText(text, '理赔材料清单已复制'));
  panel.querySelector('#claim-print')?.addEventListener('click', () => printHTML(claimHTML, `${pet.name} · ${year} 年理赔材料包`));
}

const LABELS = { weight: '体重', vaccine: '疫苗', deworm: '驱虫', vet: '就诊', medication: '用药', cost: '费用' };
let tab = 'weight';
let costYear = new Date().getFullYear();

function openRecordActions(pet, rec, after) {
  const label = LABELS[rec.type] || '记录';
  const detail = rec.type === 'weight'
    ? `${num(rec.value)} kg · ${fmtDate(rec.date)}`
    : rec.type === 'vaccine'
      ? `${rec.name || '疫苗'} · ${fmtDate(rec.date)}${rec.hospital ? ` · ${rec.hospital}` : ''}`
      : rec.type === 'deworm'
        ? `${rec.kind}驱虫 · ${fmtDate(rec.date)}${rec.product ? ` · ${rec.product}` : ''}`
        : `${rec.diagnosis || '就诊'} · ${fmtDate(rec.date)}${rec.hospital ? ` · ${rec.hospital}` : ''}`;

  const panel = openModal({
    title: `${label}记录`,
    footer: `<button class="btn btn--ghost" data-close>关闭</button>
             <button class="btn btn--danger" id="rec-del">删除</button>
             <button class="btn btn--primary" id="rec-edit">编辑</button>`,
    body: `<div class="card card--pad" style="background:var(--c-surface-2);box-shadow:none">
      <div class="strong">${esc(detail)}</div>
      ${rec.type === 'vet' && rec.symptom ? `<div class="small muted" style="margin-top:6px">症状：${esc(rec.symptom)}</div>` : ''}
      ${rec.type === 'vet' && rec.cost ? `<div class="small muted" style="margin-top:4px">花费：¥${esc(num(rec.cost))}</div>` : ''}
    </div>`,
  });

  panel.querySelector('#rec-edit')?.addEventListener('click', () => {
    closeModal();
    openRecordForm(pet, rec.type, after, rec);
  });

  panel.querySelector('#rec-del')?.addEventListener('click', () => {
    const deleted = store.deleteRecord(rec.id);
    closeModal();
    after();
    if (deleted) {
      toast('已删除记录', '🗑️', {
        label: '撤销',
        onClick: () => { store.restoreRecord(deleted); after(); toast('已恢复记录'); },
      });
    }
  });
}

export default function health(el) {
  const st = store.get();
  const pet = st.pets.find((p) => p.id === st.activePetId) || st.pets[0];
  if (!st.pets.length) { openAddPet(); return; }

  const render = () => {
    const body = {
      weight: () => weightSection(pet),
      vaccine: () => vaccineSection(pet),
      deworm: () => dewormSection(pet),
      vet: () => `${vetSection(pet)}${symptomSection(pet)}`,
      medication: () => medicationSection(pet),
      cost: () => costSection(pet),
    }[tab]();

    const addLabel = tab === 'cost' ? '＋ 添加费用'
      : tab === 'medication' ? '＋ 添加用药'
        : `＋ 添加${LABELS[tab]}记录`;

    el.innerHTML = `
      <div class="page-head">
        <h1>健康档案</h1>
        <p>${esc(pet.emoji)} ${esc(pet.name)} · ${esc(pet.breed)} · ${esc(store.ageText(pet.birthday))}</p>
      </div>

      ${st.pets.length > 1 ? `
      <div class="scroller" style="margin-bottom:var(--sp-4)">
        ${st.pets.map((p) => `<button class="chip ${p.id === pet.id ? 'is-active' : ''}" data-pet="${esc(p.id)}">${esc(p.emoji)} ${esc(p.name)}</button>`).join('')}
      </div>` : ''}

      <div class="row row--between row--wrap" style="gap:var(--sp-3);margin-bottom:var(--sp-5)">
        <div class="segmented" role="tablist" aria-label="健康记录分类">
          ${Object.keys(LABELS).map((k) => `<button id="tab-${k}" role="tab" aria-selected="${k === tab}" aria-controls="health-panel" tabindex="${k === tab ? 0 : -1}" data-tab="${k}" class="${k === tab ? 'is-active' : ''}">${LABELS[k]}</button>`).join('')}
        </div>
        <button class="btn btn--primary" id="add-rec" type="button">${addLabel}</button>
      </div>

      <div id="health-panel" role="tabpanel" aria-labelledby="tab-${tab}" tabindex="0">
        ${body}
      </div>
    `;

    el.querySelectorAll('[data-tab]').forEach((b) =>
      b.addEventListener('click', () => { tab = b.dataset.tab; render(); }));
    el.querySelector('[role="tablist"]')?.addEventListener('keydown', (e) => {
      const keys = Object.keys(LABELS);
      const i = keys.indexOf(tab);
      let next = null;
      if (e.key === 'ArrowRight') next = (i + 1) % keys.length;
      if (e.key === 'ArrowLeft') next = (i - 1 + keys.length) % keys.length;
      if (e.key === 'Home') next = 0;
      if (e.key === 'End') next = keys.length - 1;
      if (next == null) return;
      e.preventDefault();
      tab = keys[next];
      render();
      el.querySelector(`#tab-${tab}`)?.focus();
    });
    el.querySelectorAll('[data-pet]').forEach((b) =>
      b.addEventListener('click', () => { store.setActivePet(b.dataset.pet); health(el); }));
    el.querySelector('#add-rec').addEventListener('click', () => {
      if (tab === 'cost') openExpenseForm(pet, render);
      else if (tab === 'medication') openRecordForm(pet, 'medication', render);
      else openRecordForm(pet, tab, render);
    });

    el.querySelector('#symptom-add')?.addEventListener('click', () => openRecordForm(pet, 'symptom', render));
    el.querySelectorAll('[data-sy-menu]').forEach((b) =>
      b.addEventListener('click', () => {
        const sy = store.get().symptoms.find((x) => x.id === b.dataset.syMenu);
        if (sy) openSymptomActions(pet, sy, render);
      }));
    el.querySelectorAll('[data-med-toggle]').forEach((b) =>
      b.addEventListener('click', () => {
        const action = store.toggleMedicationLog(b.dataset.medToggle, todayISO());
        toast(action === 'added' ? '已记录今日服药' : '已取消今日打卡');
        render();
      }));
    el.querySelectorAll('[data-med-menu]').forEach((b) =>
      b.addEventListener('click', () => {
        const med = store.get().medications.find((x) => x.id === b.dataset.medMenu);
        if (med) openMedicationActions(pet, med, render);
      }));
    el.querySelectorAll('[data-cost-menu]').forEach((b) =>
      b.addEventListener('click', () => {
        const entry = store.costEntries(pet.id).find((x) => x.id === b.dataset.costMenu);
        if (entry) openCostActions(pet, entry, render);
      }));
    el.querySelector('#claim-open')?.addEventListener('click', () => openClaimPack(pet));
    el.querySelector('#cost-year')?.addEventListener('change', (e) => {
      costYear = Number(e.target.value);
      render();
    });
    el.querySelector('#policy-add')?.addEventListener('click', () => openPolicyForm(pet, render));
    el.querySelectorAll('[data-policy-menu]').forEach((b) =>
      b.addEventListener('click', () => {
        const policy = store.policiesOf(pet.id).find((x) => x.id === b.dataset.policyMenu);
        if (policy) openPolicyActions(pet, policy, render);
      }));

    // 每条记录的「⋯」：编辑 / 删除
    el.querySelectorAll('[data-menu]').forEach((b) =>
      b.addEventListener('click', () => {
        const rec = store.get().records.find((r) => r.id === b.dataset.menu);
        if (rec) openRecordActions(pet, rec, render);
      }));

    // 一键顺延：今天做了 → 直接生成新记录，下次日期按周期算好
    el.querySelectorAll('[data-done]').forEach((b) =>
      b.addEventListener('click', () => {
        const rec = store.get().records.find((r) => r.id === b.dataset.done);
        if (!rec) return;
        const reminder = {
          sourceId: rec.id,
          sourceDate: rec.date,
          type: rec.type,
          kind: rec.kind,
          title: rec.type === 'vaccine' ? (rec.name || '疫苗') : `${rec.kind}驱虫`,
          sub: rec.type === 'vaccine' ? rec.hospital : rec.product,
          hospital: rec.hospital || '',
        };
        const res = store.completeReminder(pet.id, reminder, todayISO());
        if (res.duplicate) {
          toast('本周期已打卡，无需重复记录', '⏳');
          return;
        }
        toast(`已记录 · 下次 ${fmtDate(res.record?.nextDate, false)}`);
        render();
      }));
  };

  render();
}
