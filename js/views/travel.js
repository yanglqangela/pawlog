/* ============================================================
   出行 / 寄养交接
   无后端：清单可打印、交接卡可复制/分享，不假装能代办证件
   ============================================================ */
import * as store from '../store.js';
import { esc, fmtDate, toast, openModal, field, copyText, shareText, printHTML } from '../ui.js';

function dateStatus(date) {
  if (!date) return { text: '未记录', level: 'missing' };
  const n = store.daysUntil(date);
  if (!Number.isFinite(n)) return { text: '日期无效', level: 'missing' };
  if (n < 0) return { text: `已过期 ${-n} 天`, level: 'expired' };
  if (n <= 30) return { text: `${n} 天后到期`, level: 'soon' };
  return { text: `有效至 ${fmtDate(date, false)}`, level: 'ok' };
}

const RABIES_RE = /狂犬|RAB/i;

function vaccineMatch(pet, re) {
  return store.recordsOf(pet.id, 'vaccine').find((v) => re.test(v.name || ''));
}

function routineVaccine(pet) {
  return store.recordsOf(pet.id, 'vaccine').find((v) => !RABIES_RE.test(v.name || '')) || null;
}

function dewormRows(pet) {
  const rows = store.recordsOf(pet.id, 'deworm');
  return ['体内', '体外']
    .map((k) => rows.find((d) => d.kind === k && d.nextDate) || rows.find((d) => d.kind === k))
    .filter(Boolean);
}

function vaccineStatus(v) {
  if (!v) return dateStatus(null);
  if (v.nextDate) return dateStatus(v.nextDate);
  if (!v.date) return dateStatus(null);
  const est = store.addDays(v.date, 365);
  const n = store.daysUntil(est);
  if (n < 0) return { text: '预计已过期（按 1 年推算）', level: 'expired' };
  if (n <= 30) return { text: `预计 ${n} 天后到期（按 1 年推算）`, level: 'soon' };
  return { text: `预计有效至 ${fmtDate(est, false)}（按 1 年推算）`, level: 'todo' };
}

function policyStatus(policies) {
  if (!policies.length) return { text: '未记录', level: 'missing' };
  const statuses = policies.map((p) => (p.end ? dateStatus(p.end) : { text: '已记录', level: 'ok' }));
  return statuses.find((s) => s.level === 'expired')
    || statuses.find((s) => s.level === 'soon')
    || { text: '已记录', level: 'ok' };
}

export function travelItems(pet) {
  const rabies = vaccineMatch(pet, RABIES_RE);
  const routine = routineVaccine(pet);
  const deworms = dewormRows(pet);
  const policies = store.policiesOf(pet.id);
  const meds = store.currentMedicationsOf(pet.id);
  const chip = (pet.chipNo || '').trim();
  const reg = (pet.registrationNo || '').trim();
  const dewormDue = deworms.map((d) => d.nextDate).filter(Boolean)
    .sort((a, b) => store.daysUntil(a) - store.daysUntil(b))[0];

  return [
    {
      key: 'rabies', label: '狂犬免疫',
      value: rabies ? `${rabies.name || '狂犬疫苗'} · ${fmtDate(rabies.date)}${rabies.hospital ? ` · ${rabies.hospital}` : ''}` : '未记录',
      status: vaccineStatus(rabies),
      note: '犬只/出行常需；以当地规定为准',
    },
    {
      key: 'vaccine', label: '常规疫苗',
      value: routine ? `${routine.name || '疫苗'} · ${fmtDate(routine.date)}` : '未记录',
      status: vaccineStatus(routine),
      note: '寄养/托运常要求近期免疫',
    },
    {
      key: 'deworm', label: '驱虫',
      value: deworms.length
        ? deworms.map((d) => `${d.kind} ${fmtDate(d.date)}${d.nextDate ? `（下次 ${fmtDate(d.nextDate, false)}）` : ''}`).join('；')
        : '未记录',
      status: dateStatus(dewormDue),
      note: '体内/体外分别看；部分寄养机构会询问',
    },
    {
      key: 'chip', label: '芯片号',
      value: chip || '未填写',
      status: chip ? { text: '已填写', level: 'ok' } : { text: '缺失', level: 'missing' },
      note: '与登记信息保持一致',
    },
    {
      key: 'reg', label: '登记证号',
      value: reg || '未填写',
      status: reg ? { text: '已填写', level: 'ok' } : { text: '缺失', level: 'missing' },
      note: '以当地犬证/电子犬牌为准',
    },
    {
      key: 'quarantine', label: '检疫证明',
      value: '出行前 7 天内办理',
      status: { text: '需自行办理', level: 'todo' },
      note: '以铁路/航空/目的地要求为准',
    },
    {
      key: 'policy', label: '保单',
      value: policies.length ? policies.map((p) => `${p.company} ${p.policyNo || ''}`).join('；') : '未记录',
      status: policyStatus(policies),
      note: '理赔材料可在「健康 → 费用」里打印',
    },
    {
      key: 'meds', label: '过敏 / 当前用药',
      value: [pet.allergies, meds.map((m) => m.name).join('、')].filter(Boolean).join(' · ') || '未记录',
      status: { text: '交接时说明', level: 'todo' },
      note: '寄养人必须知道',
    },
  ];
}

