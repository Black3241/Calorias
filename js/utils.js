/**
 * Utilidades generales: fechas, formato de números, DOM y avisos.
 */

/* ---------------- Fechas (siempre en hora local) ---------------- */

/** Convierte un Date a 'YYYY-MM-DD' en hora local. */
export function toISODate(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Fecha de hoy como 'YYYY-MM-DD'. */
export const todayISO = () => toISODate(new Date());

/** 'YYYY-MM-DD' → Date a mediodía local (evita saltos por horario de verano). */
export function parseISODate(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d, 12, 0, 0);
}

/** Suma n días a una fecha ISO. */
export function addDays(iso, n) {
  const d = parseISODate(iso);
  d.setDate(d.getDate() + n);
  return toISODate(d);
}

/** Lista de fechas ISO desde `from` hasta `to` inclusive. */
export function dateRange(from, to) {
  const out = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

const fmtLong = new Intl.DateTimeFormat('es', { weekday: 'long', day: 'numeric', month: 'long' });
const fmtShort = new Intl.DateTimeFormat('es', { day: 'numeric', month: 'short' });
const fmtTime = new Intl.DateTimeFormat('es', { hour: '2-digit', minute: '2-digit' });

/** Etiqueta amigable: "Hoy", "Ayer" o "lunes, 3 de marzo". */
export function friendlyDate(iso) {
  const today = todayISO();
  if (iso === today) return 'Hoy';
  if (iso === addDays(today, -1)) return 'Ayer';
  if (iso === addDays(today, 1)) return 'Mañana';
  const s = fmtLong.format(parseISODate(iso));
  return s.charAt(0).toUpperCase() + s.slice(1);
}
export const shortDate = (iso) => fmtShort.format(parseISODate(iso));
export const formatTime = (ts) => fmtTime.format(new Date(ts));

/** 'HH:MM' de un timestamp (para inputs type=time). */
export function timeHHMM(ts) {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** Combina fecha ISO y 'HH:MM' en un timestamp local. */
export function combineDateTime(iso, hhmm) {
  const [y, m, d] = iso.split('-').map(Number);
  const [hh, mm] = (hhmm || '12:00').split(':').map(Number);
  return new Date(y, m - 1, d, hh, mm).getTime();
}

/* ---------------- Números ---------------- */

/** Redondea con `dec` decimales y devuelve número. */
export function round(n, dec = 0) {
  if (!Number.isFinite(n)) return 0;
  const f = 10 ** dec;
  return Math.round(n * f) / f;
}

/** Formatea un número para mostrar (separador local, sin decimales innecesarios). */
export function fmt(n, dec = 0) {
  if (n == null || !Number.isFinite(Number(n))) return '–';
  return Number(n).toLocaleString('es', { maximumFractionDigits: dec, minimumFractionDigits: 0 });
}

/** Convierte texto de un input a número (acepta coma decimal). null si vacío/ inválido. */
export function parseNum(v) {
  if (v == null) return null;
  const s = String(v).trim().replace(',', '.');
  if (s === '') return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/* ---------------- DOM ---------------- */

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

/** Escapa texto para insertarlo en plantillas HTML. */
export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

/** Crea un fragmento DOM a partir de HTML. */
export function html(str) {
  const t = document.createElement('template');
  t.innerHTML = str.trim();
  return t.content;
}

/** Retrasa la ejecución de `fn` hasta que pasen `ms` sin nuevas llamadas. */
export function debounce(fn, ms = 300) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

/** Identificador único corto. */
export function uid() {
  return (crypto.randomUUID?.() || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`);
}

/** Lee una variable CSS (para colorear las gráficas según el tema). */
export function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

/* ---------------- Avisos ---------------- */

let toastTimer;
/**
 * Muestra un aviso breve. `action` opcional: { label, onClick }.
 */
export function toast(msg, action, ms = 3000) {
  const el = document.getElementById('toast');
  el.innerHTML = esc(msg);
  if (action) {
    const b = document.createElement('button');
    b.textContent = action.label;
    b.onclick = () => { el.hidden = true; action.onClick(); };
    el.appendChild(b);
  }
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, action ? Math.max(ms, 6000) : ms);
}

/** Descarga un texto como archivo. */
export function downloadFile(filename, content, mime = 'application/json') {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Iconos SVG reutilizables. */
export const ICONS = {
  back: '<svg viewBox="0 0 24 24"><path d="M15 18l-6-6 6-6"/></svg>',
  next: '<svg viewBox="0 0 24 24"><path d="M9 18l6-6-6-6"/></svg>',
  close: '<svg viewBox="0 0 24 24"><path d="M18 6L6 18M6 6l12 12"/></svg>',
  plus: '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>',
  star: '<svg viewBox="0 0 24 24"><path d="M12 3l2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.3 6.5 20.2l1-6.2L3 9.6l6.2-.9z"/></svg>',
  edit: '<svg viewBox="0 0 24 24"><path d="M4 20h4L19 9l-4-4L4 16zM14 6l4 4"/></svg>',
  trash: '<svg viewBox="0 0 24 24"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/></svg>',
  scan: '<svg viewBox="0 0 24 24"><path d="M3 7V4a1 1 0 0 1 1-1h3M17 3h3a1 1 0 0 1 1 1v3M21 17v3a1 1 0 0 1-1 1h-3M7 21H4a1 1 0 0 1-1-1v-3M7 8v8M10 8v8M13 8v8M16 8v8"/></svg>',
  clock: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
  search: '<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/></svg>',
  keyboard: '<svg viewBox="0 0 24 24"><rect x="2" y="6" width="20" height="12" rx="2"/><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 14h10"/></svg>',
  torch: '<svg viewBox="0 0 24 24"><path d="M8 2h8l-1 6H9zM9 8l1 14h4l1-14"/></svg>',
};
