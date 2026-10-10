/* ============================================================
   附近宠友 — 地域匹配 / 宠物名片墙 / 同城活动
   ============================================================ */
import * as store from '../store.js';
import { esc, fmtDate, relDate, toast, openModal, field } from '../ui.js';

let speciesFilter = '全部';
let districtFilter = '全部';

function friendCard(f) {
  return `
    <div class="card card--pad" data-friend="${esc(f.id)}">
      <div class="friend__head">
        <div class="avatar avatar--lg">${esc(f.emoji)}</div>
        <div class="grow">
          <div class="row" style="gap:6px">
            <span class="friend__name">${esc(f.name)}</span>
          </div>
          <div class="friend__loc">📍 ${esc(f.district)} · 距离你 ${f.distance}km</div>
        </div>
      </div>
      <p class="friend__bio">${esc(f.bio)}</p>
      <div class="friend__pets">
        ${f.pets.map((p) => `<span class="tag tag--brand">${esc(p.name)} · ${esc(p.breed)}</span>`).join('')}
      </div>
      <div class="row" style="gap:6px;margin-top:var(--sp-3);flex-wrap:wrap">
        ${f.tags.map((t) => `<span class="tag">#${esc(t)}</span>`).join('')}
      </div>
      <div class="row row--between" style="margin-top:var(--sp-4);padding-top:var(--sp-3);border-top:1px solid var(--c-line-soft)">
        <span class="xs muted">${f.posts} 条动态</span>
        <div class="row" style="gap:6px">
          <button class="btn btn--ghost btn--sm" data-greet="${esc(f.name)}">打招呼</button>
          <button class="btn btn--soft btn--sm" data-follow="${esc(f.name)}">关注</button>
        </div>
      </div>
    </div>`;
}

function activityCard(a, joinedIds) {
  const isJoined = joinedIds.has(a.id);
  const full = a.joined >= a.cap;
  return `
    <div class="list__item" style="align-items:center">
      <div class="list__ico" style="background:var(--c-sky-soft);font-size:20px">${esc(a.emoji)}</div>
      <div class="grow">
        <div class="list__title">${esc(a.title)}</div>
        <div class="list__sub">发起人 ${esc(a.host)} · ${esc(a.district)}</div>
        <div class="row" style="gap:6px;margin-top:6px;flex-wrap:wrap">
          ${a.tags.map((t) => `<span class="tag tag--sky">${esc(t)}</span>`).join('')}
        </div>
      </div>
      <div class="col" style="align-items:flex-end;gap:8px;flex:none">
        <div class="list__right">
          ${esc(fmtDate(a.date, false))} ${esc(a.time)}<br>
          <span class="muted">${a.joined}/${a.cap} 人</span>
        </div>
        <button class="btn ${isJoined ? 'btn--ghost' : 'btn--primary'} btn--sm" data-join="${esc(a.id)}" ${full && !isJoined ? 'disabled' : ''}>
          ${isJoined ? '已报名 ✓' : full ? '已满员' : '我要参加'}
        </button>
      </div>
    </div>`;
}

export default function nearby(el) {
  const st = store.get();
  const joinedIds = new Set(st.joinedIds || []);

  const districts = ['全部', ...new Set(st.friends.map((f) => f.district))];

  const filtered = st.friends
    .filter((f) => districtFilter === '全部' || f.district === districtFilter)
    .filter((f) => speciesFilter === '全部' || f.pets.some((p) => p.species === speciesFilter))
    .sort((a, b) => a.distance - b.distance);

  el.innerHTML = `
    <div class="page-head">
      <h1>附近宠友</h1>
      <p>你在 ${esc(st.me.city)}·${esc(st.me.district)}，发现 ${filtered.length} 位附近的家长</p>
    </div>

    <div class="card card--pad" style="margin-bottom:var(--sp-5);background:linear-gradient(135deg,#F0F7FB,#EAF4F0)">
      <div class="row row--between row--wrap" style="gap:var(--sp-3)">
        <div>
          <div class="strong">📡 按地域匹配宠友</div>
          <div class="small muted" style="margin-top:3px">同城同区的家长更容易约到一起遛宠、互相代喂</div>
        </div>
        <button class="btn btn--ghost" id="edit-loc">修改我的位置</button>
      </div>
    </div>

    <div class="section">
      <div class="section__head"><h2>筛选</h2></div>
      <div class="col" style="gap:var(--sp-3)">
        <div class="scroller">
          ${['全部', '猫', '狗', '鸟'].map((s) => `<button class="chip ${s === speciesFilter ? 'is-active' : ''}" data-sp="${s}">${s === '全部' ? '全部宠物' : s}</button>`).join('')}
        </div>
        <div class="scroller">
          ${districts.map((d) => `<button class="chip ${d === districtFilter ? 'is-active' : ''}" data-dist="${esc(d)}">${d === '全部' ? '全部区域' : esc(d)}</button>`).join('')}
        </div>
      </div>
    </div>

    <div class="section">
      <div class="section__head"><h2>宠友名片墙</h2><span class="xs muted">按距离排序</span></div>
      ${filtered.length
        ? `<div class="grid grid--auto">${filtered.map(friendCard).join('')}</div>`
        : `<div class="empty card card--pad"><div class="empty__ico">🔍</div>
             <div class="empty__title">这个筛选下还没有宠友</div>
             <div class="empty__text">换个区域或宠物类型试试</div></div>`}
    </div>

    <div class="section">
      <div class="section__head"><h2>同城活动</h2><span class="xs muted">${st.activities.length} 场进行中</span></div>
      <div class="card card--flush"><div class="list">
        ${st.activities.map((a) => activityCard(a, joinedIds)).join('')}
      </div></div>
    </div>
  `;

  el.querySelectorAll('[data-sp]').forEach((b) =>
    b.addEventListener('click', () => { speciesFilter = b.dataset.sp; nearby(el); }));
  el.querySelectorAll('[data-dist]').forEach((b) =>
    b.addEventListener('click', () => { districtFilter = b.dataset.dist; nearby(el); }));

  el.querySelectorAll('[data-greet]').forEach((b) =>
    b.addEventListener('click', () => {
      const name = b.dataset.greet;
      openModal({
        title: `给 ${name} 打招呼`,
        submit: '发送',
        body: field('说点什么', `<textarea name="msg" maxlength="120" placeholder="嗨！我也在附近养猫，有空一起交流呀～"></textarea>`),
        onSubmit(d) {
          if (!d.msg?.trim()) { toast('说点什么再发送吧', '⚠️'); return false; }
          toast(`消息已发送给 ${name} 💬`);
        },
      });
    }));

  el.querySelectorAll('[data-follow]').forEach((b) =>
    b.addEventListener('click', () => {
      b.textContent = b.textContent === '已关注' ? '关注' : '已关注';
      b.classList.toggle('btn--soft');
      b.classList.toggle('btn--ghost');
      toast(b.textContent === '已关注' ? `已关注 ${b.dataset.follow}` : `已取消关注`);
    }));

  el.querySelectorAll('[data-join]').forEach((b) =>
    b.addEventListener('click', () => {
      const id = b.dataset.join;
      const cur = new Set(store.get().joinedIds || []);
      if (cur.has(id)) { toast('你已经报名啦'); return; }
      store.update((s) => {
        s.joinedIds = s.joinedIds || [];
        s.joinedIds.push(id);
        const a = s.activities.find((x) => x.id === id);
        if (a) a.joined += 1;
      });
      toast('报名成功，记得准时到场 🐾');
      nearby(el);
    }));

  el.querySelector('#edit-loc').addEventListener('click', () => {
    openModal({
      title: '修改我的位置',
      body:
        field('城市', `<input name="city" value="${esc(st.me.city)}" required>`) +
        field('区域', `<input name="district" value="${esc(st.me.district)}" required>`, '用于匹配同区宠友，不会公开精确地址'),
      onSubmit(d) {
        store.update((s) => { s.me.city = d.city; s.me.district = d.district; });
        toast('位置已更新');
        nearby(el);
      },
    });
  });
}
