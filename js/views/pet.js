/* ============================================================
   宠物档案页 — 基本信息 / 就医关键信息 / 就医模式
   ============================================================ */
import * as store from '../store.js';
import { esc, fmtDate, relDate, todayISO, toast, openModal, field, selectHTML } from '../ui.js';

/* ---------- 就医模式：一屏给医生看完所有关键信息 ---------- */
export function emergencyCard(pet) {
  const recs = store.recordsOf(pet.id);
  const vaccines = recs.filter((r) => r.type === 'vaccine');
  const deworms = recs.filter((r) => r.type === 'deworm');
  const vets = recs.filter((r) => r.type === 'vet');
  const weights = recs.filter((r) => r.type === 'weight');
  const latestW = weights[0];

  const allergy = (pet.allergies || '').trim();
  const hasAllergy = allergy && !/^(无|没有|暂无|无已知)/.test(allergy);

  const row = (label, value, hl) => `
    <div class="erx__row">
      <span class="erx__label">${esc(label)}</span>
      <span class="erx__value"${hl ? ' style="color:var(--c-rose);font-weight:750"' : ''}>${esc(value || '—')}</span>
    </div>`;

  return `
    <div class="erx">
      <div class="erx__head">
        <div class="erx__title">🐾 就医摘要</div>
        <div class="erx__sub">爪迹 PawLog · 生成于 ${esc(fmtDate(todayISO()))}</div>
      </div>

      <div class="erx__sec">
        <div class="erx__sec-title">基本信息</div>
        ${row('名字', pet.name)}
        ${row('品种', pet.breed)}
        ${row('性别', `${pet.gender}${pet.neutered ? '（已绝育）' : '（未绝育）'}`)}
        ${row('年龄', `${store.ageText(pet.birthday)}（${fmtDate(pet.birthday)} 出生）`)}
        ${row('当前体重', latestW ? `${latestW.value} kg（${fmtDate(latestW.date)}）` : '无记录')}
        ${row('芯片号', pet.chipNo)}
      </div>

      <div class="erx__sec erx__sec--alert">
        <div class="erx__sec-title">⚠️ 过敏史</div>
        <div class="erx__allergy">${esc(hasAllergy ? allergy : '无已知过敏')}</div>
      </div>

      <div class="erx__sec">
        <div class="erx__sec-title">💉 疫苗史</div>
        ${vaccines.length
          ? vaccines.map((v) => `
            <div class="erx__row erx__row--stack">
              <span class="erx__value" style="font-weight:650">${esc(v.name)}</span>
              <span class="erx__label">${esc(fmtDate(v.date))} · ${esc(v.hospital || '—')}</span>
            </div>`).join('')
          : `<div class="erx__empty">无接种记录</div>`}
      </div>

      <div class="erx__sec">
        <div class="erx__sec-title">🐛 驱虫史</div>
        ${deworms.length
          ? deworms.slice(0, 4).map((d) => `
            <div class="erx__row erx__row--stack">
              <span class="erx__value" style="font-weight:650">${esc(d.kind)}驱虫 · ${esc(d.product || '—')}</span>
              <span class="erx__label">${esc(fmtDate(d.date))}</span>
            </div>`).join('')
          : `<div class="erx__empty">无驱虫记录</div>`}
      </div>

      <div class="erx__sec">
        <div class="erx__sec-title">🏥 既往病史</div>
        ${vets.length
          ? vets.map((v) => `
            <div class="erx__row erx__row--stack">
              <span class="erx__value" style="font-weight:650">${esc(v.diagnosis)}</span>
              <span class="erx__label">${esc(fmtDate(v.date))} · ${esc(v.symptom)}</span>
            </div>`).join('')
          : `<div class="erx__empty">无就诊记录</div>`}
      </div>

      <div class="erx__sec">
        <div class="erx__sec-title">📞 常去医院</div>
        <div class="erx__value" style="font-weight:650">${esc(pet.hospital || '未填写')}</div>
      </div>

      <div class="erx__foot">
        本页数据由主人自行记录，仅供医生参考；最后更新 ${esc(relDate(
          [latestW?.date, vaccines[0]?.date, deworms[0]?.date].filter(Boolean).sort().pop() || todayISO()
        ))}
      </div>
    </div>`;
}

