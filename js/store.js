/* ============================================================
   数据层 — localStorage 持久化 + 订阅通知 + 派生计算
   M3 Node 1：schema v2 / 本机备份 / 导入校验 / CRUD / 幂等 / 跨标签同步
   ============================================================ */
import { buildSeed } from './seed.js';
import { saveBackup } from './backup.js';

const KEY_CURRENT = 'pawlog.state.v2';
const KEY_LEGACY = 'pawlog.state.v1';
const KEY_BACKUP_LAST = 'pawlog.backup.last';
const DAY = 86400000;
const RECORD_TYPES = new Set(['weight', 'vaccine', 'deworm', 'vet']);
const MAX_PETS = 50;
const MAX_RECORDS = 20000;
const MAX_LISTS = 5000;
const MAX_IMPORT_CHARS = 8_000_000;

/* 老版本数据没有 demo 标记：按已知 seed id 迁移，避免“清空演示内容”失效 */
const SEED_FRIEND_IDS = new Set(['f1', 'f2', 'f3', 'f4', 'f5', 'f6']);
const SEED_POST_IDS = new Set(['po1', 'po2', 'po3', 'po4', 'po5']);
const SEED_ACTIVITY_IDS = new Set(['a1', 'a2', 'a3']);
const SEED_PLACE_IDS = new Set(['pl_1', 'pl_2', 'pl_3', 'pl_4', 'pl_5']);

let storageKey = KEY_CURRENT;
let legacyKey = KEY_LEGACY;
let backupEnabled = true;
let state = null;
const listeners = new Set();
const statusListeners = new Set();
const externalListeners = new Set();
let storageStatus = { ok: true, error: null, at: null, persistent: null, message: '' };
let channel = null;
let globalListenersReady = false;
let persistenceAsked = false;

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

export function isValidISO(iso) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(iso || ''))) return false;
  const [y, m, d] = String(iso).split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
}

/** 本地日期时间（症状记录）：YYYY-MM-DDTHH:MM */
export function isValidDateTime(value) {
  const s = String(value || '');
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(s)) return false;
  return !Number.isNaN(new Date(s).getTime());
}

export const todayISO = () => toISO(new Date());

/** 从某天到今天的天数；无效日期返回 null（按本地日历日计算，避免 DST 误差） */
export function daysSince(iso) {
  if (!isValidISO(iso)) return null;
  const a = parseISO(iso);
  const t = new Date();
  const aUTC = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate());
  const tUTC = Date.UTC(t.getFullYear(), t.getMonth(), t.getDate());
  return Math.round((tUTC - aUTC) / DAY);
}

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

/* ---------- 小工具 ---------- */
const clone = (v) => JSON.parse(JSON.stringify(v));
const str = (v, max = 500) => (v == null ? '' : String(v).slice(0, max));
const bool = (v) => v === true || v === 'true' || v === 'on' || v === 1;
const numOr = (v, d = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
};
const dedupeById = (arr) => {
  const seen = new Set();
  return arr.filter((x) => {
    if (!x?.id || seen.has(x.id)) return false;
    seen.add(x.id);
    return true;
  });
};
const safeGet = (key) => {
  try { return localStorage.getItem(key); } catch { return null; }
};
const safeSet = (key, val) => {
  try { localStorage.setItem(key, val); return true; } catch { return false; }
};

/* ---------- 配置（测试页使用独立 key） ---------- */
export function configure(opts = {}) {
  storageKey = opts.key || KEY_CURRENT;
  legacyKey = opts.legacyKey === undefined ? KEY_LEGACY : opts.legacyKey;
  backupEnabled = opts.backupEnabled !== false;
  state = null;
  storageStatus = { ok: true, error: null, at: null, persistent: null, message: '' };
  persistenceAsked = false;
  initChannel();
  ensureGlobalListeners();
  return { storageKey, legacyKey, backupEnabled };
}

const backupNamespace = () => (storageKey.includes('test') ? 'test' : 'prod');
const backupLastKey = () => (storageKey === KEY_CURRENT ? KEY_BACKUP_LAST : `${storageKey}.backup.last`);
const corruptKey = () => (storageKey === KEY_CURRENT ? 'pawlog.corrupt' : `${storageKey}.corrupt`);

/* ---------- 规范化：让旧版本缓存也能安全读取新字段 ---------- */
function normalizeRecord(r) {
  if (!r || typeof r !== 'object') return null;
  const type = RECORD_TYPES.has(r.type) ? r.type : '';
  if (!type) return null;
  const out = {
    ...r,
    id: str(r.id, 64),
    petId: str(r.petId, 64),
    type,
    date: str(r.date, 10),
  };
  if (!out.id || !out.petId || !out.date || !isValidISO(out.date)) return null;

  if (type === 'weight') {
    // 导入/旧数据里的异常值不应把图表撑爆
    out.value = Math.min(200, Math.max(0.1, numOr(r.value, 0.1)));
  }
  if (type === 'vaccine') {
    out.name = str(r.name, 120);
    out.hospital = str(r.hospital, 120);
    out.batch = str(r.batch, 60);
    out.nextDate = isValidISO(r.nextDate) ? str(r.nextDate, 10) : '';
  }
  if (type === 'deworm') {
    out.kind = r.kind === '体外' ? '体外' : '体内';
    out.product = str(r.product, 120);
    out.nextDate = isValidISO(r.nextDate) ? str(r.nextDate, 10) : '';
  }
  if (type === 'vet') {
    out.hospital = str(r.hospital, 120);
    out.doctor = str(r.doctor, 60);
    out.symptom = str(r.symptom, 500);
    out.diagnosis = str(r.diagnosis, 300);
    out.cost = Math.min(100_000_000, Math.max(0, numOr(r.cost, 0)));
    out.followUp = isValidISO(r.followUp) ? str(r.followUp, 10) : '';
    out.medications = Array.isArray(r.medications)
      ? r.medications.map((x) => str(x, 80)).filter(Boolean).slice(0, 20)
      : [];
    out.invoiceNote = str(r.invoiceNote, 300);
  }
  if (r.fromId) out.fromId = str(r.fromId, 64);
  if (r.cycleKey) out.cycleKey = str(r.cycleKey, 120);
  return out;
}

function normalizePet(p) {
  if (!p || typeof p !== 'object') return null;
  return {
    allergies: '', chronic: '', chipNo: '', registrationNo: '',
    hospital: '', hospitalPhone: '', weightGoal: null, neuteredDate: '',
    bio: '', color: 'brand', seniorMode: false, deceased: false,
    passedDate: '', emergencyContact: '',
    feeding: '', habits: '', noGos: '',
    ...p,
    id: str(p.id, 64),
    name: str(p.name, 60),
    emoji: str(p.emoji, 8) || '🐾',
    species: str(p.species, 20),
    breed: str(p.breed, 80),
    gender: str(p.gender, 8),
    birthday: isValidISO(p.birthday) ? str(p.birthday, 10) : '',
    neutered: bool(p.neutered),
    allergies: str(p.allergies, 300),
    chronic: str(p.chronic, 300),
    chipNo: str(p.chipNo, 60),
    registrationNo: str(p.registrationNo, 60),
    hospital: str(p.hospital, 120),
    hospitalPhone: str(p.hospitalPhone, 40),
    weightGoal: p.weightGoal == null || p.weightGoal === '' ? null : numOr(p.weightGoal, null),
    neuteredDate: isValidISO(p.neuteredDate) ? str(p.neuteredDate, 10) : '',
    bio: str(p.bio, 500),
    color: str(p.color, 20) || 'brand',
    seniorMode: bool(p.seniorMode),
    deceased: bool(p.deceased),
    passedDate: isValidISO(p.passedDate) ? str(p.passedDate, 10) : '',
    emergencyContact: str(p.emergencyContact, 80),
    feeding: str(p.feeding, 300),
    habits: str(p.habits, 300),
    noGos: str(p.noGos, 300),
  };
}

