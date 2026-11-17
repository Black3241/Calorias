/**
 * Punto de entrada: abre la base de datos, carga el estado, registra el
 * service worker y gestiona la navegación por hash (#/hoy, #/buscar…).
 */
import { openDB } from './db.js';
import { state, loadState, onChange } from './state.js';
import { applyTheme } from './theme.js';
import { destroyCharts } from './charts.js';
import { renderToday } from './views/today.js';
import { renderSearch } from './views/search.js';
import { renderStats } from './views/stats.js';
import { renderWeight } from './views/weight.js';
import { renderProfile } from './views/profile.js';
import { openScanner } from './views/scan.js';
import { toast, esc, $, $$ } from './utils.js';

const ROUTES = {
  hoy: { title: 'Hoy', render: renderToday },
  buscar: { title: 'Alimentos', render: renderSearch },
  graficas: { title: 'Gráficas', render: renderStats },
  peso: { title: 'Peso', render: renderWeight },
  perfil: { title: 'Perfil y ajustes', render: renderProfile },
};

const view = $('#view');

/** Lee la ruta actual del hash. */
function currentRoute() {
  const [path, query = ''] = location.hash.replace(/^#\/?/, '').split('?');
  return { name: ROUTES[path] ? path : 'hoy', params: new URLSearchParams(query) };
}

/**
 * Dibuja la vista actual. Las peticiones se encadenan: si llega una nueva
 * mientras se está dibujando, se repite al terminar (evita carreras).
 */
let running = null;
let pending = false;
function render() {
  if (running) { pending = true; return running; }
  running = (async () => {
    do { pending = false; await doRender(); } while (pending);
    running = null;
  })();
  return running;
}

async function doRender() {
  const { name, params } = currentRoute();
  const onboarding = !state.profile;

  destroyCharts();
  $$('.bottomnav a').forEach((a) => a.classList.toggle('active', a.dataset.route === name));
  $('#fab-scan').hidden = onboarding || name !== 'hoy';

  // Sin perfil, lo primero es configurarlo.
  if (onboarding) {
    $('#view-title').textContent = 'Configura tu perfil';
    await renderProfile(view, { onboarding: true });
    return;
  }

  $('#view-title').textContent = ROUTES[name].title;
  try {
    await ROUTES[name].render(view, params);
  } catch (e) {
    console.error(e);
    view.innerHTML = `<p class="notice warn">Error: ${esc(e.message)}</p>`;
  }
}

/** Registra el service worker y avisa cuando hay una versión nueva. */
function registerSW() {
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.register('./sw.js').then((reg) => {
    reg.addEventListener('updatefound', () => {
      const nw = reg.installing;
      nw?.addEventListener('statechange', () => {
        if (nw.state === 'installed' && navigator.serviceWorker.controller) {
          toast('Nueva versión disponible', { label: 'Actualizar', onClick: () => nw.postMessage('skipWaiting') });
        }
      });
    });
  }).catch((e) => console.warn('SW no registrado', e));

  // Solo recargamos al reemplazar una versión anterior (no en la primera instalación).
  const hadController = !!navigator.serviceWorker.controller;
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloading || !hadController) return;
    reloading = true;
    location.reload();
  });
}

async function init() {
  await openDB();
  await loadState();
  applyTheme(state.theme);

  // Si el tema es automático, seguimos los cambios del sistema.
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (state.theme === 'auto') { applyTheme('auto'); render(); }
  });

  window.addEventListener('hashchange', render);
  // Cualquier cambio de datos vuelve a dibujar la vista actual.
  onChange(() => render());

  $('#fab-scan').addEventListener('click', () => openScanner());
  window.addEventListener('online', () => toast('Conexión restablecida'));
  window.addEventListener('offline', () => toast('Sin conexión: puedes seguir usando la app'));

  // Pedimos almacenamiento persistente para que el navegador no borre los datos.
  navigator.storage?.persist?.().catch(() => {});

  await render();
  registerSW();
}

init().catch((e) => {
  console.error(e);
  view.innerHTML = `<p class="notice warn">No se pudo iniciar la app: ${esc(e.message)}</p>`;
});
