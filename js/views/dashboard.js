/* ============================================================
   首页 — 今日待办 / 宠物概览 / 健康速览 / 最近瞬间 / 附近宠友
   ============================================================ */
import * as store from '../store.js';
import * as router from '../router.js';
import { esc, relDate, fmtDate, todayISO, toast, openModal, field, selectHTML, icon } from '../ui.js';
import { openRecordForm } from '../record-forms.js';
import { exportICS } from '../ics.js';
import { memorialBanner } from './senior.js';
import { lostBanner, mountLost } from './lost.js';

function heroHTML(pet, pets) {
  const recs = store.recordsOf(pet.id);
  const weights = recs.filter((r) => r.type === 'weight');
  const first = weights[weights.length - 1];
  const latest = weights[0];
  const gainedNum = first && latest ? Number(latest.value) - Number(first.value) : null;
  const gained = gainedNum == null ? null : `${gainedNum > 0 ? '+' : ''}${gainedNum.toFixed(1)}`;
  const days = store.togetherDays(pet);

  return `
    <div class="pet-hero">
      <div class="pet-hero__main">
        <div class="petavatar avatar--xl avatar--ring" style="background:#fff">${esc(pet.emoji)}</div>
        <div class="grow">
          <div class="row" style="gap:8px">
            <span class="pet-hero__name">${esc(pet.name)}</span>
            <span class="tag tag--${esc(pet.color || 'brand')}">${esc(pet.species)}</span>
          </div>
          <div class="pet-hero__meta">${esc(pet.breed)} · ${esc(pet.gender)} · ${esc(pet.neutered ? '已绝育' : '未绝育')}</div>
          <div class="pet-hero__meta">${esc(store.ageText(pet.birthday))} · 陪伴你 ${days == null ? '—' : days} 天</div>
        </div>
      </div>
      ${pet.bio ? `<p class="pet-hero__bio">${esc(pet.bio)}</p>` : ''}
      <div class="pet-hero__stats">
        <div>
          <div class="stat__label">当前体重</div>
          <div class="stat__value">${latest ? latest.value : '—'}<small>kg</small></div>
        </div>
        <div>
          <div class="stat__label">累计增重</div>
          <div class="stat__value">${gained ?? '—'}<small>kg</small></div>
        </div>
        <div>
          <div class="stat__label">健康记录</div>
          <div class="stat__value">${recs.length}<small>条</small></div>
        </div>
        <div>
          <div class="stat__label">成长瞬间</div>
          <div class="stat__value">${store.timelineOf(pet.id).filter((t) => !t.auto).length}<small>个</small></div>
        </div>
      </div>
      <div class="row" style="gap:8px;margin-top:var(--sp-4);position:relative;flex-wrap:wrap">
        <a class="btn btn--soft btn--sm" href="#/pet/${esc(pet.id)}">查看完整档案</a>
        <a class="btn btn--ghost btn--sm" href="#/health">记一笔健康数据</a>
      </div>
    </div>`;
}

function remindersHTML(petId) {
  const list = store.reminders(petId);
  if (!list.length) {
    return `<div class="empty"><div class="empty__ico">🌿</div>
      <div class="empty__title">暂时没有待办</div>
      <div class="empty__text">疫苗和驱虫记录会自动生成到期提醒</div></div>`;
  }
  return `<div class="stack">${list.map((r) => `
    <div class="reminder reminder--${r.level}">
      <span class="reminder__ico">${esc(r.ico)}</span>
      <div class="grow">
        <div class="reminder__title">${esc(r.title)}</div>
        <div class="reminder__sub">${esc(r.sub || '')} · 下次 ${esc(fmtDate(r.date, false))}</div>
      </div>
      <div class="col" style="align-items:flex-end;gap:6px;flex:none">
        <div class="reminder__when" style="color:${
          r.level === 'due' ? 'var(--c-rose)' : r.level === 'soon' ? 'var(--c-sun)' : 'var(--c-mint)'
        }">${esc(r.text)}</div>
        <button class="btn btn--soft btn--sm" data-done="${esc(r.id)}">今天做了 ✓</button>
      </div>
    </div>`).join('')}</div>`;
}

