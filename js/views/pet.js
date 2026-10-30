/* ============================================================
   宠物档案页 — 基本信息 / 就医关键信息 / 就医模式
   ============================================================ */
import * as store from '../store.js';
import { openEmergencyMode } from './emergency.js';
import { openRedFlags } from '../red-flags.js';
import { seniorSection, mountSenior, markDeceased, memorialBanner, openMemorialCard } from './senior.js';
import { travelSection, mountTravel } from './travel.js';
import { lostBanner, mountLost, openLostForm } from './lost.js';
import { exportICS } from '../ics.js';
export { emergencyCard, emergencyText, openEmergencyMode, closeEmergencyMode } from './emergency.js';
import { esc, fmtDate, todayISO, toast, openModal, field, selectHTML, num, allergyStatus } from '../ui.js';

/* ---------- 编辑档案 ---------- */
export function openEditPet(pet, after) {
  openModal({
    title: '编辑宠物档案',
    body:
      field('名字', `<input name="name" value="${esc(pet.name)}" required maxlength="12">`) +
      field('头像 emoji', `<input name="emoji" value="${esc(pet.emoji)}" maxlength="4">`) +
      field('种类', selectHTML('species', [['猫', '猫'], ['狗', '狗'], ['其他', '其他']], pet.species)) +
      field('品种', `<input name="breed" value="${esc(pet.breed)}" required maxlength="24">`) +
      field('性别', selectHTML('gender', [['公', '公'], ['母', '母']], pet.gender)) +
      `<label class="row" style="gap:8px;align-items:center;cursor:pointer">
         <input type="checkbox" name="neutered" style="width:auto" ${pet.neutered ? 'checked' : ''}>
         <span class="small strong">已绝育</span></label>` +
      field('绝育日期', `<input type="date" name="neuteredDate" value="${esc(pet.neuteredDate || '')}">`) +
      field('出生日期', `<input type="date" name="birthday" value="${esc(pet.birthday)}" required>`) +
      field('体重目标 (kg)', `<input type="number" step="0.1" min="0" name="weightGoal" value="${pet.weightGoal ?? ''}" placeholder="达到这个体重就不用再减了">`) +
      field('过敏史', `<textarea name="allergies" maxlength="120" placeholder="比如：青霉素类 — 注射后出现面部肿胀">${esc(pet.allergies || '')}</textarea>`, '⚠️ 这条会在就医摘要卡里红色高亮，医生第一时间能看到') +
      field('慢病 / 长期问题', `<textarea name="chronic" maxlength="120" placeholder="比如：慢性肾病早期">${esc(pet.chronic || '')}</textarea>`, '选填，会出现在就医摘要里') +
      field('芯片号', `<input name="chipNo" value="${esc(pet.chipNo || '')}" maxlength="24">`) +
      field('登记证号', `<input name="registrationNo" value="${esc(pet.registrationNo || '')}" maxlength="30">`, '比如电子犬证 / 登记编号') +
      field('常去医院', `<input name="hospital" value="${esc(pet.hospital || '')}" maxlength="32">`) +
      field('医院电话', `<input name="hospitalPhone" value="${esc(pet.hospitalPhone || '')}" maxlength="24" placeholder="选填，急诊时可直接拨打">`) +
      field('紧急联系人', `<input name="emergencyContact" value="${esc(pet.emergencyContact || '')}" maxlength="40" placeholder="选填，比如家人的电话">`) +
      field('喂食', `<textarea name="feeding" maxlength="160" placeholder="比如：早晚各 30g 湿粮">${esc(pet.feeding || '')}</textarea>`, '寄养交接卡会用到') +
      field('习惯', `<textarea name="habits" maxlength="160" placeholder="比如：怕生、喜欢纸箱">${esc(pet.habits || '')}</textarea>`) +
      field('禁忌', `<textarea name="noGos" maxlength="160" placeholder="比如：不要喂人食、不要用香水">${esc(pet.noGos || '')}</textarea>`) +
      field('离开日期', `<input type="date" name="passedDate" value="${esc(pet.passedDate || '')}">`, '仅在标记为已离开时填写') +
      `<label class="row" style="gap:8px;align-items:center;cursor:pointer;margin-bottom:14px">
         <input type="checkbox" name="deceased" style="width:auto" ${pet.deceased ? 'checked' : ''}>
         <span class="small strong">已离开（纪念模式：停止健康提醒）</span>
       </label>` +
      field('一句话介绍', `<textarea name="bio" maxlength="80">${esc(pet.bio || '')}</textarea>`),
    onSubmit(d) {
      if (!d.name || !d.breed) { toast('名字和品种是必填的', '⚠️'); return false; }
      store.updatePet(pet.id, {
        name: d.name, emoji: d.emoji || '🐾', species: d.species, breed: d.breed, gender: d.gender,
        neutered: d.neutered === 'on', neuteredDate: d.neuteredDate,
        birthday: d.birthday, weightGoal: d.weightGoal ? Number(d.weightGoal) : null,
        allergies: d.allergies, chronic: d.chronic, chipNo: d.chipNo,
        registrationNo: d.registrationNo,
        hospital: d.hospital, hospitalPhone: d.hospitalPhone,
        emergencyContact: d.emergencyContact, bio: d.bio,
        feeding: d.feeding, habits: d.habits, noGos: d.noGos,
        deceased: d.deceased === 'on',
        passedDate: d.deceased === 'on' ? (d.passedDate || '') : '',
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
  const allergyInfo = allergyStatus(pet.allergies);
  const allergy = allergyInfo.text;
  const hasAllergy = allergyInfo.has;
  const after = () => petPage(el, params);

  const infoRow = (label, value, hl) => `
    <div class="list__item">
      <div class="grow"><div class="list__sub">${esc(label)}</div>
        <div class="list__title"${hl ? ' style="color:var(--c-rose)"' : ''}>${esc(value || '—')}</div></div>
    </div>`;

  el.innerHTML = `
    <div class="row" style="margin-bottom:var(--sp-4)">
      <a class="btn btn--ghost btn--sm" href="#/dashboard">← 返回</a>
    </div>

    ${memorialBanner(pet)}
    ${lostBanner(pet)}

    <div class="section">${(() => {
      const days = store.togetherDays(pet);
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
            <div class="pet-hero__meta">${esc(store.ageText(pet.birthday))} · 陪伴你 ${days == null ? '—' : days} 天</div>
          </div>
        </div>
        ${pet.bio ? `<p class="pet-hero__bio">${esc(pet.bio)}</p>` : ''}
        <div class="pet-hero__stats">
          <div><div class="stat__label">当前体重</div>
            <div class="stat__value">${latest ? esc(num(latest.value)) : '—'}<small>kg</small></div></div>
          <div><div class="stat__label">体重目标</div>
            <div class="stat__value">${goal == null ? '—' : esc(num(goal))}<small>${goal == null ? '' : 'kg'}</small></div></div>
          <div><div class="stat__label">健康记录</div>
            <div class="stat__value">${recs.length}<small>条</small></div></div>
          <div><div class="stat__label">成长瞬间</div>
            <div class="stat__value">${tl.filter((t) => !t.auto).length}<small>个</small></div></div>
        </div>
        <div class="row row--wrap" style="gap:8px;margin-top:var(--sp-5);position:relative">
          ${pet.deceased ? `
            <button class="btn btn--primary" id="memorial-card" type="button">🕯️ 纪念卡</button>
          ` : `
            <button class="btn btn--primary" id="erx">🚨 就医模式</button>
            <button class="btn btn--ghost" id="redflags">🩺 急诊自查</button>
          `}
          <button class="btn btn--ghost" id="edit">编辑档案</button>
          <a class="btn btn--ghost" href="#/health">健康档案</a>
          <a class="btn btn--ghost" href="#/timeline">成长时光</a>
        </div>
      </div>`;
    })()}</div>

    ${hasAllergy && !pet.deceased ? `
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
      <div class="section__head">
        <h2>待办提醒</h2>
        <button class="btn btn--ghost btn--sm" data-ics type="button">📅 加入日历</button>
      </div>
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

    ${seniorSection(pet, after)}
    ${travelSection(pet)}

    <div class="section">
      <div class="section__head"><h2>档案信息</h2></div>
      <div class="card card--flush"><div class="list">
        ${infoRow('出生日期', `${fmtDate(pet.birthday)}（${store.ageText(pet.birthday)}）`)}
        ${infoRow('绝育', pet.neutered ? `已绝育${pet.neuteredDate ? ` · ${fmtDate(pet.neuteredDate)}` : ''}` : '未绝育')}
        ${infoRow('过敏史', allergy || '未填写', hasAllergy)}
        ${infoRow('慢病 / 长期问题', pet.chronic)}
        ${infoRow('芯片号', pet.chipNo)}
        ${infoRow('登记证号', pet.registrationNo)}
        ${infoRow('常去医院', pet.hospital)}
        ${infoRow('医院电话', pet.hospitalPhone)}
        ${infoRow('紧急联系人', pet.emergencyContact)}
      </div></div>
    </div>

    <div class="section">
      <div class="section__head"><h2>档案管理</h2></div>
      <div class="card card--pad">
        <div class="row row--between row--wrap" style="gap:10px">
          <div>
            <div class="strong small">${pet.deceased ? '纪念模式' : '标记为已离开'}</div>
            <div class="xs muted" style="margin-top:3px">
              ${pet.deceased
                ? `${pet.passedDate ? `离开于 ${esc(fmtDate(pet.passedDate))} · ` : ''}健康提醒已停止，记录与成长时光仍保留。`
                : '停止健康提醒，保留全部记录与成长时光；可随时在编辑档案里取消。'}
            </div>
          </div>
          ${pet.deceased
            ? '<button class="btn btn--ghost" data-memorial type="button">🕯️ 纪念卡</button>'
            : `<button class="btn btn--ghost" id="lost-mode" type="button">🚨 走失模式</button>
               <button class="btn btn--ghost" id="mark-deceased" type="button">🕯️ 标记为已离开</button>`}
        </div>

        <div class="row row--between row--wrap" style="gap:10px;margin-top:14px;padding-top:14px;border-top:1px solid var(--c-line-soft)">
          <div>
            <div class="strong small">删除这只宠物的档案</div>
            <div class="xs muted" style="margin-top:3px">会同时删除它的健康记录与成长瞬间。此操作不可撤销，建议先在「我的」导出备份。</div>
          </div>
          <button class="btn btn--danger" id="delete-pet">删除档案</button>
        </div>
      </div>
    </div>
  `;

  el.querySelector('#erx')?.addEventListener('click', () => openEmergencyMode(pet));
  el.querySelector('#redflags')?.addEventListener('click', () => openRedFlags(pet));
  mountSenior(el, pet, after);
  mountTravel(el, pet);
  mountLost(el, pet, after);
  el.querySelector('[data-ics]')?.addEventListener('click', () => exportICS(pet));
  el.querySelector('#lost-mode')?.addEventListener('click', () => openLostForm(pet, after));
  el.querySelector('#mark-deceased')?.addEventListener('click', () => markDeceased(pet, after));
  el.querySelectorAll('#memorial-card, [data-memorial]').forEach((b) =>
    b.addEventListener('click', () => openMemorialCard(pet)));

  el.querySelector('#edit').addEventListener('click', () => openEditPet(pet, after));

  el.querySelector('#delete-pet').addEventListener('click', () => {
    openModal({
      title: '删除宠物档案？',
      submit: '确认删除',
      body: `<p class="small" style="color:var(--c-ink-2);line-height:1.8">
        这会删除 <b>${esc(pet.name)}</b> 的全部健康记录与成长瞬间，且不可撤销。
        如果只是想暂时不显示，建议先导出备份。</p>
        ${field('输入名字确认', `<input name="confirm" required placeholder="${esc(pet.name)}">`)}`,
      onSubmit(d) {
        if (d.confirm.trim() !== pet.name) { toast('名字不一致，已取消', '⚠️'); return false; }
        const res = store.deletePet(pet.id);
        if (!res?.ok) {
          toast(res?.reason === 'last-pet' ? '至少保留一只宠物；如要清空请使用「重置演示数据」' : '删除失败', '⚠️');
          return false;
        }
        toast('档案已删除', '🗑️');
        location.hash = '#/dashboard';
      },
    });
  });

  el.querySelectorAll('[data-done]').forEach((b) =>
    b.addEventListener('click', () => {
      const r = reminders.find((x) => x.id === b.dataset.done);
      if (!r) return;
      const res = store.completeReminder(pet.id, r, todayISO());
      if (res.duplicate) {
        toast('本周期已打卡，无需重复记录', '⏳');
        return;
      }
      toast(`${r.title} 已记录，下次 ${fmtDate(res.record?.nextDate, false)}`);
      after();
    }));
}

export default petPage;
