/* ============================================================
   附近与出行 — 宠友 / 同城活动 / 宠物友好地点 / 本地互助
   演示数据明确标注；不假装有实时匹配或站内私信
   ============================================================ */
import * as store from '../store.js';
import { esc, fmtDate, toast, openModal, field, selectHTML, copyText, shareText } from '../ui.js';

let speciesFilter = '全部';
let districtFilter = '全部';

const AID_TEMPLATES = [
  ['寄养', '寄养求助', '【寄养求助】\n我在{city}{district}，{dates}需要帮忙照看宠物。\n宠物情况：{pet}\n要求：\n联系方式：\n—— 来自爪迹 PawLog'],
  ['上门喂养', '上门喂养', '【上门喂养】\n地点：{city}{district}\n时间：{dates}\n需要：喂食 / 换水 / 铲屎 / 简单陪伴\n宠物情况：{pet}\n联系方式：\n—— 来自爪迹 PawLog'],
  ['遛狗', '遛狗搭子', '【遛狗搭子】\n我在{city}{district}，想找附近固定时间一起遛狗的朋友。\n我的狗：{pet}\n时间：\n联系方式：\n—— 来自爪迹 PawLog'],
  ['寻宠', '寻宠', '【寻宠】\n{pet} 于 {dates} 在 {city}{district} 附近走失。\n特征：\n联系方式：\n—— 来自爪迹 PawLog'],
  ['领养', '领养', '【领养】\n{city}{district}，一只{pet}寻找新家。\n年龄 / 性格 / 疫苗情况：\n领养要求：\n联系方式：\n—— 来自爪迹 PawLog'],
];

const sameArea = (f, me) => {
  if (f.city === me.city && f.district === me.district) return '同区';
  if (f.city === me.city) return '同城';
  return f.city || '未知地区';
};

