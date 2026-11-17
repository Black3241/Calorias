/**
 * Diálogos tipo "hoja inferior" construidos sobre <dialog>.
 */
import { esc, ICONS } from '../utils.js';

/**
 * Abre una hoja.
 * @param {object} o
 * @param {string} o.title   título (texto)
 * @param {string} o.body    HTML del cuerpo
 * @param {string} [o.foot]  HTML del pie (botones)
 * @param {string} [o.headExtra] HTML extra en la cabecera (p. ej. favorito)
 * @param {(el:HTMLDialogElement, close:Function)=>void} [o.onMount]
 * @param {Function} [o.onClose]
 * @returns {{el:HTMLDialogElement, close:Function}}
 */
export function openSheet({ title, body, foot = '', headExtra = '', onMount, onClose }) {
  const dlg = document.createElement('dialog');
  dlg.className = 'sheet';
  dlg.innerHTML = `
    <div class="sheet-head">
      <h2>${esc(title)}</h2>
      ${headExtra}
      <button class="icon-btn" data-close aria-label="Cerrar">${ICONS.close}</button>
    </div>
    <div class="sheet-body">${body}</div>
    ${foot ? `<div class="sheet-foot">${foot}</div>` : ''}`;
  document.getElementById('dialogs').appendChild(dlg);

  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    if (dlg.open) dlg.close();
    dlg.remove();
    onClose?.();
  };
  dlg.addEventListener('close', close);
  dlg.querySelector('[data-close]').addEventListener('click', close);
  // Tocar el fondo cierra la hoja.
  dlg.addEventListener('click', (e) => { if (e.target === dlg) close(); });

  dlg.showModal();
  onMount?.(dlg, close);
  return { el: dlg, close };
}

/** Confirmación simple. Resuelve true/false. */
export function confirmDialog(message, { title = 'Confirmar', ok = 'Aceptar', danger = false } = {}) {
  return new Promise((resolve) => {
    let answer = false;
    openSheet({
      title,
      body: `<p>${esc(message)}</p>`,
      foot: `<button class="btn" data-no>Cancelar</button>
             <button class="btn ${danger ? 'danger' : 'primary'}" data-yes>${esc(ok)}</button>`,
      onMount: (el, close) => {
        el.querySelector('[data-no]').onclick = close;
        el.querySelector('[data-yes]').onclick = () => { answer = true; close(); };
      },
      onClose: () => resolve(answer),
    });
  });
}
