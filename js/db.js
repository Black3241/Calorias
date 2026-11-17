/**
 * Capa de datos sobre IndexedDB. Todo vive solo en el dispositivo.
 *
 * Almacenes:
 *  - foods    { id, source, code, name, brand, servingSize, servingLabel,
 *               per100: {kcal, protein, ...}, image, favorite (0|1),
 *               lastUsed, useCount, updatedAt }
 *               id = 'off:<código>' | 'usda:<fdcId>' | 'manual:<uuid>'
 *  - entries  { id (auto), date 'YYYY-MM-DD', time (ms), meal, foodId, name,
 *               brand, grams, qty, unit ('g'|'serving'), servingSize,
 *               per100: {...} }   // copia de los nutrientes al registrar
 *  - weights  { date 'YYYY-MM-DD', kg }
 *  - settings { key, value }      // perfil, metas manuales, tema, clave USDA…
 */

const DB_NAME = 'calorias';
const DB_VERSION = 1;
export const STORES = ['foods', 'entries', 'weights', 'settings'];

let dbPromise;

/** Abre (y crea/actualiza) la base de datos. */
export function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('foods')) {
        const s = db.createObjectStore('foods', { keyPath: 'id' });
        s.createIndex('code', 'code', { unique: false });
        s.createIndex('lastUsed', 'lastUsed', { unique: false });
        s.createIndex('favorite', 'favorite', { unique: false });
      }
      if (!db.objectStoreNames.contains('entries')) {
        const s = db.createObjectStore('entries', { keyPath: 'id', autoIncrement: true });
        s.createIndex('date', 'date', { unique: false });
      }
      if (!db.objectStoreNames.contains('weights')) {
        db.createObjectStore('weights', { keyPath: 'date' });
      }
      if (!db.objectStoreNames.contains('settings')) {
        db.createObjectStore('settings', { keyPath: 'key' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

/** Convierte un IDBRequest en promesa. */
const done = (req) => new Promise((res, rej) => {
  req.onsuccess = () => res(req.result);
  req.onerror = () => rej(req.error);
});

/** Ejecuta `fn(store)` dentro de una transacción y espera a que termine. */
async function withStore(name, mode, fn) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(name, mode);
    const store = tx.objectStore(name);
    let result;
    Promise.resolve(fn(store)).then((r) => { result = r; }, reject);
    tx.oncomplete = () => resolve(result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

/* ---------------- Genéricos ---------------- */
export const get = (store, key) => withStore(store, 'readonly', (s) => done(s.get(key)));
export const getAll = (store) => withStore(store, 'readonly', (s) => done(s.getAll()));
export const put = (store, value) => withStore(store, 'readwrite', (s) => done(s.put(value)));
export const del = (store, key) => withStore(store, 'readwrite', (s) => done(s.delete(key)));
export const clear = (store) => withStore(store, 'readwrite', (s) => done(s.clear()));

/** Inserta muchos registros en una sola transacción. */
export const putMany = (store, values) => withStore(store, 'readwrite', async (s) => {
  for (const v of values) s.put(v);
});

/* ---------------- Alimentos ---------------- */

/** Guarda un alimento conservando su estado de favorito/uso si ya existía. */
export async function saveFood(food) {
  const prev = await get('foods', food.id);
  const merged = {
    favorite: 0, useCount: 0, lastUsed: 0,
    ...(prev ? { favorite: prev.favorite, useCount: prev.useCount, lastUsed: prev.lastUsed } : {}),
    ...food,
    updatedAt: Date.now(),
  };
  await put('foods', merged);
  return merged;
}

export const getFood = (id) => get('foods', id);

/** Busca en caché local un alimento por código de barras. */
export async function findFoodByCode(code) {
  const list = await withStore('foods', 'readonly', (s) => done(s.index('code').getAll(code)));
  // Preferimos la versión editada a mano / más reciente.
  return list.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))[0] || null;
}

/** Alimentos usados recientemente. */
export async function recentFoods(limit = 20) {
  const all = await getAll('foods');
  return all.filter((f) => f.lastUsed > 0).sort((a, b) => b.lastUsed - a.lastUsed).slice(0, limit);
}

/** Alimentos marcados como favoritos. */
export async function favoriteFoods() {
  const list = await withStore('foods', 'readonly', (s) => done(s.index('favorite').getAll(1)));
  return list.sort((a, b) => a.name.localeCompare(b.name, 'es'));
}

/** Búsqueda local por nombre/marca (sin red). */
export async function searchLocalFoods(query) {
  const q = normalize(query);
  const all = await getAll('foods');
  return all.filter((f) => normalize(`${f.name} ${f.brand || ''}`).includes(q))
    .sort((a, b) => (b.useCount || 0) - (a.useCount || 0)).slice(0, 30);
}

const normalize = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

export async function toggleFavorite(id) {
  const f = await get('foods', id);
  if (!f) return null;
  f.favorite = f.favorite ? 0 : 1;
  await put('foods', f);
  return f;
}

/** Marca un alimento como usado (para "recientes"). */
export async function touchFood(id) {
  const f = await get('foods', id);
  if (!f) return;
  f.lastUsed = Date.now();
  f.useCount = (f.useCount || 0) + 1;
  await put('foods', f);
}

/* ---------------- Entradas del diario ---------------- */

export const addEntry = (entry) => put('entries', entry);
export const updateEntry = (entry) => put('entries', entry);
export const deleteEntry = (id) => del('entries', id);
export const getEntry = (id) => get('entries', id);

export function entriesByDate(date) {
  return withStore('entries', 'readonly', (s) => done(s.index('date').getAll(date)))
    .then((l) => l.sort((a, b) => a.time - b.time));
}

/** Entradas entre dos fechas ISO (inclusive). */
export function entriesInRange(from, to) {
  return withStore('entries', 'readonly', (s) => done(s.index('date').getAll(IDBKeyRange.bound(from, to))));
}

/* ---------------- Peso ---------------- */

export async function getWeights() {
  const l = await getAll('weights');
  return l.sort((a, b) => a.date.localeCompare(b.date));
}
export const putWeight = (w) => put('weights', w);
export const deleteWeight = (date) => del('weights', date);

/* ---------------- Ajustes ---------------- */

export async function getSetting(key, fallback = null) {
  const r = await get('settings', key);
  return r ? r.value : fallback;
}
export const setSetting = (key, value) => put('settings', { key, value });

/* ---------------- Respaldo ---------------- */

/** Vuelca toda la base de datos a un objeto. */
export async function dumpAll() {
  const out = {};
  for (const s of STORES) out[s] = await getAll(s);
  return out;
}

/**
 * Restaura datos. mode = 'merge' (añade/sobrescribe por clave) o 'replace' (borra antes).
 */
export async function restoreAll(data, mode = 'merge') {
  for (const s of STORES) {
    if (!Array.isArray(data[s])) continue;
    if (mode === 'replace') await clear(s);
    await putMany(s, data[s]);
  }
}
