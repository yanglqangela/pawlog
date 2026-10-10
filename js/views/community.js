/* ============================================================
   社区 — 动态流 / 话题广场 / 发布 / 互动
   ============================================================ */
import * as store from '../store.js';
import { esc, relDate, fmtDate, toast, openModal, field } from '../ui.js';

let topic = '全部';

const TOPICS = ['全部', '新手养猫', '科学喂养', '健康档案', '遛狗日常', '减肥日记', '换毛季', '异宠'];

function postCard(p, st) {
  const author = st.friends.find((f) => f.id === p.author);
  const avatar = author?.emoji || p.emoji || '🙂';

  return `
    <article class="card card--pad" data-post="${esc(p.id)}">
      <div class="post__head">
        <div class="avatar">${esc(avatar)}</div>
        <div class="grow">
          <div class="post__name">${esc(p.name)}</div>
          <div class="post__meta">${esc(p.city)} · ${esc(relDate(p.time))}</div>
        </div>
        <button class="btn btn--ghost btn--sm" data-follow-post="${esc(p.name)}">关注</button>
      </div>

      <p class="post__body">${esc(p.text)}</p>

      ${(p.imgs || []).length ? `<div class="post__imgs">${p.imgs.map((i) => `<div class="post__img">${esc(i)}</div>`).join('')}</div>` : ''}

      ${(p.tags || []).length ? `<div class="row row--wrap" style="gap:6px;margin-top:var(--sp-3)">
        ${p.tags.map((t) => `<button class="tag tag--brand" data-topic="${esc(t)}">#${esc(t)}</button>`).join('')}
      </div>` : ''}

      <div class="post__foot">
        <button class="post__act ${p.liked ? 'is-on' : ''}" data-like="${esc(p.id)}">
          ${p.liked ? '❤️' : '🤍'} <span>${p.likes}</span>
        </button>
        <button class="post__act" data-comment="${esc(p.id)}">💬 <span>${p.comments.length}</span></button>
        <button class="post__act" data-share="${esc(p.id)}">↗ 分享</button>
      </div>

      ${p.comments.length ? `<div class="stack" style="margin-top:var(--sp-4);padding-top:var(--sp-3);border-top:1px solid var(--c-line-soft);gap:9px">
        ${p.comments.map((c) => `
          <div class="row" style="align-items:flex-start;gap:9px">
            <div class="avatar" style="width:26px;height:26px;font-size:14px">🙂</div>
            <div class="grow">
              <div class="xs strong">${esc(c.name)}</div>
              <div class="small" style="color:var(--c-ink-2)">${esc(c.text)}</div>
            </div>
            <span class="xs muted">${esc(relDate(c.time))}</span>
          </div>`).join('')}
      </div>` : ''}
    </article>`;
}

export default function community(el) {
  const st = store.get();

  const list = [...st.posts]
    .filter((p) => topic === '全部' || (p.tags || []).includes(topic))
    .sort((a, b) => (a.time < b.time ? 1 : -1));

  el.innerHTML = `
    <div class="page-head">
      <h1>社区</h1>
      <p>看看同城家长今天都在分享什么</p>
    </div>

    <button class="composer" id="compose" style="margin-bottom:var(--sp-5)">
      <div class="avatar">${esc(st.me.emoji)}</div>
      <span class="composer__ph grow">分享今天和毛孩子的日常……</span>
      <span class="btn btn--primary btn--sm" style="pointer-events:none">发布</span>
    </button>

    <div class="section">
      <div class="scroller" style="margin-bottom:var(--sp-5)">
        ${TOPICS.map((t) => `<button class="chip ${t === topic ? 'is-active' : ''}" data-topic-f="${esc(t)}">#${esc(t)}</button>`).join('')}
      </div>

      <div class="section__head">
        <h2>${topic === '全部' ? '最新动态' : '#' + topic}</h2>
        <span class="xs muted">${list.length} 条</span>
      </div>

      ${list.length
        ? `<div class="stack" style="gap:var(--sp-4)">${list.map((p) => postCard(p, st)).join('')}</div>`
        : `<div class="empty card card--pad"><div class="empty__ico">💬</div>
             <div class="empty__title">这个话题下还没有动态</div>
             <div class="empty__text">来发第一条吧</div></div>`}
    </div>
  `;

  el.querySelectorAll('[data-topic-f]').forEach((b) =>
    b.addEventListener('click', () => { topic = b.dataset.topicF; community(el); }));

  el.querySelectorAll('[data-topic]').forEach((b) =>
    b.addEventListener('click', () => { topic = b.dataset.topic; community(el); window.scrollTo({ top: 0, behavior: 'smooth' }); }));

  el.querySelectorAll('[data-like]').forEach((b) =>
    b.addEventListener('click', () => { store.toggleLike(b.dataset.like); community(el); }));

  el.querySelectorAll('[data-share]').forEach((b) =>
    b.addEventListener('click', () => toast('分享链接已复制（演示）')));

  el.querySelectorAll('[data-follow-post]').forEach((b) =>
    b.addEventListener('click', () => {
      const on = b.textContent === '已关注';
      b.textContent = on ? '关注' : '已关注';
      toast(on ? '已取消关注' : `已关注 ${b.dataset.followPost}`);
    }));

  el.querySelectorAll('[data-comment]').forEach((b) =>
    b.addEventListener('click', () => {
      const id = b.dataset.comment;
      const post = store.get().posts.find((p) => p.id === id);
      openModal({
        title: '评论',
        submit: '发送',
        body: `
          <div class="card card--pad" style="background:var(--c-surface-2);box-shadow:none">
            <div class="xs strong">${esc(post.name)}</div>
            <div class="small" style="color:var(--c-ink-2);margin-top:4px">${esc(post.text)}</div>
          </div>
          ${field('你的评论', `<textarea name="text" maxlength="160" placeholder="友善交流，文明养宠～"></textarea>`)}`,
        onSubmit(d) {
          if (!d.text?.trim()) { toast('评论不能为空', '⚠️'); return false; }
          store.addComment(id, { name: store.get().me.name, text: d.text.trim(), time: new Date().toISOString().slice(0, 10) });
          toast('评论已发布');
          community(el);
        },
      });
    }));

  el.querySelector('#compose').addEventListener('click', () => {
    openModal({
      title: '分享养宠日常',
      submit: '发布',
      body:
        field('说点什么', `<textarea name="text" required maxlength="400" placeholder="今天和毛孩子发生了什么？"></textarea>`) +
        field('配图', `<input name="imgs" maxlength="40" placeholder="贴几个 emoji，用空格分开">`, '比如 🐱 🌇 🦴（M2 将支持上传真实照片）') +
        field('话题', `<input name="tags" maxlength="60" placeholder="用空格分开，比如：遛狗日常 柴犬">`) +
        field('你的所在地', `<input name="city" value="${esc(st.me.city)}·${esc(st.me.district)}" maxlength="24">`),
      onSubmit(d) {
        if (!d.text?.trim()) { toast('说点什么再发布吧', '⚠️'); return false; }
        store.addPost({
          author: 'me',
          name: store.get().me.name,
          emoji: store.get().me.emoji,
          city: d.city || '重庆',
          time: new Date().toISOString().slice(0, 10),
          text: d.text.trim(),
          imgs: (d.imgs || '').split(/\s+/).filter(Boolean).slice(0, 3),
          tags: (d.tags || '').split(/\s+/).filter(Boolean).slice(0, 4),
        });
        toast('已发布 🎉');
        topic = '全部';
        community(el);
      },
    });
  });
}
