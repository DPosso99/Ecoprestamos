import { store, loanEstado, LOAN_ESTADO_LABEL } from '../state.js';
import { escapeHtml, fmtDT, navigate } from '../dom.js';

/**
 * Renderiza el detalle de una solicitud de prestamo, vista del estudiante
 * (ruta `/mis-solicitudes/:id`): estado, informacion general, recursos
 * solicitados y notas.
 * @param {HTMLElement} root Elemento contenedor donde se monta la vista.
 * @param {{ params: Object, query: Object }} ctx `params.id` es el idPrestamo a mostrar.
 * @returns {Promise<void>}
 */
export async function renderDetallePedido(root, { params }) {
  await Promise.all([store.loans.reload(), store.users.reload()]);
  const prestamo = store.loans.getPrestamo(Number(params.id));

  if (!prestamo) {
    root.innerHTML = `
      <div class="ui-card pmi-p-8">
        <div class="pmi-title">Prestamo no encontrado.</div>
        <button class="ui-btn ui-btn-ghost" id="pmi-back" style="margin-top:16px;">&larr; Volver</button>
      </div>
    `;
    root.querySelector('#pmi-back').addEventListener('click', () => navigate('/mis-solicitudes'));
    return;
  }

  const estado = loanEstado(prestamo);
  const ESTADO_PILL = { pendiente: 'pmi-pill-info', afuera: 'pmi-pill-warning', devuelto: 'pmi-pill-success' };
  const ESTADO_DOT = { pendiente: 'pmi-dot-info', afuera: 'pmi-dot-warning', devuelto: 'pmi-dot-success' };
  const ESTADO_COLOR = { pendiente: 'var(--status-info)', afuera: 'var(--status-warning)', devuelto: 'var(--status-success)' };
  const hint = {
    pendiente: 'Acércate al Medialab en el horario seleccionado para confirmar la entrega.',
    afuera: 'Tienes el equipo en tu poder. Devuélvelo en el Medialab para cerrar el préstamo.',
    devuelto: 'Este préstamo ya fue devuelto y cerrado.',
  }[estado];

  const items = await store.loans.getLoanDetailItems(prestamo.idPrestamo);
  const totalUnidades = items.reduce((sum, it) => sum + (Number(it.cantidad) || 1), 0);
  const borrower = store.users.getByCorreo(prestamo.usuario_solicitante);
  const responsible = store.users.getByCorreo(prestamo.usuario_responsable);
  const isTeacher = borrower?.Rol === 'Docente';
  const borrowerName = borrower?.Nombre || prestamo.usuario_solicitante.split('@')[0];
  const responsibleName = responsible?.Nombre || prestamo.usuario_responsable.split('@')[0];

  let borrowerPhone = borrower?.numero && borrower.numero !== 'N/A' ? borrower.numero : '';
  if (!borrowerPhone && prestamo.Notas) {
    const match = prestamo.Notas.match(/(?:Tel(?:\.|\s*contacto)?|Cel(?:ular)?):?\s*([0-9+\-\s()]{7,15})/i);
    if (match) borrowerPhone = match[1].trim();
  }
  if (borrowerPhone) {
    borrowerPhone = borrowerPhone.replace(/^\+57\s*/, '').trim();
  }

  let responsiblePhone = responsible?.numero && responsible.numero !== 'N/A' ? responsible.numero : '';
  if (responsiblePhone) {
    responsiblePhone = responsiblePhone.replace(/^\+57\s*/, '').trim();
  }

  /**
   * Unidades fisicas asignadas a este prestamo, con su numero de activo.
   * El backend las registra en el detalle, asi que aqui solo se leen (antes
   * se deducian por posicion y coincidencia de nombres, lo que atribuia la
   * unidad equivocada cuando dos recursos compartian parte del nombre).
   * @param {Object} it Item de detalle.
   * @returns {Array<{ id: string, activo: string }>}
   */
  function getAssignedUnits(it) {
    const allIds = (it.recursoId || '').split(',').map((s) => s.trim()).filter(Boolean);
    const allActivos = (it.activo || 'N/A').split(',').map((s) => s.trim());
    const activoDe = (unitId) => {
      const i = allIds.indexOf(unitId);
      return (i >= 0 ? allActivos[i] : null) || allActivos[0] || 'N/A';
    };

    if (it.unidades?.length) {
      return it.unidades.map((id) => ({ id, activo: activoDe(id) }));
    }

    // Prestamos anteriores a que se registraran las unidades: no hay dato de
    // cuales fueron, se muestran las primeras segun la cantidad prestada.
    return allIds.slice(0, it.cantidad || 1).map((id) => ({ id, activo: activoDe(id) }));
  }

  const itemsHtml = items.length === 0
    ? '<div class="pmi-text-sm pmi-muted" style="margin-top:12px;">No hay recursos registrados en este prestamo.</div>'
    : `<div style="margin-top:8px;">${items.map((it) => {
        const assignedUnits = getAssignedUnits(it);
        return `
          <div class="pmi-flex pmi-justify-between pmi-items-start pmi-gap-3" style="padding:12px 0;border-top:1px solid var(--eafit-border);">
            <div class="pmi-min-w-0" style="flex:1;">
              <div class="pmi-text-sm pmi-truncate" style="font-weight:600;font-size:15px;">${escapeHtml(it.nombre)}</div>
              <div class="pmi-text-xs pmi-muted" style="margin-top:2px;">${escapeHtml(it.tipo || '')}${it.ubicacion ? ` &middot; Ubicación: ${it.ubicacion.startsWith('Bloque 38') ? escapeHtml(it.ubicacion) : `Bloque 38 - ${escapeHtml(it.ubicacion)}`}` : ''}</div>
              <div class="pmi-text-xs" style="margin-top:8px;display:flex;gap:8px;flex-wrap:wrap;">
                ${assignedUnits.map((u) => `
                  <span class="pmi-pill pmi-pill-neutral" style="font-size:11px;padding:3px 10px;height:auto;line-height:1.4;">
                    <span class="pmi-dot pmi-dot-info"></span>
                    ID: <b style="font-family:monospace;font-size:12px;margin-left:2px;">${escapeHtml(u.id)}</b>
                    <span style="opacity:0.85;margin-left:6px;">(Activo: <b>${escapeHtml(u.activo)}</b>)</span>
                  </span>
                `).join('')}
              </div>
            </div>
            <div class="pmi-text-sm" style="flex-shrink:0;margin-top:2px;">&times; <b>${it.cantidad}</b></div>
          </div>
        `;
      }).join('')}</div>`;

  root.innerHTML = `
    <button class="ui-btn ui-btn-ghost ui-btn-sm" id="pmi-back">&larr; Volver</button>

    <div class="ui-card pmi-p-8" style="margin-top:16px;">
      <div class="pmi-flex pmi-justify-between pmi-items-start pmi-gap-6" style="flex-wrap:wrap;">
        <div style="flex:1 1 260px;min-width:220px;">
          <div class="pmi-h1">Prestamo #${prestamo.idPrestamo}</div>
          <div style="margin-top:10px;display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
            <span class="pmi-pill ${ESTADO_PILL[estado]}"><span class="pmi-dot ${ESTADO_DOT[estado]}"></span>${LOAN_ESTADO_LABEL[estado]}</span>
            ${prestamo.es_indefinido ? `
              <span class="pmi-pill pmi-pill-info" style="font-size:11px;font-weight:600;padding:2px 8px;height:auto;">
                <span class="pmi-dot pmi-dot-info"></span>Tiempo indefinido
              </span>
            ` : (prestamo.fecha_devolucion ? `
              <span class="pmi-pill pmi-pill-info" style="font-size:11px;font-weight:600;padding:2px 8px;height:auto;">
                <span class="pmi-dot pmi-dot-info"></span>Devolución prevista: ${fmtDT(prestamo.fecha_devolucion)}
              </span>
            ` : '')}
          </div>
        </div>
        <div style="display:grid;grid-template-columns:repeat(2, minmax(0, 1fr));gap:10px;width:100%;max-width:440px;min-width:0;flex:1 1 320px;">
          <div class="ui-card-inner" style="padding:10px 14px;min-width:0;overflow:hidden;">
            <div class="pmi-label">Fecha</div>
            <div class="pmi-text-sm pmi-truncate" style="margin-top:2px;font-weight:600;" title="${escapeHtml(fmtDT(prestamo.Fecha_prestamo))}">${fmtDT(prestamo.Fecha_prestamo)}</div>
          </div>
          <div class="ui-card-inner" style="padding:10px 14px;min-width:0;overflow:hidden;">
            <div class="pmi-label">Estado</div>
            <div class="pmi-text-sm pmi-truncate" style="margin-top:2px;font-weight:600;color:${ESTADO_COLOR[estado]};">${LOAN_ESTADO_LABEL[estado]}</div>
          </div>
          <div class="ui-card-inner" style="padding:10px 14px;min-width:0;overflow:hidden;">
            <div class="pmi-label">Solicitante</div>
            <div class="pmi-text-sm pmi-truncate" style="margin-top:2px;font-weight:700;" title="${escapeHtml(borrowerName)} (${escapeHtml(prestamo.usuario_solicitante)})">${escapeHtml(borrowerName)}</div>
            <div class="pmi-text-xs pmi-muted pmi-truncate" style="font-size:11px;">${escapeHtml(prestamo.usuario_solicitante)}</div>
          </div>
          <div class="ui-card-inner" style="padding:10px 14px;min-width:0;overflow:hidden;">
            <div class="pmi-label">Responsable</div>
            <div class="pmi-text-sm pmi-truncate" style="margin-top:2px;font-weight:700;" title="${escapeHtml(responsibleName)} (${escapeHtml(prestamo.usuario_responsable)})">${escapeHtml(responsibleName)}</div>
            <div class="pmi-text-xs pmi-muted pmi-truncate" style="font-size:11px;">${escapeHtml(prestamo.usuario_responsable)}</div>
          </div>
        </div>
      </div>
      <div class="pmi-alert pmi-alert-info" style="margin-top:20px;"><b>Que sigue</b><div style="margin-top:4px;">${hint}</div></div>
    </div>

    <div class="pmi-grid pmi-grid-2" style="margin-top:20px;align-items:start;">
      <div class="pmi-flex-col pmi-gap-6">
        <section class="ui-card pmi-p-8">
          <div class="pmi-title">Información del préstamo</div>
          <div class="ui-card-inner pmi-p-4" style="margin-top:16px;">
            <div class="pmi-grid pmi-grid-2" style="gap:16px;">
              <div>
                <div class="pmi-label">Fecha de solicitud</div>
                <div class="pmi-text-sm" style="margin-top:4px;font-weight:600;">${fmtDT(prestamo.Fecha_prestamo)}</div>
              </div>
              <div>
                <div class="pmi-label">Hora de entrega</div>
                <div class="pmi-text-sm" style="margin-top:4px;font-weight:600;">${prestamo.Hora_entrega ? fmtDT(prestamo.Hora_entrega) : '<span class="pmi-muted">Pendiente de despacho</span>'}</div>
              </div>
              ${prestamo.Hora_devolucion ? `
                <div>
                  <div class="pmi-label">Hora devolución real</div>
                  <div class="pmi-text-sm" style="margin-top:4px;font-weight:600;color:var(--status-success);">${fmtDT(prestamo.Hora_devolucion)}</div>
                </div>
              ` : ''}
              ${prestamo.es_indefinido ? `
                <div style="${prestamo.Hora_devolucion ? '' : 'grid-column:1/-1;'}">
                  <div class="pmi-label">Período de préstamo</div>
                  <div class="pmi-text-sm" style="margin-top:4px;color:var(--status-info);font-weight:600;">Tiempo indefinido (permanece prestado hasta que se devuelva al Medialab)</div>
                </div>
              ` : (prestamo.fecha_devolucion ? `
                <div style="${prestamo.Hora_devolucion ? '' : 'grid-column:1/-1;'}">
                  <div class="pmi-label">Fecha prevista de devolución</div>
                  <div class="pmi-text-sm" style="margin-top:4px;color:var(--status-info);font-weight:600;">${fmtDT(prestamo.fecha_devolucion)}</div>
                </div>
              ` : '')}

              <div style="grid-column:1/-1;border-top:1px solid var(--eafit-border);margin-top:4px;padding-top:14px;">
                <div class="pmi-grid pmi-grid-2" style="gap:16px;">
                  <div>
                    <div class="pmi-label">Solicitante</div>
                    <div style="margin-top:4px;display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
                      <span style="font-weight:700;font-size:15px;color:var(--eafit-navy);">${escapeHtml(borrowerName)}</span>
                      ${borrower?.Rol ? `<span class="pmi-pill ${isTeacher ? 'pmi-pill-warning' : 'pmi-pill-neutral'}" style="font-size:10px;font-weight:700;padding:2px 8px;height:auto;">${escapeHtml(borrower.Rol)}</span>` : ''}
                    </div>
                    <div class="pmi-text-xs pmi-muted" style="margin-top:3px;">${escapeHtml(prestamo.usuario_solicitante)}</div>
                    ${borrowerPhone ? `<div class="pmi-text-xs" style="margin-top:4px;color:var(--eafit-navy);font-weight:600;">📞 Teléfono: <span style="font-weight:500;">${escapeHtml(borrowerPhone)}</span></div>` : ''}
                  </div>

                  <div>
                    <div class="pmi-label">Responsable Medialab</div>
                    <div style="margin-top:4px;display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
                      <span style="font-weight:700;font-size:15px;color:var(--eafit-navy);">${escapeHtml(responsibleName)}</span>
                      ${(responsible?.Trabajo || responsible?.Rol) ? `<span class="pmi-pill pmi-pill-info" style="font-size:10px;font-weight:700;padding:2px 8px;height:auto;">${escapeHtml(responsible.Trabajo || responsible.Rol)}</span>` : ''}
                    </div>
                    <div class="pmi-text-xs pmi-muted" style="margin-top:3px;">${escapeHtml(prestamo.usuario_responsable)}</div>
                    ${responsiblePhone ? `<div class="pmi-text-xs" style="margin-top:4px;color:var(--eafit-navy);font-weight:600;">📞 Teléfono: <span style="font-weight:500;">${escapeHtml(responsiblePhone)}</span></div>` : ''}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section class="ui-card pmi-p-8">
          <div class="pmi-flex pmi-justify-between pmi-items-center">
            <div class="pmi-title">Recursos solicitados</div>
            <div class="pmi-text-xs pmi-muted">${items.length} tipo(s) &middot; ${totalUnidades} unidad(es)</div>
          </div>
          ${itemsHtml}
        </section>
      </div>
      <aside class="ui-card pmi-p-6">
        <div class="pmi-title">Notas</div>
        <div class="pmi-text-sm pmi-muted" style="margin-top:8px;white-space:pre-wrap;">${escapeHtml(prestamo.Notas?.trim() || 'Sin notas.')}</div>
        <div class="pmi-divider"></div>
        <div class="pmi-title">Reglas</div>
        <div class="pmi-text-sm pmi-muted" style="margin-top:8px;line-height:1.6;">
          Lunes a Viernes de 08:00 AM a 6:00 PM<br />No salir del campus<br />Trabajador confirma entrega/devolucion
        </div>
      </aside>
    </div>
  `;

  root.querySelector('#pmi-back').addEventListener('click', () => navigate('/mis-solicitudes'));
}
