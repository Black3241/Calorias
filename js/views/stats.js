/**
 * Vista "Gráficas": calorías por día, dona de macros, tendencia semanal y
 * mensual, y micronutrientes frente a la meta.
 */
import { entriesInRange } from '../db.js';
import { entryNutrients, sumNutrients, NUTRIENT_MAP, fmtNutrient } from '../nutrients.js';
import { state } from '../state.js';
import { makeChart, destroyChart, colors } from '../charts.js';
import { dateBar, bindDateBar } from './today.js';
import {
  addDays, dateRange, shortDate, parseISODate, toISODate, fmt, esc, $, $$,
} from '../utils.js';

const ui = { days: 7, trend: 'week' };

/** Totales por día: Map(fecha → nutrientes). Solo incluye días con registros. */
async function dailyTotals(from, to) {
  const entries = await entriesInRange(from, to);
  const byDay = new Map();
  for (const e of entries) {
    if (!byDay.has(e.date)) byDay.set(e.date, []);
    byDay.get(e.date).push(entryNutrients(e));
  }
  const out = new Map();
  byDay.forEach((list, d) => out.set(d, sumNutrients(list)));
  return out;
}

/** Lunes de la semana de una fecha ISO. */
function weekStart(iso) {
  const d = parseISODate(iso);
  const dow = (d.getDay() + 6) % 7;        // 0 = lunes
  d.setDate(d.getDate() - dow);
  return toISODate(d);
}

