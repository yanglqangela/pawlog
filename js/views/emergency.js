/* ============================================================
   就医模式 2.0 — 一屏给医生看完，可打印 / 复制 / 分享
   数据来自本机记录；急诊红旗走静态规则，不经过 AI
   ============================================================ */
import * as store from '../store.js';
import { esc, fmtDate, relDate, todayISO, num, toast, copyText, shareText, closeModal, allergyStatus } from '../ui.js';
import { openRedFlags } from '../red-flags.js';

const COMMON_QUESTIONS = [
  '这次症状从什么时候开始？有没有变重？',
  '需要做哪些检查？结果大概什么时候出？',
  '现在用的药，和它的慢病药、过敏史有没有冲突？',
  '需要复诊吗？复诊前要重点观察什么？',
  '费用大概多少？有没有更稳妥的替代方案？',
];
const CAT_QUESTIONS = ['它最近一次排尿是什么时候？需要查肾功能/尿检吗？'];
const DOG_QUESTIONS = ['最近有没有误食、剧烈运动或外伤？'];

function questionsFor(pet) {
  const list = [...COMMON_QUESTIONS];
  if (pet.species === '猫') list.push(...CAT_QUESTIONS);
  if (pet.species === '狗') list.push(...DOG_QUESTIONS);
  return list.slice(0, 6);
}

function fmtDateTime(value) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleString('zh-CN', { hour12: false });
}

function fmtShortTime(value) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value || '—');
  return d.toLocaleString('zh-CN', {
    month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
  });
}

function activeMedications(pet) {
  return store.currentMedicationsOf(pet.id);
}

function recentSymptoms(pet) {
  const cutoff = Date.now() - 24 * 3600 * 1000;
  return (store.get().symptoms || [])
    .filter((s) => s.petId === pet.id && new Date(s.at).getTime() >= cutoff)
    .sort((a, b) => (a.at < b.at ? 1 : -1));
}

function policiesOf(pet) {
  return (store.get().policies || []).filter((p) => p.petId === pet.id);
}

