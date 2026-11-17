/**
 * Flujo de escaneo: cámara (BarcodeDetector) + captura manual de respaldo.
 * Al leer un código busca el producto y abre el diálogo para registrarlo.
 */
import { openSheet } from './sheet.js';
import { openAddFood, openFoodEditor } from './foodDialogs.js';
import { Scanner, scannerSupported, isValidBarcode } from '../scanner.js';
import { lookupBarcode } from '../foods.js';
import { esc, toast, ICONS, $ } from '../utils.js';

/**
 * Abre el escáner.
 * @param {{meal?:string}} [opts] comida preseleccionada al registrar.
 */
export function openScanner(opts = {}) {
  const supported = scannerSupported();
  const scanner = new Scanner();

  openSheet({
    title: 'Escanear código',
    headExtra: supported ? `<button class="icon-btn" data-torch aria-label="Linterna" hidden>${ICONS.torch}</button>` : '',
    body: `
      ${supported ? `
        <div class="scanner">
          <video muted playsinline></video>
          <div class="frame"></div><div class="laser"></div>
          <div class="scan-status" data-status>Iniciando cámara…</div>
        </div>` : `
        <div class="notice warn">Este navegador no permite escanear con la cámara (BarcodeDetector).
        Usa Chrome en Android con HTTPS, o escribe el código abajo.</div>`}
      <form data-manual style="margin-top:14px">
        <label class="field"><span>O escribe el código (EAN-13, EAN-8, UPC)</span>
          <div class="row">
            <input type="text" inputmode="numeric" pattern="[0-9]*" autocomplete="off" data-code placeholder="7501234567890">
            <button class="btn primary" type="submit">Buscar</button>
          </div>
        </label>
      </form>`,
    onMount: async (el, close) => {
      const go = (code) => { close(); handleBarcode(code, opts); };

      $('[data-manual]', el).addEventListener('submit', (e) => {
        e.preventDefault();
        const code = $('[data-code]', el).value.replace(/\D/g, '');
        if (code.length < 6) { toast('Código demasiado corto'); return; }
        if (!isValidBarcode(code)) toast('Aviso: el dígito de control no coincide, se buscará igual');
        go(code);
      });

      if (!supported) { $('[data-code]', el).focus(); return; }
      const status = $('[data-status]', el);
      try {
        await scanner.start($('video', el), go);
        status.textContent = 'Apunta al código de barras';
        const torchBtn = $('[data-torch]', el);
        if (scanner.hasTorch()) {
          let on = false;
          torchBtn.hidden = false;
          torchBtn.onclick = () => { on = !on; scanner.setTorch(on); };
        }
      } catch (e) {
        status.textContent = e.name === 'NotAllowedError'
          ? 'Permiso de cámara denegado. Escribe el código.'
          : `No se pudo abrir la cámara: ${e.message}`;
      }
    },
    onClose: () => scanner.stop(),
  });
}

/** Busca un código y abre el registro, o propone crear el alimento. */
export async function handleBarcode(code, opts = {}) {
  toast(`Buscando ${code}…`, null, 8000);
  const { food, fromCache, error } = await lookupBarcode(code);
  document.getElementById('toast').hidden = true;

  if (food) {
    if (fromCache) toast('Desde caché local', null, 1500);
    openAddFood(food, opts);
    return;
  }

  openSheet({
    title: 'Producto no encontrado',
    body: `<p>${error ? esc(error) : `El código <b>${esc(code)}</b> no está en Open Food Facts.`}</p>
           <p class="muted">Puedes crearlo con los datos de la etiqueta. Se guardará en tu dispositivo.</p>`,
    foot: `<button class="btn" data-retry>Reintentar</button>
           <button class="btn primary" data-create>Crear alimento</button>`,
    onMount: (el, close) => {
      $('[data-retry]', el).onclick = () => { close(); handleBarcode(code, opts); };
      $('[data-create]', el).onclick = async () => {
        close();
        const saved = await openFoodEditor(null, { code });
        if (saved) openAddFood(saved, opts);
      };
    },
  });
}
