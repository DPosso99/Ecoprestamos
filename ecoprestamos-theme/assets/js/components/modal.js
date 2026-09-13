// Modal generico (backdrop + panel). Equivalente simplificado de components/Modal.tsx
// (sin trampa de foco ni animaciones, pero con cierre por ESC/backdrop).

import { escapeHtml } from '../dom.js';

let current = null;

/**
 * Abre un modal generico (cierra cualquiera que ya estuviera abierto).
 * Se cierra con ESC, clic en el backdrop, o el boton de cerrar; mientras
 * esta abierto, bloquea el scroll del body.
 * @param {Object} opts
 * @param {string} opts.title Titulo mostrado en el header del modal.
 * @param {string} opts.bodyHtml HTML del cuerpo del modal.
 * @param {string} [opts.footerHtml=''] HTML del footer (botones de accion); si esta vacio, no se renderiza footer.
 * @param {(panel: HTMLElement) => void} [opts.onMount] Callback tras montar el modal, recibe el elemento `.pmi-modal` para enganchar sus propios listeners.
 * @returns {HTMLElement} El elemento backdrop insertado en `document.body`.
 */
export function openModal({ title, bodyHtml, footerHtml = '', onMount }) {
  closeModal();

  const backdrop = document.createElement('div');
  backdrop.className = 'pmi-modal-backdrop';
  backdrop.innerHTML = `
    <div class="pmi-modal" role="dialog" aria-modal="true">
      <div class="pmi-modal-head">
        <div class="pmi-title pmi-truncate" style="font-size:18px;font-weight:700;">${escapeHtml(title)}</div>
        <button type="button" class="ui-btn ui-btn-ghost ui-btn-sm" id="pmi-modal-close" style="width:32px;height:32px;border-radius:50%;padding:0;display:grid;place-items:center;font-size:20px;line-height:1;color:var(--eafit-muted);" aria-label="Cerrar">&times;</button>
      </div>
      <div class="pmi-modal-body">${bodyHtml}</div>
      ${footerHtml ? `<div class="pmi-modal-foot">${footerHtml}</div>` : ''}
    </div>
  `;

  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) closeModal();
  });
  backdrop.querySelector('#pmi-modal-close').addEventListener('click', closeModal);

  const onKey = (e) => { if (e.key === 'Escape') closeModal(); };
  document.addEventListener('keydown', onKey);

  document.body.appendChild(backdrop);
  document.body.style.overflow = 'hidden';

  current = { backdrop, onKey };
  if (onMount) onMount(backdrop.querySelector('.pmi-modal'));

  return backdrop;
}

/**
 * Cierra el modal actualmente abierto (si hay uno): quita el listener de
 * ESC, remueve el backdrop del DOM y restaura el scroll del body. No-op si
 * no hay ningun modal abierto.
 */
export function closeModal() {
  if (!current) return;
  document.removeEventListener('keydown', current.onKey);
  current.backdrop.remove();
  document.body.style.overflow = '';
  current = null;
}
