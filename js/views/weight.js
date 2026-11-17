/**
 * Vista "Peso": registro de peso corporal, gráfica de tendencia con promedio
 * móvil de 7 días y recálculo de metas (con confirmación) cuando cambia.
 */
import { getWeights, putWeight, deleteWeight } from '../db.js';
import { state, saveProfile, saveOverrides } from '../state.js';
import { computeGoals, DISCLAIMER } from '../goals.js';
import { makeChart, destroyChart, colors } from '../charts.js';
import { openSheet, confirmDialog } from './sheet.js';
import {
  esc, fmt, parseNum, round, todayISO, addDays, shortDate, friendlyDate, toast, ICONS, $, $$,
} from '../utils.js';

const ui = { range: 90 };
const DAY_MS = 86400000;

/** Días desde época para usar un eje lineal (evita depender de un adaptador de fechas). */
const dayNum = (iso) => {
  const [y, m, d] = iso.split('-').map(Number);
  return Date.UTC(y, m - 1, d) / DAY_MS;
};
const fromDayNum = (n) => {
  const d = new Date(Math.round(n) * DAY_MS);
  return shortDate(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`);
};

/** Promedio móvil: media de los registros de los 7 días que terminan en cada fecha. */
export function movingAverage(weights, windowDays = 7) {
  return weights.map((w) => {
    const from = addDays(w.date, -(windowDays - 1));
    const win = weights.filter((x) => x.date >= from && x.date <= w.date);
    return { date: w.date, kg: win.reduce((a, x) => a + x.kg, 0) / win.length };
  });
}

export async function renderWeight(view) {
  const weights = await getWeights();
  const ma = movingAverage(weights);
  const last = weights[weights.length - 1];
  const lastMa = ma[ma.length - 1];
  const c = colors();

  view.innerHTML = `
    <section class="card">
      <h2>Registrar peso</h2>
      <form data-form class="grid3" style="align-items:end">
        <label class="field" style="margin:0"><span>Fecha</span><input type="date" data-date value="${todayISO()}" max="${todayISO()}"></label>
        <label class="field" style="margin:0"><span>Peso (kg)</span><input type="number" inputmode="decimal" step="0.1" min="20" max="400" data-kg value="${last ? last.kg : (state.profile?.weight ?? '')}" required></label>
        <button class="btn primary" type="submit">Guardar</button>
      </form>
    </section>

    <section class="card">
      <div class="row spread"><h2>Tendencia</h2>
        <div class="seg" data-range style="width:210px">
          <button data-r="30">30 d</button><button data-r="90">90 d</button><button data-r="365">1 año</button><button data-r="0">Todo</button>
        </div>
      </div>
      ${weights.length ? `
        <div class="grid3" style="text-align:center;margin:6px 0 10px">
          <div><small>Último</small><br><b>${fmt(last.kg, 1)} kg</b></div>
          <div><small>Prom. 7 días</small><br><b>${fmt(lastMa.kg, 1)} kg</b></div>
          <div><small>En metas</small><br><b>${fmt(state.profile?.weight, 1)} kg</b></div>
        </div>
        <div class="chart-box"><canvas data-c="weight" aria-label="Tendencia de peso"></canvas></div>`
    : '<p class="empty">Aún no hay registros de peso.</p>'}
    </section>

    <section class="card">
      <h2>Historial</h2>
      ${weights.length ? `<ul class="list">${[...weights].reverse().map((w) => `
        <li data-w="${w.date}">
          <div class="grow"><div class="name">${fmt(w.kg, 1)} kg</div><div class="sub">${esc(friendlyDate(w.date))}</div></div>
          <button class="icon-btn" data-del="${w.date}" aria-label="Borrar">${ICONS.trash}</button>
        </li>`).join('')}</ul>` : '<p class="empty">Sin registros.</p>'}
    </section>
    <p class="notice">${esc(DISCLAIMER)}</p>`;

  /* Guardar */
  $('[data-form]', view).addEventListener('submit', async (e) => {
    e.preventDefault();
    const date = $('[data-date]', view).value || todayISO();
    const kg = parseNum($('[data-kg]', view).value);
    if (!(kg >= 20 && kg <= 400)) { toast('Peso no válido'); return; }
    await putWeight({ date, kg: round(kg, 2) });
    toast('Peso guardado');
    await maybeRecalculate();
    renderWeight(view);
  });

  /* Borrar */
  $$('[data-del]', view).forEach((b) => b.addEventListener('click', async (e) => {
    e.stopPropagation();
    if (!(await confirmDialog(`¿Borrar el registro del ${friendlyDate(b.dataset.del).toLowerCase()}?`, { ok: 'Borrar', danger: true }))) return;
    await deleteWeight(b.dataset.del);
    renderWeight(view);
  }));

  /* Gráfica */
  if (!weights.length) return;
  let chart;
  const draw = () => {
    destroyChart(chart);
    $$('[data-r]', view).forEach((b) => b.classList.toggle('on', Number(b.dataset.r) === ui.range));
    const from = ui.range ? addDays(todayISO(), -ui.range) : '0000-00-00';
    const pts = weights.filter((w) => w.date >= from).map((w) => ({ x: dayNum(w.date), y: w.kg }));
    const maPts = ma.filter((w) => w.date >= from).map((w) => ({ x: dayNum(w.date), y: round(w.kg, 2) }));
    chart = makeChart($('[data-c="weight"]', view), {
      type: 'line',
      data: {
        datasets: [
          { label: 'Peso', data: pts, borderColor: c.text2, backgroundColor: c.text2, showLine: false, pointRadius: 4 },
          { label: 'Promedio 7 días', data: maPts, borderColor: c.primary, backgroundColor: c.primary, borderWidth: 2, pointRadius: 0, tension: 0.3 },
        ],
      },
      options: {
        interaction: { mode: 'nearest', intersect: false },
        scales: {
          x: { type: 'linear', ticks: { callback: (v) => fromDayNum(v), maxTicksLimit: 6 }, grid: { display: false } },
          y: { ticks: { callback: (v) => `${v} kg` } },
        },
        plugins: { tooltip: { callbacks: { title: (it) => fromDayNum(it[0].parsed.x), label: (it) => ` ${it.dataset.label}: ${fmt(it.parsed.y, 1)} kg` } } },
      },
    });
  };
  $$('[data-r]', view).forEach((b) => b.addEventListener('click', () => { ui.range = Number(b.dataset.r); draw(); }));
  draw();
}

/**
 * Si el peso más reciente difiere del usado en las metas, propone recalcular
 * mostrando los valores actuales y los nuevos. Requiere confirmación.
 */
export async function maybeRecalculate() {
  const p = state.profile;
  if (!p) return;
  const weights = await getWeights();
  const last = weights[weights.length - 1];
  if (!last || Math.abs(last.kg - p.weight) < 0.1) return;

  const next = computeGoals({ ...p, weight: last.kg });
  const cur = state.goals;
  const keys = [['kcal', 'Calorías', 'kcal'], ['protein', 'Proteína', 'g'], ['carbs', 'Carbohidratos', 'g'], ['fat', 'Grasa', 'g'], ['fiber', 'Fibra', 'g']];
  const weightKeys = ['kcal', 'protein', 'carbs', 'fat', 'fiber', 'sugars', 'satFat'];
  const hasOverrides = weightKeys.some((k) => state.overrides[k] != null);

  openSheet({
    title: 'Recalcular metas',
    body: `
      <p>Tu peso cambió de <b>${fmt(p.weight, 1)} kg</b> a <b>${fmt(last.kg, 1)} kg</b>. ¿Actualizar las metas?</p>
      <table class="ntable">
        <tr><td></td><td><small>Actual → Nueva</small></td></tr>
        ${keys.map(([k, l, u]) => `<tr><td>${l}</td><td>${fmt(cur[k])} → <b>${fmt(next[k])}</b> ${u}</td></tr>`).join('')}
      </table>
      ${hasOverrides ? `<label class="row" style="margin-top:12px"><input type="checkbox" data-keep checked> Conservar las metas que edité a mano</label>` : ''}
      <p class="notice">${esc(DISCLAIMER)}</p>`,
    foot: '<button class="btn" data-no>Ahora no</button><button class="btn primary" data-yes>Aplicar</button>',
    onMount: (el, close) => {
      $('[data-no]', el).onclick = close;
      $('[data-yes]', el).onclick = async () => {
        const keep = $('[data-keep]', el)?.checked ?? true;
        if (!keep) {
          const o = { ...state.overrides };
          weightKeys.forEach((k) => delete o[k]);
          await saveOverrides(o);
        }
        await saveProfile({ ...p, weight: last.kg });
        close();
        toast('Metas actualizadas');
      };
    },
  });
}