/** Promedia los días registrados agrupando por semana o mes. */
function groupAverages(totals, mode, end) {
  const groups = new Map();
  // Definimos los 12 periodos que terminan en `end`.
  const keys = [];
  if (mode === 'week') {
    let w = weekStart(end);
    for (let i = 0; i < 12; i++) { keys.unshift(w); w = addDays(w, -7); }
  } else {
    const d = parseISODate(end);
    for (let i = 0; i < 12; i++) {
      keys.unshift(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
      d.setDate(1); d.setMonth(d.getMonth() - 1);
    }
  }
  keys.forEach((k) => groups.set(k, []));
  totals.forEach((n, date) => {
    const k = mode === 'week' ? weekStart(date) : date.slice(0, 7);
    groups.get(k)?.push(n);
  });
  const avg = (list, key) => (list.length ? list.reduce((a, n) => a + n[key], 0) / list.length : null);
  return keys.map((k) => {
    const list = groups.get(k);
    return {
      key: k,
      label: mode === 'week' ? shortDate(k) : new Intl.DateTimeFormat('es', { month: 'short', year: '2-digit' }).format(parseISODate(`${k}-15`)),
      days: list.length,
      kcal: avg(list, 'kcal'), protein: avg(list, 'protein'), carbs: avg(list, 'carbs'), fat: avg(list, 'fat'),
    };
  });
}

export async function renderStats(view) {
  const date = state.date;
  const goals = state.goals || {};
  const c = colors();

  // Cargamos un año de datos de una vez (cubre todas las gráficas).
  const yearAgo = addDays(date, -370);
  const totals = await dailyTotals(yearAgo, date);
  const day = totals.get(date) || sumNutrients([]);
  const microKeys = ['fiber', 'sugars', 'satFat', 'sodium', 'cholesterol', 'potassium', 'calcium', 'iron',
    'magnesium', 'zinc', 'phosphorus', 'vitA', 'vitC', 'vitD', 'vitE', 'vitK', 'vitB12', 'folate']
    .filter((k) => goals[k] > 0);

  view.innerHTML = `
    ${dateBar(date)}

    <section class="card">
      <div class="row spread"><h2>Calorías por día</h2>
        <div class="seg" data-days style="width:150px">
          <button data-d="7">7 d</button><button data-d="30">30 d</button>
        </div>
      </div>
      <div class="chart-box"><canvas data-c="daily" aria-label="Calorías por día"></canvas></div>
      <p class="muted" data-daily-sum style="font-size:.85rem;margin:8px 0 0"></p>
    </section>

    <section class="card">
      <h2>Macros del día</h2>
      ${day.kcal > 0 ? `
        <div class="chart-box donut"><canvas data-c="donut" aria-label="Distribución de macros"></canvas></div>
        <div class="legend-inline" data-donut-legend></div>` : '<p class="empty">Sin registros este día.</p>'}
    </section>

    <section class="card">
      <div class="row spread"><h2>Tendencia</h2>
        <div class="seg" data-trend style="width:190px">
          <button data-t="week">Semanal</button><button data-t="month">Mensual</button>
        </div>
      </div>
      <p class="muted" style="font-size:.8rem;margin:0 0 6px">Promedio diario de los días con registros.</p>
      <div class="chart-box"><canvas data-c="trend" aria-label="Tendencia de calorías"></canvas></div>
    </section>

    <section class="card">
      <h2>Micronutrientes frente a la meta</h2>
      <p class="muted" style="font-size:.8rem;margin:0 0 6px">% de la meta del día. En los marcados “máx.” la meta es un límite.</p>
      <div class="chart-box" style="height:${microKeys.length * 26 + 40}px"><canvas data-c="micro" aria-label="Micronutrientes"></canvas></div>
      <details style="margin-top:8px"><summary>Ver tabla</summary><div data-micro-table></div></details>
    </section>`;

  bindDateBar(view);

  /* ---------- Calorías por día ---------- */
  let dailyChart;
  const drawDaily = () => {
    destroyChart(dailyChart);
    $$('[data-d]', view).forEach((b) => b.classList.toggle('on', Number(b.dataset.d) === ui.days));
    const days = dateRange(addDays(date, -(ui.days - 1)), date);
    const vals = days.map((d) => Math.round(totals.get(d)?.kcal || 0));
    const logged = days.filter((d) => totals.has(d));
    const avg = logged.length ? logged.reduce((a, d) => a + totals.get(d).kcal, 0) / logged.length : 0;
    $('[data-daily-sum]', view).textContent = logged.length
      ? `Promedio: ${fmt(avg)} kcal/día en ${logged.length} día(s) con registros.`
      : 'Sin registros en este periodo.';
    dailyChart = makeChart($('[data-c="daily"]', view), {
      type: 'bar',
      data: {
        labels: days.map((d) => (ui.days <= 7 ? new Intl.DateTimeFormat('es', { weekday: 'short' }).format(parseISODate(d)) : shortDate(d))),
        datasets: [
          {
            label: 'Consumidas', data: vals,
            backgroundColor: vals.map((v) => (goals.kcal && v > goals.kcal ? c.over : c.primary)),
            borderRadius: 4, borderSkipped: 'start', maxBarThickness: 28, order: 2,
          },
          {
            label: 'Meta', data: days.map(() => goals.kcal || null), type: 'line',
            borderColor: c.text2, borderDash: [5, 4], borderWidth: 2, pointRadius: 0, order: 1,
          },
        ],
      },
      options: {
        interaction: { mode: 'index', intersect: false },
        scales: { y: { beginAtZero: true, grid: { drawTicks: false } }, x: { grid: { display: false }, ticks: { maxRotation: 0, autoSkipPadding: 6 } } },
        plugins: { tooltip: { callbacks: { title: (it) => shortDate(days[it[0].dataIndex]) } } },
      },
    });
  };
  $$('[data-d]', view).forEach((b) => b.addEventListener('click', () => { ui.days = Number(b.dataset.d); drawDaily(); }));
  drawDaily();

  /* ---------- Dona de macros ---------- */
  if (day.kcal > 0) {
    const parts = [
      ['Proteína', day.protein, 4, c.protein],
      ['Carbohidratos', day.carbs, 4, c.carbs],
      ['Grasa', day.fat, 9, c.fat],
    ];
    const kcals = parts.map(([, g, f]) => g * f);
    const sum = kcals.reduce((a, b) => a + b, 0) || 1;
    makeChart($('[data-c="donut"]', view), {
      type: 'doughnut',
      data: {
        labels: parts.map((p) => p[0]),
        datasets: [{ data: kcals.map(Math.round), backgroundColor: parts.map((p) => p[3]), borderColor: c.surface, borderWidth: 2 }],
      },
      options: {
        cutout: '68%',
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: (it) => ` ${it.label}: ${fmt(parts[it.dataIndex][1], 1)} g · ${fmt((kcals[it.dataIndex] / sum) * 100)} %` } },
        },
      },
    });
    $('[data-donut-legend]', view).innerHTML = parts.map(([l, g, , col], i) => `
      <span><i style="background:${col}"></i>${l} <b>${fmt(g, 1)} g</b> (${fmt((kcals[i] / sum) * 100)} %)
      <span class="muted">/ ${fmt(goals[['protein', 'carbs', 'fat'][i]])} g</span></span>`).join('');
  }

  /* ---------- Tendencia semanal / mensual ---------- */
  let trendChart;
  const drawTrend = () => {
    destroyChart(trendChart);
    $$('[data-t]', view).forEach((b) => b.classList.toggle('on', b.dataset.t === ui.trend));
    const groups = groupAverages(totals, ui.trend, date);
    trendChart = makeChart($('[data-c="trend"]', view), {
      type: 'line',
      data: {
        labels: groups.map((g) => g.label),
        datasets: [
          {
            label: 'Promedio kcal/día', data: groups.map((g) => (g.kcal == null ? null : Math.round(g.kcal))),
            borderColor: c.primary, backgroundColor: c.primary, borderWidth: 2, pointRadius: 4, spanGaps: true, tension: 0.25,
          },
          {
            label: 'Meta', data: groups.map(() => goals.kcal || null),
            borderColor: c.text2, borderDash: [5, 4], borderWidth: 2, pointRadius: 0,
          },
        ],
      },
      options: {
        interaction: { mode: 'index', intersect: false },
        scales: { y: { beginAtZero: true }, x: { grid: { display: false }, ticks: { maxRotation: 0, autoSkipPadding: 8 } } },
        plugins: {
          tooltip: {
            callbacks: {
              afterBody: (it) => {
                const g = groups[it[0].dataIndex];
                return g.days ? [`${g.days} día(s) registrados`, `P ${fmt(g.protein)} g · C ${fmt(g.carbs)} g · G ${fmt(g.fat)} g`] : ['Sin registros'];
              },
            },
          },
        },
      },
    });
  };
  $$('[data-t]', view).forEach((b) => b.addEventListener('click', () => { ui.trend = b.dataset.t; drawTrend(); }));
  drawTrend();

  /* ---------- Micronutrientes ---------- */
  const pct = microKeys.map((k) => Math.round(((day[k] || 0) / goals[k]) * 100));
  makeChart($('[data-c="micro"]', view), {
    type: 'bar',
    data: {
      labels: microKeys.map((k) => `${NUTRIENT_MAP[k].label}${NUTRIENT_MAP[k].limit ? ' (máx.)' : ''}`),
      datasets: [{
        label: '% de la meta',
        data: pct.map((p) => Math.min(p, 200)),
        backgroundColor: microKeys.map((k, i) => (NUTRIENT_MAP[k].limit && pct[i] > 100 ? c.over : c.primary)),
        borderRadius: 4, borderSkipped: 'start', barThickness: 10,
      }],
    },
    options: {
      indexAxis: 'y',
      scales: { x: { beginAtZero: true, suggestedMax: 100, ticks: { callback: (v) => `${v}%` } }, y: { grid: { display: false }, ticks: { autoSkip: false } } },
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: (it) => ` ${pct[it.dataIndex]} % · ${fmtNutrient(microKeys[it.dataIndex], day[microKeys[it.dataIndex]] || 0)} de ${fmtNutrient(microKeys[it.dataIndex], goals[microKeys[it.dataIndex]])}` } },
      },
    },
  });
  $('[data-micro-table]', view).innerHTML = `<table class="ntable">${microKeys.map((k, i) => `
    <tr><td>${esc(NUTRIENT_MAP[k].label)}</td><td>${fmtNutrient(k, day[k] || 0)} / ${fmtNutrient(k, goals[k])} · ${pct[i]} %</td></tr>`).join('')}</table>
    <p class="muted" style="font-size:.8rem">Muchos productos no informan micronutrientes, así que el total puede quedar por debajo de lo real.</p>`;
}
