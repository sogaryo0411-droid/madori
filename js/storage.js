// IndexedDB への自動保存。
// 画像は大きいので、家具配置など（layout）とは別キーに保存し、変わったときだけ書く。
// Blob をそのまま入れると古い iOS で失敗することがあるので ArrayBuffer にして保存する。

const DB_NAME = 'madori';
const STORE = 'kv';

let dbPromise = null;

function openDb() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
}

async function tx(mode, fn) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const store = t.objectStore(STORE);
    const req = fn(store);
    t.oncomplete = () => resolve(req?.result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error || new Error('保存に失敗（容量不足かも）'));
  });
}

const get = (key) => tx('readonly', (s) => s.get(key));
const put = (key, value) => tx('readwrite', (s) => s.put(value, key));
const del = (key) => tx('readwrite', (s) => s.delete(key));

/** @param image { blob, width, height } | null */
export async function saveImage(image) {
  if (!image) return del('image');
  const buffer = await image.blob.arrayBuffer();
  return put('image', { buffer, type: image.blob.type, width: image.width, height: image.height });
}

export function saveLayout(layout) {
  return put('layout', layout);
}

/** @returns { image: {blob,width,height} | null, layout: object | null } */
export async function loadAll() {
  const [img, layout] = await Promise.all([get('image'), get('layout')]);
  const image = img ? { blob: new Blob([img.buffer], { type: img.type }), width: img.width, height: img.height } : null;
  return { image, layout: layout ?? null };
}

export async function clearAll() {
  await Promise.all([del('image'), del('layout')]);
}

/** Safari に「消さないで」と頼む（ホーム画面に追加したアプリだと通りやすい） */
export function requestPersist() {
  navigator.storage?.persist?.().catch(() => {});
}