const LEVEL_TAG = { ok: 'tag--mint', soon: 'tag--sun', expired: 'tag--rose', missing: 'tag--rose', todo: 'tag--sky' };

function itemsHTML(items) {
  return `<div class="card card--flush"><div class="list">${items.map((it) => `
    <div class="list__item">
      <div class="grow">
        <div class="row" style="gap:8px;flex-wrap:wrap">
          <span class="list__title">${esc(it.label)}</span>
          <span class="tag ${LEVEL_TAG[it.status.level] || ''}">${esc(it.status.text)}</span>
        </div>
        <div class="list__sub">${esc(it.value)}${it.note ? ` · ${esc(it.note)}` : ''}</div>
      </div>
    </div>`).join('')}</div></div>`;
}

function railInfoHTML() {
  return `<div class="card card--pad" style="background:var(--c-surface-2);box-shadow:none;margin-top:var(--sp-4)">
    <div class="xs strong">🚄 高铁「爱宠行」信息（2026-04 起）</div>
    <div class="small muted" style="margin-top:6px;line-height:1.8">
      目前 121 座高铁站、228 趟列车可托运宠物。需提前办理动物检疫合格证明、使用合规笼具，并按车站要求到站办理。
    </div>
    <div class="row row--wrap" style="gap:8px;margin-top:10px">
      <a class="btn btn--ghost btn--sm" href="https://www.12306.cn/" target="_blank" rel="noopener">去 12306 核对最新规定</a>
    </div>
    <p class="xs muted" style="margin-top:8px">政策会变，以铁路 12306 与车站当日要求为准。</p>
  </div>`;
}

export function travelSection(pet) {
  if (pet.deceased) return '';
  const rabies = vaccineMatch(pet, RABIES_RE);
  const rabiesStatus = vaccineStatus(rabies);
  const chip = (pet.chipNo || '').trim();
  return `
    <div class="section">
      <div class="section__head"><h2>出行与寄养</h2></div>
      <div class="card card--pad">
        <div class="row row--between row--wrap" style="gap:10px">
          <div>
            <div class="strong small">带它出门，或者托付给值得信任的人</div>
            <div class="xs muted" style="margin-top:3px">证件清单可打印；交接卡可复制发给寄养人。</div>
          </div>
          <div class="row row--wrap" style="gap:8px">
            <button class="btn btn--primary btn--sm" id="travel-pack" type="button">出行证件包</button>
            <button class="btn btn--ghost btn--sm" id="boarding-card" type="button">寄养交接卡</button>
          </div>
        </div>
        <div class="row row--wrap" style="gap:8px;margin-top:12px">
          <span class="tag ${LEVEL_TAG[rabiesStatus.level] || ''}">狂犬：${esc(rabiesStatus.text)}</span>
          <span class="tag ${chip ? 'tag--mint' : 'tag--rose'}">芯片：${chip ? '已填写' : '缺失'}</span>
          <span class="tag ${pet.registrationNo ? 'tag--mint' : 'tag--sun'}">登记证：${pet.registrationNo ? '已填写' : '未填写'}</span>
        </div>
      </div>
    </div>`;
}

export function mountTravel(root, pet) {
  root.querySelector('#travel-pack')?.addEventListener('click', () => openTravelPack(pet));
  root.querySelector('#boarding-card')?.addEventListener('click', () => openBoardingCard(pet));
}

export function openTravelPack(pet) {
  const items = travelItems(pet);
  const text = [
    `【${pet.name} · 出行证件包】`,
    ...items.map((it) => `${it.label}：${it.value}（${it.status.text}）${it.note ? ` — ${it.note}` : ''}`),
    '高铁/航空/寄养要求会变，以官方当日要求为准。',
    '— 由爪迹 PawLog 生成',
  ].join('\n');
  const html = `
    <h1>${esc(pet.name)} · 出行证件包</h1>
    <table><thead><tr><th>项目</th><th>当前记录</th><th>状态</th><th>说明</th></tr></thead><tbody>
      ${items.map((it) => `<tr><td>${esc(it.label)}</td><td>${esc(it.value)}</td><td>${esc(it.status.text)}</td><td>${esc(it.note || '')}</td></tr>`).join('')}
    </tbody></table>
    <p>高铁「爱宠行」：121 座车站、228 趟列车（2026-04 起）；以 12306 最新规定为准。</p>`;

  const panel = openModal({
    title: '出行证件包',
    footer: `<button class="btn btn--ghost" data-close>关闭</button>
             <button class="btn btn--ghost" id="travel-copy">复制清单</button>
             <button class="btn btn--primary" id="travel-print">打印 / PDF</button>`,
    body: `${itemsHTML(items)}${railInfoHTML()}`,
  });
  panel.querySelector('#travel-copy')?.addEventListener('click', () => copyText(text, '出行清单已复制'));
  panel.querySelector('#travel-print')?.addEventListener('click', () => printHTML(html, `${pet.name} · 出行证件包`));
}

