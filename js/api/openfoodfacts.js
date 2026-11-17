/**
 * Cliente de Open Food Facts (https://world.openfoodfacts.org).
 * Convierte los productos al formato interno de alimento.
 */
import { NUTRIENTS, G_TO_UNIT, kcalFromMacros } from '../nutrients.js';

const BASE = 'https://world.openfoodfacts.org';
const FIELDS = [
  'code', 'product_name', 'product_name_es', 'generic_name', 'brands', 'quantity',
  'serving_size', 'serving_quantity', 'nutriments', 'image_front_small_url', 'image_small_url',
].join(',');

/** fetch con tiempo límite. */
async function fetchJSON(url, ms = 12000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    const r = await fetch(url, { signal: ctrl.signal, headers: { Accept: 'application/json' } });
    if (r.status === 404) return null;
    if (!r.ok) throw new Error(`Open Food Facts respondió ${r.status}`);
    return await r.json();
  } finally {
    clearTimeout(t);
  }
}

/**
 * Busca un producto por código de barras.
 * @returns {Promise<object|null>} alimento o null si no existe.
 */
export async function fetchByBarcode(code) {
  const data = await fetchJSON(`${BASE}/api/v2/product/${encodeURIComponent(code)}?fields=${FIELDS}`);
  if (!data || data.status === 0 || !data.product) return null;
  return mapProduct({ code, ...data.product });
}

/** Búsqueda por texto. */
export async function searchOFF(query, pageSize = 25) {
  const params = new URLSearchParams({
    search_terms: query, search_simple: '1', action: 'process', json: '1',
    page_size: String(pageSize), fields: FIELDS,
  });
  const data = await fetchJSON(`${BASE}/cgi/search.pl?${params}`, 15000);
  return (data?.products || []).map(mapProduct).filter((f) => f.name);
}

const num = (v) => {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/** Convierte un producto de OFF al modelo interno. */
export function mapProduct(p) {
  const nm = p.nutriments || {};
  const servingSize = num(p.serving_quantity);

  // Lee un nutriente por 100 g; si solo hay valor por porción, lo convierte.
  const read = (name) => {
    const v100 = num(nm[`${name}_100g`]);
    if (v100 != null) return v100;
    const vs = num(nm[`${name}_serving`]);
    if (vs != null && servingSize) return (vs * 100) / servingSize;
    return null;
  };

  const per100 = {};
  for (const n of NUTRIENTS) {
    if (!n.off) continue;
    const g = read(n.off);                         // valor en gramos
    per100[n.key] = g == null ? null : g * G_TO_UNIT[n.unit];
  }
  // Sodio: si falta, se deriva de la sal (sal = sodio × 2.5).
  if (per100.sodium == null) {
    const salt = read('salt');
    if (salt != null) per100.sodium = (salt / 2.5) * 1000;
  }
  // Energía: kcal directas, o kJ convertidos, o estimadas desde macros.
  let kcal = read('energy-kcal');
  if (kcal == null) {
    const kj = read('energy-kj') ?? read('energy');
    if (kj != null) kcal = kj / 4.184;
  }
  per100.kcal = kcal ?? kcalFromMacros(per100);

  const code = String(p.code || '');
  return {
    id: `off:${code}`,
    source: 'off',
    code,
    name: (p.product_name_es || p.product_name || p.generic_name || '').trim(),
    brand: (p.brands || '').split(',')[0].trim(),
    quantity: p.quantity || '',
    servingSize: servingSize || null,
    servingLabel: p.serving_size || '',
    per100,
    image: p.image_front_small_url || p.image_small_url || '',
  };
}
