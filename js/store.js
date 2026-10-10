/* ============================================================
   数据层 — localStorage 持久化 + 订阅通知
   ============================================================ */
import { buildSeed } from './seed.js';

const KEY = 'pawlog.state.v1';

let state = null;
const listeners = new Set();

function read() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    // 结构校验：种子数据升级后旧缓存仍然可用
    if (!parsed || !Array.isArray(parsed.pets) || !parsed.pets.length) return null;
    return parsed;
  } catch {
    return null;
  }
}

function persist() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* 隐私模式 / 配额满：静默降级为内存态，不阻断使用 */
  }
}

export function init() {
  state = read() || buildSeed();
  return state;
}

export function get() {
  if (!state) init();
  return state;
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function emit() {
  listeners.forEach((fn) => fn(state));
}

/** 以可变方式修改 state，自动持久化并通知订阅者 */
export function update(mutator) {
  const r = mutator(get());
  persist();
  emit();
  return r;
}

export function reset() {
  state = buildSeed();
  persist();
  emit();
}

export const uid = (p = 'x') => `${p}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

/* ---------- 选择器 ---------- */

export const activePet = () => {
  const s = get();
  return s.pets.find((p) => p.id === s.activePetId) || s.pets[0];
};

export const petById = (id) => get().pets.find((p) => p.id === id);

export const recordsOf = (petId, type) =>
  get().records
    .filter((r) => r.petId === petId && (!type || r.type === type))
    .sort((a, b) => (a.date < b.date ? 1 : -1));

export const timelineOf = (petId) =>
  get().timeline
    .filter((t) => t.petId === petId)
    .sort((a, b) => (a.date < b.date ? 1 : -1));

/* ---------- 写入操作 ---------- */

export function setActivePet(id) {
  return update((s) => { s.activePetId = id; });
}

export function addRecord(rec) {
  return update((s) => { s.records.push({ id: uid('r'), ...rec }); });
}

export function addTimeline(entry) {
  return update((s) => { s.timeline.push({ id: uid('t'), ...entry }); });
}

export function addPet(pet) {
  return update((s) => {
    const id = uid('p');
    s.pets.push({ id, ...pet });
    s.activePetId = id;
  });
}

export function toggleLike(postId) {
  return update((s) => {
    const p = s.posts.find((x) => x.id === postId);
    if (!p) return;
    p.liked = !p.liked;
    p.likes += p.liked ? 1 : -1;
  });
}

export function addComment(postId, comment) {
  return update((s) => {
    const p = s.posts.find((x) => x.id === postId);
    if (p) p.comments.push(comment);
  });
}

export function addPost(post) {
  return update((s) => { s.posts.unshift({ id: uid('po'), liked: false, likes: 0, comments: [], ...post }); });
}

export function joinActivity(id) {
  return update((s) => {
    const a = s.activities.find((x) => x.id === id);
    if (a && a.joined < a.cap) a.joined += 1;
  });
}

/* ---------- 派生计算 ---------- */

export function ageText(birthday) {
  const days = Math.floor((Date.now() - new Date(birthday).getTime()) / 86400000);
  if (days < 0) return '还没出生';
  const y = Math.floor(days / 365);
  const m = Math.floor((days % 365) / 30);
  if (y >= 1) return m > 0 ? `${y} 岁 ${m} 个月` : `${y} 岁`;
  return `${m} 个月`;
}

export function daysUntil(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  const t = new Date(); t.setHours(0, 0, 0, 0);
  return Math.round((d - t) / 86400000);
}

export function dueText(dateStr) {
  const n = daysUntil(dateStr);
  if (n < 0) return { text: `已逾期 ${-n} 天`, level: 'due' };
  if (n === 0) return { text: '就是今天', level: 'due' };
  if (n <= 7) return { text: `${n} 天后`, level: 'due' };
  if (n <= 30) return { text: `${n} 天后`, level: 'soon' };
  return { text: `${n} 天后`, level: 'ok' };
}

/** 汇总当前宠物的待办提醒（疫苗 / 驱虫），按紧急度排序 */
export function reminders(petId) {
  const out = [];
  const seen = new Set();

  for (const r of recordsOf(petId)) {
    if (!r.nextDate) continue;
    if (r.type !== 'vaccine' && r.type !== 'deworm') continue;
    const key = `${r.type}:${r.name || r.kind}`;
    if (seen.has(key)) continue;   // 同类只保留最新一条
    seen.add(key);
    out.push({
      id: r.id,
      type: r.type,
      ico: r.type === 'vaccine' ? '💉' : '🐛',
      title: r.type === 'vaccine' ? r.name : `${r.kind}驱虫`,
      sub: r.type === 'vaccine' ? r.hospital : r.product,
      date: r.nextDate,
      ...dueText(r.nextDate),
    });
  }
  return out.sort((a, b) => daysUntil(a.date) - daysUntil(b.date));
}