function normalizeMedication(m) {
  if (!m || typeof m !== 'object') return null;
  const id = str(m.id, 64);
  const petId = str(m.petId, 64);
  const name = str(m.name, 120);
  if (!id || !petId || !name) return null;
  return {
    ...m,
    id, petId, name,
    dose: str(m.dose, 40),
    unit: str(m.unit, 20),
    frequency: str(m.frequency, 40),
    times: Array.isArray(m.times) ? m.times.map((x) => str(x, 10)).slice(0, 6) : [],
    startDate: str(m.startDate, 10),
    endDate: str(m.endDate, 10),
    reason: str(m.reason, 300),
    prescriber: str(m.prescriber, 120),
    note: str(m.note, 500),
    active: m.active === undefined ? true : bool(m.active),
  };
}

function normalizeMedicationLog(x) {
  if (!x || typeof x !== 'object') return null;
  const id = str(x.id, 64);
  const petId = str(x.petId, 64);
  const medId = str(x.medId, 64);
  const date = str(x.date, 10);
  if (!id || !petId || !medId || !date) return null;
  return {
    ...x,
    id, petId, medId, date,
    time: str(x.time, 10),
    taken: bool(x.taken),
  };
}

function normalizeSymptom(x) {
  if (!x || typeof x !== 'object') return null;
  const id = str(x.id, 64);
  const petId = str(x.petId, 64);
  const at = str(x.at, 20);
  if (!id || !petId || !at) return null;
  return {
    ...x,
    id, petId, at,
    vomiting: str(x.vomiting, 40),
    diarrhea: str(x.diarrhea, 40),
    appetite: str(x.appetite, 40),
    energy: str(x.energy, 40),
    water: str(x.water, 40),
    urination: str(x.urination, 40),
    breathing: str(x.breathing, 40),
    pain: Math.min(5, Math.max(0, numOr(x.pain, 0))),
    note: str(x.note, 800),
    redFlags: Array.isArray(x.redFlags) ? x.redFlags.map((f) => str(f, 60)).slice(0, 10) : [],
  };
}

function normalizeExpense(x) {
  if (!x || typeof x !== 'object') return null;
  const id = str(x.id, 64);
  const petId = str(x.petId, 64);
  const date = str(x.date, 10);
  if (!id || !petId || !date) return null;
  return {
    ...x,
    id, petId, date,
    category: str(x.category, 40) || '其他',
    amount: Math.max(0, numOr(x.amount, 0)),
    note: str(x.note, 300),
    recordId: str(x.recordId, 64),
  };
}

function normalizePolicy(x) {
  if (!x || typeof x !== 'object') return null;
  const id = str(x.id, 64);
  const petId = str(x.petId, 64);
  const company = str(x.company, 80);
  if (!id || !petId || !company) return null;
  return {
    ...x,
    id, petId, company,
    policyNo: str(x.policyNo, 80),
    start: str(x.start, 10),
    end: str(x.end, 10),
    coverage: str(x.coverage, 500),
    claimPhone: str(x.claimPhone, 40),
    note: str(x.note, 500),
  };
}

function normalizeQol(x) {
  if (!x || typeof x !== 'object') return null;
  const id = str(x.id, 64);
  const petId = str(x.petId, 64);
  const date = str(x.date, 10);
  if (!id || !petId || !isValidISO(date)) return null;
  const keys = ['hurt', 'hunger', 'hydration', 'hygiene', 'happiness', 'mobility', 'goodDays'];
  const scores = {};
  for (const k of keys) scores[k] = Math.min(10, Math.max(0, numOr(x.scores?.[k], 0)));
  const total = (10 - scores.hurt) + scores.hunger + scores.hydration + scores.hygiene
    + scores.happiness + scores.mobility + scores.goodDays;
  return {
    ...x, id, petId, date, scores, total,
    note: str(x.note, 500),
  };
}

function normalize(s) {
  if (!s || typeof s !== 'object') return null;

  const pets = dedupeById((Array.isArray(s.pets) ? s.pets : []).map(normalizePet).filter(Boolean));
  if (!pets.length) return null;
  const petIds = new Set(pets.map((p) => p.id));

  const records = dedupeById(
    (Array.isArray(s.records) ? s.records : []).map(normalizeRecord).filter(Boolean)
  ).filter((r) => petIds.has(r.petId)).slice(0, MAX_RECORDS);

  const timeline = dedupeById(
    (Array.isArray(s.timeline) ? s.timeline : []).map((t) => {
      if (!t || typeof t !== 'object') return null;
      return {
        ...t,
        id: str(t.id, 64),
        petId: str(t.petId, 64),
        date: str(t.date, 10),
        title: str(t.title, 120),
        text: str(t.text, 2000),
        photos: Array.isArray(t.photos) ? t.photos.map((x) => str(x, 8)).filter(Boolean).slice(0, 6) : [],
        tags: Array.isArray(t.tags) ? t.tags.map((x) => str(x, 30)).filter(Boolean).slice(0, 12) : [],
        milestone: bool(t.milestone),
      };
    }).filter((t) => t && t.id && t.petId && t.date && isValidISO(t.date) && t.title)
  ).filter((t) => petIds.has(t.petId)).slice(0, MAX_LISTS);

  const friends = dedupeById((Array.isArray(s.friends) ? s.friends : []).map((f) => ({
    ...f,
    id: str(f?.id, 64),
    name: str(f?.name, 60),
    emoji: str(f?.emoji, 8) || '🐾',
    city: str(f?.city, 40),
    district: str(f?.district, 40),
    distance: Math.max(0, numOr(f?.distance, 0)),
    pets: Array.isArray(f?.pets)
      ? f.pets.map((p) => ({ name: str(p?.name, 40), species: str(p?.species, 20), breed: str(p?.breed, 60) }))
      : [],
    bio: str(f?.bio, 500),
    tags: Array.isArray(f?.tags) ? f.tags.map((x) => str(x, 30)).filter(Boolean).slice(0, 12) : [],
    posts: Math.max(0, numOr(f?.posts, 0)),
    demo: bool(f?.demo) || SEED_FRIEND_IDS.has(str(f?.id, 64)),
  })).filter((f) => f.id));

  const posts = dedupeById((Array.isArray(s.posts) ? s.posts : []).map((p) => ({
    ...p,
    id: str(p?.id, 64),
    author: str(p?.author, 64),
    name: str(p?.name, 60),
    emoji: str(p?.emoji, 8) || '🙂',
    city: str(p?.city, 60),
    time: str(p?.time, 10),
    text: str(p?.text, 4000),
    imgs: Array.isArray(p?.imgs) ? p.imgs.map((x) => str(x, 8)).filter(Boolean).slice(0, 6) : [],
    tags: Array.isArray(p?.tags) ? p.tags.map((x) => str(x, 30)).filter(Boolean).slice(0, 8) : [],
    likes: Math.max(0, numOr(p?.likes, 0)),
    liked: bool(p?.liked),
    comments: Array.isArray(p?.comments)
      ? p.comments.map((c) => ({ name: str(c?.name, 60), text: str(c?.text, 800), time: str(c?.time, 10) }))
      : [],
    demo: bool(p?.demo) || SEED_POST_IDS.has(str(p?.id, 64)),
  })).filter((p) => p.id).slice(0, MAX_LISTS));

  const activities = dedupeById((Array.isArray(s.activities) ? s.activities : []).map((a) => ({
    ...a,
    id: str(a?.id, 64),
    title: str(a?.title, 120),
    host: str(a?.host, 60),
    emoji: str(a?.emoji, 8) || '🐾',
    city: str(a?.city, 40),
    district: str(a?.district, 40),
    date: str(a?.date, 10),
    time: str(a?.time, 10),
    joined: Math.max(0, numOr(a?.joined, 0)),
    cap: Math.max(0, numOr(a?.cap, 0)),
    tags: Array.isArray(a?.tags) ? a.tags.map((x) => str(x, 30)).filter(Boolean).slice(0, 8) : [],
    demo: bool(a?.demo) || SEED_ACTIVITY_IDS.has(str(a?.id, 64)),
  })).filter((a) => a.id));

  const places = dedupeById(
    (Array.isArray(s.places) ? s.places : []).map((x) => ({
      ...x,
      id: str(x?.id, 64),
      name: str(x?.name, 80),
      type: str(x?.type, 40) || '其他',
      city: str(x?.city, 40),
      district: str(x?.district, 40),
      address: str(x?.address, 160),
      note: str(x?.note, 300),
      source: str(x?.source, 80),
      demo: bool(x?.demo) || SEED_PLACE_IDS.has(str(x?.id, 64)),
    })).filter((x) => x.id && x.name)
  );

  const medications = dedupeById(
    (Array.isArray(s.medications) ? s.medications : []).map(normalizeMedication).filter(Boolean)
  ).filter((m) => petIds.has(m.petId));

  const medicationLogs = dedupeById(
    (Array.isArray(s.medicationLogs) ? s.medicationLogs : []).map(normalizeMedicationLog).filter(Boolean)
  ).filter((x) => petIds.has(x.petId));

  const symptoms = dedupeById(
    (Array.isArray(s.symptoms) ? s.symptoms : []).map(normalizeSymptom).filter(Boolean)
  ).filter((x) => petIds.has(x.petId));

  const qol = dedupeById(
    (Array.isArray(s.qol) ? s.qol : []).map(normalizeQol).filter(Boolean)
  ).filter((x) => petIds.has(x.petId));

  const expenses = dedupeById(
    (Array.isArray(s.expenses) ? s.expenses : []).map(normalizeExpense).filter(Boolean)
  ).filter((x) => petIds.has(x.petId));

  const policies = dedupeById(
    (Array.isArray(s.policies) ? s.policies : []).map(normalizePolicy).filter(Boolean)
  ).filter((x) => petIds.has(x.petId));

  const activePetId = pets.some((p) => p.id === s.activePetId) ? s.activePetId : pets[0].id;

  let lost = s.lost && typeof s.lost === 'object'
    ? {
        petId: str(s.lost.petId, 64),
        active: bool(s.lost.active),
        lastSeenAt: str(s.lost.lastSeenAt, 20),
        place: str(s.lost.place, 200),
        contact: str(s.lost.contact, 80),
        note: str(s.lost.note, 500),
      }
    : null;
  if (lost && !petIds.has(lost.petId)) lost = null;

  return {
    schemaVersion: 2,
    meta: {
      updatedAt: str(s.meta?.updatedAt, 40),
      lastBackupAt: str(s.meta?.lastBackupAt, 40),
      demo: s.meta?.demo !== false,
      rev: Math.max(0, numOr(s.meta?.rev, 0)),
    },
    settings: {
      largeText: bool(s.settings?.largeText),
      aiEnabled: bool(s.settings?.aiEnabled),
    },
    pets,
    records,
    timeline,
    friends,
    posts,
    activities,
    places,
    medications,
    medicationLogs,
    symptoms,
    qol,
    expenses,
    policies,
    lost,
    joinedIds: Array.isArray(s.joinedIds) ? s.joinedIds.map((x) => str(x, 64)).filter(Boolean) : [],
    me: {
      name: '我', emoji: '🙂', city: '重庆', district: '北碚区', bio: '',
      ...(s.me && typeof s.me === 'object' ? s.me : {}),
      name: str(s.me?.name, 40) || '我',
      emoji: str(s.me?.emoji, 8) || '🙂',
      city: str(s.me?.city, 40) || '重庆',
      district: str(s.me?.district, 40) || '北碚区',
      bio: str(s.me?.bio, 300),
    },
    activePetId,
  };
}

