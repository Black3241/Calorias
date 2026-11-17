/**
 * Ayudantes para Chart.js (cargado como script UMD en window.Chart).
 * Toman los colores de las variables CSS para respetar el modo oscuro.
 */
import { cssVar } from './utils.js';

const instances = new Set();

/** Destruye todas las gráficas activas (al cambiar de vista o re-renderizar). */
export function destroyCharts() {
  instances.forEach((c) => c.destroy());
  instances.clear();
}

/** Aplica colores del tema actual a los valores por defecto de Chart.js. */
function applyTheme() {
  const C = window.Chart;
  C.defaults.color = cssVar('--text-2');
  C.defaults.borderColor = cssVar('--border');
  C.defaults.font.family = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
  C.defaults.plugins.legend.labels.usePointStyle = true;
  C.defaults.plugins.legend.labels.boxWidth = 8;
  C.defaults.plugins.legend.labels.sort = (a, b) => a.datasetIndex - b.datasetIndex;
  C.defaults.plugins.tooltip.padding = 10;
  C.defaults.plugins.tooltip.backgroundColor = cssVar('--text');
  C.defaults.plugins.tooltip.titleColor = cssVar('--bg');
  C.defaults.plugins.tooltip.bodyColor = cssVar('--bg');
  C.defaults.maintainAspectRatio = false;
  C.defaults.animation.duration = 300;
}

/** Crea una gráfica en el canvas indicado. */
export function makeChart(canvas, config) {
  if (!window.Chart) {
    canvas.replaceWith(Object.assign(document.createElement('p'), { className: 'empty', textContent: 'No se pudo cargar Chart.js.' }));
    return null;
  }
  applyTheme();
  const chart = new window.Chart(canvas, config);
  instances.add(chart);
  return chart;
}

/** Colores de la paleta (resueltos del CSS). */
export const colors = () => ({
  primary: cssVar('--primary'),
  over: cssVar('--over'),
  protein: cssVar('--protein'),
  carbs: cssVar('--carbs'),
  fat: cssVar('--fat'),
  text2: cssVar('--text-2'),
  surface: cssVar('--surface'),
  track: cssVar('--track'),
});

/** Destruye una gráfica concreta. */
export function destroyChart(chart) {
  if (!chart) return;
  instances.delete(chart);
  chart.destroy();
}