/** 把就医卡转成纯文本，方便发给医生或存进备忘录 */
export function emergencyText(pet) {
  const recs = store.recordsOf(pet.id);
  const g = (t) => recs.filter((r) => r.type === t);
  const L = [];
  L.push(`【${pet.name} · 就医摘要】`);
  L.push(`品种：${pet.breed}　性别：${pet.gender}${pet.neutered ? '（已绝育）' : '（未绝育）'}`);
  L.push(`年龄：${store.ageText(pet.birthday)}（${fmtDate(pet.birthday)} 出生）`);
  const w = g('weight')[0];
  if (w) L.push(`最近体重：${w.value} kg（${fmtDate(w.date)}）`);
  if (pet.chipNo) L.push(`芯片号：${pet.chipNo}`);
  L.push(`过敏史：${pet.allergies || '未知（请询问主人）'}`);
  const v = g('vaccine');
  L.push(`疫苗史：${v.length ? v.map((x) => `${x.name}（${fmtDate(x.date, false)}）`).join('；') : '无记录'}`);
  const d = g('deworm');
  L.push(`驱虫史：${d.length ? d.slice(0, 3).map((x) => `${x.kind}（${fmtDate(x.date, false)}）`).join('；') : '无记录'}`);
  const vt = g('vet');
  L.push(`既往病史：${vt.length ? vt.map((x) => `${x.diagnosis}（${fmtDate(x.date, false)}）`).join('；') : '无'}`);
  if (pet.hospital) L.push(`常去医院：${pet.hospital}`);
  L.push('— 由爪迹 PawLog 生成，仅供医生参考');
  return L.join('\n');
}

/* ---------- 编辑档案 ---------- */
export function openEditPet(pet, after) {
  openModal({
    title: '编辑宠物档案',
    body:
      field('名字', `<input name="name" value="${esc(pet.name)}" required maxlength="12">`) +
      field('头像 emoji', `<input name="emoji" value="${esc(pet.emoji)}" maxlength="4">`) +
      field('品种', `<input name="breed" value="${esc(pet.breed)}" required maxlength="24">`) +
      field('性别', selectHTML('gender', [['公', '公'], ['母', '母']], pet.gender)) +
      `<label class="row" style="gap:8px;align-items:center;cursor:pointer">
         <input type="checkbox" name="neutered" style="width:auto" ${pet.neutered ? 'checked' : ''}>
         <span class="small strong">已绝育</span></label>` +
      field('绝育日期', `<input type="date" name="neuteredDate" value="${esc(pet.neuteredDate || '')}">`) +
      field('出生日期', `<input type="date" name="birthday" value="${esc(pet.birthday)}" required>`) +
      field('体重目标 (kg)', `<input type="number" step="0.1" min="0" name="weightGoal" value="${pet.weightGoal ?? ''}" placeholder="达到这个体重就不用再减了">`) +
      field('过敏史', `<textarea name="allergies" maxlength="120" placeholder="比如：青霉素类 — 注射后出现面部肿胀">`, '⚠️ 这条会在就医摘要卡里红色高亮，医生第一时间能看到') +
      field('芯片号', `<input name="chipNo" value="${esc(pet.chipNo || '')}" maxlength="24">`) +
      field('常去医院', `<input name="hospital" value="${esc(pet.hospital || '')}" maxlength="32">`) +
      field('一句话介绍', `<textarea name="bio" maxlength="80">${esc(pet.bio || '')}</textarea>`),
    onSubmit(d) {
      if (!d.name || !d.breed) { toast('名字和品种是必填的', '⚠️'); return false; }
      store.updatePet(pet.id, {
        name: d.name, emoji: d.emoji || '🐾', breed: d.breed, gender: d.gender,
        neutered: d.neutered === 'on', neuteredDate: d.neuteredDate,
        birthday: d.birthday, weightGoal: d.weightGoal ? Number(d.weightGoal) : null,
        allergies: d.allergies, chipNo: d.chipNo, hospital: d.hospital, bio: d.bio,
      });
      toast('档案已更新');
      if (after) after();
    },
  });
}