/* 首页「记一笔」：不用先想清楚去哪一页，点一下就开始 */
const QUICK_ACTIONS = [
  ['weight', '⚖️', '体重', '记录今天的数字'],
  ['vaccine', '💉', '疫苗', '接种后记一笔'],
  ['deworm', '🐛', '驱虫', '体内 / 体外'],
  ['vet', '🏥', '就诊', '症状、诊断与花费'],
  ['symptom', '🌡️', '症状', '呕吐 / 食欲 / 精神'],
  ['medication', '💊', '用药', '今日服药打卡'],
];

function quickRecordHTML() {
  return `<div class="grid grid--4 quick-grid">
    ${QUICK_ACTIONS.map(([type, ico, label, sub]) => `
      <button class="quick-record" data-quick="${esc(type)}" type="button">
        <span class="quick-record__ico" aria-hidden="true">${ico}</span>
        <span class="grow" style="text-align:left">
          <span class="quick-record__label">${esc(label)}</span>
          <span class="quick-record__sub">${esc(sub)}</span>
        </span>
        <span class="quick-record__plus" aria-hidden="true">＋</span>
      </button>`).join('')}
  </div>`;
}

function tilesHTML(petId) {
  const recs = store.recordsOf(petId);
  const latestOf = (t) => recs.find((r) => r.type === t);

  const w = latestOf('weight');
  const v = latestOf('vaccine');
  const d = latestOf('deworm');
  const vt = latestOf('vet');

  const tile = (ico, label, value, unit, foot) => `
    <div class="tile">
      <div class="tile__top"><span class="tile__label">${esc(label)}</span><span class="tile__ico">${esc(ico)}</span></div>
      <div class="tile__value">${esc(value)}${unit ? `<small>${esc(unit)}</small>` : ''}</div>
      <div class="tile__foot">${esc(foot)}</div>
    </div>`;

  return `
    ${tile('⚖️', '最近体重', w ? w.value : '—', 'kg', w ? relDate(w.date) : '还没有记录')}
    ${tile('💉', '最近疫苗', v ? v.name.replace(/（.*?）/, '') : '—', '', v ? relDate(v.date) : '还没有记录')}
    ${tile('🐛', '最近驱虫', d ? d.kind : '—', '', d ? relDate(d.date) : '还没有记录')}
    ${tile('🏥', '最近就诊', vt ? '有记录' : '—', '', vt ? relDate(vt.date) : '身体棒棒的')}`;
}

function nearbyHTML() {
  const st = store.get();
  const me = st.me;
  if (!st.friends.length) {
    return `<div class="empty card card--pad"><div class="empty__ico">📍</div>
      <div class="empty__title">附近暂时没有宠友</div>
      <div class="empty__text">演示内容已清空；可以到「附近与出行」添加地点或生成互助文案</div></div>`;
  }
  const near = [...st.friends]
    .sort((a, b) => (
      Number(b.city === me.city && b.district === me.district)
      - Number(a.city === me.city && a.district === me.district)
    ) || a.name.localeCompare(b.name, 'zh'))
    .slice(0, 4);
  const loc = (f) => f.city === me.city && f.district === me.district ? '同区'
    : f.city === me.city ? '同城' : f.city;
  return `<div class="grid grid--auto">${near.map((f) => `
    <a class="card card--pad" href="#/nearby">
      <div class="friend__head">
        <div class="avatar avatar--lg" style="background:var(--c-bg-warm)">${esc(f.emoji)}</div>
        <div class="grow">
          <div class="row" style="gap:6px;flex-wrap:wrap">
            <span class="friend__name">${esc(f.name)}</span>
            ${f.demo ? '<span class="tag tag--sun">演示</span>' : ''}
          </div>
          <div class="friend__loc">📍 ${esc(f.city)}·${esc(f.district)} · ${esc(loc(f))}</div>
        </div>
      </div>
      <p class="friend__bio" style="display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden">${esc(f.bio)}</p>
      <div class="friend__pets">${(f.pets || []).map((p) => `<span class="tag">${esc(p.species)} · ${esc(p.breed)}</span>`).join('')}</div>
    </a>`).join('')}</div>`;
}