function friendCard(f, me) {
  return `
    <div class="card card--pad" data-friend="${esc(f.id)}">
      <div class="friend__head">
        <div class="avatar avatar--lg">${esc(f.emoji)}</div>
        <div class="grow">
          <div class="row" style="gap:6px;flex-wrap:wrap">
            <span class="friend__name">${esc(f.name)}</span>
            ${f.demo ? '<span class="tag tag--sun">演示</span>' : ''}
          </div>
          <div class="friend__loc">📍 ${esc(f.city)}·${esc(f.district)} · ${esc(sameArea(f, me))}</div>
        </div>
      </div>
      <p class="friend__bio">${esc(f.bio)}</p>
      <div class="friend__pets">
        ${(f.pets || []).map((p) => `<span class="tag tag--brand">${esc(p.name)} · ${esc(p.breed)}</span>`).join('')}
      </div>
      <div class="row" style="gap:6px;margin-top:var(--sp-3);flex-wrap:wrap">
        ${(f.tags || []).map((t) => `<span class="tag">#${esc(t)}</span>`).join('')}
      </div>
      <div class="row row--between" style="margin-top:var(--sp-4);padding-top:var(--sp-3);border-top:1px solid var(--c-line-soft)">
        <span class="xs muted">${f.posts || 0} 条动态</span>
        <button class="btn btn--ghost btn--sm" data-share-friend="${esc(f.id)}" type="button">分享名片</button>
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
        <div class="row" style="gap:6px;flex-wrap:wrap">
          <span class="list__title">${esc(a.title)}</span>
          ${a.demo ? '<span class="tag tag--sun">演示</span>' : ''}
        </div>
        <div class="list__sub">发起人 ${esc(a.host)} · ${esc(a.district)}</div>
        <div class="row" style="gap:6px;margin-top:6px;flex-wrap:wrap">
          ${(a.tags || []).map((t) => `<span class="tag tag--sky">${esc(t)}</span>`).join('')}
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

function placeCard(p) {
  const q = encodeURIComponent(`${p.name} ${p.address || ''}`.trim());
  return `
    <div class="card card--pad">
      <div class="row row--between" style="gap:8px;align-items:flex-start">
        <div class="grow">
          <div class="row" style="gap:6px;flex-wrap:wrap">
            <span class="strong">${esc(p.name)}</span>
            <span class="tag tag--sky">${esc(p.type)}</span>
            ${p.demo ? '<span class="tag tag--sun">示例</span>' : ''}
          </div>
          <div class="xs muted" style="margin-top:4px">📍 ${esc(p.city)}${esc(p.district)}${p.address ? ` · ${esc(p.address)}` : ''}</div>
          ${p.note ? `<div class="small muted" style="margin-top:4px">${esc(p.note)}</div>` : ''}
        </div>
      </div>
      <div class="row row--wrap" style="gap:6px;margin-top:10px">
        <a class="btn btn--ghost btn--sm" href="https://uri.amap.com/search?keyword=${q}" target="_blank" rel="noopener">在高德打开</a>
        <a class="btn btn--ghost btn--sm" href="https://map.baidu.com/search/${q}" target="_blank" rel="noopener">在百度打开</a>
        ${p.demo ? '' : `<button class="btn btn--ghost list__menu" data-del-place="${esc(p.id)}" title="删除地点" aria-label="删除地点">🗑️</button>`}
      </div>
    </div>`;
}

function openShareFriend(f) {
  const pets = (f.pets || []).map((p) => `${p.name}（${p.breed}）`).join('、');
  const text = `【宠友名片】${f.name}\n${f.city}·${f.district} · ${pets}\n${f.bio}${f.demo ? '\n（演示数据，来自爪迹 PawLog）' : '\n—— 来自爪迹 PawLog'}`;
  shareText({ title: `${f.name} 的宠友名片`, text });
}

function openMutualAid(kindLabel, title, template, me) {
  const text = template
    .replaceAll('{city}', me.city || '')
    .replaceAll('{district}', me.district || '')
    .replaceAll('{dates}', '（补充日期）')
    .replaceAll('{pet}', '（补充宠物信息）');
  const panel = openModal({
    title: `${kindLabel} · 本地互助`,
    footer: `<button class="btn btn--ghost" data-close>关闭</button>
             <button class="btn btn--ghost" id="aid-copy">复制文案</button>
             <button class="btn btn--primary" id="aid-share">分享</button>`,
    body: `<p class="small" style="color:var(--c-ink-2);line-height:1.8">
      本应用没有站内私信。生成文案后，请复制/分享到你所在的小区群、宠友群，并线下核验对方身份。
    </p>
    ${field('文案（可编辑）', `<textarea name="text" rows="8" maxlength="600">${esc(text)}</textarea>`)}`,
  });
  const ta = panel.querySelector('[name="text"]');
  panel.querySelector('#aid-copy')?.addEventListener('click', () => copyText(ta?.value || text, '互助文案已复制'));
  panel.querySelector('#aid-share')?.addEventListener('click', () => shareText({ title, text: ta?.value || text }));
}

function openPlaceForm(me, after) {
  openModal({
    title: '添加宠物友好地点',
    sheet: true,
    body:
      field('名称', `<input name="name" required maxlength="40" placeholder="比如：滨江路草坪">`) +
      field('类型', selectHTML('type', [['遛狗', '遛狗'], ['公园', '公园'], ['咖啡 / 餐厅', '咖啡 / 餐厅'], ['住宿', '住宿'], ['宠物医院', '宠物医院'], ['其他', '其他']], '遛狗')) +
      field('城市', `<input name="city" value="${esc(me.city)}" maxlength="20">`) +
      field('区域', `<input name="district" value="${esc(me.district)}" maxlength="20">`) +
      field('地址', `<input name="address" maxlength="80" placeholder="选填">`) +
      field('备注', `<textarea name="note" maxlength="120" placeholder="比如：需牵绳、可带宠区域">${''}</textarea>`),
    onSubmit(d) {
      if (!d.name) { toast('请填写名称', '⚠️'); return false; }
      store.addPlace({ ...d, source: '本机添加', demo: false });
      toast('地点已添加');
      if (after) after();
    },
  });
}

export default function nearby(el) {
  const st = store.get();
  const me = st.me;
  const joinedIds = new Set(st.joinedIds || []);

  const districts = ['全部', ...new Set(st.friends.map((f) => f.district))];
  const filtered = st.friends
    .filter((f) => districtFilter === '全部' || f.district === districtFilter)
    .filter((f) => speciesFilter === '全部' || f.pets.some((p) => p.species === speciesFilter))
    .sort((a, b) => (
      Number(b.city === me.city && b.district === me.district)
      - Number(a.city === me.city && a.district === me.district)
    ) || a.name.localeCompare(b.name, 'zh'));

  const places = [...store.get().places].sort((a, b) => (
    Number(b.city === me.city) - Number(a.city === me.city)
  ) || a.name.localeCompare(b.name, 'zh'));
  const hasDemo = st.friends.some((f) => f.demo)
    || st.activities.some((a) => a.demo)
    || places.some((p) => p.demo);

  el.innerHTML = `
    <div class="page-head">
      <h1>附近与出行</h1>
      <p>同城宠友、活动、宠物友好地点与本地互助</p>
    </div>

    ${hasDemo ? `<div class="reminder reminder--soon" style="border:1px solid var(--c-line);margin-bottom:var(--sp-5);background:var(--c-surface-2)">
      <span class="reminder__ico">📌</span>
      <div class="grow">
        <div class="reminder__title">演示数据说明</div>
        <div class="reminder__sub">宠友、动态与活动为示例内容，不会实时更新；地点可自行添加。可在「我的」一键清空演示内容。</div>
      </div>
      <a class="btn btn--ghost btn--sm" href="#/me">去管理</a>
    </div>` : ''}

    <div class="card card--pad" style="margin-bottom:var(--sp-5);background:linear-gradient(135deg,#F0F7FB,#EAF4F0)">
      <div class="row row--between row--wrap" style="gap:var(--sp-3)">
        <div>
          <div class="strong">📡 你在 ${esc(me.city)}·${esc(me.district)}</div>
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
      <div class="section__head"><h2>宠友名片墙</h2><span class="xs muted">同区优先</span></div>
      ${filtered.length
        ? `<div class="grid grid--auto">${filtered.map((f) => friendCard(f, me)).join('')}</div>`
        : `<div class="empty card card--pad"><div class="empty__ico">🔍</div>
             <div class="empty__title">这个筛选下还没有宠友</div>
             <div class="empty__text">换个区域或宠物类型试试</div></div>`}
    </div>

    <div class="section">
      <div class="section__head"><h2>同城活动</h2><span class="xs muted">${st.activities.length} 场</span></div>
      ${st.activities.length
        ? `<div class="card card--flush"><div class="list">${st.activities.map((a) => activityCard(a, joinedIds)).join('')}</div></div>`
        : `<div class="empty card card--pad"><div class="empty__ico">📅</div><div class="empty__title">暂时没有同城活动</div><div class="empty__text">演示活动已清空，可在真实群里约一场</div></div>`}
    </div>

    <div class="section">
      <div class="section__head">
        <h2>宠物友好地点</h2>
        <button class="btn btn--soft btn--sm" id="place-add" type="button">＋ 添加</button>
      </div>
      <p class="xs muted" style="margin-bottom:var(--sp-3)">示例地点仅作演示；请在出发前电话确认商家/场地的最新规定。</p>
      ${places.length
        ? `<div class="grid grid--auto">${places.map(placeCard).join('')}</div>`
        : `<div class="empty card card--pad"><div class="empty__ico">📍</div><div class="empty__title">还没有地点</div><div class="empty__text">添加一个你常去的遛狗/宠物友好地点</div></div>`}
    </div>

    <div class="section">
      <div class="section__head"><h2>本地互助</h2><span class="xs muted">生成文案，发到真实群里</span></div>
      <p class="xs muted" style="margin-bottom:var(--sp-3)">本应用没有站内私信或交易担保；请线下核验身份。</p>
      <div class="grid grid--auto">
        ${AID_TEMPLATES.map(([kind, title, tpl]) => `
          <button class="quick-record" type="button" data-aid="${esc(kind)}">
            <span class="quick-record__ico" aria-hidden="true">🤝</span>
            <span class="grow" style="text-align:left">
              <span class="quick-record__label">${esc(kind)}</span>
              <span class="quick-record__sub">${esc(title)} · 复制/分享</span>
            </span>
            <span class="quick-record__plus" aria-hidden="true">↗</span>
          </button>`).join('')}
      </div>
    </div>
  `;

  el.querySelectorAll('[data-sp]').forEach((b) =>
    b.addEventListener('click', () => { speciesFilter = b.dataset.sp; nearby(el); }));
  el.querySelectorAll('[data-dist]').forEach((b) =>
    b.addEventListener('click', () => { districtFilter = b.dataset.dist; nearby(el); }));

  el.querySelectorAll('[data-share-friend]').forEach((b) =>
    b.addEventListener('click', () => {
      const f = store.get().friends.find((x) => x.id === b.dataset.shareFriend);
      if (f) openShareFriend(f);
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
      toast('已记到本机；请按主办方渠道确认报名 🐾');
      nearby(el);
    }));

  el.querySelectorAll('[data-aid]').forEach((b) =>
    b.addEventListener('click', () => {
      const t = AID_TEMPLATES.find(([kind]) => kind === b.dataset.aid);
      if (t) openMutualAid(t[0], t[1], t[2], me);
    }));

  el.querySelector('#place-add')?.addEventListener('click', () => openPlaceForm(me, () => nearby(el)));
  el.querySelectorAll('[data-del-place]').forEach((b) =>
    b.addEventListener('click', () => {
      const id = b.dataset.delPlace;
      openModal({
        title: '删除这个地点？',
        submit: '删除',
        body: '<p class="small" style="color:var(--c-ink-2);line-height:1.8">只会删除本机保存的地点记录。</p>',
        onSubmit() {
          store.deletePlace(id);
          toast('地点已删除');
          nearby(el);
        },
      });
    }));

  el.querySelector('#edit-loc').addEventListener('click', () => {
    openModal({
      title: '修改我的位置',
      body:
        field('城市', `<input name="city" value="${esc(me.city)}" required>`) +
        field('区域', `<input name="district" value="${esc(me.district)}" required>`, '用于同城/同区展示，不会公开精确地址'),
      onSubmit(d) {
        store.update((s) => { s.me.city = d.city; s.me.district = d.district; });
        toast('位置已更新');
        nearby(el);
      },
    });
  });
}