export function openBoardingCard(pet) {
  const meds = store.currentMedicationsOf(pet.id);
  const vaccine = routineVaccine(pet) || vaccineMatch(pet, RABIES_RE);
  const deworms = dewormRows(pet);
  const dewormText = deworms.length
    ? deworms.map((d) => `${d.kind} ${fmtDate(d.date, false)}`).join(' / ')
    : '驱虫未记录';
  const card = `
    <div class="boarding-card">
      <div class="boarding-card__head">
        <div class="boarding-card__emoji">${esc(pet.emoji)}</div>
        <div>
          <div class="boarding-card__name">${esc(pet.name)} 的寄养交接卡</div>
          <div class="xs muted">${esc(pet.species || '')}${pet.breed ? ` · ${esc(pet.breed)}` : ''}${pet.weightGoal ? ` · 目标 ${pet.weightGoal}kg` : ''}</div>
        </div>
      </div>
      <div class="boarding-card__grid">
        <div><b>喂食</b><br>${esc(pet.feeding || '未填写')}</div>
        <div><b>习惯</b><br>${esc(pet.habits || '未填写')}</div>
        <div><b>禁忌</b><br>${esc(pet.noGos || '未填写')}</div>
        <div><b>过敏 / 慢病</b><br>${esc([pet.allergies, pet.chronic].filter(Boolean).join(' · ') || '未填写')}</div>
        <div><b>当前用药</b><br>${meds.length ? meds.map((m) => `${esc(m.name)} ${esc(m.dose || '')}${esc(m.unit || '')} ${esc(m.frequency || '')}`).join('<br>') : '无'}</div>
        <div><b>疫苗 / 驱虫</b><br>${vaccine ? `疫苗 ${esc(fmtDate(vaccine.date, false))}` : '疫苗未记录'}<br>${esc(dewormText)}</div>
        <div><b>紧急联系人</b><br>${esc(pet.emergencyContact || '未填写')}</div>
        <div><b>常去医院</b><br>${esc(pet.hospital || '未填写')}${pet.hospitalPhone ? `<br>${esc(pet.hospitalPhone)}` : ''}</div>
      </div>
      <div class="boarding-card__foot">由爪迹 PawLog 生成 · 请寄养人先确认喂食/用药/禁忌，再接触宠物。</div>
    </div>`;

  const text = [
    `【${pet.name} · 寄养交接卡】`,
    `喂食：${pet.feeding || '未填写'}`,
    `习惯：${pet.habits || '未填写'}`,
    `禁忌：${pet.noGos || '未填写'}`,
    `过敏/慢病：${[pet.allergies, pet.chronic].filter(Boolean).join(' · ') || '未填写'}`,
    `当前用药：${meds.length ? meds.map((m) => `${m.name} ${m.dose || ''}${m.unit || ''} ${m.frequency || ''}`).join('；') : '无'}`,
    `疫苗：${vaccine ? `${vaccine.name || '疫苗'} ${fmtDate(vaccine.date)}` : '未记录'}`,
    `驱虫：${dewormText}`,
    `紧急联系人：${pet.emergencyContact || '未填写'}`,
    `常去医院：${pet.hospital || '未填写'}${pet.hospitalPhone ? `（${pet.hospitalPhone}）` : ''}`,
  ].join('\n');

  const panel = openModal({
    title: '寄养交接卡',
    footer: `<button class="btn btn--ghost" data-close>关闭</button>
             <button class="btn btn--ghost" id="board-copy">复制</button>
             <button class="btn btn--ghost" id="board-share">分享</button>
             <button class="btn btn--primary" id="board-print">打印 / PDF</button>`,
    body: card,
  });
  panel.querySelector('#board-copy')?.addEventListener('click', () => copyText(text, '交接卡已复制'));
  panel.querySelector('#board-share')?.addEventListener('click', () => shareText({ title: `${pet.name} 的寄养交接卡`, text }));
  panel.querySelector('#board-print')?.addEventListener('click', () => printHTML(card, `${pet.name} · 寄养交接卡`));
}