/* ---------- 读取 / 写入 ---------- */
function preserveCorrupt(raw) {
  try { safeSet(corruptKey(), raw); } catch { /* ignore */ }
  setStatus({
    ok: false,
    error: 'corrupt',
    at: Date.now(),
    message: '本地数据损坏，已保留副本并尝试恢复；如仍异常请在「我的」导入备份',
  });
}

function parseRaw(raw) {
  if (!raw) return null;
  try {
    return normalize(JSON.parse(raw));
  } catch {
    return null;
  }
}

function readState() {
  const rawCurrent = safeGet(storageKey);
  if (rawCurrent) {
    const parsed = parseRaw(rawCurrent);
    if (parsed) return { state: parsed, source: 'current' };
    preserveCorrupt(rawCurrent);
  }

  if (legacyKey && legacyKey !== storageKey) {
    const rawLegacy = safeGet(legacyKey);
    if (rawLegacy) {
      const parsed = parseRaw(rawLegacy);
      if (parsed) return { state: parsed, source: 'legacy' };
      preserveCorrupt(rawLegacy);
    }
  }

  return { state: null, source: 'none' };
}

function setStatus(patch) {
  storageStatus = { ...storageStatus, ...patch };
  for (const fn of statusListeners) {
    try { fn(storageStatus); } catch { /* listen 失败不影响主流程 */ }
  }
}

function maybeRequestPersistence() {
  if (persistenceAsked) return;
  if (typeof navigator === 'undefined' || !navigator.storage?.persist) return;
  persistenceAsked = true;
  navigator.storage.persist().then(
    (granted) => setStatus({ persistent: !!granted }),
    () => {},
  );
}

export async function requestPersistence() {
  if (typeof navigator === 'undefined' || !navigator.storage?.persist) return null;
  try {
    const granted = await navigator.storage.persist();
    setStatus({ persistent: !!granted });
    return granted;
  } catch {
    return null;
  }
}

function persist() {
  if (!state) return false;
  try {
    localStorage.setItem(storageKey, JSON.stringify(state));
    setStatus({ ok: true, error: null, at: Date.now(), message: '' });
    maybeRequestPersistence();
    return true;
  } catch (e) {
    setStatus({
      ok: false,
      error: e?.name || 'Error',
      at: Date.now(),
      message: '本次修改未保存：存储空间不足或处于无痕模式',
    });
    return false;
  }
}

export function onStorageStatus(fn) {
  statusListeners.add(fn);
  try { fn(storageStatus); } catch { /* ignore */ }
  return () => statusListeners.delete(fn);
}

export function getStorageStatus() {
  return { ...storageStatus };
}

/* ---------- 跨标签页同步 ---------- */
function ensureGlobalListeners() {
  if (globalListenersReady || typeof window === 'undefined') return;
  globalListenersReady = true;
  // 始终监听 storage；BroadcastChannel 可用时也会触发，reloadFromStorage 会去重
  window.addEventListener('storage', (e) => {
    if (e.key === storageKey) reloadFromStorage({ type: 'storage' });
  });
}

function initChannel() {
  if (typeof window === 'undefined' || typeof BroadcastChannel === 'undefined') return;
  try {
    if (channel) channel.close();
    channel = new BroadcastChannel('pawlog.sync');
    channel.onmessage = (e) => {
      if (e.data?.key !== storageKey) return;
      reloadFromStorage(e.data);
    };
  } catch {
    channel = null;
  }
}

function reloadFromStorage(data = null) {
  const r = readState();
  if (!r.state) return false;

  // 按 revision 去重：BroadcastChannel 可能先于 storage 事件到达。
  // 如果先读到旧 rev，直接跳过；稍后 storage 事件带来更高 rev 时再处理。
  const nextRev = r.state.meta?.rev || 0;
  const curRev = state?.meta?.rev || 0;
  if (nextRev <= curRev) return false;

  state = r.state;
  emit();

  // 无论走 BroadcastChannel 还是 storage 事件，都要通知 UI 重绘
  const payload = data || { type: 'external' };
  for (const fn of externalListeners) {
    try { fn(payload); } catch { /* ignore */ }
  }
  return true;
}

function broadcast(extra = {}) {
  try {
    channel?.postMessage({ ...extra, key: storageKey, at: Date.now(), rev: state?.meta?.rev || 0 });
  } catch { /* ignore */ }
}

export function onExternalUpdate(fn) {
  externalListeners.add(fn);
  return () => externalListeners.delete(fn);
}

/* ---------- 备份 ---------- */
function backupSync(reason, { idb = true } = {}) {
  if (!state) return null;
  const snapshot = { at: Date.now(), reason, state: clone(state) };
  snapshot.saved = safeSet(backupLastKey(), JSON.stringify(snapshot));
  if (idb && backupEnabled) {
    saveBackup(snapshot.state, reason, { namespace: backupNamespace() }).catch(() => {});
  }
  return snapshot;
}

function snapshotAsync(prev, reason = 'auto') {
  if (!backupEnabled || !prev) return;
  saveBackup(prev, reason, { namespace: backupNamespace() }).catch(() => {});
}

