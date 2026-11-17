/**
 * Diálogos relacionados con alimentos:
 *  - openAddFood:    elegir cantidad + comida y registrar en el diario.
 *  - openEditEntry:  modificar o borrar una entrada existente.
 *  - openFoodEditor: crear un alimento manual o corregir sus valores.
 */
import { openSheet, confirmDialog } from './sheet.js';
import {
  addEntry, updateEntry, deleteEntry, saveFood, touchFood, toggleFavorite, getFood,
} from '../db.js';
import { NUTRIENTS, NUTRIENT_MAP, scale, fmtNutrient } from '../nutrients.js';
import { MEALS, MEAL_LABEL, SOURCE_LABEL, mealForNow, servingText, refreshFromOFF } from '../foods.js';
import { state, emitChange } from '../state.js';
import {
  esc, fmt, parseNum, round, toast, uid, todayISO, timeHHMM, combineDateTime, ICONS, $, $$,
} from '../utils.js';

/* ------------------------------------------------------------------ */
/* Bloques reutilizables                                               */
/* ------------------------------------------------------------------ */

/** Cabecera con imagen, marca y fuente. */
function foodHeader(food) {
  return `
    <div class="row" style="margin-bottom:12px">
      ${food.image ? `<img class="thumb" src="${esc(food.image)}" alt="" style="width:56px;height:56px;border-radius:12px;object-fit:cover">` : ''}
      <div class="grow">
        <div style="font-weight:600">${esc(food.name || 'Sin nombre')}</div>
        <div class="muted" style="font-size:.85rem">
          ${esc(food.brand || '')}${food.brand ? ' · ' : ''}${esc(SOURCE_LABEL[food.source] || '')}
          ${food.code ? ` · ${esc(food.code)}` : ''}${food.edited ? ' · editado' : ''}
        </div>
        ${food.servingSize ? `<div class="muted" style="font-size:.85rem">Porción: ${esc(servingText(food))}</div>` : ''}
      </div>
    </div>`;
}

/** Tabla de nutrientes para una cantidad dada. */
export function nutrientTable(values) {
  const rows = NUTRIENTS.filter((n) => n.key !== 'kcal' && values[n.key] != null).map((n) => `
    <tr class="${n.kind === 'sub' ? 'sub' : ''}"><td>${esc(n.label)}</td><td>${fmtNutrient(n.key, values[n.key])}</td></tr>`).join('');
  return rows ? `<table class="ntable">${rows}</table>` : '<p class="empty">Sin datos de nutrientes.</p>';
}

/** Avisa de datos que suelen faltar para que el usuario los complete. */
function missingNotice(per100) {
  const missing = ['kcal', 'protein', 'carbs', 'fat'].filter((k) => per100?.[k] == null)
    .map((k) => NUTRIENT_MAP[k].label.toLowerCase());
  return missing.length
    ? `<div class="notice warn">Faltan datos: ${esc(missing.join(', '))}. Puedes completarlos con “Editar datos”.</div>`
    : '';
}

/**
 * Formulario de cantidad/comida/fecha. Devuelve el HTML y una función para
 * leer los valores y otra para refrescar la vista previa.
 */
