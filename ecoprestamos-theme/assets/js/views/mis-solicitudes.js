import { store } from '../state.js';
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

  /** @returns {Array<Object>} Prestamos solicitados por el usuario actual. */
  function misPrestamos() {
    return store.loans.prestamos.filter((p) => p.usuario_solicitante === store.auth.user?.Correo);
  }

  /** @returns {Array<Object>} Prestamos del usuario, ordenados del mas reciente al mas antiguo. */
  function ordered() {
    return [...misPrestamos()].sort((a, b) => new Date(b.Fecha_prestamo || 0) - new Date(a.Fecha_prestamo || 0));
  }

  /** @returns {Array<Object>} Prestamos que pasan el filtro de estado (pendiente/entregado) y la busqueda actuales. */
  function filtered() {
    const query_ = q.trim().toLowerCase();
    return ordered().filter((p) => {
      if (filter === 'pendiente' && p.Entregado !== 0) return false;
      if (filter === 'entregado' && p.Entregado !== 1) return false;
      if (!query_) return true;
      const hay = [String(p.idPrestamo), p.usuario_solicitante, p.usuario_responsable, p.Notas ?? '', p.Entregado === 0 ? 'pendiente' : 'entregado'].join(' ').toLowerCase();
      return hay.includes(query_);
    });
  }

  /**
   * @param {Object} p Prestamo.
   * @returns {string} HTML de una fila de la lista de solicitudes.
   */
  function rowHtml(p) {
    const isPend = p.Entregado === 0;
    const details = store.loans.detailsMap[p.idPrestamo] || [];
    return `
      <button type="button" class="pmi-solicitud-row" data-id="${p.idPrestamo}" style="width:100%;text-align:left;padding:20px 24px;border:none;background:none;cursor:pointer;border-top:1px solid var(--eafit-border);font-family:inherit;">
        <div class="pmi-flex pmi-justify-between pmi-items-center pmi-gap-4" style="flex-wrap:wrap;">
          <div class="pmi-min-w-0">
            <div class="pmi-title">Prestamo #${p.idPrestamo} <span class="pmi-text-xs pmi-muted">&middot; ${fmtDT(p.Fecha_prestamo)}</span></div>
            <div class="pmi-text-sm pmi-muted" style="margin-top:4px;">Responsable: ${escapeHtml(p.usuario_responsable)}${p.Notas ? ` &middot; ${escapeHtml(p.Notas)}` : ''}</div>
            ${details.length ? `<div class="pmi-flex pmi-gap-1 pmi-wrap" style="margin-top:8px;">${details.map((d) => `<span class="pmi-text-xs" style="padding:2px 8px;border-radius:6px;background:var(--eafit-bg);border:1px solid var(--eafit-border);">${escapeHtml(d)}</span>`).join('')}</div>` : ''}
          </div>
          <span class="pmi-pill ${isPend ? 'pmi-pill-info' : 'pmi-pill-success'}"><span class="pmi-dot ${isPend ? 'pmi-dot-info' : 'pmi-dot-success'}"></span>${isPend ? 'Pendiente de entrega' : 'Entregado'}</span>
        </div>
      </button>
    `;
  }

  /** Renderiza la vista completa (contadores, buscador, lista) y engancha sus listeners. */
  function full() {
    const list = filtered();
    const all = misPrestamos();
    const counts = { total: all.length, pendientes: all.filter((p) => p.Entregado === 0).length, entregados: all.filter((p) => p.Entregado === 1).length };
    const chip = (val, label) => `<button type="button" class="ui-chip ${filter === val ? 'ui-chip-on' : 'ui-chip-off'}" data-filter="${val}">${label}</button>`;

    root.innerHTML = `
      <div class="pmi-flex pmi-justify-between pmi-items-start pmi-gap-4" style="flex-wrap:wrap;">
        <div>
          <div class="pmi-h1">Mis solicitudes</div>
          <div class="pmi-muted" style="margin-top:6px;">Historial de prestamos${counts.total ? ` (${counts.total})` : ''}.</div>
          <div class="pmi-flex pmi-gap-2 pmi-wrap" style="margin-top:12px;">
            ${chip('all', `Total: ${counts.total}`)}
            ${chip('pendiente', `Pendientes: ${counts.pendientes}`)}
            ${chip('entregado', `Entregados: ${counts.entregados}`)}
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
