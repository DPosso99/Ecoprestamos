import { store } from '../state.js';
import { escapeHtml, fmtDT, navigate } from '../dom.js';

/**
 * Renderiza "Mis prestamos" (ruta `/mis-prestamos`, vista de estudiante):
 * historial de prestamos ya entregados, en filas expandibles con su detalle.
 * @param {HTMLElement} root Elemento contenedor donde se monta la vista.
 * @returns {Promise<void>}
 */
export async function renderMisPrestamos(root) {
  await store.loans.reload();

  let q = '';
  const openIds = {};

  /** @returns {Array<Object>} Todos los prestamos ya entregados (de cualquier estudiante). */
  function delivered() {
    return store.loans.prestamos.filter((p) => p.Entregado === 1);
  }

  /** @returns {Array<Object>} Prestamos entregados que coinciden con la busqueda actual. */
  function filtered() {
    const query = q.trim().toLowerCase();
    if (!query) return delivered();
    return delivered().filter((p) => [String(p.idPrestamo), p.usuario_solicitante, p.usuario_responsable, p.Notas ?? ''].join(' ').toLowerCase().includes(query));
  }

  /**
   * @param {Object} p Prestamo entregado.
   * @returns {string} HTML de la fila expandible de un prestamo.
   */
  function rowHtml(p) {
    const isOpen = openIds[p.idPrestamo] ?? true;
    const details = store.loans.detailsMap[p.idPrestamo] || [];
    return `
      <section style="padding:24px;border-top:1px solid var(--eafit-border);">
        <button type="button" data-toggle="${p.idPrestamo}" style="width:100%;text-align:left;border:none;background:none;cursor:pointer;font-family:inherit;padding:0;">
          <div class="pmi-flex pmi-justify-between pmi-items-start pmi-gap-4" style="flex-wrap:wrap;">
            <div>
              <div class="pmi-title">Prestamo #${p.idPrestamo}</div>
              <div class="pmi-text-xs pmi-muted" style="margin-top:4px;">Fecha: ${fmtDT(p.Fecha_prestamo)}</div>
            </div>
            <span class="pmi-pill pmi-pill-success"><span class="pmi-dot pmi-dot-success"></span>Entregado</span>
          </div>
          <div class="pmi-text-xs pmi-muted" style="margin-top:10px;">Clic para ${isOpen ? 'ocultar' : 'ver'} detalle</div>
        </button>
        ${isOpen ? `
          <div class="ui-card-inner pmi-p-4" style="margin-top:14px;">
            <div class="pmi-grid pmi-grid-2">
              <div><div class="pmi-label">Solicitante</div><div class="pmi-text-sm" style="margin-top:4px;">${escapeHtml(p.usuario_solicitante)}</div></div>
              <div><div class="pmi-label">Responsable</div><div class="pmi-text-sm" style="margin-top:4px;">${escapeHtml(p.usuario_responsable)}</div></div>
              <div><div class="pmi-label">Hora entrega</div><div class="pmi-text-sm" style="margin-top:4px;">${fmtDT(p.Hora_entrega)}</div></div>
              <div><div class="pmi-label">Notas</div><div class="pmi-text-sm" style="margin-top:4px;">${escapeHtml(p.Notas || '—')}</div></div>
            </div>
            ${details.length ? `
              <div style="margin-top:12px;">
                <div class="pmi-label">Recursos</div>
                <div class="pmi-flex pmi-gap-2 pmi-wrap" style="margin-top:6px;">
                  ${details.map((d) => `<span class="pmi-text-xs" style="padding:4px 8px;border-radius:6px;background:var(--eafit-bg);border:1px solid var(--eafit-border);">${escapeHtml(d)}</span>`).join('')}
                </div>
              </div>
            ` : ''}
          </div>
        ` : ''}
      </section>
    `;
  }

  /** Renderiza la vista completa (buscador + lista expandible) y engancha sus listeners. */
  function full() {
    const list = filtered();
    const total = delivered().length;

    root.innerHTML = `
      <div class="pmi-flex pmi-justify-between pmi-items-start pmi-gap-4" style="flex-wrap:wrap;">
        <div>
          <div class="pmi-h1">Mis prestamos</div>
          <div class="pmi-muted" style="margin-top:6px;">${total === 0 ? 'Prestamos actualmente entregados.' : `${total} prestamo(s) entregados`}</div>
        </div>
        <button class="ui-btn ui-btn-ghost ui-btn-sm" id="pmi-back">&larr; Volver al catalogo</button>
      </div>

      ${total > 0 ? `<div class="ui-card pmi-p-4" style="margin-top:20px;"><input class="ui-input" id="pmi-search" placeholder="Buscar por prestamo, solicitante, responsable..." value="${escapeHtml(q)}" /></div>` : ''}

      <div class="ui-card" style="margin-top:20px;overflow:hidden;">
        ${total === 0 ? `
          <div class="pmi-empty">
            <div class="pmi-empty-icon">&#128230;</div>
            <div class="pmi-title">Sin prestamos activos</div>
            <div class="pmi-text-sm pmi-muted">No hay prestamos entregados actualmente.</div>
            <button class="ui-btn ui-btn-primary ui-btn-sm" id="pmi-ir-catalogo">Ir al catalogo</button>
          </div>
        ` : list.length === 0 ? `
          <div class="pmi-empty"><div class="pmi-title">Sin resultados</div></div>
        ` : list.map(rowHtml).join('')}
      </div>
    `;

    root.querySelector('#pmi-back')?.addEventListener('click', () => navigate('/catalogo'));
    root.querySelector('#pmi-ir-catalogo')?.addEventListener('click', () => navigate('/catalogo'));
    root.querySelector('#pmi-search')?.addEventListener('input', (e) => { q = e.target.value; full(); });
    root.querySelectorAll('[data-toggle]').forEach((btn) => btn.addEventListener('click', () => {
      const id = Number(btn.dataset.toggle);
      openIds[id] = !(openIds[id] ?? true);
      full();
    }));
  }

  full();
}
