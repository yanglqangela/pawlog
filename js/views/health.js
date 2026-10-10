/* ============================================================
   健康档案 — 体重曲线 / 疫苗 / 驱虫 / 就诊
   ============================================================ */
import * as store from '../store.js';
import { esc, fmtDate, relDate, todayISO, toast, openModal, field, selectHTML } from '../ui.js';
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
    <svg class="chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="体重变化曲线">
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
        <div class="tile__value">${latest ? latest.value : '—'}<small>kg</small></div>
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
              <div class="list__title">${r.value} kg</div>
              <div class="list__sub">${esc(fmtDate(r.date))}</div>
            </div>
            <div class="list__right">${esc(relDate(r.date))}</div>
          </div>`).join('')
        : `<div class="empty"><div class="empty__ico">⚖️</div><div class="empty__title">还没有体重记录</div></div>`}
      </div>
    </div>`;
}

function vaccineSection(pet) {
  const recs = store.recordsOf(pet.id, 'vaccine');
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
          ${d ? `<button class="btn btn--soft btn--sm" data-done data-type="vaccine" data-kind="" data-name="${esc(r.name)}" data-product="">今天打了 ✓</button>` : ''}
        </div>
      </div>`;
  }).join('')}</div></div>`
    : `<div class="empty card card--pad"><div class="empty__ico">💉</div>
        <div class="empty__title">还没有疫苗记录</div><div class="empty__text">记下接种日期，到期前会自动提醒</div></div>`;
}

function dewormSection(pet) {
  const recs = store.recordsOf(pet.id, 'deworm');
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
          ${d ? `<button class="btn btn--soft btn--sm" data-done data-type="deworm" data-kind="${esc(r.kind)}" data-name="" data-product="${esc(r.product || '')}">今天做了 ✓</button>` : ''}
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
        ${r.cost ? `<div class="list__right">¥${esc(r.cost)}</div>` : ''}
      </div>`).join('')}</div></div>`
    : `<div class="empty card card--pad"><div class="empty__ico">🏥</div>
        <div class="empty__title">还没有就诊记录</div><div class="empty__text">希望永远用不上 🍀</div></div>`;
}

