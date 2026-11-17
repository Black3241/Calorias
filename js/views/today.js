/**
 * Pantalla principal ("Hoy"): resumen de calorías, macros y lista del día.
 */
import { entriesByDate, recentFoods, favoriteFoods } from '../db.js';
import { entryNutrients, sumNutrients } from '../nutrients.js';
import { MEALS } from '../foods.js';
import { state, setDate } from '../state.js';
import { openEditEntry, openAddFood } from './foodDialogs.js';
import { openScanner } from './scan.js';
import { openSheet } from './sheet.js';
import { DISCLAIMER } from '../goals.js';
import {
  esc, fmt, todayISO, addDays, friendlyDate, formatTime, ICONS, $, $$,
} from '../utils.js';

/** Selector de fecha (◀ fecha ▶). Reutilizado en otras vistas. */
export function dateBar(date) {
  const isToday = date === todayISO();
  return `
    <div class="datebar">
      <button class="icon-btn" data-day="-1" aria-label="Día anterior">${ICONS.back}</button>
      <label class="date-label">${esc(friendlyDate(date))}
        <input type="date" data-pick value="${date}" aria-label="Elegir fecha"></label>
      <button class="icon-btn" data-day="1" aria-label="Día siguiente">${ICONS.next}</button>
      ${isToday ? '' : '<button class="btn small" data-today>Hoy</button>'}
    </div>`;
}

/** Conecta los eventos del selector de fecha. */
export function bindDateBar(root) {
  $$('[data-day]', root).forEach((b) => b.addEventListener('click', () => setDate(addDays(state.date, Number(b.dataset.day)))));
  $('[data-pick]', root)?.addEventListener('change', (e) => { if (e.target.value) setDate(e.target.value); });
  $('[data-today]', root)?.addEventListener('click', () => setDate(todayISO()));
}

/**
 * Barra de progreso.
 * Si se supera la meta cambia de color y muestra "+X".
 */
export function progressBar({ label, consumed, goal, unit, color, mini = false, limit = false }) {
  const c = consumed || 0;
  const g = goal || 0;
  const over = g > 0 && c > g;
  const pct = g > 0 ? Math.min(100, (c / g) * 100) : 0;
  const dec = unit === 'g' && g < 50 ? 1 : 0;
  const rest = !g ? 'sin meta' : over ? `+${fmt(c - g, dec)} ${unit}` : `${limit ? 'quedan' : 'faltan'} ${fmt(g - c, dec)} ${unit}`;
  return `
    <div class="bar ${mini ? 'mini' : ''} ${over ? 'over' : ''}" style="--c:${color}">
      <div class="bar-head">
        <span><b>${esc(label)}</b> ${mini ? '<br>' : ''}<span class="muted">${fmt(c, dec)} / ${fmt(g, dec)} ${unit}</span></span>
        <span class="rest">${rest}</span>
      </div>
      <div class="track"><div class="fill" style="width:${pct}%"></div></div>
    </div>`;
}

/** Anillo de calorías en SVG. */
function ring(consumed, goal) {
  const r = 54;
  const circ = 2 * Math.PI * r;
  const pct = goal > 0 ? Math.min(1, consumed / goal) : 0;
  const over = goal > 0 && consumed > goal;
  const remaining = goal - consumed;
  return `
    <div class="ring ${over ? 'over' : ''}" role="img" aria-label="${fmt(consumed)} de ${fmt(goal)} kcal">
      <svg viewBox="0 0 132 132">
        <circle class="track" cx="66" cy="66" r="${r}"></circle>
        <circle class="prog" cx="66" cy="66" r="${r}" stroke-dasharray="${circ}" stroke-dashoffset="${circ * (1 - pct)}"></circle>
      </svg>
      <div class="center">
        <span class="big">${fmt(Math.abs(remaining))}</span>
        <span class="lbl">${over ? 'kcal de más' : 'kcal restantes'}</span>
      </div>
    </div>`;
}

