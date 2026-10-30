/* ============================================================
   走失模式 — 一屏海报 + 可下载图片 + 可复制文案
   纯静态：海报在本机生成，不依赖服务器
   ============================================================ */
import * as store from '../store.js';
import { esc, fmtDate, toast, openModal, closeModal, field, copyText, shareText } from '../ui.js';

const nowLocal = () => {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};

function activeLost(pet) {
  const lost = store.lostOf();
  return lost?.active && lost.petId === pet.id ? lost : null;
}

export function lostBanner(pet) {
  const lost = activeLost(pet);
  if (!lost) return '';
  return `
    <div class="lost-banner">
      <div class="lost-banner__ico" aria-hidden="true">🚨</div>
      <div class="grow">
        <div class="strong">${esc(pet.name)} 正在走失中</div>
        <div class="xs muted">${esc(lost.place || '最后出现地点未填写')}${lost.lastSeenAt ? ` · ${esc(lost.lastSeenAt.replace('T', ' '))}` : ''}</div>
      </div>
      <button class="btn btn--danger btn--sm" data-lost-poster type="button">看海报</button>
      <button class="btn btn--ghost btn--sm" data-lost-found type="button">已找回</button>
    </div>`;
}

export function mountLost(root, pet, after) {
  root.querySelectorAll('[data-lost-poster]').forEach((b) =>
    b.addEventListener('click', () => openLostPoster(pet, after)));
  root.querySelectorAll('[data-lost-found]').forEach((b) =>
    b.addEventListener('click', () => {
      store.clearLostReport();
      toast('已标记为找回，撤下走失提示', '🐾');
      if (after) after();
    }));
}

export function openLostForm(pet, after) {
  const lost = activeLost(pet);
  openModal({
    title: '走失模式',
    sheet: true,
    body: `<p class="small" style="color:var(--c-ink-2);line-height:1.8">
      填写最后出现的信息，生成寻宠海报和文案。请先联系常去医院、附近小区群和救助组织。</p>
      ${field('最后出现时间', `<input type="datetime-local" name="lastSeenAt" value="${esc(lost?.lastSeenAt || nowLocal())}" required>`)}
      ${field('最后出现地点', `<input name="place" required maxlength="80" value="${esc(lost?.place || '')}" placeholder="比如：北碚区滨江路附近">`)}
      ${field('联系方式', `<input name="contact" required maxlength="40" value="${esc(lost?.contact || pet.emergencyContact || '')}" placeholder="手机号或微信">`)}
      ${field('特征 / 注意事项', `<textarea name="note" maxlength="200" placeholder="毛色、项圈、是否怕生、是否绝育……">${esc(lost?.note || pet.bio || '')}</textarea>`)}`,
    onSubmit(d) {
      if (!d.place || !d.contact) { toast('请填写地点和联系方式', '⚠️'); return false; }
      store.setLostReport({ petId: pet.id, ...d });
      toast('已开启走失模式，海报已生成', '🚨');
      if (after) after();
      setTimeout(() => openLostPoster(pet, after), 80);
    },
  });
}

function wrapText(ctx, text, maxWidth) {
  const lines = [];
  for (const para of String(text || '').split('\n')) {
    let line = '';
    for (const ch of para) {
      const test = line + ch;
      if (ctx.measureText(test).width > maxWidth && line) {
        lines.push(line);
        line = ch;
      } else {
        line = test;
      }
    }
    if (line) lines.push(line);
  }
  return lines;
}

