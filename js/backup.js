/* ============================================================
   本机备份 — IndexedDB 快照（最近 10 版 + 每日 1 版）
   与 store.js 解耦：只负责存取，不感知业务
   ============================================================ */

const DB_NAME = 'pawlog-backups';
const DB_VERSION = 1;
const STORE = 'snapshots';
const KEEP_LATEST = 10;
const KEEP_DAYS = 7;

let dbPromise = null;

function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB unavailable'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function store(db, mode = 'readonly') {
  return db.transaction(STORE, mode).objectStore(STORE);
}

function reqToPromise(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

const uid = () => `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

/** 保存一份快照。失败不抛错，备份是尽力而为。 */
export async function saveBackup(state, reason = 'auto', { namespace = 'prod' } = {}) {
  try {
    const db = await openDB();
    const entry = {
      id: `${namespace}_${uid()}`,
      namespace,
      at: Date.now(),
      reason,
      state,
    };
    await reqToPromise(store(db, 'readwrite').put(entry));
    await prune(namespace);
    return entry;
  } catch {
    return null;
  }
}

/** 按时间倒序列出快照 */
export async function listBackups(namespace = 'prod') {
  try {
    const db = await openDB();
    const all = await reqToPromise(store(db).getAll());
    return all
      .filter((b) => b.namespace === namespace)
      .sort((a, b) => b.at - a.at);
  } catch {
    return [];
  }
}

export async function getBackup(id) {
  try {
    const db = await openDB();
    return (await reqToPromise(store(db).get(id))) || null;
  } catch {
    return null;
  }
}

/** 本机快照存储是否可用（隐私模式/浏览器限制时会失败） */
export async function backupStorageAvailable() {
  try {
    await openDB();
    return true;
  } catch {
    return false;
  }
}

export async function restoreBackup(id) {
  const b = await getBackup(id);
  return b?.state || null;
}

/** 保留最近 10 版 + 最近 7 天每天 1 版 */
export async function prune(namespace = 'prod') {
  try {
    const db = await openDB();
    const all = (await reqToPromise(store(db).getAll()))
      .filter((b) => b.namespace === namespace)
      .sort((a, b) => b.at - a.at);

    const keep = new Set(all.slice(0, KEEP_LATEST).map((b) => b.id));
    const days = new Set();
    for (const b of all) {
      const d = new Date(b.at);
      const localDay = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      if (days.size < KEEP_DAYS && !days.has(localDay)) {
        days.add(localDay);
        keep.add(b.id);
      }
    }

    const tx = db.transaction(STORE, 'readwrite');
    const os = tx.objectStore(STORE);
    for (const b of all) if (!keep.has(b.id)) os.delete(b.id);
    await new Promise((resolve, reject) => {
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
    return { kept: keep.size, removed: all.length - keep.size };
  } catch {
    return { kept: 0, removed: 0 };
  }
}

export async function clearBackups(namespace = 'prod') {
  try {
    const db = await openDB();
    const all = (await reqToPromise(store(db).getAll())).filter((b) => b.namespace === namespace);
    const tx = db.transaction(STORE, 'readwrite');
    const os = tx.objectStore(STORE);
    for (const b of all) os.delete(b.id);
    await new Promise((resolve, reject) => {
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
    return all.length;
  } catch {
    return 0;
  }
}