/** Renderiza la vista. */
export async function renderToday(view) {
  const date = state.date;
  const goals = state.goals || {};
  const entries = await entriesByDate(date);
  const withN = entries.map((e) => ({ ...e, n: entryNutrients(e) }));
  const total = sumNutrients(withN.map((e) => e.n));
  const remaining = (goals.kcal || 0) - total.kcal;

  const mealCards = MEALS.map(([key, label]) => {
    const list = withN.filter((e) => e.meal === key);
    const sub = list.reduce((a, e) => a + (e.n.kcal || 0), 0);
    return `
      <section class="card">
        <div class="meal-head">
          <h3>${label}</h3>
          <div class="row">
            <span class="meal-kcal">${fmt(sub)} kcal</span>
            <button class="icon-btn" data-addmeal="${key}" aria-label="Agregar a ${label}">${ICONS.plus}</button>
          </div>
        </div>
        ${list.length ? `<ul class="list">${list.map((e) => `
          <li data-entry="${e.id}">
            <div class="grow">
              <div class="name">${esc(e.name)}</div>
              <div class="sub">${e.unit === 'serving' ? `${fmt(e.qty, 2)} porc. · ` : ''}${fmt(e.grams, 1)} g · ${formatTime(e.time)}
                · P ${fmt(e.n.protein, 1)} · C ${fmt(e.n.carbs, 1)} · G ${fmt(e.n.fat, 1)}</div>
            </div>
            <span class="kcal">${fmt(e.n.kcal)}</span>
          </li>`).join('')}</ul>` : '<p class="empty">Sin registros.</p>'}
      </section>`;
  }).join('');

  view.innerHTML = `
    ${dateBar(date)}

    <section class="card">
      <div class="summary">
        ${ring(total.kcal, goals.kcal || 0)}
        <div class="kcal-stats">
          <div><span>Consumidas</span><b>${fmt(total.kcal)}</b></div>
          <div><span>Meta</span><b>${fmt(goals.kcal)}</b></div>
          <div><span>${remaining >= 0 ? 'Restantes' : 'Excedido'}</span><b style="${remaining < 0 ? 'color:var(--over)' : ''}">${fmt(Math.abs(remaining))}</b></div>
        </div>
      </div>
    </section>

    <section class="card">
      ${progressBar({ label: 'Proteína', consumed: total.protein, goal: goals.protein, unit: 'g', color: 'var(--protein)' })}
      ${progressBar({ label: 'Carbohidratos', consumed: total.carbs, goal: goals.carbs, unit: 'g', color: 'var(--carbs)' })}
      ${progressBar({ label: 'Grasa', consumed: total.fat, goal: goals.fat, unit: 'g', color: 'var(--fat)' })}
      <div class="mini-bars" style="margin-top:6px">
        ${progressBar({ label: 'Fibra', consumed: total.fiber, goal: goals.fiber, unit: 'g', color: 'var(--fiber)', mini: true })}
        ${progressBar({ label: 'Azúcares', consumed: total.sugars, goal: goals.sugars, unit: 'g', color: 'var(--sugars)', mini: true, limit: true })}
        ${progressBar({ label: 'Sodio', consumed: total.sodium, goal: goals.sodium, unit: 'mg', color: 'var(--sodium)', mini: true, limit: true })}
      </div>
    </section>

    <div class="chips" style="margin-bottom:12px;flex-wrap:wrap">
      <button class="chip" data-quick="recent">${ICONS.clock} Recientes</button>
      <button class="chip" data-quick="fav">${ICONS.star} Favoritos</button>
      <a class="chip" href="#/buscar" style="text-decoration:none;color:inherit">${ICONS.search} Buscar</a>
      <button class="chip" data-quick="scan">${ICONS.scan} Escanear</button>
    </div>

    ${mealCards}

    <p class="notice">${esc(DISCLAIMER)}</p>`;

  bindDateBar(view);
  $$('[data-entry]', view).forEach((li) => li.addEventListener('click', () => {
    const e = entries.find((x) => String(x.id) === li.dataset.entry);
    if (e) openEditEntry(e);
  }));
  $$('[data-addmeal]', view).forEach((b) => b.addEventListener('click', () => openAddMenu(b.dataset.addmeal)));
  $('[data-quick="recent"]', view).onclick = () => openQuickPick('recent');
  $('[data-quick="fav"]', view).onclick = () => openQuickPick('fav');
  $('[data-quick="scan"]', view).onclick = () => openScanner();
}