export function buildPosterCanvas(pet, lost) {
  const canvas = document.createElement('canvas');
  canvas.width = 1080;
  canvas.height = 1500;
  const ctx = canvas.getContext('2d');
  const sans = '"PingFang SC", "Microsoft YaHei", sans-serif';

  ctx.fillStyle = '#FFF8F2';
  ctx.fillRect(0, 0, 1080, 1500);

  ctx.fillStyle = '#B34424';
  ctx.fillRect(0, 0, 1080, 170);
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'left';
  ctx.font = `800 64px ${sans}`;
  ctx.fillText('寻宠启事', 72, 112);

  ctx.textAlign = 'center';
  ctx.font = `160px ${sans}`;
  ctx.fillText(pet.emoji || '🐾', 540, 360);

  ctx.fillStyle = '#2B2622';
  ctx.font = `800 72px ${sans}`;
  ctx.fillText(pet.name || '它', 540, 470, 900);

  ctx.fillStyle = '#5F564E';
  ctx.font = `500 32px ${sans}`;
  ctx.fillText([pet.species, pet.breed, pet.gender, pet.neutered ? '已绝育' : ''].filter(Boolean).join(' · '), 540, 525);

  ctx.textAlign = 'left';
  let y = 620;
  const block = (label, value) => {
    ctx.fillStyle = '#B34424';
    ctx.font = `700 28px ${sans}`;
    ctx.fillText(label, 80, y);
    y += 42;
    ctx.fillStyle = '#2B2622';
    ctx.font = `500 32px ${sans}`;
    const lines = wrapText(ctx, value || '—', 920);
    for (const line of lines.slice(0, 3)) {
      ctx.fillText(line, 80, y);
      y += 44;
    }
    y += 26;
  };

  block('最后出现', `${lost.place || '—'}${lost.lastSeenAt ? `\n${lost.lastSeenAt.replace('T', ' ')}` : ''}`);
  block('特征', lost.note || pet.bio || '—');

  ctx.fillStyle = '#FFF0EA';
  ctx.fillRect(60, y, 960, 150);
  ctx.fillStyle = '#B34424';
  ctx.font = `700 28px ${sans}`;
  ctx.fillText('请联系我', 90, y + 50);
  ctx.fillStyle = '#2B2622';
  ctx.font = `800 44px ${sans}`;
  ctx.fillText(lost.contact || '—', 90, y + 112, 900);

  ctx.fillStyle = '#756B62';
  ctx.font = `500 26px ${sans}`;
  ctx.fillText('请帮忙转发到附近小区群 / 宠友群，谢谢！', 80, 1390);
  ctx.fillText('由爪迹 PawLog 生成 · 本机生成，无服务器上传', 80, 1435);

  return canvas;
}

function posterText(pet, lost) {
  return `【寻宠】${pet.name || '它'}${pet.species ? `（${pet.species}${pet.breed ? ` · ${pet.breed}` : ''}）` : ''}\n最后出现：${lost.place || '—'}${lost.lastSeenAt ? `（${lost.lastSeenAt.replace('T', ' ')}）` : ''}\n特征：${lost.note || pet.bio || '—'}\n联系方式：${lost.contact || '—'}\n请帮忙转发到附近小区群/宠友群，谢谢！\n—— 来自爪迹 PawLog`;
}

export function openLostPoster(pet, after) {
  const lost = activeLost(pet);
  if (!lost) { openLostForm(pet, after); return; }
  const text = posterText(pet, lost);
  const preview = `
    <div class="lost-poster">
      <div class="lost-poster__band">寻宠启事</div>
      <div class="lost-poster__emoji">${esc(pet.emoji || '🐾')}</div>
      <div class="lost-poster__name">${esc(pet.name)}</div>
      <div class="lost-poster__meta">${esc([pet.species, pet.breed, pet.gender].filter(Boolean).join(' · '))}</div>
      <div class="lost-poster__block"><b>最后出现</b><br>${esc(lost.place || '—')}${lost.lastSeenAt ? `<br>${esc(lost.lastSeenAt.replace('T', ' '))}` : ''}</div>
      <div class="lost-poster__block"><b>特征</b><br>${esc(lost.note || pet.bio || '—')}</div>
      <div class="lost-poster__contact"><b>请联系我</b><br><span>${esc(lost.contact || '—')}</span></div>
      <div class="lost-poster__foot">请帮忙转发 · 爪迹 PawLog</div>
    </div>`;

  const panel = openModal({
    title: `${pet.name} · 寻宠海报`,
    footer: `<button class="btn btn--ghost" data-close>关闭</button>
             <button class="btn btn--ghost" id="lost-copy">复制文案</button>
             <button class="btn btn--ghost" id="lost-share">分享</button>
             <button class="btn btn--primary" id="lost-download">下载海报 PNG</button>
             <button class="btn btn--danger" id="lost-found">已找回</button>`,
    body: preview,
  });

  panel.querySelector('#lost-copy')?.addEventListener('click', () => copyText(text, '寻宠文案已复制'));
  panel.querySelector('#lost-share')?.addEventListener('click', () => shareText({ title: `寻宠：${pet.name}`, text }));
  panel.querySelector('#lost-download')?.addEventListener('click', () => {
    try {
      const canvas = buildPosterCanvas(pet, lost);
      canvas.toBlob((blob) => {
        if (!blob) { toast('海报生成失败，请重试', '⚠️'); return; }
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${pet.name}-寻宠海报.png`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        toast('海报已下载');
      }, 'image/png');
    } catch (e) {
      toast('海报生成失败，请重试', '⚠️');
    }
  });
  panel.querySelector('#lost-found')?.addEventListener('click', () => {
    store.clearLostReport();
    closeModal();
    toast('已标记为找回，撤下走失提示', '🐾');
    if (after) after();
  });
}