function amountForm(food, init) {
  const hasServing = !!food.servingSize;
  const unit = init.unit === 'serving' && hasServing ? 'serving' : 'g';
  const body = `
    <div class="seg" data-unit>
      <button type="button" data-u="g" class="${unit === 'g' ? 'on' : ''}">Gramos</button>
      <button type="button" data-u="serving" class="${unit === 'serving' ? 'on' : ''}" ${hasServing ? '' : 'disabled title="Sin tamaño de porción"'}>Porciones</button>
    </div>
    <div class="row" style="margin-top:10px">
      <button type="button" class="btn" data-step="-1" aria-label="Menos">−</button>
      <input type="number" inputmode="decimal" step="any" min="0" data-qty value="${init.qty}" style="text-align:center;font-size:1.3rem;font-weight:700" aria-label="Cantidad">
      <button type="button" class="btn" data-step="1" aria-label="Más">+</button>
    </div>
    <div class="chips" style="margin-top:8px" data-quick></div>
    <div class="muted" data-grams-note style="font-size:.85rem;margin-top:6px"></div>

    <h3 style="margin-top:14px">Comida</h3>
    <div class="seg" data-meal>
      ${MEALS.map(([k, l]) => `<button type="button" data-m="${k}" class="${init.meal === k ? 'on' : ''}">${l}</button>`).join('')}
    </div>

    <div class="grid2" style="margin-top:12px">
      <label class="field"><span>Fecha</span><input type="date" data-date value="${init.date}"></label>
      <label class="field"><span>Hora</span><input type="time" data-time value="${init.time}"></label>
    </div>

    <div class="card" style="margin:6px 0 0" data-preview></div>
    <details style="margin-top:8px"><summary>Todos los nutrientes</summary><div data-table style="margin-top:8px"></div></details>`;

  const bind = (el) => {
    let curUnit = unit;
    const qtyEl = $('[data-qty]', el);
    const quick = $('[data-quick]', el);

    const grams = () => {
      const q = parseNum(qtyEl.value) || 0;
      return curUnit === 'serving' ? q * food.servingSize : q;
    };
    const renderQuick = () => {
      const opts = curUnit === 'g' ? [50, 100, 150, 200, 250] : [0.5, 1, 1.5, 2, 3];
      quick.innerHTML = opts.map((v) => `<button type="button" class="chip" data-q="${v}">${fmt(v, 1)}${curUnit === 'g' ? ' g' : ''}</button>`).join('');
    };
    const refresh = () => {
      const g = grams();
      const n = scale(food.per100, g);
      $('[data-grams-note]', el).textContent = curUnit === 'serving' ? `= ${fmt(g, 1)} g` : (hasServing ? `1 porción = ${fmt(food.servingSize, 1)} g` : '');
      $('[data-preview]', el).innerHTML = `
        <div class="row spread">
          <div><div style="font-size:1.6rem;font-weight:700">${fmt(n.kcal)} <small>kcal</small></div></div>
          <div class="row" style="gap:12px;font-size:.9rem;text-align:center">
            <div><b style="color:var(--protein)">${fmt(n.protein, 1)} g</b><br><small>Proteína</small></div>
            <div><b style="color:var(--carbs)">${fmt(n.carbs, 1)} g</b><br><small>Carbs</small></div>
            <div><b style="color:var(--fat)">${fmt(n.fat, 1)} g</b><br><small>Grasa</small></div>
          </div>
        </div>`;
      $('[data-table]', el).innerHTML = nutrientTable(n);
    };

    $$('[data-unit] button', el).forEach((b) => b.addEventListener('click', () => {
      if (b.disabled || b.dataset.u === curUnit) return;
      const g = grams();
      curUnit = b.dataset.u;
      $$('[data-unit] button', el).forEach((x) => x.classList.toggle('on', x === b));
      // Convertimos la cantidad para mantener los mismos gramos.
      qtyEl.value = curUnit === 'serving' ? round(g / food.servingSize, 2) : round(g, 1);
      renderQuick(); refresh();
    }));
    $$('[data-step]', el).forEach((b) => b.addEventListener('click', () => {
      const step = curUnit === 'g' ? 10 : 0.5;
      const v = Math.max(0, (parseNum(qtyEl.value) || 0) + step * Number(b.dataset.step));
      qtyEl.value = round(v, 2); refresh();
    }));
    quick.addEventListener('click', (e) => {
      const b = e.target.closest('[data-q]');
      if (b) { qtyEl.value = b.dataset.q; refresh(); }
    });
    qtyEl.addEventListener('input', refresh);
    $$('[data-meal] button', el).forEach((b) => b.addEventListener('click', () => {
      $$('[data-meal] button', el).forEach((x) => x.classList.toggle('on', x === b));
    }));

    renderQuick(); refresh();

    return {
      read: () => {
        const qty = parseNum(qtyEl.value) || 0;
        const date = $('[data-date]', el).value || todayISO();
        return {
          unit: curUnit,
          qty,
          grams: grams(),
          meal: $('[data-meal] button.on', el)?.dataset.m || 'snack',
          date,
          time: combineDateTime(date, $('[data-time]', el).value),
        };
      },
    };
  };

  return { body, bind };
}

/** Valores iniciales para la cantidad: 1 porción si existe, si no 100 g. */
function defaultAmount(food) {
  return food.servingSize ? { unit: 'serving', qty: 1 } : { unit: 'g', qty: 100 };
}

/** Copia de los datos del alimento que se guarda en cada entrada. */
function entrySnapshot(food) {
  return {
    foodId: food.id,
    name: food.name,
    brand: food.brand || '',
    servingSize: food.servingSize || null,
    per100: { ...food.per100 },
  };
}

/* ------------------------------------------------------------------ */
/* Agregar al diario                                                   */
/* ------------------------------------------------------------------ */

/**
 * Abre el diálogo para registrar un alimento.
 * @param {object} food
 * @param {{meal?:string, date?:string}} [opts]
 */
