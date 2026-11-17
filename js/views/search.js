/**
 * Vista "Alimentos": búsqueda por nombre (local, Open Food Facts, USDA),
 * recientes, favoritos, escaneo y creación manual.
 */
import { recentFoods, favoriteFoods, getFood } from '../db.js';
import { searchFoods, cacheFood } from '../foods.js';
import { openAddFood, openFoodEditor } from './foodDialogs.js';
import { openScanner } from './scan.js';
import { foodRow } from './today.js';
import { esc, debounce, ICONS, $, $$ } from '../utils.js';

// Se conserva entre visitas a la vista.
const ui = { query: '', source: 'local', results: null, error: '' };

export async function renderSearch(view, params) {
  const meal = params.get('meal') || undefined;

  view.innerHTML = `
    <form data-form class="row" style="margin-bottom:10px" role="search">
      <input type="search" data-q placeholder="Buscar alimento…" value="${esc(ui.query)}" enterkeyhint="search" aria-label="Buscar">
      <button class="btn primary" type="submit" aria-label="Buscar">${ICONS.search}</button>
    </form>
    <div class="seg" data-src style="margin-bottom:12px">
      <button type="button" data-s="local">Mis alimentos</button>
      <button type="button" data-s="off">Open Food Facts</button>
      <button type="button" data-s="usda">USDA</button>
    </div>
    <div class="grid2" style="margin-bottom:12px">
      <button class="btn" data-scan>${ICONS.scan} Escanear</button>
      <button class="btn" data-new>${ICONS.plus} Crear manual</button>
    </div>
    <div data-results></div>`;

  const resultsEl = $('[data-results]', view);
  const qEl = $('[data-q]', view);

  const setSource = (s) => {
    ui.source = s;
    $$('[data-s]', view).forEach((b) => b.classList.toggle('on', b.dataset.s === s));
  };
  setSource(ui.source);

  /** Muestra recientes y favoritos cuando no hay búsqueda. */
  const drawHome = async () => {
    const [recent, fav] = await Promise.all([recentFoods(15), favoriteFoods()]);
    resultsEl.innerHTML = `
      <section class="card"><h2>Favoritos</h2>
        ${fav.length ? `<ul class="list" data-list="fav">${fav.map(foodRow).join('')}</ul>` : '<p class="empty">Marca alimentos con ★ para verlos aquí.</p>'}
      </section>
      <section class="card"><h2>Recientes</h2>
        ${recent.length ? `<ul class="list" data-list="recent">${recent.map(foodRow).join('')}</ul>` : '<p class="empty">Aún no has registrado alimentos.</p>'}
      </section>`;
    bindList('fav', fav);
    bindList('recent', recent);
  };

  const drawResults = () => {
    if (ui.error) { resultsEl.innerHTML = `<div class="notice warn">${esc(ui.error)}</div>`; return; }
    if (!ui.results) return;
    resultsEl.innerHTML = ui.results.length
      ? `<section class="card"><ul class="list" data-list="res">${ui.results.map(foodRow).join('')}</ul></section>`
      : `<p class="empty">Sin resultados para “${esc(ui.query)}”.
         <button class="btn small" data-newq>Crear “${esc(ui.query)}”</button></p>`;
    bindList('res', ui.results);
    $('[data-newq]', view)?.addEventListener('click', () => createManual(ui.query));
  };

  /** Al tocar un alimento: usa la copia local si fue editada, si no actualiza caché. */
  const bindList = (name, list) => {
    $(`[data-list="${name}"]`, view)?.addEventListener('click', async (e) => {
      const li = e.target.closest('[data-i]');
      if (!li) return;
      let food = list[Number(li.dataset.i)];
      const local = await getFood(food.id);
      food = local && (local.edited || local.source === 'manual' || name !== 'res' || ui.source === 'local')
        ? local
        : await cacheFood(food);
      openAddFood(food, { meal });
    });
  };

  const run = async () => {
    ui.query = qEl.value.trim();
    ui.error = '';
    if (!ui.query) { ui.results = null; drawHome(); return; }
    if (ui.source !== 'local' && !navigator.onLine) {
      ui.error = 'Sin conexión: solo puedes buscar en “Mis alimentos”.'; drawResults(); return;
    }
    resultsEl.innerHTML = '<p class="loading">Buscando…</p>';
    try {
      ui.results = await searchFoods(ui.query, ui.source);
    } catch (e) {
      ui.results = null;
      ui.error = e.name === 'AbortError' ? 'Tiempo de espera agotado. Intenta de nuevo.' : `Error al buscar: ${e.message}`;
    }
    drawResults();
  };

  const createManual = async (name = '') => {
    const saved = await openFoodEditor(null, { name });
    if (saved) openAddFood(saved, { meal });
  };

  $('[data-form]', view).addEventListener('submit', (e) => { e.preventDefault(); qEl.blur(); run(); });
  // En local se busca mientras se escribe; en remoto solo al enviar.
  qEl.addEventListener('input', debounce(() => { if (ui.source === 'local' || !qEl.value.trim()) run(); }, 250));
  $$('[data-s]', view).forEach((b) => b.addEventListener('click', () => { setSource(b.dataset.s); if (qEl.value.trim()) run(); }));
  $('[data-scan]', view).onclick = () => openScanner({ meal });
  $('[data-new]', view).onclick = () => createManual(qEl.value.trim());

  if (ui.query && ui.results) drawResults(); else if (ui.query) run(); else drawHome();
}
