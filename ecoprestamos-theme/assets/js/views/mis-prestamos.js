import { store, loanEstado, LOAN_ESTADO_LABEL } from '../state.js';
import { escapeHtml, fmtDT, navigate } from '../dom.js';

/**
 * Renderiza "Mis prestamos" (ruta `/mis-prestamos`, vista de estudiante):
 * los prestamos que ya salieron del laboratorio (en su poder o ya devueltos),
 * en filas expandibles con su detalle.
 * @param {HTMLElement} root Elemento contenedor donde se monta la vista.
 * @returns {Promise<void>}
 */
export async function renderMisPrestamos(root) {
  await store.loans.reload();

  let q = '';
  const openIds = {};

  /** @returns {Array<Object>} Prestamos ya entregados (en su poder o devueltos) del estudiante actual. */
  function delivered() {
    return store.loans.prestamos.filter((p) => p.Entregado === 1 && (store.auth.isWorker || p.usuario_solicitante === store.auth.user?.Correo));
  }

  /** @returns {Array<Object>} Solicitudes pendientes de entrega del estudiante actual. */
  function pending() {
    return store.loans.prestamos.filter((p) => p.Entregado === 0 && p.usuario_solicitante === store.auth.user?.Correo);
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
            <div class="pmi-flex pmi-items-center pmi-gap-2">
              ${p.es_indefinido ? `
                <span class="pmi-pill pmi-pill-info" style="font-size:11px;font-weight:600;padding:2px 8px;height:auto;">
                  <span class="pmi-dot pmi-dot-info"></span>Tiempo indefinido
                </span>
              ` : (p.fecha_devolucion ? `
                <span class="pmi-pill pmi-pill-info" style="font-size:11px;font-weight:600;padding:2px 8px;height:auto;">
                  <span class="pmi-dot pmi-dot-info"></span>Devolución: ${fmtDT(p.fecha_devolucion)}
                </span>
              ` : '')}
              <span class="pmi-pill ${loanEstado(p) === 'devuelto' ? 'pmi-pill-success' : 'pmi-pill-warning'}"><span class="pmi-dot ${loanEstado(p) === 'devuelto' ? 'pmi-dot-success' : 'pmi-dot-warning'}"></span>${LOAN_ESTADO_LABEL[loanEstado(p)]}</span>
            </div>
          </div>
          <div class="pmi-text-xs pmi-muted" style="margin-top:10px;">Clic para ${isOpen ? 'ocultar' : 'ver'} detalle</div>
        </button>
        ${isOpen ? `
          <div class="ui-card-inner pmi-p-4" style="margin-top:14px;">
            <div class="pmi-grid pmi-grid-2">
              <div><div class="pmi-label">Solicitante</div><div class="pmi-text-sm" style="margin-top:4px;">${escapeHtml(p.usuario_solicitante)}</div></div>
              <div><div class="pmi-label">Responsable</div><div class="pmi-text-sm" style="margin-top:4px;">${escapeHtml(p.usuario_responsable)}</div></div>
              <div><div class="pmi-label">Hora entrega</div><div class="pmi-text-sm" style="margin-top:4px;">${fmtDT(p.Hora_entrega)}</div></div>
              <div><div class="pmi-label">${p.Devuelto ? 'Devuelto el' : 'Devolución prevista'}</div><div class="pmi-text-sm" style="margin-top:4px;color:var(--status-info);font-weight:600;">${p.Devuelto ? fmtDT(p.Hora_devolucion) : (p.es_indefinido ? 'Tiempo indefinido' : (p.fecha_devolucion ? fmtDT(p.fecha_devolucion) : '—'))}</div></div>
              <div style="grid-column:1/-1;"><div class="pmi-label">Notas</div><div class="pmi-text-sm" style="margin-top:4px;">${escapeHtml(p.Notas || '—')}</div></div>
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
    const pendingList = pending();

    root.innerHTML = `
      <div class="pmi-flex pmi-justify-between pmi-items-start pmi-gap-4" style="flex-wrap:wrap;">
        <div>
          <div class="pmi-h1">Mis prestamos entregados</div>
          <div class="pmi-muted" style="margin-top:6px;">${total === 0 ? 'Equipos actualmente en tu poder.' : `${total} prestamo(s) entregados`}</div>
        </div>
        <div class="pmi-flex pmi-gap-2">
          <button class="ui-btn ui-btn-ghost ui-btn-sm" id="pmi-ver-solicitudes-top">Mis solicitudes (${pendingList.length})</button>
          <button class="ui-btn ui-btn-ghost ui-btn-sm" id="pmi-back">&larr; Volver al catalogo</button>
        </div>
      </div>

      ${pendingList.length > 0 ? `
        <div class="ui-card-inner pmi-p-4 pmi-flex pmi-justify-between pmi-items-center pmi-gap-4" style="margin-top:16px;background:rgba(14,165,233,.08);border:1px solid var(--eafit-secondary);border-radius:10px;">
          <div>
            <div class="pmi-title pmi-text-sm" style="color:var(--eafit-primary);">Tienes ${pendingList.length} solicitud(es) activa(s) pendiente(s) de entrega</div>
            <div class="pmi-text-xs pmi-muted" style="margin-top:2px;">Acércate al Medialab para recibir tus equipos o consulta su detalle en "Mis solicitudes".</div>
          </div>
          <button type="button" class="ui-btn ui-btn-primary ui-btn-sm" id="pmi-go-mis-solicitudes">Ver solicitudes &rarr;</button>
        </div>
      ` : ''}

      ${total > 0 ? `<div class="ui-card pmi-p-4" style="margin-top:20px;"><input class="ui-input" id="pmi-search" placeholder="Buscar por prestamo, solicitante, responsable..." value="${escapeHtml(q)}" /></div>` : ''}

      <div class="ui-card" style="margin-top:20px;overflow:hidden;">
        ${total === 0 ? `
          <div class="pmi-empty">
            <div class="pmi-empty-icon">&#128230;</div>
            <div class="pmi-title">Sin prestamos entregados</div>
            <div class="pmi-text-sm pmi-muted">No tienes equipos entregados en este momento.</div>
            <div class="pmi-flex pmi-gap-2 pmi-justify-center" style="margin-top:12px;">
              <button class="ui-btn ui-btn-ghost ui-btn-sm" id="pmi-ir-solicitudes">Ver mis solicitudes</button>
              <button class="ui-btn ui-btn-primary ui-btn-sm" id="pmi-ir-catalogo">Ir al catalogo</button>
            </div>
          </div>
        ` : list.length === 0 ? `
          <div class="pmi-empty"><div class="pmi-title">Sin resultados</div></div>
        ` : list.map(rowHtml).join('')}
      </div>
    `;

    root.querySelector('#pmi-back')?.addEventListener('click', () => navigate('/catalogo'));
    root.querySelector('#pmi-ir-catalogo')?.addEventListener('click', () => navigate('/catalogo'));
    root.querySelector('#pmi-ir-solicitudes')?.addEventListener('click', () => navigate('/mis-solicitudes'));
    root.querySelector('#pmi-ver-solicitudes-top')?.addEventListener('click', () => navigate('/mis-solicitudes'));
    root.querySelector('#pmi-go-mis-solicitudes')?.addEventListener('click', () => navigate('/mis-solicitudes'));
    root.querySelector('#pmi-search')?.addEventListener('input', (e) => { q = e.target.value; full(); });
    root.querySelectorAll('[data-toggle]').forEach((btn) => btn.addEventListener('click', () => {
      const id = Number(btn.dataset.toggle);
      openIds[id] = !(openIds[id] ?? true);
      full();
    }));
  }

  full();
}
