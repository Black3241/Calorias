/**
 * Estado compartido de la app (fecha seleccionada, perfil y metas) y un bus
 * de eventos mínimo para que las vistas se actualicen cuando cambian datos.
 */
import { getSetting, setSetting } from './db.js';
import { computeGoals, effectiveGoals } from './goals.js';
import { todayISO } from './utils.js';

export const state = {
  date: todayISO(),     // día que se está viendo/editando
  profile: null,        // perfil del usuario (null = falta configurarlo)
  overrides: {},        // metas editadas a mano { clave: valor }
  auto: null,           // metas calculadas
  goals: null,          // metas efectivas (auto + manuales)
  usdaKey: '',
  theme: 'auto',
};

const listeners = new Set();
/** Suscribe una función a cambios de datos. Devuelve la función para cancelar. */
export function onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }
/** Notifica que algo cambió (entradas, alimentos, metas…). */
export function emitChange(what = 'data') { listeners.forEach((fn) => fn(what)); }

/** Recalcula las metas efectivas a partir del perfil y las ediciones manuales. */
function recompute() {
  state.auto = state.profile ? computeGoals(state.profile) : null;
  state.goals = state.auto ? effectiveGoals(state.auto, state.overrides) : null;
}

/** Carga los ajustes guardados al iniciar. */
export async function loadState() {
  state.profile = await getSetting('profile', null);
  state.overrides = await getSetting('goalOverrides', {}) || {};
  state.usdaKey = await getSetting('usdaKey', '') || '';
  state.theme = await getSetting('theme', 'auto') || 'auto';
  recompute();
}

export async function saveProfile(profile) {
  state.profile = profile;
  await setSetting('profile', profile);
  recompute();
  emitChange('goals');
}

export async function saveOverrides(overrides) {
  state.overrides = overrides;
  await setSetting('goalOverrides', overrides);
  recompute();
  emitChange('goals');
}

export function setDate(iso) {
  state.date = iso;
  emitChange('date');
}