/* ---------- 页面 ---------- */
function petPage(el, params) {
  const pet = store.petById(params.id) || store.activePet();
  if (!pet) { location.hash = '#/dashboard'; return; }

  const recs = store.recordsOf(pet.id);
  const tl = store.timelineOf(pet.id);
  const reminders = store.reminders(pet.id);
  const weights = recs.filter((r) => r.type === 'weight');
  const latest = weights[0];
  const goal = pet.weightGoal;
  const allergy = (pet.allergies || '').trim();
  const hasAllergy = allergy && !/^(无|没有|暂无|无已知)/.test(allergy);

  const infoRow = (label, value, hl) => `
    <div class="list__item">
      <div class="grow"><div class="list__sub">${esc(label)}</div>
        <div class="list__title"${hl ? ' style="color:var(--c-rose)"' : ''}>${esc(value || '—')}</div></div>
    </div>`;

  el.innerHTML = `
    <div class="row" style="margin-bottom:var(--sp-4)">
      <a class="btn btn--ghost btn--sm" href="#/dashboard">← 返回</a>
    </div>

    <div class="section">${(() => {
      const days = Math.floor((Date.now() - new Date(pet.birthday).getTime()) / 86400000);
      return `
      <div class="pet-hero">
        <div class="pet-hero__main">
          <div class="petavatar avatar--xl avatar--ring" style="background:#fff">${esc(pet.emoji)}</div>
          <div class="grow">
            <div class="row" style="gap:8px;flex-wrap:wrap">
              <span class="pet-hero__name">${esc(pet.name)}</span>
              <span class="tag tag--${esc(pet.color || 'brand')}">${esc(pet.species)}</span>
            </div>
            <div class="pet-hero__meta">${esc(pet.breed)} · ${esc(pet.gender)} · ${esc(pet.neutered ? '已绝育' : '未绝育')}</div>
            <div class="pet-hero__meta">${esc(store.ageText(pet.birthday))} · 陪伴你 ${days} 天</div>
          </div>
        </div>
        ${pet.bio ? `<p class="pet-hero__bio">${esc(pet.bio)}</p>` : ''}
        <div class="pet-hero__stats">
          <div><div class="stat__label">当前体重</div>
            <div class="stat__value">${latest ? latest.value : '—'}<small>kg</small></div></div>
          <div><div class="stat__label">体重目标</div>
            <div class="stat__value">${goal ?? '—'}<small>${goal ? 'kg' : ''}</small></div></div>
          <div><div class="stat__label">健康记录</div>
            <div class="stat__value">${recs.length}<small>条</small></div></div>
          <div><div class="stat__label">成长瞬间</div>
            <div class="stat__value">${tl.length}<small>个</small></div></div>
        </div>
        <div class="row row--wrap" style="gap:8px;margin-top:var(--sp-5);position:relative">
          <button class="btn btn--primary" id="erx">🚨 就医模式</button>
          <button class="btn btn--ghost" id="edit">编辑档案</button>
          <a class="btn btn--ghost" href="#/health">健康档案</a>
          <a class="btn btn--ghost" href="#/timeline">成长时光</a>
        </div>
      </div>`;
    })()}</div>

    ${hasAllergy ? `
    <div class="section">
      <div class="reminder reminder--due">
        <span class="reminder__ico">⚠️</span>
        <div class="grow">
          <div class="reminder__title">过敏史</div>
          <div class="reminder__sub">${esc(allergy)}</div>
        </div>
      </div>
    </div>` : ''}

    ${reminders.length ? `
    <div class="section">
      <div class="section__head"><h2>待办提醒</h2></div>
      <div class="stack">${reminders.map((r) => `
        <div class="reminder reminder--${r.level}">
          <span class="reminder__ico">${esc(r.ico)}</span>
          <div class="grow">
            <div class="reminder__title">${esc(r.title)}</div>
            <div class="reminder__sub">下次 ${esc(fmtDate(r.date, false))}</div>
          </div>
          <button class="btn btn--soft btn--sm" data-done="${esc(r.id)}">今天做了 ✓</button>
        </div>`).join('')}</div>
    </div>` : ''}

    <div class="section">
      <div class="section__head"><h2>档案信息</h2></div>
      <div class="card card--flush"><div class="list">
        ${infoRow('出生日期', `${fmtDate(pet.birthday)}（${store.ageText(pet.birthday)}）`)}
        ${infoRow('绝育', pet.neutered ? `已绝育${pet.neuteredDate ? ` · ${fmtDate(pet.neuteredDate)}` : ''}` : '未绝育')}
        ${infoRow('过敏史', allergy || '未填写', hasAllergy)}
        ${infoRow('芯片号', pet.chipNo)}
        ${infoRow('常去医院', pet.hospital)}
      </div></div>
    </div>
  `;

  el.querySelector('#erx').addEventListener('click', () => {
    openModal({
      title: '就医模式',
      footer: `<button class="btn btn--ghost" data-close>关闭</button>
               <button class="btn btn--primary" id="erx-copy">复制为文本</button>`,
      body: emergencyCard(pet),
    });
    document.getElementById('erx-copy').addEventListener('click', () => {
      const text = emergencyText(pet);
      navigator.clipboard?.writeText(text).then(
        () => toast('已复制，可直接发给医生'),
        () => {
          // 剪贴板不可用（非 HTTPS / 无权限）时退化为让用户手动选择
          const ta = document.createElement('textarea');
          ta.value = text; document.body.appendChild(ta); ta.select();
          try { document.execCommand('copy'); toast('已复制'); }
          catch { toast('复制失败，请长按选择文本', '⚠️'); }
          ta.remove();
        },
      );
    });
  });

  el.querySelector('#edit').addEventListener('click', () => openEditPet(pet, () => petPage(el, params)));

  el.querySelectorAll('[data-done]').forEach((b) =>
    b.addEventListener('click', () => {
      const r = reminders.find((x) => x.id === b.dataset.done);
      if (!r) return;
      store.completeReminder(pet.id, r, todayISO());
      toast(`${r.title} 已记录，下次 ${fmtDate(store.suggestNext(r.type, r.kind, todayISO()), false)}`);
      petPage(el, params);
    }));
}

export default petPage;