/** 手动创建一份备份（写入 localStorage 最后一版 + IndexedDB 历史） */
export async function backupNow(reason = 'manual') {
  const snap = backupSync(reason, { idb: false });
  if (!snap) return { ok: false, reason: 'no-state' };
  if (!snap.saved) return { ok: false, reason: 'localstorage', at: snap.at };
  const saved = await saveBackup(snap.state, reason, { namespace: backupNamespace() });
  return {
    ok: !!saved,
    reason: saved ? null : 'idb',
    at: snap.at,
  };
}

export function lastBackupInfo() {
  try {
    const b = JSON.parse(safeGet(backupLastKey()) || 'null');
    return b ? { at: b.at, reason: b.reason } : null;
  } catch {
    return null;
  }
}

/* ---------- 初始化 ---------- */
export function init() {
  ensureGlobalListeners();
  initChannel();
  const r = readState();
  state = r.state || normalize(buildSeed());
  if (r.source === 'legacy' && r.state) persist(); // 旧 key 平滑迁移到 v2
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
  for (const fn of listeners) {
    try { fn(state); } catch (e) { console.error('[store] listener failed', e); }
  }
}

export function update(mutator) {
  // 如果另一个标签页已经写了更新的版本，先采用它，避免用旧快照覆盖
  const stored = readState();
  if (stored.state && (stored.state.meta?.rev || 0) > (state?.meta?.rev || 0)) {
    state = stored.state;
  }

  const current = get();
  const prev = clone(current);
  const draft = clone(current);
  const result = mutator(draft);
  draft.meta = {
    ...(draft.meta || {}),
    rev: (current.meta?.rev || 0) + 1,
    updatedAt: new Date().toISOString(),
  };
  state = draft;
  const ok = persist();
  if (ok) {
    snapshotAsync(prev, 'auto');
    broadcast({ type: 'update' });
  }
  emit();
  return result;
}

export function reset() {
  const pre = backupSync('before-reset');
  if (!pre?.saved) {
    setStatus({ ok: false, error: 'backup-failed', message: '无法创建重置前备份，已取消重置' });
    return { ok: false, reason: 'backup-failed' };
  }
  const prev = state;
  const next = normalize(buildSeed());
  next.meta.rev = (prev?.meta?.rev || 0) + 1;
  state = next;
  const ok = persist();
  if (!ok) {
    state = prev;
    emit();
    return { ok: false, reason: 'persist-failed' };
  }
  emit();
  broadcast({ type: 'reset' });
  return { ok: true };
}