/** Menú "+" de una comida: escanear, recientes, favoritos o buscar. */
function openAddMenu(meal) {
  openSheet({
    title: 'Agregar',
    body: `
      <div style="display:grid;gap:8px">
        <button class="btn block primary" data-a="scan">${ICONS.scan} Escanear código</button>
        <button class="btn block" data-a="recent">${ICONS.clock} Recientes</button>
        <button class="btn block" data-a="fav">${ICONS.star} Favoritos</button>
        <button class="btn block" data-a="search">${ICONS.search} Buscar o crear alimento</button>
      </div>`,
    onMount: (el, close) => {
      el.addEventListener('click', (e) => {
        const a = e.target.closest('[data-a]')?.dataset.a;
        if (!a) return;
        close();
        if (a === 'scan') openScanner({ meal });
        if (a === 'recent' || a === 'fav') openQuickPick(a, meal);
        if (a === 'search') location.hash = `#/buscar?meal=${meal}`;
      });
    },
  });
}

/** Lista rápida de recientes o favoritos. */
export async function openQuickPick(kind, meal) {
  const [recent, fav] = await Promise.all([recentFoods(30), favoriteFoods()]);
  let tab = kind;
  openSheet({
    title: 'Elegir alimento',
    body: `
      <div class="seg" style="margin-bottom:10px">
        <button data-t="recent" class="${tab === 'recent' ? 'on' : ''}">Recientes</button>
        <button data-t="fav" class="${tab === 'fav' ? 'on' : ''}">Favoritos</button>
      </div>
      <ul class="list" data-list></ul>`,
    onMount: (el, close) => {
      const draw = () => {
        const list = tab === 'recent' ? recent : fav;
        $('[data-list]', el).innerHTML = list.length
          ? list.map((f, i) => foodRow(f, i)).join('')
          : `<p class="empty">${tab === 'recent' ? 'Aún no hay alimentos recientes.' : 'Marca alimentos con ★ para verlos aquí.'}</p>`;
      };
      $$('[data-t]', el).forEach((b) => b.addEventListener('click', () => {
        tab = b.dataset.t;
        $$('[data-t]', el).forEach((x) => x.classList.toggle('on', x === b));
        draw();
      }));
      $('[data-list]', el).addEventListener('click', (e) => {
        const li = e.target.closest('[data-i]');
        if (!li) return;
        const f = (tab === 'recent' ? recent : fav)[Number(li.dataset.i)];
        close();
        openAddFood(f, { meal });
      });
      draw();
    },
  });
}

/** Fila de alimento para listas. */
export function foodRow(f, i) {
  const kcal = f.per100?.kcal;
  return `
    <li data-i="${i}">
      ${f.image ? `<img class="thumb" src="${esc(f.image)}" alt="" loading="lazy">` : '<div class="thumb"></div>'}
      <div class="grow">
        <div class="name">${f.favorite ? '★ ' : ''}${esc(f.name)}</div>
        <div class="sub">${esc(f.brand || '')}${f.brand ? ' · ' : ''}${kcal != null ? `${fmt(kcal)} kcal/100 g` : 'sin kcal'}${f.servingSize ? ` · porción ${fmt(f.servingSize, 1)} g` : ''}</div>
      </div>
    </li>`;
}
