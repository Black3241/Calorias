/**
 * Cliente de USDA FoodData Central (https://fdc.nal.usda.gov).
 * Requiere una clave gratuita; "DEMO_KEY" funciona con límite de peticiones.
 */
import { NUTRIENTS, convertMass, kcalFromMacros } from '../nutrients.js';

const BASE = 'https://api.nal.usda.gov/fdc/v1';
export const DEFAULT_USDA_KEY = 'DEMO_KEY';

/** Búsqueda por texto. Los valores de foodNutrients vienen por 100 g. */
export async function searchUSDA(query, apiKey = DEFAULT_USDA_KEY, pageSize = 25) {
  const params = new URLSearchParams({
    api_key: apiKey || DEFAULT_USDA_KEY,
    query,
    pageSize: String(pageSize),
    dataType: 'Foundation,SR Legacy,Survey (FNDDS),Branded',
  });
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 15000);
  try {
    const r = await fetch(`${BASE}/foods/search?${params}`, { signal: ctrl.signal });
    if (r.status === 429) throw new Error('USDA: límite de peticiones alcanzado. Configura tu propia clave en Perfil → Ajustes.');
    if (r.status === 403) throw new Error('USDA: clave de API no válida.');
    if (!r.ok) throw new Error(`USDA respondió ${r.status}`);
    const data = await r.json();
    return (data.foods || []).map(mapFood);
  } finally {
    clearTimeout(t);
  }
}

/** Convierte un resultado de USDA al modelo interno. */
export function mapFood(f) {
  // Índice nutrientId → { value, unit }
  const byId = new Map();
  for (const fn of f.foodNutrients || []) {
    const id = fn.nutrientId ?? fn.nutrient?.id;
    const value = fn.value ?? fn.amount;
    if (id != null && value != null) byId.set(Number(id), { value: Number(value), unit: fn.unitName ?? fn.nutrient?.unitName ?? '' });
  }

  const per100 = {};
  for (const n of NUTRIENTS) {
    per100[n.key] = null;
    for (const id of n.usda || []) {
      const v = byId.get(id);
      if (!v) continue;
      if (n.unit === 'kcal') {
        if (String(v.unit).toUpperCase() === 'KCAL') { per100.kcal = v.value; break; }
        continue;
      }
      const conv = convertMass(v.value, v.unit, n.unit);
      if (conv != null) { per100[n.key] = conv; break; }
    }
  }
  if (per100.kcal == null) {
    const kj = byId.get(1062);
    per100.kcal = kj ? kj.value / 4.184 : kcalFromMacros(per100);
  }

  // Porción (solo en alimentos de marca). Si la unidad es ml se trata como g.
  let servingSize = null;
  let servingLabel = '';
  if (f.servingSize && /^(g|grm|ml|mlt)$/i.test(f.servingSizeUnit || '')) {
    servingSize = Number(f.servingSize);
    servingLabel = f.householdServingFullText
      ? `${f.householdServingFullText} (${servingSize} ${f.servingSizeUnit.toLowerCase().startsWith('m') ? 'ml' : 'g'})`
      : `${servingSize} g`;
  }

  return {
    id: `usda:${f.fdcId}`,
    source: 'usda',
    code: f.gtinUpc ? String(f.gtinUpc) : '',
    name: titleCase(f.description || ''),
    brand: f.brandName || f.brandOwner || '',
    servingSize,
    servingLabel,
    per100,
    image: '',
    dataType: f.dataType,
  };
}

/** Las descripciones de USDA vienen en mayúsculas en los productos de marca. */
function titleCase(s) {
  if (s !== s.toUpperCase()) return s;
  return s.toLowerCase().replace(/(^|[\s,(])\p{L}/gu, (m) => m.toUpperCase());
}