export const uid = (p = 'x') => `${p}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

/* ---------- 备份：导出 / 导入 ---------- */
export function exportJSON() {
  return JSON.stringify(get(), null, 2);
}

function parseText(text) {
  if (text && typeof text === 'object') return text;
  const raw = String(text ?? '');
  if (raw.length > MAX_IMPORT_CHARS) throw new Error('文件过大，已拒绝导入');
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error('不是有效的 JSON 文件');
  }
}

/** 导入前校验：只做结构校验，不改数据 */
export function validateState(s) {
  if (!s || typeof s !== 'object' || Array.isArray(s)) throw new Error('文件内容不是爪迹备份');
  if (!Array.isArray(s.pets) || s.pets.length === 0) throw new Error('文件里没有找到宠物数据，可能不是爪迹的备份文件');
  if (s.pets.length > MAX_PETS) throw new Error(`宠物数量异常（${s.pets.length}），已拒绝导入`);

  const petIds = new Set();
  for (const p of s.pets) {
    if (!p || typeof p !== 'object') throw new Error('宠物数据格式错误');
    if (typeof p.id !== 'string' || !p.id) throw new Error('宠物缺少 id');
    if (typeof p.name !== 'string' || !p.name) throw new Error('宠物缺少名字');
    if (typeof p.species !== 'string' || !p.species) throw new Error(`宠物「${p.name}」缺少种类`);
    if (p.birthday && !isValidISO(p.birthday)) throw new Error(`宠物「${p.name}」出生日期无效`);
    if (p.neuteredDate && !isValidISO(p.neuteredDate)) throw new Error(`宠物「${p.name}」绝育日期无效`);
    if (p.passedDate && !isValidISO(p.passedDate)) throw new Error(`宠物「${p.name}」离开日期无效`);
    if (petIds.has(p.id)) throw new Error(`宠物 id 重复：${p.id}`);
    petIds.add(p.id);
  }

  const optionalArrays = ['records', 'timeline', 'friends', 'posts', 'activities', 'places', 'medications',
    'medicationLogs', 'symptoms', 'qol', 'expenses', 'policies'];
  for (const k of optionalArrays) {
    if (s[k] != null && !Array.isArray(s[k])) throw new Error(`字段 ${k} 应该是数组`);
  }
  if (s.joinedIds != null && !Array.isArray(s.joinedIds)) throw new Error('字段 joinedIds 应该是数组');

  const records = Array.isArray(s.records) ? s.records : [];
  if (records.length > MAX_RECORDS) throw new Error('健康记录数量异常，已拒绝导入');
  const recordIds = new Set();
  for (const r of records) {
    if (!r || typeof r !== 'object') throw new Error('健康记录格式错误');
    if (typeof r.id !== 'string' || !r.id) throw new Error('健康记录缺少 id');
    if (typeof r.petId !== 'string' || !r.petId) throw new Error('健康记录缺少 petId');
    if (typeof r.date !== 'string' || !isValidISO(r.date)) throw new Error(`健康记录日期无效：${r.date || '空'}`);
    if (!RECORD_TYPES.has(r.type)) throw new Error(`未知的健康记录类型：${r.type}`);
    if (r.nextDate && !isValidISO(r.nextDate)) throw new Error('下次日期无效');
    if (r.type === 'weight') {
      const v = Number(r.value);
      if (!Number.isFinite(v) || v <= 0 || v > 200) throw new Error('体重值超出合理范围（0–200kg）');
    }
    if (r.type === 'vet' && r.cost != null) {
      const c = Number(r.cost);
      if (!Number.isFinite(c) || c < 0 || c > 100_000_000) throw new Error('费用值超出合理范围');
    }
    if (recordIds.has(r.id)) throw new Error(`健康记录 id 重复：${r.id}`);
    recordIds.add(r.id);
    if (!petIds.has(r.petId)) throw new Error(`健康记录引用了不存在的宠物：${r.petId}`);
  }

  const timeline = Array.isArray(s.timeline) ? s.timeline : [];
  if (timeline.length > MAX_LISTS) throw new Error('成长记录数量异常，已拒绝导入');
  const timelineIds = new Set();
  for (const t of timeline) {
    if (!t || typeof t !== 'object') throw new Error('成长记录格式错误');
    if (typeof t.id !== 'string' || !t.id) throw new Error('成长记录缺少 id');
    if (typeof t.petId !== 'string' || !t.petId) throw new Error('成长记录缺少 petId');
    if (typeof t.date !== 'string' || !isValidISO(t.date)) throw new Error('成长记录日期无效');
    if (typeof t.title !== 'string' || !t.title) throw new Error('成长记录缺少标题');
    if (timelineIds.has(t.id)) throw new Error(`成长记录 id 重复：${t.id}`);
    timelineIds.add(t.id);
    if (!petIds.has(t.petId)) throw new Error(`成长记录引用了不存在的宠物：${t.petId}`);
  }

  const posts = Array.isArray(s.posts) ? s.posts : [];
  if (posts.length > MAX_LISTS) throw new Error('动态数量异常，已拒绝导入');
  const postIds = new Set();
  for (const p of posts) {
    if (!p || typeof p !== 'object') throw new Error('动态格式错误');
    if (typeof p.id !== 'string' || !p.id) throw new Error('动态缺少 id');
    if (typeof p.text !== 'string') throw new Error('动态缺少内容');
    if (p.time && !isValidISO(p.time)) throw new Error('动态日期无效');
    if (p.comments != null && !Array.isArray(p.comments)) throw new Error('评论数据格式错误');
    if (postIds.has(p.id)) throw new Error(`动态 id 重复：${p.id}`);
    postIds.add(p.id);
  }

  const checkPet = (x, label) => {
    if (typeof x.petId !== 'string' || !x.petId) throw new Error(`${label}缺少 petId`);
    if (!petIds.has(x.petId)) throw new Error(`${label}引用了不存在的宠物：${x.petId}`);
  };
  const checkUnique = (seen, id, label) => {
    if (seen.has(id)) throw new Error(`${label} id 重复：${id}`);
    seen.add(id);
  };

  const uniqueList = (arr, label) => {
    if (!Array.isArray(arr)) return;
    if (arr.length > MAX_LISTS) throw new Error(`${label}数量异常，已拒绝导入`);
    const seen = new Set();
    for (const x of arr) {
      if (!x || typeof x !== 'object') throw new Error(`${label}格式错误`);
      if (typeof x.id !== 'string' || !x.id) throw new Error(`${label}缺少 id`);
      checkUnique(seen, x.id, label);
    }
  };
  uniqueList(s.friends, '宠友');
  uniqueList(s.activities, '活动');

  if (Array.isArray(s.places)) {
    if (s.places.length > MAX_LISTS) throw new Error('地点数量异常，已拒绝导入');
    const ids = new Set();
    for (const x of s.places) {
      if (!x || typeof x !== 'object') throw new Error('地点格式错误');
      if (typeof x.id !== 'string' || !x.id) throw new Error('地点缺少 id');
      if (typeof x.name !== 'string' || !x.name) throw new Error('地点缺少名称');
      checkUnique(ids, x.id, '地点');
    }
  }

  const medIds = new Set();
  if (Array.isArray(s.medications)) {
    if (s.medications.length > MAX_LISTS) throw new Error('用药数量异常，已拒绝导入');
    for (const m of s.medications) {
      if (!m || typeof m !== 'object') throw new Error('用药格式错误');
      if (typeof m.id !== 'string' || !m.id) throw new Error('用药缺少 id');
      if (typeof m.name !== 'string' || !m.name) throw new Error('用药缺少药名');
      checkPet(m, '用药');
      if (m.startDate && !isValidISO(m.startDate)) throw new Error('用药开始日期无效');
      if (m.endDate && !isValidISO(m.endDate)) throw new Error('用药结束日期无效');
      if (m.times != null && !Array.isArray(m.times)) throw new Error('用药时间格式错误');
      checkUnique(medIds, m.id, '用药');
    }
  }

  if (Array.isArray(s.medicationLogs)) {
    if (s.medicationLogs.length > MAX_LISTS) throw new Error('用药记录数量异常，已拒绝导入');
    const logIds = new Set();
    for (const l of s.medicationLogs) {
      if (!l || typeof l !== 'object') throw new Error('用药记录格式错误');
      if (typeof l.id !== 'string' || !l.id) throw new Error('用药记录缺少 id');
      checkPet(l, '用药记录');
      if (typeof l.medId !== 'string' || !medIds.has(l.medId)) throw new Error('用药记录引用了不存在的用药');
      if (!isValidISO(l.date)) throw new Error('用药记录日期无效');
      checkUnique(logIds, l.id, '用药记录');
    }
  }

  if (Array.isArray(s.symptoms)) {
    if (s.symptoms.length > MAX_LISTS) throw new Error('症状数量异常，已拒绝导入');
    const ids = new Set();
    for (const x of s.symptoms) {
      if (!x || typeof x !== 'object') throw new Error('症状格式错误');
      if (typeof x.id !== 'string' || !x.id) throw new Error('症状缺少 id');
      checkPet(x, '症状');
      if (!isValidDateTime(x.at)) throw new Error('症状时间无效');
      if (x.pain != null && !Number.isFinite(Number(x.pain))) throw new Error('症状疼痛值无效');
      checkUnique(ids, x.id, '症状');
    }
  }

  if (Array.isArray(s.qol)) {
    if (s.qol.length > MAX_LISTS) throw new Error('生活质量评分数量异常，已拒绝导入');
    const ids = new Set();
    for (const x of s.qol) {
      if (!x || typeof x !== 'object') throw new Error('生活质量评分格式错误');
      if (typeof x.id !== 'string' || !x.id) throw new Error('生活质量评分缺少 id');
      checkPet(x, '生活质量评分');
      if (!isValidISO(x.date)) throw new Error('生活质量评分日期无效');
      if (!x.scores || typeof x.scores !== 'object' || Array.isArray(x.scores)) {
        throw new Error('生活质量评分缺少分数');
      }
      for (const k of ['hurt', 'hunger', 'hydration', 'hygiene', 'happiness', 'mobility', 'goodDays']) {
        const v = Number(x.scores[k]);
        if (!Number.isFinite(v) || v < 0 || v > 10) throw new Error('生活质量评分分数无效');
      }
      checkUnique(ids, x.id, '生活质量评分');
    }
  }

  if (Array.isArray(s.expenses)) {
    if (s.expenses.length > MAX_LISTS) throw new Error('费用数量异常，已拒绝导入');
    const ids = new Set();
    for (const x of s.expenses) {
      if (!x || typeof x !== 'object') throw new Error('费用格式错误');
      if (typeof x.id !== 'string' || !x.id) throw new Error('费用缺少 id');
      checkPet(x, '费用');
      if (!isValidISO(x.date)) throw new Error('费用日期无效');
      const amount = Number(x.amount);
      if (!Number.isFinite(amount) || amount < 0 || amount > 100_000_000) throw new Error('费用金额无效');
      checkUnique(ids, x.id, '费用');
    }
  }

  if (Array.isArray(s.policies)) {
    if (s.policies.length > MAX_LISTS) throw new Error('保单数量异常，已拒绝导入');
    const ids = new Set();
    for (const x of s.policies) {
      if (!x || typeof x !== 'object') throw new Error('保单格式错误');
      if (typeof x.id !== 'string' || !x.id) throw new Error('保单缺少 id');
      if (typeof x.company !== 'string' || !x.company) throw new Error('保单缺少保险公司');
      checkPet(x, '保单');
      if (x.start && !isValidISO(x.start)) throw new Error('保单生效日期无效');
      if (x.end && !isValidISO(x.end)) throw new Error('保单到期日期无效');
      checkUnique(ids, x.id, '保单');
    }
  }

  if (s.joinedIds != null && !s.joinedIds.every((x) => typeof x === 'string')) {
    throw new Error('报名数据格式错误');
  }

  return true;
}

export function previewImport(text) {
  const parsed = parseText(text);
  validateState(parsed);
  const next = normalize(parsed);
  if (!next) throw new Error('文件里没有可用的宠物数据');
  return {
    pets: next.pets.length,
    records: next.records.length,
    timeline: next.timeline.length,
    posts: next.posts.length,
    medications: next.medications.length,
    symptoms: next.symptoms.length,
    expenses: next.expenses.length,
    policies: next.policies.length,
    qol: next.qol.length,
    places: next.places.length,
  };
}

function mergeById(current, incoming) {
  const map = new Map((current || []).map((x) => [x.id, x]));
  for (const x of incoming || []) if (x?.id) map.set(x.id, x);
  return [...map.values()];
}

function mergeStates(current, incoming) {
  const out = clone(current);
  out.pets = mergeById(current.pets, incoming.pets);
  out.records = mergeById(current.records, incoming.records);
  out.timeline = mergeById(current.timeline, incoming.timeline);
  out.friends = mergeById(current.friends, incoming.friends);
  out.posts = mergeById(current.posts, incoming.posts);
  out.activities = mergeById(current.activities, incoming.activities);
  out.places = mergeById(current.places, incoming.places);
  out.joinedIds = [...new Set([...(current.joinedIds || []), ...(incoming.joinedIds || [])])];
  out.medications = mergeById(current.medications, incoming.medications);
  out.medicationLogs = mergeById(current.medicationLogs, incoming.medicationLogs);
  out.symptoms = mergeById(current.symptoms, incoming.symptoms);
  out.qol = mergeById(current.qol, incoming.qol);
  out.expenses = mergeById(current.expenses, incoming.expenses);
  out.policies = mergeById(current.policies, incoming.policies);
  if (!out.lost && incoming.lost) out.lost = incoming.lost;
  return normalize(out);
}

export function importJSON(text, opts = {}) {
  const mode = opts.mode === 'merge' ? 'merge' : 'replace';
  const parsed = parseText(text);
  validateState(parsed);
  const incoming = normalize(parsed);
  if (!incoming) throw new Error('文件里没有可用的宠物数据');

  const pre = backupSync('before-import');
  if (!pre?.saved) throw new Error('无法创建导入前备份，已取消导入');

  const prev = state;
  const next = mode === 'merge' ? mergeStates(get(), incoming) : incoming;
  if (!next) throw new Error('合并失败：没有可用的宠物数据');
  next.meta.rev = Math.max(prev?.meta?.rev || 0, next.meta?.rev || 0) + 1;

  state = next;
  const ok = persist();
  if (!ok) {
    state = prev;
    throw new Error('写入失败，已回滚到导入前的数据');
  }

  emit();
  broadcast({ type: 'import', mode });
  return {
    pets: next.pets.length,
    records: next.records.length,
    timeline: next.timeline.length,
    mode,
  };
}

export function restoreState(snapshotState) {
  validateState(snapshotState);
  const incoming = normalize(snapshotState);
  if (!incoming) throw new Error('备份内容不可用');
  const pre = backupSync('before-restore');
  if (!pre?.saved) throw new Error('无法创建恢复前备份，已取消恢复');
  const prev = state;
  incoming.meta.rev = Math.max(prev?.meta?.rev || 0, incoming.meta?.rev || 0) + 1;
  state = incoming;
  const ok = persist();
  if (!ok) {
    state = prev;
    throw new Error('写入失败，已回滚到恢复前的数据');
  }
  emit();
  broadcast({ type: 'restore' });
  return { pets: incoming.pets.length, records: incoming.records.length };
}

export function restoreLastBackup() {
  let b = null;
  try { b = JSON.parse(safeGet(backupLastKey()) || 'null'); } catch { /* ignore */ }
  if (!b?.state) throw new Error('还没有可恢复的本机备份');
  return restoreState(b.state);
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
    .sort((a, b) => {
      if (a.date === b.date) return a.id < b.id ? 1 : -1;
      return a.date < b.date ? 1 : -1;
    });

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
        kind: 'health', ico: '💉', date: r.date, title: `接种 ${r.name || '疫苗'}`,
        text: [r.hospital, r.batch ? `批号 ${r.batch}` : ''].filter(Boolean).join(' · '),
        tags: ['疫苗'], sourceId: r.id,
      };
    case 'deworm':
      return {
        kind: 'health', ico: '🐛', date: r.date, title: `${r.kind}驱虫`,
        text: [r.product, r.nextDate ? `下次 ${r.nextDate}` : ''].filter(Boolean).join(' · '),
        tags: ['驱虫', r.kind], sourceId: r.id,
      };
    case 'vet':
      return {
        kind: 'health', ico: '🏥', date: r.date, title: `就诊 · ${r.diagnosis || '未填写'}`,
        text: `症状：${r.symptom || '—'}\n${r.hospital || ''}${r.cost ? ` · ¥${r.cost}` : ''}`,
        tags: ['就诊'], sourceId: r.id,
      };
    case 'weight':
      return {
        kind: 'weight', ico: '⚖️', date: r.date, title: `体重 ${r.value} kg`,
        text: '', tags: ['体重'], value: r.value, sourceId: r.id,
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
      sourceId: null,
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

  return [...manual, ...auto].sort((a, b) => {
    if (a.date === b.date) return a.id < b.id ? 1 : -1;
    return a.date < b.date ? 1 : -1;
  });
}

/* ---------- 写入操作 ---------- */
export const setActivePet = (id) => {
  if (!get().pets.some((p) => p.id === id)) return false;
  return update((s) => { s.activePetId = id; });
};

export function addRecord(rec) {
  const clean = normalizeRecord({ ...rec, id: rec.id || uid('r') });
  if (!clean) throw new Error('记录格式无效');
  if (!get().pets.some((p) => p.id === clean.petId)) throw new Error('宠物不存在，请刷新页面');
  return update((s) => {
    s.records.push(clean);
    return clean;
  });
}

export function updateRecord(id, patch) {
  return update((s) => {
    const i = s.records.findIndex((r) => r.id === id);
    if (i < 0) return null;
    const next = normalizeRecord({ ...s.records[i], ...patch, id });
    if (!next) return null;
    if (!s.pets.some((p) => p.id === next.petId)) return null;
    s.records[i] = next;
    return next;
  });
}

export function deleteRecord(id) {
  let deleted = null;
  update((s) => {
    const i = s.records.findIndex((r) => r.id === id);
    if (i >= 0) {
      deleted = s.records[i];
      s.records.splice(i, 1);
    }
  });
  return deleted;
}

export function restoreRecord(rec) {
  const clean = normalizeRecord(rec);
  if (!clean) throw new Error('记录格式无效');
  if (!get().pets.some((p) => p.id === clean.petId)) throw new Error('宠物不存在，无法恢复记录');
  return update((s) => {
    if (!s.records.some((r) => r.id === clean.id)) s.records.push(clean);
    return clean;
  });
}

/* ---------- 症状 ---------- */
export const symptomsOf = (petId) => get().symptoms
  .filter((s) => s.petId === petId)
  .sort((a, b) => (a.at < b.at ? 1 : -1));

export function addSymptom(s) {
  const item = normalizeSymptom({ ...s, id: s.id || uid('sy') });
  if (!item) throw new Error('症状记录格式无效');
  if (!get().pets.some((p) => p.id === item.petId)) throw new Error('宠物不存在，请刷新页面');
  return update((st) => { st.symptoms.push(item); return item; });
}

export function updateSymptom(id, patch) {
  return update((st) => {
    const i = st.symptoms.findIndex((x) => x.id === id);
    if (i < 0) return null;
    const next = normalizeSymptom({ ...st.symptoms[i], ...patch, id });
    if (!next) return null;
    st.symptoms[i] = next;
    return next;
  });
}

export function deleteSymptom(id) {
  let deleted = null;
  update((st) => {
    const i = st.symptoms.findIndex((x) => x.id === id);
    if (i >= 0) { deleted = st.symptoms[i]; st.symptoms.splice(i, 1); }
  });
  return deleted;
}

export function restoreSymptom(item) {
  const clean = normalizeSymptom(item);
  if (!clean) throw new Error('症状记录格式无效');
  return update((st) => {
    if (!st.symptoms.some((x) => x.id === clean.id)) st.symptoms.push(clean);
    return clean;
  });
}

/* ---------- 用药 ---------- */
export const medicationsOf = (petId) => get().medications
  .filter((m) => m.petId === petId)
  .sort((a, b) => (Number(b.active) - Number(a.active)) || a.name.localeCompare(b.name, 'zh'));

export function addMedication(m) {
  const item = normalizeMedication({ ...m, id: m.id || uid('m') });
  if (!item) throw new Error('用药记录格式无效');
  if (!get().pets.some((p) => p.id === item.petId)) throw new Error('宠物不存在，请刷新页面');
  return update((st) => { st.medications.push(item); return item; });
}

export function updateMedication(id, patch) {
  return update((st) => {
    const i = st.medications.findIndex((x) => x.id === id);
    if (i < 0) return null;
    const next = normalizeMedication({ ...st.medications[i], ...patch, id });
    if (!next) return null;
    st.medications[i] = next;
    return next;
  });
}

export function deleteMedication(id) {
  let deleted = null;
  update((st) => {
    const i = st.medications.findIndex((x) => x.id === id);
    if (i >= 0) {
      // 把打卡记录一起带出去，撤销时才能原样恢复
      deleted = {
        ...st.medications[i],
        _logs: st.medicationLogs.filter((l) => l.medId === id),
      };
      st.medications.splice(i, 1);
      st.medicationLogs = st.medicationLogs.filter((l) => l.medId !== id);
    }
  });
  return deleted;
}

export function restoreMedication(item) {
  if (!item) throw new Error('用药记录格式无效');
  const { _logs, ...med } = item;
  const clean = normalizeMedication(med);
  if (!clean) throw new Error('用药记录格式无效');
  return update((st) => {
    if (!st.medications.some((x) => x.id === clean.id)) st.medications.push(clean);
    for (const l of _logs || []) {
      const log = normalizeMedicationLog(l);
      if (log && !st.medicationLogs.some((x) => x.id === log.id)) st.medicationLogs.push(log);
    }
    return clean;
  });
}

/* ---------- 生活质量 / 老年 / 复诊 ---------- */
export const qolOf = (petId) => get().qol
  .filter((q) => q.petId === petId)
  .sort((a, b) => (a.date < b.date ? 1 : -1));

export function addQol(x) {
  const item = normalizeQol({ ...x, id: x.id || uid('q') });
  if (!item) throw new Error('生活质量评分格式无效');
  if (!get().pets.some((p) => p.id === item.petId)) throw new Error('宠物不存在，请刷新页面');
  return update((st) => { st.qol.push(item); return item; });
}

export function updateQol(id, patch) {
  return update((st) => {
    const i = st.qol.findIndex((x) => x.id === id);
    if (i < 0) return null;
    const next = normalizeQol({ ...st.qol[i], ...patch, id });
    if (!next) return null;
    st.qol[i] = next;
    return next;
  });
}

export function deleteQol(id) {
  let deleted = null;
  update((st) => {
    const i = st.qol.findIndex((x) => x.id === id);
    if (i >= 0) { deleted = st.qol[i]; st.qol.splice(i, 1); }
  });
  return deleted;
}

export function restoreQol(item) {
  const clean = normalizeQol(item);
  if (!clean) throw new Error('生活质量评分格式无效');
  return update((st) => {
    if (!st.qol.some((x) => x.id === clean.id)) st.qol.push(clean);
    return clean;
  });
}

/** 真正“一起走过”的天数：优先接回家里程碑，结束于离开日期 */
export function togetherDays(pet) {
  if (!pet) return null;
  const adoption = get().timeline
    .filter((t) => t.petId === pet.id && (
      String(t.title || '').includes('接你回家')
      || (t.tags || []).includes('第一个里程碑')
    ))
    .map((t) => t.date)
    .filter(isValidISO)
    .sort()[0];
  const start = adoption || pet.birthday;
  const end = pet.passedDate || todayISO();
  if (!isValidISO(start) || !isValidISO(end)) return null;
  const a = parseISO(start);
  const b = parseISO(end);
  const ms = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate())
    - Date.UTC(a.getFullYear(), a.getMonth(), a.getDate());
  return Math.max(0, Math.round(ms / DAY));
}

export const currentMedicationsOf = (petId) => {
  const today = todayISO();
  return get().medications.filter((m) => (
    m.petId === petId
    && m.active
    && (!m.endDate || m.endDate >= today)
  ));
};

export function isSenior(pet) {
  const days = daysSince(pet?.birthday);
  if (days == null) return false;
  const years = days / 365;
  if (pet.species === '猫') return years >= 7;
  if (pet.species === '狗') return years >= 6;
  return years >= 7;
}

/** 就诊记录里的复诊日期 */
export const followUpsOf = (petId) => recordsOf(petId, 'vet')
  .filter((r) => r.followUp && isValidISO(r.followUp))
  .map((r) => ({
    id: `follow:${r.id}`,
    sourceId: r.id,
    date: r.followUp,
    title: '复诊',
    sub: r.diagnosis || r.symptom || '',
    hospital: r.hospital || '',
    ...dueText(r.followUp),
  }))
  .sort((a, b) => daysUntil(a.date) - daysUntil(b.date));

export const medicationLogsOf = (petId, date) => get().medicationLogs
  .filter((l) => l.petId === petId && (!date || l.date === date));

/** 今日服药打卡：有则取消，无则添加 */
export function toggleMedicationLog(medId, date = todayISO(), time = '08:00') {
  const med = get().medications.find((m) => m.id === medId);
  if (!med) return null;
  let action = 'added';
  update((st) => {
    const i = st.medicationLogs.findIndex((l) => l.medId === medId && l.date === date);
    if (i >= 0) {
      st.medicationLogs.splice(i, 1);
      action = 'removed';
    } else {
      st.medicationLogs.push(normalizeMedicationLog({
        id: uid('ml'), petId: med.petId, medId, date, time, taken: true,
      }));
    }
  });
  return action;
}

/* ---------- 费用 / 保单 ---------- */
export const expensesOf = (petId) => get().expenses
  .filter((e) => e.petId === petId)
  .sort((a, b) => (a.date < b.date ? 1 : -1));

export function addExpense(e) {
  const item = normalizeExpense({ ...e, id: e.id || uid('e') });
  if (!item) throw new Error('费用记录格式无效');
  if (!get().pets.some((p) => p.id === item.petId)) throw new Error('宠物不存在，请刷新页面');
  return update((st) => { st.expenses.push(item); return item; });
}

export function updateExpense(id, patch) {
  return update((st) => {
    const i = st.expenses.findIndex((x) => x.id === id);
    if (i < 0) return null;
    const next = normalizeExpense({ ...st.expenses[i], ...patch, id });
    if (!next) return null;
    st.expenses[i] = next;
    return next;
  });
}

export function deleteExpense(id) {
  let deleted = null;
  update((st) => {
    const i = st.expenses.findIndex((x) => x.id === id);
    if (i >= 0) { deleted = st.expenses[i]; st.expenses.splice(i, 1); }
  });
  return deleted;
}

export function restoreExpense(item) {
  const clean = normalizeExpense(item);
  if (!clean) throw new Error('费用记录格式无效');
  return update((st) => {
    if (!st.expenses.some((x) => x.id === clean.id)) st.expenses.push(clean);
    return clean;
  });
}

export const policiesOf = (petId) => get().policies.filter((p) => p.petId === petId);

export function addPolicy(p) {
  const item = normalizePolicy({ ...p, id: p.id || uid('pol') });
  if (!item) throw new Error('保单格式无效');
  if (!get().pets.some((x) => x.id === item.petId)) throw new Error('宠物不存在，请刷新页面');
  return update((st) => { st.policies.push(item); return item; });
}

export function updatePolicy(id, patch) {
  return update((st) => {
    const i = st.policies.findIndex((x) => x.id === id);
    if (i < 0) return null;
    const next = normalizePolicy({ ...st.policies[i], ...patch, id });
    if (!next) return null;
    st.policies[i] = next;
    return next;
  });
}

export function deletePolicy(id) {
  let deleted = null;
  update((st) => {
    const i = st.policies.findIndex((x) => x.id === id);
    if (i >= 0) { deleted = st.policies[i]; st.policies.splice(i, 1); }
  });
  return deleted;
}

/* ---------- 宠物友好地点 / 演示内容 ---------- */
export const placesOf = (city) => get().places
  .filter((p) => !city || p.city === city);

export function addPlace(p) {
  const item = {
    id: p.id || uid('pl'),
    name: str(p.name, 80),
    type: str(p.type, 40) || '其他',
    city: str(p.city, 40),
    district: str(p.district, 40),
    address: str(p.address, 160),
    note: str(p.note, 300),
    source: str(p.source, 80) || '本机添加',
    demo: bool(p.demo),
  };
  if (!item.name) throw new Error('地点名称不能为空');
  return update((st) => { st.places.push(item); return item; });
}

export function deletePlace(id) {
  let deleted = null;
  update((st) => {
    const i = st.places.findIndex((x) => x.id === id);
    if (i >= 0) { deleted = st.places[i]; st.places.splice(i, 1); }
  });
  return deleted;
}

/** 清空演示内容：宠友 / 动态 / 活动 / 演示地点 / 报名记录，不动健康数据 */
export function clearDemoContent() {
  return update((st) => {
    st.friends = (st.friends || []).filter((f) => !f.demo);
    st.posts = (st.posts || []).filter((p) => !p.demo);
    st.activities = (st.activities || []).filter((a) => !a.demo);
    st.places = (st.places || []).filter((p) => !p.demo);
    st.joinedIds = [];
  });
}

/* ---------- 走失模式 ---------- */
export const lostOf = () => get().lost;

export function setLostReport(report) {
  const pet = get().pets.find((p) => p.id === report.petId);
  if (!pet) throw new Error('宠物不存在，请刷新页面');
  return update((st) => {
    st.lost = {
      petId: pet.id,
      active: true,
      lastSeenAt: str(report.lastSeenAt, 20),
      place: str(report.place, 200),
      contact: str(report.contact, 80),
      note: str(report.note, 500),
    };
    return st.lost;
  });
}

export function clearLostReport() {
  return update((st) => { st.lost = null; return null; });
}

/** 费用台账：就诊记录里的 cost + 手动费用 */
export function costEntries(petId) {
  const entries = [];
  for (const r of recordsOf(petId, 'vet')) {
    const amount = Number(r.cost) || 0;
    if (amount > 0) {
      entries.push({
        id: `vet:${r.id}`,
        source: 'vet',
        sourceId: r.id,
        date: r.date,
        category: '就诊',
        amount,
        note: r.diagnosis || r.symptom || '',
        hospital: r.hospital || '',
      });
    }
  }
  for (const e of expensesOf(petId)) {
    entries.push({ ...e, source: 'expense' });
  }
  return entries.sort((a, b) => (a.date < b.date ? 1 : -1));
}

export function addTimeline(entry) {
  const id = entry.id || uid('t');
  if (!get().pets.some((p) => p.id === entry.petId)) throw new Error('宠物不存在，请刷新页面');
  return update((s) => {
    const item = {
      photos: [], tags: [], milestone: false, text: '',
      ...entry,
      id,
    };
    s.timeline.push(item);
    return item;
  });
}

export function updateTimeline(id, patch) {
  return update((s) => {
    const i = s.timeline.findIndex((t) => t.id === id);
    if (i < 0) return null;
    s.timeline[i] = { ...s.timeline[i], ...patch, id };
    return s.timeline[i];
  });
}

export function deleteTimeline(id) {
  let deleted = null;
  update((s) => {
    const i = s.timeline.findIndex((t) => t.id === id);
    if (i >= 0) {
      deleted = s.timeline[i];
      s.timeline.splice(i, 1);
    }
  });
  return deleted;
}

export function restoreTimeline(entry) {
  if (!entry?.id) throw new Error('记录格式无效');
  return update((s) => {
    if (!s.timeline.some((t) => t.id === entry.id)) s.timeline.push(entry);
    return entry;
  });
}

export const updatePet = (id, patch) =>
  update((s) => {
    const p = s.pets.find((x) => x.id === id);
    if (p) Object.assign(p, patch);
    return p || null;
  });

export function addPet(pet) {
  return update((s) => {
    const id = pet.id || uid('p');
    const p = normalizePet({ ...pet, id });
    s.pets.push(p);
    s.activePetId = id;
    const w = Number(pet.weight);
    if (Number.isFinite(w) && w > 0) {
      s.records.push(normalizeRecord({
        id: uid('r'), petId: id, type: 'weight', date: todayISO(), value: w,
      }));
    }
    return p;
  });
}

export function deletePet(id) {
  return update((s) => {
    if (s.pets.length <= 1) return { ok: false, reason: 'last-pet' };
    s.pets = s.pets.filter((p) => p.id !== id);
    s.records = s.records.filter((r) => r.petId !== id);
    s.timeline = s.timeline.filter((t) => t.petId !== id);
    s.medications = s.medications.filter((m) => m.petId !== id);
    s.medicationLogs = s.medicationLogs.filter((m) => m.petId !== id);
    s.symptoms = s.symptoms.filter((m) => m.petId !== id);
    s.qol = s.qol.filter((m) => m.petId !== id);
    s.expenses = s.expenses.filter((m) => m.petId !== id);
    s.policies = s.policies.filter((m) => m.petId !== id);
    if (s.lost?.petId === id) s.lost = null;
    if (s.activePetId === id) s.activePetId = s.pets[0]?.id;
    return { ok: true, id };
  });
}

export const toggleLike = (postId) => update((s) => {
  const p = s.posts.find((x) => x.id === postId);
  if (!p) return;
  p.liked = !p.liked;
  p.likes = Math.max(0, (p.likes || 0) + (p.liked ? 1 : -1));
});

export const addComment = (postId, c) =>
  update((s) => {
    const p = s.posts.find((x) => x.id === postId);
    if (p) {
      if (!Array.isArray(p.comments)) p.comments = [];
      p.comments.push(c);
    }
  });

export const addPost = (post) =>
  update((s) => {
    s.posts.unshift({ id: uid('po'), liked: false, likes: 0, comments: [], ...post });
  });

/* ---------- 派生计算 ---------- */
export function ageText(birthday) {
  if (!isValidISO(birthday)) return '—';
  const days = daysSince(birthday);
  if (days == null || days < 0) return '—';
  const y = Math.floor(days / 365);
  const m = Math.floor((days % 365) / 30);
  if (y >= 1) return m > 0 ? `${y} 岁 ${m} 个月` : `${y} 岁`;
  return `${Math.max(m, 0)} 个月`;
}

export function daysUntil(dateStr) {
  if (!isValidISO(dateStr)) return NaN;
  const d = parseISO(dateStr);
  const t = new Date(); t.setHours(0, 0, 0, 0);
  return Math.round((d - t) / DAY);
}

export function dueText(dateStr) {
  const n = daysUntil(dateStr);
  if (!Number.isFinite(n)) return { text: '日期无效', level: 'ok' };
  if (n < 0) return { text: `已逾期 ${-n} 天`, level: 'due' };
  if (n === 0) return { text: '就是今天', level: 'due' };
  if (n <= 7) return { text: `${n} 天后`, level: 'due' };
  if (n <= 30) return { text: `${n} 天后`, level: 'soon' };
  return { text: `${n} 天后`, level: 'ok' };
}

/** 汇总待办提醒（疫苗 / 体内 / 体外驱虫），按紧急度排序 */
export function reminders(petId) {
  const pet = get().pets.find((p) => p.id === petId);
  if (pet?.deceased) return [];
  const out = [];
  const seen = new Set();

  for (const r of recordsOf(petId)) {
    if (!r.nextDate || !isValidISO(r.nextDate)) continue;
    if (r.type !== 'vaccine' && r.type !== 'deworm') continue;
    const key = r.type === 'vaccine' ? 'vaccine' : `deworm:${r.kind}`;
    if (seen.has(key)) continue;              // 同类只看最新一条
    seen.add(key);
    out.push({
      id: r.id,
      sourceId: r.id,
      sourceDate: r.date,
      type: r.type,
      kind: r.kind,
      ico: r.type === 'vaccine' ? '💉' : '🐛',
      title: r.type === 'vaccine' ? (r.name || '疫苗') : `${r.kind}驱虫`,
      sub: r.type === 'vaccine' ? r.hospital : r.product,
      hospital: r.hospital || '',
      date: r.nextDate,
      ...dueText(r.nextDate),
    });
  }
  return out.sort((a, b) => daysUntil(a.date) - daysUntil(b.date));
}

/** 一键顺延：把某条提醒对应的驱虫/疫苗标记为「今天做了」，自动生成新记录 */
export function completeReminder(petId, reminder, today = todayISO()) {
  if (!reminder?.sourceId) return { duplicate: false, record: null, reason: 'missing-source' };

  const s0 = get();
  const cycleKey = `${reminder.sourceId}@${reminder.sourceDate || ''}`;
  const duplicated = s0.records.some(
    (r) => r.petId === petId
      && (r.cycleKey === cycleKey || (r.fromId === reminder.sourceId && r.date >= reminder.sourceDate))
  );
  if (duplicated) return { duplicate: true, record: null };

  const source = s0.records.find((r) => r.id === reminder.sourceId);
  let created = null;

  update((s) => {
    created = normalizeRecord({
      id: uid('r'),
      petId,
      type: reminder.type,
      kind: reminder.kind,
      date: today,
      nextDate: suggestNext(reminder.type, reminder.kind, today),
      fromId: reminder.sourceId,
      cycleKey,
      name: reminder.type === 'vaccine' ? (source?.name || reminder.title || '') : undefined,
      product: reminder.type === 'deworm' ? (source?.product || reminder.sub || '') : undefined,
      hospital: source?.hospital || reminder.hospital || '',
      batch: source?.batch || '',
    });
    s.records.push(created);
    return created;
  });

  return { duplicate: false, record: created };
}