function momentsHTML(petId) {
  const list = store.timelineOf(petId).filter((t) => !t.auto).slice(0, 2);
  if (!list.length) {
    return `<div class="empty"><div class="empty__ico">📸</div>
      <div class="empty__title">还没有成长记录</div>
      <div class="empty__text">记下第一个瞬间吧</div></div>`;
  }
  return `<div class="stack">${list.map((t) => `
    <div class="card card--pad">
      <div class="row row--between" style="align-items:flex-start">
        <div class="grow">
          <div class="row" style="gap:7px;flex-wrap:wrap">
            ${t.milestone ? `<span class="tag tag--sun">🏅 里程碑</span>` : ''}
            <span class="strong">${esc(t.title)}</span>
          </div>
          <div class="xs muted" style="margin-top:3px">${esc(fmtDate(t.date))}</div>
        </div>
        <div style="font-size:26px">${esc((t.photos || [])[0] || '🐾')}</div>
      </div>
      <p class="small" style="color:var(--c-ink-2);margin-top:8px">${esc(t.text)}</p>
    </div>`).join('')}</div>`;
}

export default function dashboard(el) {
  const st = store.get();
  const pet = store.activePet();
  const lost = store.lostOf();
  const lostPet = lost?.active ? store.petById(lost.petId) : null;

  if (!pet) {
    el.innerHTML = `
      <div class="page-head"><h1>欢迎来到爪迹</h1><p>先为家里的小家伙建一份档案吧</p></div>
      <div class="empty card card--pad">
        <div class="empty__ico">🐾</div>
        <div class="empty__title">还没有宠物档案</div>
        <div class="empty__text">添加后就能记录体重、疫苗、驱虫与就诊</div>
        <button class="btn btn--primary" id="add-first" style="margin-top:var(--sp-4)">＋ 添加宠物</button>
      </div>`;
    el.querySelector('#add-first').addEventListener('click', () => openAddPet(() => dashboard(el)));
    return;
  }

  el.innerHTML = `
    <div class="page-head">
      <h1>你好，${esc(st.me.name)} 👋</h1>
      <p>今天也一起照顾好 ${esc(pet.name)} 吧</p>
    </div>

    ${st.pets.length > 1 ? `
    <div class="scroller" style="margin-bottom:var(--sp-4)" id="pet-tabs">
      ${st.pets.map((p) => `
        <button class="chip ${p.id === pet.id ? 'is-active' : ''}" data-pet="${esc(p.id)}">
          ${esc(p.emoji)} ${esc(p.name)}
        </button>`).join('')}
      <button class="chip" id="add-pet">＋ 添加宠物</button>
    </div>` : ''}

    ${lostPet ? lostBanner(lostPet) : ''}

    ${pet.deceased ? memorialBanner(pet) : `
    <div class="section">
      <div class="section__head">
        <h2>今天要做的</h2>
        <div class="row" style="gap:8px;align-items:center">
          ${store.reminders(pet.id).length ? '<button class="btn btn--ghost btn--sm" data-ics type="button">📅 加入日历</button>' : ''}
          <a class="section__more" href="#/health">健康档案 →</a>
        </div>
      </div>
      ${remindersHTML(pet.id)}
    </div>

    <div class="section">
      <div class="section__head">
        <h2>记一笔</h2>
        <a class="section__more" href="#/health">全部记录 →</a>
      </div>
      ${quickRecordHTML()}
    </div>
    `}

    <div class="section">${heroHTML(pet, st.pets)}</div>

    <div class="section">
      <div class="section__head"><h2>健康速览</h2></div>
      <div class="grid grid--4">${tilesHTML(pet.id)}</div>
    </div>

    <div class="section">
      <div class="section__head">
        <h2>最近成长瞬间</h2>
        <a class="section__more" href="#/timeline">全部时光 →</a>
      </div>
      ${momentsHTML(pet.id)}
    </div>

    <div class="section">
      <div class="section__head">
        <h2>附近的宠友</h2>
        <a class="section__more" href="#/nearby">发现更多 →</a>
      </div>
      ${nearbyHTML()}
    </div>
  `;

  // 宠物切换
  el.querySelectorAll('[data-pet]').forEach((btn) => {
    btn.addEventListener('click', () => {
      store.setActivePet(btn.dataset.pet);
      dashboard(el);
    });
  });

  const addBtn = el.querySelector('#add-pet');
  if (addBtn) addBtn.addEventListener('click', () => openAddPet(() => dashboard(el)));

  el.querySelectorAll('[data-quick]').forEach((b) =>
    b.addEventListener('click', () => openRecordForm(pet, b.dataset.quick, () => dashboard(el))));
  el.querySelector('[data-ics]')?.addEventListener('click', () => exportICS(pet));
  if (lostPet) mountLost(el, lostPet, () => dashboard(el));

  // 待办一键完成：今天做了 → 直接顺延，不用进表单
  el.querySelectorAll('[data-done]').forEach((b) =>
    b.addEventListener('click', () => {
      const pet = store.activePet();
      const r = store.reminders(pet.id).find((x) => x.id === b.dataset.done);
      if (!r) return;
      const res = store.completeReminder(pet.id, r, todayISO());
      if (res.duplicate) {
        toast('本周期已打卡，无需重复记录', '⏳');
        return;
      }
      const rerender = () => router.rerender();
      toast(`${r.title} 已记录 · 下次 ${fmtDate(store.suggestNext(r.type, r.kind, todayISO()), false)}`, '✓', {
        label: '撤销',
        onClick: () => {
          if (res.record) store.deleteRecord(res.record.id);
          rerender();
        },
      });
      dashboard(el);
    }));
}