function symptomSummary(s) {
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

export function updatedText(pet) {
  const meta = store.get().meta?.updatedAt;
  if (meta) {
    const s = fmtDateTime(meta);
    if (s) return s;
  }
  const dates = [
    ...store.recordsOf(pet.id).map((r) => r.date),
    ...(store.get().timeline || []).filter((t) => t.petId === pet.id).map((t) => t.date),
    ...recentSymptoms(pet).map((s) => String(s.at).slice(0, 10)),
  ].filter(Boolean).sort();
  return dates.length ? fmtDate(dates[dates.length - 1]) : fmtDate(todayISO());
}

/* ---------- 卡片 HTML ---------- */
export function emergencyCard(pet) {
  const recs = store.recordsOf(pet.id);
  const vaccines = recs.filter((r) => r.type === 'vaccine').slice(0, 3);
  const deworms = recs.filter((r) => r.type === 'deworm').slice(0, 4);
  const vets = recs.filter((r) => r.type === 'vet').slice(0, 4);
  const weights = recs.filter((r) => r.type === 'weight');
  const latestW = weights[0];
  const meds = activeMedications(pet);
  const symptoms = recentSymptoms(pet).slice(0, 3);
  const policies = policiesOf(pet);

  const allergy = allergyStatus(pet.allergies);

  const row = (label, value, hl) => `
    <div class="erx__row">
      <span class="erx__label">${esc(label)}</span>
      <span class="erx__value"${hl ? ' style="color:var(--c-rose);font-weight:750"' : ''}>${esc(value || '—')}</span>
    </div>`;

  return `
    <div class="erx">
      <div class="erx__head">
        <div class="erx__title">🐾 ${esc(pet.name)} · 就医摘要</div>
        <div class="erx__sub">爪迹 PawLog · 数据更新于 ${esc(updatedText(pet))}</div>
      </div>

      <div class="erx__sec">
        <div class="erx__sec-title">基本信息</div>
        ${row('名字', pet.name)}
        ${row('品种', `${pet.species || ''}${pet.breed ? ` · ${pet.breed}` : ''}`)}
        ${row('性别', `${pet.gender || '—'}${pet.neutered ? '（已绝育）' : '（未绝育）'}`)}
        ${row('年龄', `${store.ageText(pet.birthday)}${pet.birthday ? `（${fmtDate(pet.birthday)} 出生）` : ''}`)}
        ${row('当前体重', latestW ? `${num(latestW.value)} kg（${fmtDate(latestW.date)}）` : '无记录')}
        ${row('芯片号', pet.chipNo)}
        ${pet.registrationNo ? row('登记证号', pet.registrationNo) : ''}
      </div>

      <div class="erx__sec erx__sec--alert">
        <div class="erx__sec-title">⚠️ 过敏 / 慢病 / 当前用药</div>
        <div class="erx__allergy${allergy.unknown ? ' erx__allergy--unknown' : ''}">${esc(allergy.text)}</div>
        ${pet.chronic ? `<div class="erx__row"><span class="erx__label">慢病</span><span class="erx__value" style="font-weight:700">${esc(pet.chronic)}</span></div>` : ''}
        ${meds.length
          ? meds.map((m) => `<div class="erx__row erx__row--stack">
              <span class="erx__value" style="font-weight:650">💊 ${esc(m.name)}${m.dose ? ` · ${esc(m.dose)}${esc(m.unit || '')}` : ''}</span>
              <span class="erx__label">${esc(m.frequency || '按兽医处方')}${m.endDate ? ` · 至 ${esc(fmtDate(m.endDate, false))}` : ''}${m.reason ? ` · ${esc(m.reason)}` : ''}</span>
            </div>`).join('')
          : `<div class="erx__empty">当前用药：未记录</div>`}
      </div>

      <div class="erx__sec">
        <div class="erx__sec-title">🌡️ 最近 24 小时</div>
        ${symptoms.length
          ? symptoms.map((s) => `<div class="erx__row erx__row--stack">
              <span class="erx__value" style="font-weight:650">${esc(fmtShortTime(s.at))}</span>
              <span class="erx__label">${esc(symptomSummary(s))}</span>
            </div>`).join('')
          : `<div class="erx__empty">无近期症状记录</div>`}
      </div>

      <div class="erx__sec">
        <div class="erx__sec-title">💉 疫苗史</div>
        ${vaccines.length
          ? vaccines.map((v) => `<div class="erx__row erx__row--stack">
              <span class="erx__value" style="font-weight:650">${esc(v.name || '疫苗')}</span>
              <span class="erx__label">${esc(fmtDate(v.date))} · ${esc(v.hospital || '—')}${v.nextDate ? ` · 下次 ${esc(fmtDate(v.nextDate, false))}` : ''}</span>
            </div>`).join('')
          : `<div class="erx__empty">无接种记录</div>`}
      </div>

      <div class="erx__sec">
        <div class="erx__sec-title">🐛 驱虫史</div>
        ${deworms.length
          ? deworms.map((d) => `<div class="erx__row erx__row--stack">
              <span class="erx__value" style="font-weight:650">${esc(d.kind)}驱虫 · ${esc(d.product || '—')}</span>
              <span class="erx__label">${esc(fmtDate(d.date))}${d.nextDate ? ` · 下次 ${esc(fmtDate(d.nextDate, false))}` : ''}</span>
            </div>`).join('')
          : `<div class="erx__empty">无驱虫记录</div>`}
      </div>

      <div class="erx__sec">
        <div class="erx__sec-title">🏥 既往病史</div>
        ${vets.length
          ? vets.map((v) => `<div class="erx__row erx__row--stack">
              <span class="erx__value" style="font-weight:650">${esc(v.diagnosis || '就诊')}${v.cost ? ` · ¥${esc(num(v.cost))}` : ''}</span>
              <span class="erx__label">${esc(fmtDate(v.date))} · ${esc(v.hospital || '—')}${v.symptom ? ` · ${esc(v.symptom)}` : ''}${v.followUp ? ` · 复诊 ${esc(fmtDate(v.followUp, false))}` : ''}</span>
            </div>`).join('')
          : `<div class="erx__empty">无就诊记录</div>`}
      </div>

      <div class="erx__sec">
        <div class="erx__sec-title">📞 常去医院 / 联系人</div>
        <div class="erx__value" style="font-weight:650">${esc(pet.hospital || '未填写')}</div>
        ${pet.hospitalPhone ? `<div class="erx__label" style="margin-top:3px">电话：${esc(pet.hospitalPhone)}</div>` : ''}
        ${pet.emergencyContact ? `<div class="erx__label" style="margin-top:3px">紧急联系人：${esc(pet.emergencyContact)}</div>` : ''}
      </div>

      ${policies.length ? `
      <div class="erx__sec erx__sec--policy">
        <div class="erx__sec-title">🛡️ 保单</div>
        ${policies.map((p) => `<div class="erx__row erx__row--stack">
          <span class="erx__value" style="font-weight:650">${esc(p.company)} · ${esc(p.policyNo || '—')}</span>
          <span class="erx__label">${p.start ? `${esc(fmtDate(p.start, false))} – ` : ''}${p.end ? esc(fmtDate(p.end, false)) : '—'}${p.claimPhone ? ` · 理赔 ${esc(p.claimPhone)}` : ''}</span>
        </div>`).join('')}
      </div>` : ''}

      <div class="erx__sec erx__questions">
        <div class="erx__sec-title">💬 可以问医生</div>
        <ol class="erx__questions-list">
          ${questionsFor(pet).map((q) => `<li>${esc(q)}</li>`).join('')}
        </ol>
      </div>

      <div class="erx__foot">
        本页由主人自行记录，仅供医生参考，不构成兽医诊断。最后更新 ${esc(relDate(
          [latestW?.date, vaccines[0]?.date, deworms[0]?.date, vets[0]?.date].filter(Boolean).sort().pop() || todayISO()
        ))}。
      </div>
    </div>`;
}

/* ---------- 纯文本 ---------- */
export function emergencyText(pet) {
  const recs = store.recordsOf(pet.id);
  const g = (t) => recs.filter((r) => r.type === t);
  const meds = activeMedications(pet);
  const symptoms = recentSymptoms(pet).slice(0, 3);
  const policies = policiesOf(pet);
  const allergy = allergyStatus(pet.allergies);
  const L = [];
  L.push(`【${pet.name} · 就医摘要】`);
  L.push(`更新时间：${updatedText(pet)}`);
  L.push(`品种：${pet.species || ''}${pet.breed ? ` · ${pet.breed}` : ''}　性别：${pet.gender || '—'}${pet.neutered ? '（已绝育）' : '（未绝育）'}`);
  L.push(`年龄：${store.ageText(pet.birthday)}${pet.birthday ? `（${fmtDate(pet.birthday)} 出生）` : ''}`);
  const w = g('weight')[0];
  if (w) L.push(`最近体重：${num(w.value)} kg（${fmtDate(w.date)}）`);
  if (pet.chipNo) L.push(`芯片号：${pet.chipNo}`);
  if (pet.registrationNo) L.push(`登记证号：${pet.registrationNo}`);
  L.push(`过敏史：${allergy.unknown ? '未知（请询问主人）' : allergy.text}`);
  if (pet.chronic) L.push(`慢病：${pet.chronic}`);
  L.push(`当前用药：${meds.length ? meds.map((m) => `${m.name}${m.dose ? ` ${m.dose}${m.unit || ''}` : ''}${m.frequency ? `（${m.frequency}）` : ''}`).join('；') : '未记录'}`);
  L.push(`最近 24 小时：${symptoms.length ? symptoms.map((s) => `${fmtShortTime(s.at)} ${symptomSummary(s)}`).join('；') : '无记录'}`);
  const v = g('vaccine');
  L.push(`疫苗史：${v.length ? v.slice(0, 3).map((x) => `${x.name || '疫苗'}（${fmtDate(x.date, false)}${x.nextDate ? `，下次 ${fmtDate(x.nextDate, false)}` : ''}）`).join('；') : '无记录'}`);
  const d = g('deworm');
  L.push(`驱虫史：${d.length ? d.slice(0, 4).map((x) => `${x.kind}（${fmtDate(x.date, false)}${x.nextDate ? `，下次 ${fmtDate(x.nextDate, false)}` : ''}）`).join('；') : '无记录'}`);
  const vt = g('vet');
  L.push(`既往病史：${vt.length ? vt.slice(0, 4).map((x) => `${x.diagnosis || '就诊'}（${fmtDate(x.date, false)}${x.cost ? `，¥${num(x.cost)}` : ''}）`).join('；') : '无'}`);
  if (pet.hospital || pet.hospitalPhone) {
    L.push(`常去医院：${pet.hospital || '未填写'}${pet.hospitalPhone ? `（${pet.hospitalPhone}）` : ''}`);
  }
  if (pet.emergencyContact) L.push(`紧急联系人：${pet.emergencyContact}`);
  if (policies.length) L.push(`保单：${policies.map((p) => `${p.company} ${p.policyNo || ''}`).join('；')}`);
  L.push('可以问医生：');
  questionsFor(pet).forEach((q, i) => L.push(`${i + 1}. ${q}`));
  L.push('— 由爪迹 PawLog 生成，仅供医生参考，不构成兽医诊断');
  return L.join('\n');
}

/* ---------- 全屏就医模式 ---------- */
function ensureHost() {
  let host = document.getElementById('erx-root');
  if (!host) {
    host = document.createElement('div');
    host.id = 'erx-root';
    document.body.appendChild(host);
  }
  return host;
}

let activeClose = null;

export function closeEmergencyMode() {
  if (activeClose) activeClose();
}

export function openEmergencyMode(pet) {
  if (pet?.deceased) {
    toast(`${pet.name || '它'} 已进入纪念模式，不再显示就医卡`, '🕯️');
    return;
  }
  closeModal();
  closeEmergencyMode();
  const host = ensureHost();
  const previousFocus = document.activeElement;
  const updated = updatedText(pet);

  host.innerHTML = `
    <div class="erx-screen" role="dialog" aria-modal="true" aria-label="${esc(pet.name)} 的就医信息" tabindex="-1">
      <div class="erx-screen__bar no-print">
        <div class="grow">
          <div class="erx-screen__title">🚨 ${esc(pet.name)} · 就医信息</div>
          <div class="xs muted">数据更新于 ${esc(updated)}</div>
        </div>
        <button class="btn btn--ghost btn--sm" id="erx-redflags" type="button">急诊红旗</button>
        <button class="btn btn--soft btn--sm" id="erx-print" type="button">打印 / PDF</button>
        <button class="btn btn--soft btn--sm" id="erx-share" type="button">分享</button>
        <button class="btn btn--primary btn--sm" id="erx-copy" type="button">复制文本</button>
        <button class="btn btn--ghost btn--icon" id="erx-close" type="button" aria-label="关闭">✕</button>
      </div>
      <div class="erx-screen__body">
        ${emergencyCard(pet)}
        <div class="erx__disclaimer">由主人记录生成，仅供参考，不构成兽医诊断。紧急情况请立即就医。</div>
      </div>
    </div>`;

  document.body.classList.add('erx-open');
  document.body.style.overflow = 'hidden';

  const close = () => {
    host.innerHTML = '';
    document.body.classList.remove('erx-open');
    document.body.style.overflow = '';
    document.removeEventListener('keydown', onKey);
    activeClose = null;
    if (previousFocus && typeof previousFocus.focus === 'function') previousFocus.focus();
  };
  activeClose = close;
  const onKey = (e) => {
    // 红旗弹窗在上层时，让弹窗自己处理 Esc，避免把整张就医卡一起关掉
    if (e.key === 'Escape' && !document.querySelector('#modal-root .modal')) close();
  };

  host.querySelector('#erx-close')?.addEventListener('click', close);
  host.querySelector('#erx-print')?.addEventListener('click', () => window.print());
  host.querySelector('#erx-copy')?.addEventListener('click', () => copyText(emergencyText(pet), '已复制，可直接发给医生'));
  host.querySelector('#erx-share')?.addEventListener('click', () => {
    shareText({ title: `${pet.name} 的就医信息 · 爪迹 PawLog`, text: emergencyText(pet) });
  });
  host.querySelector('#erx-redflags')?.addEventListener('click', () => openRedFlags(pet));
  document.addEventListener('keydown', onKey);
  host.querySelector('#erx-close')?.focus();
}
