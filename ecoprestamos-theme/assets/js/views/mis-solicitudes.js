import { store, loanEstado, LOAN_ESTADO_LABEL } from '../state.js';
import { escapeHtml, fmtDT, navigate } from '../dom.js';

/**
 * Renderiza el historial de solicitudes del estudiante (ruta
 * `/mis-solicitudes`): lista filtrable/buscable de sus prestamos, con
 * navegacion al detalle de cada uno.
 * @param {HTMLElement} root Elemento contenedor donde se monta la vista.
 * @param {{ params: Object, query: Object }} ctx Parametros de ruta (sin uso aqui) y query (`q` y `filter` precargan busqueda/filtro).
 * @returns {Promise<void>}
 */
export async function renderMisSolicitudes(root, { query }) {
  await store.loans.reload();

  let q = query.q || '';
  let filter = query.filter || 'all';
  const ESTADO_PILL = { pendiente: 'pmi-pill-info', afuera: 'pmi-pill-warning', devuelto: 'pmi-pill-success' };
  const ESTADO_DOT = { pendiente: 'pmi-dot-info', afuera: 'pmi-dot-warning', devuelto: 'pmi-dot-success' };

  /** @returns {Array<Object>} Prestamos solicitados por el usuario actual. */
  function misPrestamos() {
    return store.loans.prestamos.filter((p) => p.usuario_solicitante === store.auth.user?.Correo);
  }

  /** @returns {Array<Object>} Prestamos del usuario, ordenados del mas reciente al mas antiguo. */
  function ordered() {
    return [...misPrestamos()].sort((a, b) => new Date(b.Fecha_prestamo || 0) - new Date(a.Fecha_prestamo || 0));
  }

  /** @returns {Array<Object>} Prestamos que pasan el filtro de estado y la busqueda actuales. */
  function filtered() {
    const query_ = q.trim().toLowerCase();
    return ordered().filter((p) => {
      const estado = loanEstado(p);
      if (filter !== 'all' && estado !== filter) return false;
      if (!query_) return true;
      const hay = [String(p.idPrestamo), p.usuario_solicitante, p.usuario_responsable, p.Notas ?? '', LOAN_ESTADO_LABEL[estado]].join(' ').toLowerCase();
      return hay.includes(query_);
    });
  }

  /**
   * @param {Object} p Prestamo.
   * @returns {string} HTML de una fila de la lista de solicitudes.
   */
  function rowHtml(p) {
    const estado = loanEstado(p);
    const details = store.loans.detailsMap[p.idPrestamo] || [];
    return `
      <button type="button" class="pmi-solicitud-row" data-id="${p.idPrestamo}" style="width:100%;text-align:left;padding:20px 24px;border:none;background:none;cursor:pointer;border-top:1px solid var(--eafit-border);font-family:inherit;">
        <div class="pmi-flex pmi-justify-between pmi-items-center pmi-gap-4" style="flex-wrap:wrap;">
          <div class="pmi-min-w-0">
            <div class="pmi-title pmi-flex pmi-items-center pmi-gap-2" style="flex-wrap:wrap;">
              Prestamo #${p.idPrestamo}
              <span class="pmi-text-xs pmi-muted">&middot; ${fmtDT(p.Fecha_prestamo)}</span>
              ${p.es_indefinido ? `
                <span class="pmi-pill pmi-pill-info" style="font-size:10px;font-weight:600;padding:1px 6px;height:auto;">
                  Tiempo indefinido
                </span>
              ` : (p.fecha_devolucion ? `
                <span class="pmi-pill pmi-pill-info" style="font-size:10px;font-weight:600;padding:1px 6px;height:auto;">
                  Devolución: ${fmtDT(p.fecha_devolucion)}
                </span>
              ` : '')}
            </div>
            <div class="pmi-text-sm pmi-muted" style="margin-top:4px;">Responsable: ${escapeHtml(p.usuario_responsable)}${p.Notas ? ` &middot; ${escapeHtml(p.Notas)}` : ''}</div>
            ${details.length ? `<div class="pmi-flex pmi-gap-1 pmi-wrap" style="margin-top:8px;">${details.map((d) => `<span class="pmi-text-xs" style="padding:2px 8px;border-radius:6px;background:var(--eafit-bg);border:1px solid var(--eafit-border);">${escapeHtml(d)}</span>`).join('')}</div>` : ''}
          </div>
          <span class="pmi-pill ${ESTADO_PILL[estado]}"><span class="pmi-dot ${ESTADO_DOT[estado]}"></span>${LOAN_ESTADO_LABEL[estado]}</span>
        </div>
      </button>
    `;
  }

  /** Renderiza la vista completa (contadores, buscador, lista) y engancha sus listeners. */
  function full() {
    const list = filtered();
    const all = misPrestamos();
    const counts = {
      total: all.length,
      pendiente: all.filter((p) => loanEstado(p) === 'pendiente').length,
      afuera: all.filter((p) => loanEstado(p) === 'afuera').length,
      devuelto: all.filter((p) => loanEstado(p) === 'devuelto').length,
    };
    const chip = (val, label) => `<button type="button" class="ui-chip ${filter === val ? 'ui-chip-on' : 'ui-chip-off'}" data-filter="${val}">${label}</button>`;

    root.innerHTML = `
      <div class="pmi-flex pmi-justify-between pmi-items-start pmi-gap-4" style="flex-wrap:wrap;">
        <div>
          <div class="pmi-h1">Mis solicitudes</div>
          <div class="pmi-muted" style="margin-top:6px;">Historial de prestamos${counts.total ? ` (${counts.total})` : ''}.</div>
          <div class="pmi-flex pmi-gap-2 pmi-wrap" style="margin-top:12px;">
            ${chip('all', `Total: ${counts.total}`)}
            ${chip('pendiente', `Pendientes: ${counts.pendiente}`)}
            ${chip('afuera', `En mi poder: ${counts.afuera}`)}
            ${chip('devuelto', `Devueltos: ${counts.devuelto}`)}
          </div>
        </div>
        <button class="ui-btn ui-btn-ghost ui-btn-sm" id="pmi-back">&larr; Volver al catalogo</button>
      </div>

      ${all.length > 0 ? `
        <div class="ui-card pmi-p-4" style="margin-top:20px;">
          <input class="ui-input" id="pmi-search" placeholder="Buscar por prestamo, estado..." value="${escapeHtml(q)}" />
        </div>
      ` : ''}

      <div class="ui-card" style="margin-top:20px;overflow:hidden;">
        <div style="padding:16px 24px;border-bottom:1px solid var(--eafit-border);" class="pmi-title">Prestamos</div>
        ${all.length === 0 ? `
          <div class="pmi-empty">
            <div class="pmi-empty-icon">&#128196;</div>
            <div class="pmi-title">Aun no tienes solicitudes</div>
            <div class="pmi-text-sm pmi-muted">Ve al catalogo para seleccionar recursos y crear una solicitud.</div>
            <button class="ui-btn ui-btn-primary ui-btn-sm" id="pmi-ir-catalogo">Ir al catalogo</button>
          </div>
        ` : list.length === 0 ? `
          <div class="pmi-empty">
            <div class="pmi-empty-icon">&#128269;</div>
            <div class="pmi-title">Sin resultados</div>
            <div class="pmi-text-sm pmi-muted">Prueba con otro termino o ajusta los filtros.</div>
          </div>
        ` : list.map(rowHtml).join('')}
      </div>
    `;

    root.querySelector('#pmi-back')?.addEventListener('click', () => navigate('/catalogo'));
    root.querySelector('#pmi-ir-catalogo')?.addEventListener('click', () => navigate('/catalogo'));
    root.querySelector('#pmi-search')?.addEventListener('input', (e) => { q = e.target.value; full(); });
    root.querySelectorAll('[data-filter]').forEach((btn) => btn.addEventListener('click', () => { filter = btn.dataset.filter; full(); }));
    root.querySelectorAll('[data-id]').forEach((btn) => btn.addEventListener('click', () => navigate(`/mis-solicitudes/${btn.dataset.id}`)));
  }

  full();
}