export function openAddFood(food, opts = {}) {
  const date = opts.date || state.date;
  const now = new Date();
  const init = {
    ...defaultAmount(food),
    meal: opts.meal || mealForNow(now),
    date,
    time: date === todayISO() ? timeHHMM(now) : '12:00',
  };
  const form = amountForm(food, init);
  const fav = food.favorite ? 'on' : '';

  openSheet({
    title: 'Agregar alimento',
    headExtra: `<button class="icon-btn star ${fav}" data-fav aria-label="Favorito">${ICONS.star}</button>`,
    body: foodHeader(food) + missingNotice(food.per100) + form.body,
    foot: `<button class="btn" data-editfood>${ICONS.edit} Editar datos</button>
           <button class="btn primary" data-save>Agregar</button>`,
    onMount: (el, close) => {
      const f = form.bind(el);

      $('[data-fav]', el).onclick = async () => {
        await saveFood(food);                         // asegura que esté en caché
        const updated = await toggleFavorite(food.id);
        food.favorite = updated.favorite;
        $('[data-fav]', el).classList.toggle('on', !!updated.favorite);
        toast(updated.favorite ? 'Añadido a favoritos' : 'Quitado de favoritos');
        emitChange('foods');
      };

      $('[data-editfood]', el).onclick = async () => {
        close();
        const saved = await openFoodEditor(food);
        openAddFood(saved || food, opts);
      };

      $('[data-save]', el).onclick = async () => {
        const v = f.read();
        if (!(v.grams > 0)) { toast('Indica una cantidad mayor que 0'); return; }
        const saved = await saveFood(food);
        await addEntry({
          ...entrySnapshot(saved),
          date: v.date, time: v.time, meal: v.meal,
          grams: round(v.grams, 2), qty: v.qty, unit: v.unit,
        });
        await touchFood(saved.id);
        close();
        toast(`${saved.name} agregado a ${MEAL_LABEL[v.meal].toLowerCase()}`);
        emitChange('entries');
        opts.onAdded?.();
      };
    },
  });
}

/* ------------------------------------------------------------------ */
/* Editar entrada                                                      */
/* ------------------------------------------------------------------ */

export function openEditEntry(entry) {
  const food = {
    id: entry.foodId, name: entry.name, brand: entry.brand,
    servingSize: entry.servingSize, per100: entry.per100, source: entry.foodId?.split(':')[0],
  };
  const init = {
    unit: entry.unit, qty: entry.qty ?? entry.grams, meal: entry.meal,
    date: entry.date, time: timeHHMM(entry.time),
  };
  const form = amountForm(food, init);

  openSheet({
    title: 'Editar entrada',
    body: foodHeader(food) + form.body + `
      <button class="btn small ghost" data-resync style="margin-top:10px">Usar datos actuales del alimento</button>`,
    foot: `<button class="btn danger" data-del>${ICONS.trash} Borrar</button>
           <button class="btn primary" data-save>Guardar</button>`,
    onMount: (el, close) => {
      const f = form.bind(el);

      $('[data-save]', el).onclick = async () => {
        const v = f.read();
        if (!(v.grams > 0)) { toast('Indica una cantidad mayor que 0'); return; }
        await updateEntry({ ...entry, ...v, grams: round(v.grams, 2) });
        close();
        toast('Entrada actualizada');
        emitChange('entries');
      };

      $('[data-del]', el).onclick = async () => {
        if (!(await confirmDialog(`¿Borrar “${entry.name}”?`, { ok: 'Borrar', danger: true }))) return;
        await deleteEntry(entry.id);
        close();
        toast('Entrada borrada', {
          label: 'Deshacer',
          onClick: async () => { await addEntry(entry); emitChange('entries'); },
        });
        emitChange('entries');
      };

      // Si el alimento se corrigió después, permite aplicar los nuevos valores.
      $('[data-resync]', el).onclick = async () => {
        const current = entry.foodId && (await getFood(entry.foodId));
        if (!current) { toast('El alimento ya no está guardado'); return; }
        const v = f.read();
        await updateEntry({ ...entry, ...v, ...entrySnapshot(current), grams: round(v.grams, 2) });
        close();
        toast('Valores actualizados');
        emitChange('entries');
      };
    },
  });
}

/* ------------------------------------------------------------------ */
/* Editor de alimentos                                                 */
/* ------------------------------------------------------------------ */

/**
 * Crea o edita un alimento. Los campos vacíos se guardan como "sin dato".
 * @param {object|null} food  alimento a editar (null = nuevo)
 * @param {{code?:string}} [opts]
 * @returns {Promise<object|null>} alimento guardado o null si se cancela.
 */
