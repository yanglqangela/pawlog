/* ============================================================
   数据层 — localStorage 持久化 + 订阅通知 + 派生计算
   ============================================================ */
import { buildSeed } from './seed.js';

const KEY = 'pawlog.state.v1';
const DAY = 86400000;

let state = null;
const listeners = new Set();

/* ---------- 日期工具 ----------
   注意：绝不能对 Date 用 toISOString() 取日期。
   它返回的是 UTC 日期，东八区的本地 00:00 会变成前一天的 16:00，
   结果就是「凌晨打开时今天变成昨天」、推算日期整体早一天。
   统一走本地时区的 parseISO / toISO，并用 setDate 做加减（顺带避开夏令时）。 */
export const toISO = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export function parseISO(iso) {
  const [y, m, d] = String(iso || '').split('-').map(Number);
  return new Date(y || 1970, (m || 1) - 1, d || 1);
}

export const todayISO = () => toISO(new Date());

/* ---------- 周期常量：用户记不住，系统替他记 ---------- */
export const CYCLE_DAYS = { 体内: 30, 体外: 30, 疫苗: 365 };

export function addDays(iso, n) {
  const d = parseISO(iso);
  d.setDate(d.getDate() + n);
  return toISO(d);
}

/** 按周期推算下次日期 */
export function suggestNext(type, kind, fromISO) {
  const days = type === 'vaccine' ? CYCLE_DAYS.疫苗 : (CYCLE_DAYS[kind] || 30);
  return addDays(fromISO, days);
}

/* ---------- 规范化：让旧版本缓存也能安全读取新字段 ---------- */
function normalize(s) {
  if (!s || typeof s !== 'object') return null;

  s.pets = (Array.isArray(s.pets) ? s.pets : []).map((p) => ({
    allergies: '', chipNo: '', hospital: '', weightGoal: null, neuteredDate: '', bio: '', color: 'brand',
    ...p,
  }));
  if (!s.pets.length) return null;

  s.records = Array.isArray(s.records) ? s.records : [];
  s.timeline = Array.isArray(s.timeline) ? s.timeline : [];
  s.friends = Array.isArray(s.friends) ? s.friends : [];
  s.posts = Array.isArray(s.posts) ? s.posts : [];
  s.activities = Array.isArray(s.activities) ? s.activities : [];
  s.joinedIds = Array.isArray(s.joinedIds) ? s.joinedIds : [];
  s.me = { name: '我', emoji: '🙂', city: '重庆', district: '北碚区', bio: '', ...(s.me || {}) };

  if (!s.pets.some((p) => p.id === s.activePetId)) s.activePetId = s.pets[0].id;
  return s;
}

