/**
 * Servicio de alimentos: combina la caché local (IndexedDB) con las fuentes
 * remotas (Open Food Facts y USDA). Los alimentos consultados se guardan en
 * local para poder usarlos sin conexión.
 */
import { findFoodByCode, saveFood, searchLocalFoods } from './db.js';
import { fetchByBarcode, searchOFF } from './api/openfoodfacts.js';
import { searchUSDA } from './api/usda.js';
import { normalizeBarcode } from './scanner.js';
import { state } from './state.js';

/**
 * Busca un alimento por código: primero en caché local, luego en OFF.
 * @returns {Promise<{food: object|null, fromCache: boolean, error?: string}>}
 */
export async function lookupBarcode(rawCode) {
  const code = normalizeBarcode(rawCode);
  const cached = (await findFoodByCode(code)) || (await findFoodByCode(rawCode));
  if (cached) return { food: cached, fromCache: true };

  if (!navigator.onLine) return { food: null, fromCache: false, error: 'Sin conexión y el producto no está en caché.' };
  try {
    const food = await fetchByBarcode(code);
    if (!food) return { food: null, fromCache: false };
    food.code = code;
    food.id = `off:${code}`;
    return { food: await saveFood(food), fromCache: false };
  } catch (e) {
    return { food: null, fromCache: false, error: e.name === 'AbortError' ? 'Tiempo de espera agotado.' : e.message };
  }
}

/** Vuelve a descargar un producto de OFF (para actualizar la caché). */
export async function refreshFromOFF(food) {
  const fresh = await fetchByBarcode(food.code);
  if (!fresh) return null;
  return saveFood({ ...fresh, id: food.id, code: food.code });
}

/**
 * Busca por nombre en la fuente indicada.
 * @param {'local'|'off'|'usda'} source
 */
export async function searchFoods(query, source) {
  if (source === 'local') return searchLocalFoods(query);
  if (source === 'off') return searchOFF(query);
  if (source === 'usda') return searchUSDA(query, state.usdaKey);
  return [];
}

/** Guarda en caché un alimento que viene de una búsqueda remota. */
export const cacheFood = (food) => saveFood(food);

export const SOURCE_LABEL = { off: 'Open Food Facts', usda: 'USDA', manual: 'Manual' };

/** Etiqueta de porción para mostrar. */
export function servingText(food) {
  if (!food.servingSize) return '';
  return food.servingLabel || `${food.servingSize} g`;
}

/** Comida sugerida según la hora. */
export function mealForNow(d = new Date()) {
  const h = d.getHours();
  if (h >= 5 && h < 11) return 'desayuno';
  if (h >= 13 && h < 17) return 'comida';
  if (h >= 19 && h < 23) return 'cena';
  return 'snack';
}

export const MEALS = [
  ['desayuno', 'Desayuno'],
  ['comida', 'Comida'],
  ['cena', 'Cena'],
  ['snack', 'Snack'],
];
export const MEAL_LABEL = Object.fromEntries(MEALS);
