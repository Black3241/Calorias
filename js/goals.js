/**
 * Cálculo de metas nutricionales a partir del perfil.
 *
 * - Metabolismo basal: Mifflin-St Jeor
 *     hombre: 10·kg + 6.25·cm − 5·edad + 5
 *     mujer:  10·kg + 6.25·cm − 5·edad − 161
 * - Mantenimiento = basal × factor de actividad.
 * - Objetivo: déficit (bajar) o superávit (subir) en % configurable.
 * - Proteína y grasa en g por kg de peso; carbohidratos = kcal restantes.
 * - Fibra: 14 g por cada 1000 kcal.
 * - Resto: valores de referencia generales para adultos (IOM/NASEM, OMS).
 *
 * Son estimaciones generales, no consejo médico.
 */

export const ACTIVITY = {
  sedentario: { label: 'Sedentario (poco o nada de ejercicio)', factor: 1.2 },
  ligero: { label: 'Ligero (1–3 días/semana)', factor: 1.375 },
  moderado: { label: 'Moderado (3–5 días/semana)', factor: 1.55 },
  alto: { label: 'Alto (6–7 días/semana)', factor: 1.725 },
};

export const OBJECTIVES = {
  bajar: 'Bajar peso',
  mantener: 'Mantener peso',
  subir: 'Subir peso',
};

export const DEFAULT_PROFILE = {
  weight: 70,
  height: 170,
  age: 30,
  sex: 'm',                 // 'm' | 'f'
  activity: 'ligero',
  objective: 'mantener',
  deficitPct: 15,           // % de déficit al bajar
  surplusPct: 10,           // % de superávit al subir
  proteinPerKg: 1.6,        // 0.8 – 2.2
  fatPerKg: 0.8,
};

export const PROTEIN_RANGE = { min: 0.8, max: 2.2, step: 0.1 };
export const FAT_RANGE = { min: 0.5, max: 1.5, step: 0.1 };

/** Claves de meta editables y su etiqueta. */
export const GOAL_FIELDS = [
  ['kcal', 'Calorías', 'kcal'],
  ['protein', 'Proteína', 'g'],
  ['carbs', 'Carbohidratos', 'g'],
  ['fat', 'Grasa', 'g'],
  ['fiber', 'Fibra', 'g'],
  ['sugars', 'Azúcares (máx.)', 'g'],
  ['satFat', 'Grasa saturada (máx.)', 'g'],
  ['transFat', 'Grasa trans (máx.)', 'g'],
  ['sodium', 'Sodio (máx.)', 'mg'],
  ['cholesterol', 'Colesterol (máx.)', 'mg'],
  ['potassium', 'Potasio', 'mg'],
  ['calcium', 'Calcio', 'mg'],
  ['iron', 'Hierro', 'mg'],
  ['magnesium', 'Magnesio', 'mg'],
  ['zinc', 'Zinc', 'mg'],
  ['phosphorus', 'Fósforo', 'mg'],
  ['vitA', 'Vitamina A', 'µg'],
  ['vitC', 'Vitamina C', 'mg'],
  ['vitD', 'Vitamina D', 'µg'],
  ['vitE', 'Vitamina E', 'mg'],
  ['vitK', 'Vitamina K', 'µg'],
  ['vitB12', 'Vitamina B12', 'µg'],
  ['folate', 'Folato (B9)', 'µg'],
];

/** Metabolismo basal (kcal/día). */
export function bmr({ weight, height, age, sex }) {
  return 10 * weight + 6.25 * height - 5 * age + (sex === 'f' ? -161 : 5);
}

/** Calorías de mantenimiento (kcal/día). */
export function maintenance(profile) {
  return bmr(profile) * (ACTIVITY[profile.activity]?.factor ?? 1.2);
}

/** Valores de referencia de micronutrientes según sexo y edad (adultos). */
export function microReferences({ sex, age }) {
  const f = sex === 'f';
  return {
    sodium: 2300,                                          // máx. mg
    cholesterol: 300,                                      // máx. mg
    potassium: f ? 2600 : 3400,
    calcium: (f && age > 50) || age > 70 ? 1200 : 1000,
    iron: f && age <= 50 ? 18 : 8,
    magnesium: f ? (age <= 30 ? 310 : 320) : (age <= 30 ? 400 : 420),
    zinc: f ? 8 : 11,
    phosphorus: 700,
    vitA: f ? 700 : 900,
    vitC: f ? 75 : 90,
    vitD: age > 70 ? 20 : 15,
    vitE: 15,
    vitK: f ? 90 : 120,
    vitB12: 2.4,
    folate: 400,
  };
}

/**
 * Calcula todas las metas a partir del perfil.
 * @returns {{kcal:number, protein:number, carbs:number, fat:number, ...,
 *            _bmr:number, _maintenance:number, _carbsWarning:boolean}}
 */
export function computeGoals(p) {
  const base = bmr(p);
  const maint = maintenance(p);
  let kcal = maint;
  if (p.objective === 'bajar') kcal = maint * (1 - (p.deficitPct ?? 15) / 100);
  if (p.objective === 'subir') kcal = maint * (1 + (p.surplusPct ?? 10) / 100);

  const protein = p.weight * (p.proteinPerKg ?? 1.6);
  const fat = p.weight * (p.fatPerKg ?? 0.8);
  const carbsRaw = (kcal - protein * 4 - fat * 9) / 4;

  return {
    kcal: Math.round(kcal),
    protein: Math.round(protein),
    fat: Math.round(fat),
    carbs: Math.max(0, Math.round(carbsRaw)),
    fiber: Math.round((kcal / 1000) * 14),
    sugars: Math.round((kcal * 0.10) / 4),              // < 10 % de las kcal
    satFat: Math.round((kcal * 0.10) / 9),              // < 10 % de las kcal
    transFat: 2,
    ...microReferences(p),
    _bmr: Math.round(base),
    _maintenance: Math.round(maint),
    _carbsWarning: carbsRaw < 0,
  };
}

/** Combina metas calculadas con las editadas a mano (las manuales ganan). */
export function effectiveGoals(auto, overrides = {}) {
  const out = { ...auto };
  for (const [k, v] of Object.entries(overrides || {})) {
    if (v != null && Number.isFinite(Number(v))) out[k] = Number(v);
  }
  return out;
}

/** Validación básica del perfil. Devuelve un mensaje de error o null. */
export function validateProfile(p) {
  if (!(p.weight >= 25 && p.weight <= 350)) return 'Peso fuera de rango (25–350 kg).';
  if (!(p.height >= 100 && p.height <= 250)) return 'Estatura fuera de rango (100–250 cm).';
  if (!(p.age >= 14 && p.age <= 110)) return 'Edad fuera de rango (14–110 años).';
  if (!ACTIVITY[p.activity]) return 'Selecciona un nivel de actividad.';
  if (!OBJECTIVES[p.objective]) return 'Selecciona un objetivo.';
  return null;
}

export const DISCLAIMER = 'Las metas son estimaciones generales basadas en fórmulas y valores de referencia para adultos sanos. No sustituyen el consejo de un profesional de la salud.';