function read() {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? normalize(JSON.parse(raw)) : null;
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
  state = read() || normalize(buildSeed());
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

function emit() { listeners.forEach((fn) => fn(state)); }

export function update(mutator) {
  const r = mutator(get());
  persist();
  emit();
  return r;
}

export function reset() {
  state = normalize(buildSeed());
  persist();
  emit();
}

export const uid = (p = 'x') => `${p}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

/* ---------- 备份：导出 / 导入 ---------- */
export function exportJSON() {
  return JSON.stringify(get(), null, 2);
}

export function importJSON(text) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('不是有效的 JSON 文件');
  }
  const next = normalize(parsed);
  if (!next) throw new Error('文件里没有找到宠物数据，可能不是爪迹的备份文件');
  state = next;
  persist();
  emit();
  return { pets: next.pets.length, records: next.records.length, timeline: next.timeline.length };
}

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

/** 某类记录的最新一条（驱虫需区分体内/体外） */
export function lastRecord(petId, type, kind) {
  return recordsOf(petId, type).find((r) => (kind ? r.kind === kind : true)) || null;
}

/* ---------- 时间线：自动聚合健康记录 + 手动补充的瞬间 ---------- */

const WEIGHT_ROLLUP_TITLE = (n) => `${n} 月体重记录`;

function recordToNode(r) {
  switch (r.type) {
    case 'vaccine':
      return {
        kind: 'health', ico: '💉', date: r.date, title: `接种 ${r.name}`,
        text: [r.hospital, r.batch ? `批号 ${r.batch}` : ''].filter(Boolean).join(' · '),
        tags: ['疫苗'],
      };
    case 'deworm':
      return {
        kind: 'health', ico: '🐛', date: r.date, title: `${r.kind}驱虫`,
        text: [r.product, r.nextDate ? `下次 ${r.nextDate}` : ''].filter(Boolean).join(' · '),
        tags: ['驱虫', r.kind],
      };
    case 'vet':
      return {
        kind: 'health', ico: '🏥', date: r.date, title: `就诊 · ${r.diagnosis}`,
        text: `症状：${r.symptom}\n${r.hospital}${r.cost ? ` · ¥${r.cost}` : ''}`,
        tags: ['就诊'],
      };
    case 'weight':
      return {
        kind: 'weight', ico: '⚖️', date: r.date, title: `体重 ${r.value} kg`,
        text: '', tags: ['体重'], value: r.value,
      };
    default:
      return null;
  }
}

/** 体重是连续量，逐条铺在时间轴上会变成流水账 —— 按月汇总成一条 */
function rollupWeights(records) {
  const byMonth = new Map();
  for (const r of records) {
    const key = r.date.slice(0, 7);          // YYYY-MM
    const bucket = byMonth.get(key);
    if (bucket) {
      bucket.items.push(r);
      if (r.date > bucket.date) bucket.date = r.date;
    } else {
      byMonth.set(key, { date: r.date, items: [r] });
    }
  }
  return [...byMonth.entries()].map(([key, b]) => {
    const sorted = b.items.sort((x, y) => (x.date < y.date ? -1 : 1));
    const first = sorted[0].value;
    const last = sorted[sorted.length - 1].value;
    const delta = last - first;
    const m = Number(key.slice(5, 7));
    return {
      id: `auto:weight:${key}`,
      petId: null, auto: true, kind: 'weight', ico: '⚖️',
      date: b.date,
      title: WEIGHT_ROLLUP_TITLE(m),
      text: sorted.length > 1
        ? `${sorted.length} 次记录，${first} kg → ${last} kg${delta ? `（${delta > 0 ? '+' : ''}${delta.toFixed(1)}）` : ''}`
        : `记录 ${last} kg`,
      tags: ['体重'],
      weights: sorted.map((x) => ({ date: x.date, value: x.value })),
    };
  });
}

/** 返回该宠物的完整时间线（自动节点 + 手动节点，按日期倒序） */
export function timelineOf(petId) {
  const manual = get().timeline
    .filter((t) => t.petId === petId)
    .map((t) => ({ ...t, auto: false, kind: 'moment' }));

  const auto = [];
  for (const r of recordsOf(petId)) {
    if (r.type === 'weight') continue;      // 体重单独按月汇总
    const node = recordToNode(r);
    if (node) auto.push({ id: `auto:${r.id}`, petId, auto: true, ...node });
  }
  auto.push(...rollupWeights(recordsOf(petId, 'weight')).map((n) => ({ ...n, petId })));

  return [...manual, ...auto].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}

/* ---------- 写入操作 ---------- */
export const setActivePet = (id) => update((s) => { s.activePetId = id; });

export const addRecord = (rec) => update((s) => { s.records.push({ id: uid('r'), ...rec }); });

export const addTimeline = (entry) => update((s) => { s.timeline.push({ id: uid('t'), ...entry }); });

export const updatePet = (id, patch) =>
  update((s) => { const p = s.pets.find((x) => x.id === id); if (p) Object.assign(p, patch); });

export function addPet(pet) {
  return update((s) => {
    const id = uid('p');
    s.pets.push({ allergies: '', chipNo: '', hospital: '', weightGoal: null, neuteredDate: '', bio: '', color: 'brand', ...pet, id });
    s.activePetId = id;
  });
}

export function deletePet(id) {
  return update((s) => {
    s.pets = s.pets.filter((p) => p.id !== id);
    s.records = s.records.filter((r) => r.petId !== id);
    s.timeline = s.timeline.filter((t) => t.petId !== id);
    if (s.activePetId === id) s.activePetId = s.pets[0]?.id;
  });
}

export const toggleLike = (postId) => update((s) => {
  const p = s.posts.find((x) => x.id === postId);
  if (!p) return;
  p.liked = !p.liked;
  p.likes += p.liked ? 1 : -1;
});

export const addComment = (postId, c) =>
  update((s) => { const p = s.posts.find((x) => x.id === postId); if (p) p.comments.push(c); });

export const addPost = (post) =>
  update((s) => { s.posts.unshift({ id: uid('po'), liked: false, likes: 0, comments: [], ...post }); });

/* ---------- 派生计算 ---------- */
export function ageText(birthday) {
  const days = Math.floor((Date.now() - parseISO(birthday).getTime()) / DAY);
  if (!Number.isFinite(days) || days < 0) return '—';
  const y = Math.floor(days / 365);
  const m = Math.floor((days % 365) / 30);
  if (y >= 1) return m > 0 ? `${y} 岁 ${m} 个月` : `${y} 岁`;
  return `${Math.max(m, 0)} 个月`;
}

export function daysUntil(dateStr) {
  const d = parseISO(dateStr);
  const t = new Date(); t.setHours(0, 0, 0, 0);
  return Math.round((d - t) / DAY);
}

export function dueText(dateStr) {
  const n = daysUntil(dateStr);
  if (n < 0) return { text: `已逾期 ${-n} 天`, level: 'due' };
  if (n === 0) return { text: '就是今天', level: 'due' };
  if (n <= 7) return { text: `${n} 天后`, level: 'due' };
  if (n <= 30) return { text: `${n} 天后`, level: 'soon' };
  return { text: `${n} 天后`, level: 'ok' };
}

/** 汇总待办提醒（疫苗 / 体内 / 体外驱虫），按紧急度排序 */
export function reminders(petId) {
  const out = [];
  const seen = new Set();

  for (const r of recordsOf(petId)) {
    if (!r.nextDate) continue;
    if (r.type !== 'vaccine' && r.type !== 'deworm') continue;
    const key = r.type === 'vaccine' ? 'vaccine' : `deworm:${r.kind}`;
    if (seen.has(key)) continue;              // 同类只看最新一条
    seen.add(key);
    out.push({
      id: r.id,
      type: r.type,
      kind: r.kind,
      ico: r.type === 'vaccine' ? '💉' : '🐛',
      title: r.type === 'vaccine' ? r.name : `${r.kind}驱虫`,
      sub: r.type === 'vaccine' ? r.hospital : r.product,
      date: r.nextDate,
      ...dueText(r.nextDate),
    });
  }
  return out.sort((a, b) => daysUntil(a.date) - daysUntil(b.date));
}

/** 一键顺延：把某条提醒对应的驱虫/疫苗标记为「今天做了」，自动生成新记录 */
export function completeReminder(petId, reminder, todayISO) {
  return update((s) => {
    s.records.push({
      id: uid('r'),
      petId,
      type: reminder.type,
      kind: reminder.kind,
      name: reminder.type === 'vaccine' ? reminder.title : undefined,
      date: todayISO,
      nextDate: suggestNext(reminder.type, reminder.kind, todayISO),
    });
  });
}