export function openFoodEditor(food = null, opts = {}) {
  const isNew = !food;
  const f = food || {
    id: `manual:${uid()}`, source: 'manual', code: opts.code || '', name: opts.name || '', brand: '',
    servingSize: null, servingLabel: '', per100: {}, image: '',
  };

  const input = (n) => {
    const v = f.per100?.[n.key];
    return `<label class="field"><span>${esc(n.label)} (${n.unit})</span>
      <input type="number" inputmode="decimal" step="any" min="0" data-n="${n.key}" value="${v == null ? '' : round(v, 3)}"></label>`;
  };
  const main = NUTRIENTS.filter((n) => n.kind !== 'micro' || n.key === 'sodium');
  const micros = NUTRIENTS.filter((n) => n.kind === 'micro' && n.key !== 'sodium');

  return new Promise((resolve) => {
    let result = null;
    openSheet({
      title: isNew ? 'Nuevo alimento' : 'Editar alimento',
      body: `
        <label class="field"><span>Nombre *</span><input type="text" data-f="name" value="${esc(f.name)}" required></label>
        <div class="grid2">
          <label class="field"><span>Marca</span><input type="text" data-f="brand" value="${esc(f.brand || '')}"></label>
          <label class="field"><span>Código de barras</span><input type="text" inputmode="numeric" data-f="code" value="${esc(f.code || '')}"></label>
          <label class="field"><span>Porción (g o ml)</span><input type="number" inputmode="decimal" step="any" min="0" data-f="servingSize" value="${f.servingSize ?? ''}"></label>
          <label class="field"><span>Nombre de la porción</span><input type="text" data-f="servingLabel" placeholder="1 taza, 2 galletas…" value="${esc(f.servingLabel || '')}"></label>
        </div>
        <h3>Valores nutrimentales</h3>
        <div class="seg" data-basis style="margin-bottom:10px">
          <button type="button" data-b="100" class="on">Por 100 g</button>
          <button type="button" data-b="serving">Por porción</button>
        </div>
        <p class="muted" style="font-size:.8rem;margin:-4px 0 8px">Deja vacío lo que no sepas. Las kcal se estiman con 4/4/9 si faltan.</p>
        <div class="nut-edit">${main.map(input).join('')}</div>
        <details><summary>Micronutrientes</summary><div class="nut-edit" style="margin-top:8px">${micros.map(input).join('')}</div></details>`,
      foot: `<button class="btn" data-cancel>Cancelar</button>
             ${!isNew && f.source === 'off' && f.code ? '<button class="btn" data-refresh>Recargar OFF</button>' : ''}
             <button class="btn primary" data-save>Guardar</button>`,
      onMount: (el, close) => {
        let basis = '100';
        const servingEl = $('[data-f="servingSize"]', el);
        // Cambia la base (100 g / porción) convirtiendo los valores escritos.
        $$('[data-basis] button', el).forEach((b) => b.addEventListener('click', () => {
          if (b.dataset.b === basis) return;
          const ss = parseNum(servingEl.value);
          if (b.dataset.b === 'serving' && !ss) { toast('Indica primero el tamaño de la porción'); return; }
          const factor = b.dataset.b === 'serving' ? ss / 100 : 100 / ss;
          $$('[data-n]', el).forEach((i) => {
            const v = parseNum(i.value);
            if (v != null) i.value = round(v * factor, 3);
          });
          basis = b.dataset.b;
          $$('[data-basis] button', el).forEach((x) => x.classList.toggle('on', x === b));
        }));

        $('[data-cancel]', el).onclick = close;

        $('[data-refresh]', el)?.addEventListener('click', async () => {
          try {
            const fresh = await refreshFromOFF(f);
            if (!fresh) { toast('No encontrado en Open Food Facts'); return; }
            result = fresh; close(); toast('Datos recargados');
          } catch (e) { toast(`Error: ${e.message}`); }
        });

        $('[data-save]', el).onclick = async () => {
          const name = $('[data-f="name"]', el).value.trim();
          if (!name) { toast('El nombre es obligatorio'); return; }
          const ss = parseNum(servingEl.value);
          const factor = basis === 'serving' ? 100 / ss : 1;
          const per100 = {};
          $$('[data-n]', el).forEach((i) => {
            const v = parseNum(i.value);
            per100[i.dataset.n] = v == null ? null : v * factor;
          });
          if (per100.kcal == null && (per100.protein != null || per100.carbs != null || per100.fat != null)) {
            per100.kcal = (per100.protein || 0) * 4 + (per100.carbs || 0) * 4 + (per100.fat || 0) * 9;
          }
          const saved = await saveFood({
            ...f,
            name,
            brand: $('[data-f="brand"]', el).value.trim(),
            code: $('[data-f="code"]', el).value.replace(/\D/g, ''),
            servingSize: ss || null,
            servingLabel: $('[data-f="servingLabel"]', el).value.trim(),
            per100,
            edited: !isNew && f.source !== 'manual' ? true : f.edited,
          });
          result = saved;
          close();
          toast('Alimento guardado');
          emitChange('foods');
        };
      },
      onClose: () => resolve(result),
    });
  });
}
