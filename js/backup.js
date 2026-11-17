/**
 * Respaldo: exportar e importar los datos en JSON (completo) y CSV
 * (entradas del diario, pesos y alimentos).
 */
import { dumpAll, restoreAll, getAll, putMany } from './db.js';
import { NUTRIENT_KEYS, entryNutrients } from './nutrients.js';
import { downloadFile, todayISO, timeHHMM, combineDateTime, round, parseNum } from './utils.js';

const APP = 'calorias';
const FORMAT_VERSION = 1;

/* ---------------- JSON ---------------- */

export async function exportJSON() {
  const data = await dumpAll();
  const payload = { app: APP, version: FORMAT_VERSION, exportedAt: new Date().toISOString(), ...data };
  downloadFile(`calorias-respaldo-${todayISO()}.json`, JSON.stringify(payload, null, 2));
}

/** Importa un respaldo JSON. mode: 'merge' | 'replace'. Devuelve un resumen. */
export async function importJSON(text, mode = 'merge') {
  const data = JSON.parse(text);
  if (data.app !== APP) throw new Error('El archivo no es un respaldo de esta app.');
  await restoreAll(data, mode);
  return {
    foods: data.foods?.length || 0,
    entries: data.entries?.length || 0,
    weights: data.weights?.length || 0,
  };
}

/* ---------------- CSV ---------------- */

/** Escapa un valor para CSV. */
const cell = (v) => {
  if (v == null) return '';
  const s = String(v);
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const toCSV = (header, rows) => [header, ...rows].map((r) => r.map(cell).join(',')).join('\n');

/** Parser CSV sencillo con soporte de comillas. */
export function parseCSV(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  const src = text.replace(/^﻿/, '');
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(field); field = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(field); rows.push(row); row = []; field = '';
    } else field += ch;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((c) => c !== ''));
}

const ENTRY_HEADER = ['id', 'date', 'time', 'meal', 'name', 'brand', 'foodId', 'grams', 'qty', 'unit', 'servingSize', ...NUTRIENT_KEYS];
const WEIGHT_HEADER = ['date', 'kg'];
const FOOD_HEADER = ['id', 'source', 'code', 'name', 'brand', 'servingSize', 'servingLabel', 'favorite', ...NUTRIENT_KEYS.map((k) => `per100_${k}`)];

/** Exporta las entradas del diario (nutrientes totales por entrada). */
export async function exportEntriesCSV() {
  const entries = (await getAll('entries')).sort((a, b) => a.time - b.time);
  const rows = entries.map((e) => {
    const n = entryNutrients(e);
    return [e.id, e.date, timeHHMM(e.time), e.meal, e.name, e.brand, e.foodId, e.grams, e.qty, e.unit, e.servingSize,
      ...NUTRIENT_KEYS.map((k) => (n[k] == null ? '' : round(n[k], 3)))];
  });
  downloadFile(`calorias-diario-${todayISO()}.csv`, `﻿${toCSV(ENTRY_HEADER, rows)}`, 'text/csv');
}

export async function exportWeightsCSV() {
  const w = (await getAll('weights')).sort((a, b) => a.date.localeCompare(b.date));
  downloadFile(`calorias-peso-${todayISO()}.csv`, `﻿${toCSV(WEIGHT_HEADER, w.map((x) => [x.date, x.kg]))}`, 'text/csv');
}

export async function exportFoodsCSV() {
  const foods = await getAll('foods');
  const rows = foods.map((f) => [f.id, f.source, f.code, f.name, f.brand, f.servingSize, f.servingLabel, f.favorite,
    ...NUTRIENT_KEYS.map((k) => (f.per100?.[k] == null ? '' : round(f.per100[k], 4)))]);
  downloadFile(`calorias-alimentos-${todayISO()}.csv`, `﻿${toCSV(FOOD_HEADER, rows)}`, 'text/csv');
}

/**
 * Importa un CSV exportado por la app. Detecta el tipo por la cabecera.
 * @returns {{type:string, count:number}}
 */
export async function importCSV(text) {
  const [header, ...rows] = parseCSV(text);
  if (!header) throw new Error('CSV vacío.');
  const col = Object.fromEntries(header.map((h, i) => [h.trim(), i]));
  const get = (r, k) => (col[k] == null ? '' : (r[col[k]] ?? '').trim());
  const num = (r, k) => parseNum(get(r, k));

  // Entradas del diario
  if ('meal' in col && 'grams' in col && 'date' in col) {
    const list = rows.map((r) => {
      const grams = num(r, 'grams') || 0;
      const per100 = {};
      for (const k of NUTRIENT_KEYS) {
        const v = num(r, k);
        per100[k] = v == null || !grams ? null : (v * 100) / grams;
      }
      const e = {
        date: get(r, 'date'),
        time: combineDateTime(get(r, 'date'), get(r, 'time') || '12:00'),
        meal: get(r, 'meal') || 'snack',
        name: get(r, 'name') || 'Sin nombre',
        brand: get(r, 'brand'),
        foodId: get(r, 'foodId') || null,
        grams,
        qty: num(r, 'qty') ?? grams,
        unit: get(r, 'unit') === 'serving' ? 'serving' : 'g',
        servingSize: num(r, 'servingSize'),
        per100,
      };
      const id = num(r, 'id');
      if (id != null) e.id = id;
      return e;
    }).filter((e) => /^\d{4}-\d{2}-\d{2}$/.test(e.date) && e.grams > 0);
    await putMany('entries', list);
    return { type: 'entradas', count: list.length };
  }

  // Pesos
  if ('kg' in col && 'date' in col) {
    const list = rows.map((r) => ({ date: get(r, 'date'), kg: num(r, 'kg') }))
      .filter((w) => /^\d{4}-\d{2}-\d{2}$/.test(w.date) && w.kg > 0);
    await putMany('weights', list);
    return { type: 'pesos', count: list.length };
  }

  // Alimentos
  if ('id' in col && 'name' in col && 'per100_kcal' in col) {
    const list = rows.map((r) => ({
      id: get(r, 'id'),
      source: get(r, 'source') || 'manual',
      code: get(r, 'code'),
      name: get(r, 'name'),
      brand: get(r, 'brand'),
      servingSize: num(r, 'servingSize'),
      servingLabel: get(r, 'servingLabel'),
      favorite: num(r, 'favorite') ? 1 : 0,
      per100: Object.fromEntries(NUTRIENT_KEYS.map((k) => [k, num(r, `per100_${k}`)])),
      lastUsed: 0, useCount: 0, updatedAt: Date.now(),
    })).filter((f) => f.id && f.name);
    await putMany('foods', list);
    return { type: 'alimentos', count: list.length };
  }

  throw new Error('No se reconoce el formato del CSV.');
}