export function openAddPet(after) {
  openModal({
    title: '添加宠物',
    submit: '创建档案',
    body:
      field('名字', `<input name="name" required maxlength="12" placeholder="比如：布丁">`) +
      field('头像', `<input name="emoji" maxlength="4" value="🐾" placeholder="填一个 emoji">`, '贴一个 emoji 当头像，比上传图片快') +
      field('种类', selectHTML('species', [['猫', '猫'], ['狗', '狗'], ['其他', '其他']], '猫')) +
      field('品种', `<input name="breed" required maxlength="24" placeholder="比如：中华田园猫">`) +
      field('性别', selectHTML('gender', [['公', '公'], ['母', '母']], '公')) +
      field('出生日期', `<input type="date" name="birthday" required value="${todayISO()}">`) +
      field('当前体重 (kg)', `<input type="number" name="weight" step="0.1" min="0" placeholder="比如：4.8">`) +
      field('一句话介绍', `<textarea name="bio" maxlength="80" placeholder="它的性格、来历、小怪癖……"></textarea>`),
    onSubmit(data) {
      if (!data.name || !data.breed) { toast('请填写名字和品种', '⚠️'); return false; }
      store.addPet({
        name: data.name,
        emoji: data.emoji || '🐾',
        species: data.species,
        breed: data.breed,
        gender: data.gender,
        neutered: false,
        birthday: data.birthday,
        weight: Number(data.weight) || 0,
        color: 'brand',
        bio: data.bio || '',
      });
      toast(`${data.name} 的档案已创建`);
      if (after) after();
    },
  });
}
