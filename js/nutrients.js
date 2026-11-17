/**
 * Catálogo de nutrientes y operaciones con ellos.
 *
 * Todos los alimentos guardan sus valores "por 100 g" (o 100 ml) en `per100`,
 * en la unidad indicada en `unit` de este catálogo.
 *
 *  off:  nombre del nutriente en Open Food Facts (los valores *_100g de OFF
 *        vienen en gramos para nutrientes de masa).
 *  usda: ids de nutriente en USDA FoodData Central, en orden de preferencia.
 *  kind: 'macro' | 'sub' (sub-componente) | 'micro'
 *  limit: true si la meta es un máximo (pasarse es malo) y no un mínimo.
 */
export const NUTRIENTS = [
  { key: 'kcal', label: 'Calorías', unit: 'kcal', kind: 'energy', usda: [1008, 2047, 2048] },
  { key: 'protein', label: 'Proteína', unit: 'g', kind: 'macro', off: 'proteins', usda: [1003] },
  { key: 'carbs', label: 'Carbohidratos', unit: 'g', kind: 'macro', off: 'carbohydrates', usda: [1005, 1050] },
  { key: 'sugars', label: 'Azúcares', unit: 'g', kind: 'sub', off: 'sugars', usda: [2000, 1063], limit: true },
  { key: 'fiber', label: 'Fibra', unit: 'g', kind: 'sub', off: 'fiber', usda: [1079] },
  { key: 'fat', label: 'Grasa', unit: 'g', kind: 'macro', off: 'fat', usda: [1004, 1085] },
  { key: 'satFat', label: 'Grasa saturada', unit: 'g', kind: 'sub', off: 'saturated-fat', usda: [1258], limit: true },
  { key: 'transFat', label: 'Grasa trans', unit: 'g', kind: 'sub', off: 'trans-fat', usda: [1257], limit: true },
  { key: 'sodium', label: 'Sodio', unit: 'mg', kind: 'micro', off: 'sodium', usda: [1093], limit: true },
  { key: 'cholesterol', label: 'Colesterol', unit: 'mg', kind: 'micro', off: 'cholesterol', usda: [1253], limit: true },
  { key: 'potassium', label: 'Potasio', unit: 'mg', kind: 'micro', off: 'potassium', usda: [1092] },
  { key: 'calcium', label: 'Calcio', unit: 'mg', kind: 'micro', off: 'calcium', usda: [1087] },
  { key: 'iron', label: 'Hierro', unit: 'mg', kind: 'micro', off: 'iron', usda: [1089] },
  { key: 'magnesium', label: 'Magnesio', unit: 'mg', kind: 'micro', off: 'magnesium', usda: [1090] },
  { key: 'zinc', label: 'Zinc', unit: 'mg', kind: 'micro', off: 'zinc', usda: [1095] },
  { key: 'phosphorus', label: 'Fósforo', unit: 'mg', kind: 'micro', off: 'phosphorus', usda: [1091] },
  { key: 'vitA', label: 'Vitamina A', unit: 'µg', kind: 'micro', off: 'vitamin-a', usda: [1106] },
  { key: 'vitC', label: 'Vitamina C', unit: 'mg', kind: 'micro', off: 'vitamin-c', usda: [1162] },
  { key: 'vitD', label: 'Vitamina D', unit: 'µg', kind: 'micro', off: 'vitamin-d', usda: [1114] },
  { key: 'vitE', label: 'Vitamina E', unit: 'mg', kind: 'micro', off: 'vitamin-e', usda: [1109] },
  { key: 'vitK', label: 'Vitamina K', unit: 'µg', kind: 'micro', off: 'vitamin-k', usda: [1185] },
  { key: 'vitB12', label: 'Vitamina B12', unit: 'µg', kind: 'micro', off: 'vitamin-b12', usda: [1178] },
  { key: 'folate', label: 'Folato (B9)', unit: 'µg', kind: 'micro', off: 'vitamin-b9', usda: [1190, 1177] },
];

export const NUTRIENT_MAP = Object.fromEntries(NUTRIENTS.map((n) => [n.key, n]));
export const NUTRIENT_KEYS = NUTRIENTS.map((n) => n.key);

/** Micronutrientes que se comparan contra meta en las gráficas. */
export const MICRO_KEYS = NUTRIENTS.filter((n) => n.kind === 'micro').map((n) => n.key);

/** Factor para convertir gramos a la unidad del catálogo. */
export const G_TO_UNIT = { g: 1, mg: 1000, 'µg': 1e6, kcal: 1 };

/** Convierte un valor entre unidades de masa (g, mg, µg). */
export function convertMass(value, from, to) {
  const f = { g: 1, mg: 1e-3, ug: 1e-6, 'µg': 1e-6, mcg: 1e-6 };
  const a = f[String(from).toLowerCase()] ?? f[from];
  const b = f[to];
  if (a == null || b == null) return null;
  return (value * a) / b;
}

/** Objeto con todos los nutrientes en cero. */
export function emptyNutrients() {
  return Object.fromEntries(NUTRIENT_KEYS.map((k) => [k, 0]));
}

/**
 * Escala valores por 100 g a una cantidad en gramos.
 * Los nutrientes ausentes (null/undefined) se dejan como null para
 * distinguir "0" de "sin dato".
 */
export function scale(per100, grams) {
  const out = {};
  for (const k of NUTRIENT_KEYS) {
    const v = per100?.[k];
    out[k] = v == null ? null : (v * grams) / 100;
  }
  return out;
}

/** Nutrientes totales de una entrada del diario. */
export const entryNutrients = (entry) => scale(entry.per100, entry.grams);

/** Suma una lista de objetos de nutrientes (null cuenta como 0). */
export function sumNutrients(list) {
  const total = emptyNutrients();
  for (const n of list) for (const k of NUTRIENT_KEYS) total[k] += Number(n?.[k]) || 0;
  return total;
}

/** Estima kcal a partir de macros cuando el alimento no las trae (Atwater 4/4/9). */
export function kcalFromMacros(n) {
  if (n.protein == null && n.carbs == null && n.fat == null) return null;
  return (n.protein || 0) * 4 + (n.carbs || 0) * 4 + (n.fat || 0) * 9;
}

/** Formatea la cantidad de un nutriente con su unidad. */
export function fmtNutrient(key, value) {
  const n = NUTRIENT_MAP[key];
  if (value == null) return '–';
  const dec = n.unit === 'kcal' ? 0 : value < 10 ? 1 : 0;
  return `${Number(value).toLocaleString('es', { maximumFractionDigits: dec })} ${n.unit}`;
}
