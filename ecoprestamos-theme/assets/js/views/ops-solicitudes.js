import { store } from '../state.js';
import { escapeHtml, fmtDT, navigate } from '../dom.js';

/**
 * Renderiza la bandeja de solicitudes del trabajador (ruta
 * `/ops/solicitudes`): tabla de prestamos con tabs pendiente/entregado,
 * busqueda, y navegacion al ticket de cada prestamo.
 * @param {HTMLElement} root Elemento contenedor donde se monta la vista.
 * @param {{ params: Object, query: Object }} ctx Parametros de ruta (sin uso aqui) y query (`tab` y `q` precargan pestana/busqueda).
 * @returns {Promise<void>}
 */
export async function renderOpsSolicitudes(root, { query }) {
  await store.loans.reload();

  let tab = query.tab === 'entregado' ? 'entregado' : 'pendiente';
  let q = query.q || '';

  /** @returns {'pendiente'|'entregado'} La pestana a la que pertenece un prestamo segun su estado. */
  function prestamoTab(p) { return p.Entregado === 0 ? 'pendiente' : 'entregado'; }

  /** @returns {Array<Object>} Todos los prestamos, ordenados del mas reciente al mas antiguo. */
  function sorted() {
    return [...store.loans.prestamos].sort((a, b) => new Date(b.Fecha_prestamo || 0) - new Date(a.Fecha_prestamo || 0));
  }

  /** @returns {{ pendiente: number, entregado: number }} Conteo de prestamos por pestana. */
  function counts() {
    const c = { pendiente: 0, entregado: 0 };
    sorted().forEach((p) => { c[prestamoTab(p)]++; });
    return c;
  }

  /** @returns {Array<Object>} Prestamos de la pestana activa que coinciden con la busqueda actual. */
  function filtered() {
    const query_ = q.trim().toLowerCase();
    return sorted().filter((p) => {
      if (prestamoTab(p) !== tab) return false;
      if (!query_) return true;
      const details = store.loans.detailsMap[p.idPrestamo] || [];
      const hay = [String(p.idPrestamo), p.usuario_solicitante, p.usuario_responsable, p.Notas ?? '', ...details].join(' ').toLowerCase();
      return hay.includes(query_);
    });
  }

  /** Renderiza la vista completa (tabs, buscador, tabla) y engancha sus listeners. */
  function full() {
    const list = filtered();
    const c = counts();

    root.innerHTML = `
      <div class="pmi-flex pmi-justify-between pmi-items-start pmi-gap-4" style="flex-wrap:wrap;">
        <div>
          <div class="pmi-h1">Trabajador &middot; Solicitudes</div>
          <div class="pmi-muted" style="margin-top:6px;">Bandeja de prestamos</div>
          <div class="pmi-flex pmi-gap-2" style="margin-top:12px;">
            <span class="ui-chip ui-chip-on">${tab === 'pendiente' ? 'Pendientes' : 'Entregados'}: <b>${c[tab]}</b></span>
            <span class="ui-chip ui-chip-off">Mostrando: <b>${list.length}</b></span>
          </div>
        </div>
        <div class="pmi-flex pmi-gap-2 pmi-wrap">
          <input class="ui-input" id="pmi-search" style="width:280px;" placeholder="Buscar" value="${escapeHtml(q)}" />
          <button class="ui-btn ui-btn-primary" id="pmi-back">&larr; Volver</button>
        </div>
      </div>

      <div class="ui-card pmi-p-4" style="margin-top:20px;">
        <div class="pmi-flex pmi-gap-2 pmi-wrap">
          <button type="button" class="ui-chip ${tab === 'pendiente' ? 'ui-chip-on' : 'ui-chip-off'}" data-tab="pendiente">Pendientes (${c.pendiente})</button>
          <button type="button" class="ui-chip ${tab === 'entregado' ? 'ui-chip-on' : 'ui-chip-off'}" data-tab="entregado">Entregados (${c.entregado})</button>
        </div>
      </div>

      <div class="ui-card pmi-table-wrap" style="margin-top:20px;overflow:hidden;">
        <div style="padding:16px 24px;border-bottom:1px solid var(--eafit-border);" class="pmi-flex pmi-justify-between">
          <span class="pmi-title">Prestamos</span><span class="pmi-text-xs pmi-muted">Orden: mas recientes primero</span>
        </div>
        ${list.length === 0 ? `
          <div class="pmi-empty"><div class="pmi-title">Sin resultados</div><div class="pmi-text-sm pmi-muted">Prueba cambiando el tab o la busqueda.</div></div>
        ` : `
          <table class="pmi-table">
            <thead><tr><th># Prestamo</th><th>Solicitante</th><th>Fecha</th><th>Recursos</th><th>Responsable</th><th>Estado</th><th>Notas</th><th></th></tr></thead>
            <tbody>
              ${list.map((p) => {
                const isPend = prestamoTab(p) === 'pendiente';
                const details = store.loans.detailsMap[p.idPrestamo] || [];
                return `
                  <tr>
                    <td><b>#${p.idPrestamo}</b></td>
                    <td class="pmi-muted">${escapeHtml(p.usuario_solicitante)}</td>
                    <td class="pmi-muted">${fmtDT(p.Fecha_prestamo)}</td>
                    <td class="pmi-muted pmi-text-xs">${details.map(escapeHtml).join('<br/>') || '—'}</td>
                    <td class="pmi-muted">${escapeHtml(p.usuario_responsable)}</td>
                    <td><span class="pmi-pill ${isPend ? 'pmi-pill-info' : 'pmi-pill-success'}"><span class="pmi-dot ${isPend ? 'pmi-dot-info' : 'pmi-dot-success'}"></span>${isPend ? 'Pendiente entrega' : 'Entregado'}</span></td>
                    <td class="pmi-muted pmi-truncate" style="max-width:180px;">${escapeHtml(p.Notas || '—')}</td>
                    <td style="text-align:right;"><button class="ui-btn ui-btn-primary" data-open="${p.idPrestamo}">Abrir &rarr;</button></td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        `}
      </div>
    `;

    root.querySelector('#pmi-back').addEventListener('click', () => navigate('/ops'));
    root.querySelector('#pmi-search').addEventListener('input', (e) => { q = e.target.value; full(); });
    root.querySelectorAll('[data-tab]').forEach((btn) => btn.addEventListener('click', () => { tab = btn.dataset.tab; q = ''; full(); }));
    root.querySelectorAll('[data-open]').forEach((btn) => btn.addEventListener('click', () => navigate(`/ops/ticket/${btn.dataset.open}`)));
  }

  full();
}
