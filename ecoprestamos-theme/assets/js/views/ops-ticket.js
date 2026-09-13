import { store, loanEstado, LOAN_ESTADO_LABEL } from '../state.js';
import { escapeHtml, fmtDT, navigate } from '../dom.js';

/**
 * Renderiza el detalle de un prestamo para el trabajador (ruta
 * `/ops/ticket/:id`): informacion del prestamo, recursos solicitados, y las
 * acciones de entrega y devolucion segun el estado en que este.
 * @param {HTMLElement} root Elemento contenedor donde se monta la vista.
 * @param {{ params: Object, query: Object }} ctx `params.id` es el idPrestamo a mostrar.
 * @returns {Promise<void>}
 */
export async function renderOpsTicket(root, { params }) {
  await Promise.all([store.loans.reload(), store.users.reload()]);
  const prestamo = store.loans.getPrestamo(Number(params.id));

  if (!prestamo) {
    root.innerHTML = `
      <div class="ui-card pmi-p-8">
        <div class="pmi-title">Prestamo no encontrado.</div>
        <button class="ui-btn ui-btn-ghost" id="pmi-back" style="margin-top:16px;">&larr; Volver</button>
      </div>
    `;
    root.querySelector('#pmi-back').addEventListener('click', () => navigate('/ops'));
    return;
  }

  let busy = false;
  let error = '';
  // Dos hitos distintos: entregar saca el equipo del laboratorio (y NO libera
  // stock); registrar la devolucion es el unico paso que lo reintegra. Cada
  // estado ofrece su propia accion: ninguna hace las dos cosas de una vez.
  const estado = loanEstado(prestamo);
  const puedeEntregar = estado === 'pendiente';
  const puedeDevolver = estado === 'afuera';
  const estadoPill = { pendiente: 'pmi-pill-info', afuera: 'pmi-pill-warning', devuelto: 'pmi-pill-success' };
  const estadoDot = { pendiente: 'pmi-dot-info', afuera: 'pmi-dot-warning', devuelto: 'pmi-dot-success' };
  const siguienteAccion = {
    pendiente: 'Haz clic en "Marcar como entregado" cuando el recurso sea despachado.',
    afuera: 'Haz clic en "Registrar devolución" cuando el equipo regrese al laboratorio: ese es el paso que lo devuelve al inventario.',
    devuelto: 'Este préstamo ya fue entregado y devuelto: las unidades están de vuelta en el inventario.',
  };
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
   *
   * El backend registra en el detalle cuales unidades concretas se
   * reservaron, asi que aqui solo se leen. Antes se deducian contando
   * cuantas unidades habian tomado los prestamos anteriores y comparando
   * nombres por substring, lo que atribuia la unidad equivocada en cuanto
   * dos recursos compartian parte del nombre.
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

  /**
   * @param {Object} it Item de detalle del prestamo.
   * @returns {string} HTML de una fila de recurso solicitado.
   */
  function itemRowHtml(it) {
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
  }

  /** Renderiza la vista completa (informacion, recursos, acciones) y engancha sus listeners. */
  function full() {
    root.innerHTML = `
      <div class="pmi-admin-header pmi-flex pmi-justify-between pmi-items-start pmi-gap-4">
        <div>
          <div class="pmi-h1">Préstamo #${prestamo.idPrestamo}</div>
          <div style="margin-top:10px;display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
            <span class="pmi-pill ${estadoPill[estado]}"><span class="pmi-dot ${estadoDot[estado]}"></span>${LOAN_ESTADO_LABEL[estado]}</span>
            ${isTeacher ? `<span class="pmi-pill pmi-pill-warning" style="font-size:11px;font-weight:700;padding:2px 8px;height:auto;"><span class="pmi-dot pmi-dot-warning"></span>Docente</span>` : ''}
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
          <div class="pmi-alert pmi-alert-info" style="margin-top:14px;max-width:520px;">
            <b>Siguiente accion</b>
            <div style="margin-top:4px;">${siguienteAccion[estado]}</div>
          </div>
        </div>
        <div class="pmi-admin-header-actions">
          <button class="ui-btn ui-btn-primary ui-btn-sm" id="pmi-back">&larr; Solicitudes</button>
        </div>
      </div>

      <div class="pmi-grid pmi-grid-2" style="margin-top:28px;align-items:start;">
        <div class="pmi-flex-col pmi-gap-6">
          <section class="ui-card pmi-p-6">
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
                    <div class="pmi-text-sm" style="margin-top:4px;color:var(--status-info);font-weight:600;">Tiempo indefinido (permanece prestado hasta que el docente lo entregue)</div>
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

                <div style="grid-column:1/-1;border-top:1px solid var(--eafit-border);margin-top:4px;padding-top:14px;">
                  <div class="pmi-label">Notas / Observaciones</div>
                  <div class="pmi-text-sm" style="margin-top:6px;white-space:pre-wrap;background:var(--eafit-bg);padding:10px 14px;border-radius:var(--eafit-radius-sm);border:1px solid var(--eafit-border);line-height:1.5;">${escapeHtml(prestamo.Notas?.trim() || 'Sin notas registradas.')}</div>
                </div>
              </div>
            </div>
          </section>

          <section class="ui-card pmi-p-6">
            <div class="pmi-flex pmi-justify-between pmi-items-center">
              <div class="pmi-title">Recursos solicitados</div>
              <div class="pmi-text-xs pmi-muted">${items.length} tipo(s) &middot; ${totalUnidades} unidad(es)</div>
            </div>
            ${items.length === 0
              ? '<div class="pmi-text-sm pmi-muted" style="margin-top:12px;">No hay recursos registrados en este prestamo.</div>'
              : `<div style="margin-top:8px;">${items.map(itemRowHtml).join('')}</div>`
            }
          </section>
        </div>

        <aside class="ui-card pmi-p-6">
          <div class="pmi-title">Acciones</div>
          <div class="pmi-text-sm pmi-muted" style="margin-top:6px;">Disponibles segun estado.</div>
          ${error ? `<div class="pmi-alert pmi-alert-danger" style="margin-top:12px;">${escapeHtml(error)}</div>` : ''}
          <div style="margin-top:20px;">
            ${puedeEntregar || puedeDevolver
              ? `<button class="ui-btn ui-btn-primary ui-btn-block" id="${puedeEntregar ? 'pmi-entregar' : 'pmi-devolver'}" style="height:48px;" ${busy ? 'disabled' : ''}>${busy ? 'Procesando...' : (puedeEntregar ? 'Marcar como entregado' : 'Registrar devolución')}</button>`
              : `<div class="ui-card-inner pmi-p-4 pmi-text-sm pmi-muted">El préstamo ya fue entregado y devuelto: las unidades están de vuelta en el inventario.</div>`}
          </div>
        </aside>
      </div>
    `;

    root.querySelector('#pmi-back').addEventListener('click', () => navigate('/ops'));

    /**
     * Ejecuta el hito del estado actual y vuelve al panel, que reagrupa los
     * prestamos por estado (entrega pendiente / fuera / historial).
     * @param {Function} accion Hito a ejecutar.
     * @param {string} mensajeError Texto a mostrar si el hito falla.
     */
    async function ejecutarHito(accion, mensajeError) {
      busy = true; error = ''; full();
      try {
        await accion();
        navigate('/ops');
      } catch (e) {
        error = e.message || mensajeError;
        busy = false; full();
      }
    }

    root.querySelector('#pmi-entregar')?.addEventListener('click', () => ejecutarHito(
      () => store.loans.marcarEntregado(prestamo.idPrestamo),
      'No se pudo marcar como entregado.'
    ));
    root.querySelector('#pmi-devolver')?.addEventListener('click', () => ejecutarHito(
      () => store.loans.marcarDevuelto(prestamo.idPrestamo),
      'No se pudo registrar la devolución.'
    ));
  }

  full();
}
