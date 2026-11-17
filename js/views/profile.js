/**
 * Vista "Perfil": datos personales, metas (calculadas y editables) y ajustes
 * (tema, clave USDA, respaldo). También sirve como pantalla de bienvenida.
 */
import { state, saveProfile, saveOverrides, emitChange } from '../state.js';
import {
  ACTIVITY, OBJECTIVES, DEFAULT_PROFILE, PROTEIN_RANGE, FAT_RANGE, GOAL_FIELDS,
  computeGoals, validateProfile, DISCLAIMER,
} from '../goals.js';
import { putWeight, setSetting, getWeights, clear, STORES } from '../db.js';
import {
  exportJSON, importJSON, exportEntriesCSV, exportWeightsCSV, exportFoodsCSV, importCSV,
} from '../backup.js';
import { confirmDialog } from './sheet.js';
import { applyTheme } from '../theme.js';
import { esc, fmt, parseNum, round, todayISO, toast, $, $$ } from '../utils.js';

export async function renderProfile(view, { onboarding = false } = {}) {
  const p = { ...DEFAULT_PROFILE, ...(state.profile || {}) };

  view.innerHTML = `
    ${onboarding ? `
      <section class="card">
        <h2>¡Bienvenido!</h2>
        <p>Para calcular tus metas necesito algunos datos. Todo se guarda solo en este dispositivo.</p>
      </section>` : ''}

    <form data-profile class="card">
      <h2>Perfil</h2>
      <div class="grid3">
        <label class="field"><span>Peso (kg)</span><input type="number" inputmode="decimal" step="0.1" name="weight" value="${p.weight}" required></label>
        <label class="field"><span>Estatura (cm)</span><input type="number" inputmode="decimal" step="0.5" name="height" value="${p.height}" required></label>
        <label class="field"><span>Edad</span><input type="number" inputmode="numeric" step="1" name="age" value="${p.age}" required></label>
      </div>
      <div class="field"><span>Sexo</span>
        <div class="seg" data-seg="sex">
          <button type="button" data-v="m">Hombre</button><button type="button" data-v="f">Mujer</button>
        </div></div>
      <label class="field"><span>Nivel de actividad</span>
        <select name="activity">${Object.entries(ACTIVITY).map(([k, a]) => `<option value="${k}" ${p.activity === k ? 'selected' : ''}>${esc(a.label)}</option>`).join('')}</select></label>
      <div class="field"><span>Objetivo</span>
        <div class="seg" data-seg="objective">
          ${Object.entries(OBJECTIVES).map(([k, l]) => `<button type="button" data-v="${k}">${esc(l.replace(' peso', ''))}</button>`).join('')}
        </div></div>
      <label class="field" data-adj><span data-adj-label></span>
        <input type="range" min="5" max="25" step="1" data-adj-range></label>
      <label class="field"><span>Proteína: <b data-pk></b> g por kg</span>
        <input type="range" name="proteinPerKg" min="${PROTEIN_RANGE.min}" max="${PROTEIN_RANGE.max}" step="${PROTEIN_RANGE.step}" value="${p.proteinPerKg}"></label>
      <label class="field"><span>Grasa: <b data-fk></b> g por kg</span>
        <input type="range" name="fatPerKg" min="${FAT_RANGE.min}" max="${FAT_RANGE.max}" step="${FAT_RANGE.step}" value="${p.fatPerKg}"></label>

      <div class="notice" data-calc></div>
      <button class="btn primary block" type="submit">${onboarding ? 'Empezar' : 'Guardar perfil'}</button>
      <p class="notice">${esc(DISCLAIMER)}</p>
    </form>

    ${onboarding ? '' : `
    <section class="card">
      <div class="row spread"><h2>Metas diarias</h2><button class="btn small" data-reset-all>Restablecer</button></div>
      <p class="muted" style="font-size:.82rem;margin-top:0">Calculadas a partir del perfil. Puedes escribir otro valor; vacío = automático.</p>
      <form data-goals>
        ${GOAL_FIELDS.map(([k, l, u]) => `
          <label class="field row" style="margin-bottom:6px">
            <span class="grow" style="margin:0;font-size:.9rem;color:var(--text)">${esc(l)} <small>(${u})</small>
              ${state.overrides[k] != null ? '<span class="badge">manual</span>' : ''}</span>
            <input type="number" inputmode="decimal" step="any" min="0" data-goal="${k}" style="width:110px"
              value="${state.overrides[k] ?? ''}" placeholder="${fmt(state.auto?.[k], 1)}">
          </label>`).join('')}
        <button class="btn primary block" type="submit">Guardar metas</button>
      </form>
    </section>

    <section class="card">
      <h2>Ajustes</h2>
      <div class="field"><span>Tema</span>
        <div class="seg" data-theme>
          <button type="button" data-v="auto">Automático</button><button type="button" data-v="light">Claro</button><button type="button" data-v="dark">Oscuro</button>
        </div></div>
      <label class="field"><span>Clave API de USDA FoodData Central (opcional)</span>
        <div class="row"><input type="password" data-usda value="${esc(state.usdaKey)}" placeholder="DEMO_KEY" autocomplete="off">
        <button class="btn" data-usda-save>Guardar</button></div></label>
      <p class="muted" style="font-size:.8rem;margin-top:-4px">Sin clave se usa DEMO_KEY (pocas búsquedas por hora). Consigue una gratis en api.data.gov/signup.</p>
    </section>

    <section class="card">
      <h2>Respaldo</h2>
      <p class="muted" style="font-size:.85rem;margin-top:0">Tus datos solo existen en este dispositivo. Exporta un respaldo de vez en cuando.</p>
      <div class="grid2">
        <button class="btn" data-exp="json">Exportar JSON</button>
        <button class="btn" data-exp="entries">Diario (CSV)</button>
        <button class="btn" data-exp="weights">Peso (CSV)</button>
        <button class="btn" data-exp="foods">Alimentos (CSV)</button>
      </div>
      <h3 style="margin-top:14px">Importar</h3>
      <div class="seg" data-impmode style="margin-bottom:8px">
        <button type="button" data-v="merge" class="on">Combinar</button><button type="button" data-v="replace">Reemplazar todo</button>
      </div>
      <label class="btn block">Elegir archivo JSON o CSV<input type="file" accept=".json,.csv,application/json,text/csv" data-import hidden></label>
      <p class="muted" style="font-size:.8rem">“Reemplazar” solo aplica a JSON. Los CSV siempre se combinan.</p>
      <button class="btn danger block" data-wipe style="margin-top:8px">Borrar todos los datos</button>
    </section>
    <p class="muted" style="text-align:center;font-size:.8rem">Datos de alimentos: Open Food Facts (ODbL) y USDA FoodData Central.</p>`}`;

  /* ---------- Perfil ---------- */
  const form = $('[data-profile]', view);
  const segVal = { sex: p.sex, objective: p.objective };
  const adj = { deficitPct: p.deficitPct, surplusPct: p.surplusPct };

  const readProfile = () => {
    const fd = new FormData(form);
    return {
      weight: parseNum(fd.get('weight')),
      height: parseNum(fd.get('height')),
      age: parseNum(fd.get('age')),
      sex: segVal.sex,
      activity: fd.get('activity'),
      objective: segVal.objective,
      deficitPct: adj.deficitPct,
      surplusPct: adj.surplusPct,
      proteinPerKg: parseNum(fd.get('proteinPerKg')),
      fatPerKg: parseNum(fd.get('fatPerKg')),
    };
  };

  /** Vista previa de los cálculos mientras se edita. */
  const preview = () => {
    const cur = readProfile();
    $('[data-pk]', view).textContent = fmt(cur.proteinPerKg, 1);
    $('[data-fk]', view).textContent = fmt(cur.fatPerKg, 1);
    const adjWrap = $('[data-adj]', view);
    adjWrap.hidden = cur.objective === 'mantener';
    if (cur.objective !== 'mantener') {
      const key = cur.objective === 'bajar' ? 'deficitPct' : 'surplusPct';
      $('[data-adj-range]', view).value = adj[key];
      $('[data-adj-label]', view).innerHTML = `${cur.objective === 'bajar' ? 'Déficit' : 'Superávit'}: <b>${adj[key]} %</b> (recomendado 10–15 %)`;
    }
    const err = validateProfile(cur);
    if (err) { $('[data-calc]', view).textContent = err; return; }
    const g = computeGoals(cur);
    $('[data-calc]', view).innerHTML = `
      Basal (Mifflin-St Jeor): <b>${fmt(g._bmr)}</b> kcal · Mantenimiento: <b>${fmt(g._maintenance)}</b> kcal<br>
      Meta: <b>${fmt(g.kcal)} kcal</b> · P ${fmt(g.protein)} g · C ${fmt(g.carbs)} g · G ${fmt(g.fat)} g · Fibra ${fmt(g.fiber)} g
      ${g._carbsWarning ? '<br><b style="color:var(--warn)">Proteína y grasa superan las calorías de la meta; ajusta los valores.</b>' : ''}`;
  };

  $$('[data-seg]', form).forEach((seg) => {
    const name = seg.dataset.seg;
    const sync = () => $$('button', seg).forEach((b) => b.classList.toggle('on', b.dataset.v === segVal[name]));
    seg.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (b) { segVal[name] = b.dataset.v; sync(); preview(); }
    });
    sync();
  });
  $('[data-adj-range]', view).addEventListener('input', (e) => {
    adj[segVal.objective === 'bajar' ? 'deficitPct' : 'surplusPct'] = Number(e.target.value);
    preview();
  });
  form.addEventListener('input', preview);
  preview();

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const cur = readProfile();
    const err = validateProfile(cur);
    if (err) { toast(err); return; }
    const prevWeight = state.profile?.weight;
    await saveProfile(cur);
    // Si el peso del perfil cambió (o es el primero), lo anotamos en el registro de hoy.
    const weights = await getWeights();
    if (!weights.length || prevWeight !== cur.weight) await putWeight({ date: todayISO(), kg: round(cur.weight, 2) });
    toast(onboarding ? 'Perfil creado' : 'Perfil guardado');
    if (onboarding) location.hash = '#/hoy';
  });

  if (onboarding) return;

  /* ---------- Metas manuales ---------- */
  $('[data-goals]', view).addEventListener('submit', async (e) => {
    e.preventDefault();
    const o = {};
    $$('[data-goal]', view).forEach((i) => {
      const v = parseNum(i.value);
      if (v != null && v >= 0) o[i.dataset.goal] = v;
    });
    await saveOverrides(o);
    toast('Metas guardadas');
  });
  $('[data-reset-all]', view).onclick = async () => {
    if (!(await confirmDialog('¿Volver a las metas calculadas automáticamente?', { ok: 'Restablecer' }))) return;
    await saveOverrides({});
    toast('Metas restablecidas');
  };

  /* ---------- Tema ---------- */
  const themeSeg = $('[data-theme]', view);
  const syncTheme = () => $$('button', themeSeg).forEach((b) => b.classList.toggle('on', b.dataset.v === state.theme));
  themeSeg.addEventListener('click', async (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    state.theme = b.dataset.v;
    await setSetting('theme', state.theme);
    applyTheme(state.theme);
    syncTheme();
  });
  syncTheme();

  /* ---------- USDA ---------- */
  $('[data-usda-save]', view).onclick = async () => {
    state.usdaKey = $('[data-usda]', view).value.trim();
    await setSetting('usdaKey', state.usdaKey);
    toast('Clave guardada');
  };

  /* ---------- Respaldo ---------- */
  const exporters = { json: exportJSON, entries: exportEntriesCSV, weights: exportWeightsCSV, foods: exportFoodsCSV };
  $$('[data-exp]', view).forEach((b) => b.addEventListener('click', () => exporters[b.dataset.exp]().catch((err) => toast(err.message))));

  let impMode = 'merge';
  $('[data-impmode]', view).addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    impMode = b.dataset.v;
    $$('[data-impmode] button', view).forEach((x) => x.classList.toggle('on', x === b));
  });

  $('[data-import]', view).addEventListener('change', async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    try {
      const text = await file.text();
      if (file.name.toLowerCase().endsWith('.json') || text.trim().startsWith('{')) {
        if (impMode === 'replace' && !(await confirmDialog('Se borrarán los datos actuales y se reemplazarán por los del archivo.', { ok: 'Reemplazar', danger: true }))) return;
        const r = await importJSON(text, impMode);
        toast(`Importado: ${r.entries} entradas, ${r.foods} alimentos, ${r.weights} pesos`);
      } else {
        const r = await importCSV(text);
        toast(`Importado: ${r.count} ${r.type}`);
      }
      await reloadSettings();
    } catch (err) {
      toast(`No se pudo importar: ${err.message}`);
    }
  });

  $('[data-wipe]', view).onclick = async () => {
    if (!(await confirmDialog('Se borrarán diario, alimentos, pesos, perfil y metas de este dispositivo. No se puede deshacer.', { title: 'Borrar todo', ok: 'Borrar todo', danger: true }))) return;
    for (const s of STORES) await clear(s);
    location.hash = '#/hoy';
    location.reload();
  };
}

/** Tras importar, recarga perfil/metas/tema desde la base de datos. */
async function reloadSettings() {
  const { loadState } = await import('../state.js');
  await loadState();
  applyTheme(state.theme);
  emitChange('import');
}