/* ---------- 添加表单 ---------- */
const FORMS = {
  weight(pet, after) {
    // 「沿用上次」直接预填，用户多数时候只要确认一下
    const last = store.lastRecord(pet.id, 'weight');
    const preset = last ? last.value : '';
    openModal({
      title: `记录 ${pet.name} 的体重`,
      body:
        field('体重 (kg)',
          `<input type="number" name="value" step="0.1" min="0.1" max="120" required value="${preset}" placeholder="比如：4.8">`,
          last ? `已填上次的 ${last.value}kg（${fmtDate(last.date, false)}），有变化改一下就行` : '') +
        field('测量日期', `<input type="date" name="date" value="${todayISO()}" required>`) +
        (last && last.value > 0 ? `
        <div class="row" style="gap:6px;flex-wrap:wrap">
          <button type="button" class="chip" data-delta="-0.2">−0.2</button>
          <button type="button" class="chip" data-delta="-0.1">−0.1</button>
          <button type="button" class="chip" data-delta="0">保持 ${last.value}</button>
          <button type="button" class="chip" data-delta="0.1">+0.1</button>
          <button type="button" class="chip" data-delta="0.2">+0.2</button>
        </div>` : ''),
      onSubmit(d) {
        const v = Number(d.value);
        if (!(v > 0)) { toast('体重需要大于 0', '⚠️'); return false; }
        store.addRecord({ petId: pet.id, type: 'weight', value: v, date: d.date });
        const delta = last ? v - last.value : 0;
        toast(delta === 0 ? `已记录 ${v}kg` : `已记录 ${v}kg（${delta > 0 ? '+' : ''}${delta.toFixed(1)}）`);
        after();
      },
    });

    // 快捷增减按钮
    const panel = document.getElementById('modal-form');
    if (panel && last) {
      panel.querySelectorAll('[data-delta]').forEach((b) =>
        b.addEventListener('click', () => {
          const input = panel.querySelector('[name="value"]');
          input.value = (Number(last.value) + Number(b.dataset.delta)).toFixed(1);
        }));
    }
  },

  vaccine(pet, after) {
    const last = store.lastRecord(pet.id, 'vaccine');
    const nextPreset = last?.nextDate || store.suggestNext('vaccine', null, todayISO());
    openModal({
      title: '添加疫苗记录',
      body:
        field('疫苗名称', `<input name="name" required value="${esc(last?.name || '')}" placeholder="比如：猫三联（第三针）">`) +
        field('接种日期', `<input type="date" name="date" value="${todayISO()}" required>`) +
        field('下次接种日期', `<input type="date" name="nextDate" value="${nextPreset}">`, '已按一年周期自动填好，可改') +
        field('医院', `<input name="hospital" value="${esc(last?.hospital || pet.hospital || '')}" placeholder="比如：北碚仁爱动物医院">`) +
        field('疫苗批号', `<input name="batch" placeholder="选填">`),
      onSubmit(d) {
        if (!d.name) { toast('请填写疫苗名称', '⚠️'); return false; }
        store.addRecord({ petId: pet.id, type: 'vaccine', name: d.name, date: d.date, nextDate: d.nextDate || '', hospital: d.hospital, batch: d.batch });
        toast('疫苗记录已保存');
        after();
      },
    });
  },

  deworm(pet, after) {
    const lastIn = store.lastRecord(pet.id, 'deworm', '体内');
    const lastOut = store.lastRecord(pet.id, 'deworm', '体外');
    openModal({
      title: '添加驱虫记录',
      body:
        field('类型', selectHTML('kind', [['体内', '体内驱虫'], ['体外', '体外驱虫']], '体内')) +
        field('驱虫日期', `<input type="date" name="date" value="${todayISO()}" required>`) +
        field('下次日期', `<input type="date" name="nextDate" value="${store.suggestNext('deworm', '体内', todayISO())}">`, '已按 30 天周期自动填好，可改') +
        field('使用药品', `<input name="product" value="${esc(lastIn?.product || lastOut?.product || '')}" placeholder="比如：拜宠清 / 大宠爱">`),
      onSubmit(d) {
        store.addRecord({ petId: pet.id, type: 'deworm', kind: d.kind, date: d.date, nextDate: d.nextDate || '', product: d.product });
        toast(`${d.kind}驱虫已记录`);
        after();
      },
    });

    // 切换体内/体外时，同步更新预填的下次日期与药品
    const form = document.getElementById('modal-form');
    if (form) {
      const sel = form.querySelector('[name="kind"]');
      sel?.addEventListener('change', () => {
        const last = sel.value === '体内' ? lastIn : lastOut;
        form.querySelector('[name="nextDate"]').value = store.suggestNext('deworm', sel.value, todayISO());
        form.querySelector('[name="product"]').value = last?.product || '';
      });
    }
  },

  vet(pet, after) {
    openModal({
      title: '添加就诊记录',
      body:
        field('就诊日期', `<input type="date" name="date" value="${todayISO()}" required>`) +
        field('医院', `<input name="hospital" required value="${esc(pet.hospital || '')}" placeholder="比如：北碚仁爱动物医院">`) +
        field('症状', `<textarea name="symptom" required placeholder="比如：连续两天软便、食欲下降"></textarea>`) +
        field('诊断结果', `<input name="diagnosis" required placeholder="比如：轻度肠胃炎">`) +
        field('花费 (元)', `<input type="number" name="cost" min="0" step="1" placeholder="比如：320">`),
      onSubmit(d) {
        if (!d.hospital || !d.symptom || !d.diagnosis) { toast('请填写完整', '⚠️'); return false; }
        store.addRecord({ petId: pet.id, type: 'vet', date: d.date, hospital: d.hospital, symptom: d.symptom, diagnosis: d.diagnosis, cost: Number(d.cost) || 0 });
        toast('就诊记录已保存');
        after();
      },
    });
  },
};

const LABELS = { weight: '体重', vaccine: '疫苗', deworm: '驱虫', vet: '就诊' };
let tab = 'weight';

export default function health(el) {
  const st = store.get();
  const pet = st.pets.find((p) => p.id === st.activePetId) || st.pets[0];
  if (!st.pets.length) { openAddPet(); return; }

  const render = () => {
    const body = {
      weight: () => weightSection(pet),
      vaccine: () => vaccineSection(pet),
      deworm: () => dewormSection(pet),
      vet: () => vetSection(pet),
    }[tab]();

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
        <div class="segmented">
          ${Object.keys(LABELS).map((k) => `<button data-tab="${k}" class="${k === tab ? 'is-active' : ''}">${LABELS[k]}</button>`).join('')}
        </div>
        <button class="btn btn--primary" id="add-rec">＋ 添加${LABELS[tab]}记录</button>
      </div>

      ${body}
    `;

    el.querySelectorAll('[data-tab]').forEach((b) =>
      b.addEventListener('click', () => { tab = b.dataset.tab; render(); }));
    el.querySelectorAll('[data-pet]').forEach((b) =>
      b.addEventListener('click', () => { store.setActivePet(b.dataset.pet); health(el); }));
    el.querySelector('#add-rec').addEventListener('click', () => FORMS[tab](pet, render));

    // 一键顺延：今天做了 → 直接生成新记录，下次日期按周期算好
    el.querySelectorAll('[data-done]').forEach((b) =>
      b.addEventListener('click', () => {
        const type = b.dataset.type;
        const kind = b.dataset.kind || undefined;
        const today = todayISO();
        const next = store.suggestNext(type, kind, today);
        store.addRecord({
          petId: pet.id,
          type,
          kind,
          name: b.dataset.name || undefined,
          product: b.dataset.product || undefined,
          date: today,
          nextDate: next,
        });
        toast(`已记录 · 下次 ${fmtDate(next, false)}`);
        render();
      }));
  };

  render();
}
