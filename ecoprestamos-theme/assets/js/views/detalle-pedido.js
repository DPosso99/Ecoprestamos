import { store } from '../state.js';
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
  await store.loans.reload();
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

  const isPend = prestamo.Entregado === 0;
  const hint = isPend
    ? 'Acercate al laboratorio en el horario seleccionado para confirmar la entrega.'
    : 'Este prestamo ya fue entregado.';

  const items = await store.loans.getLoanDetailItems(prestamo.idPrestamo);
  const totalUnidades = items.reduce((sum, it) => sum + (it.cantidad || 1), 0);
  const itemsHtml = items.length === 0
    ? '<div class="pmi-text-sm pmi-muted" style="margin-top:12px;">No hay recursos registrados en este prestamo.</div>'
    : `<div style="margin-top:8px;">${items.map((it) => `
        <div class="pmi-flex pmi-justify-between pmi-items-center pmi-gap-3" style="padding:10px 0;border-top:1px solid var(--eafit-border);">
          <div class="pmi-min-w-0">
            <div class="pmi-text-sm pmi-truncate" style="font-weight:600;">${escapeHtml(it.nombre)}</div>
            <div class="pmi-text-xs pmi-muted">${escapeHtml(it.tipo || '')}</div>
          </div>
          <div class="pmi-text-sm" style="flex-shrink:0;">&times; <b>${it.cantidad}</b></div>
        </div>
      `).join('')}</div>`;

  root.innerHTML = `
    <button class="ui-btn ui-btn-ghost ui-btn-sm" id="pmi-back">&larr; Volver</button>

    <div class="ui-card pmi-p-8" style="margin-top:16px;">
      <div class="pmi-flex pmi-justify-between pmi-items-start pmi-gap-4" style="flex-wrap:wrap;">
        <div>
          <div class="pmi-h1">Prestamo #${prestamo.idPrestamo}</div>
          <div style="margin-top:10px;">
            <span class="pmi-pill ${isPend ? 'pmi-pill-info' : 'pmi-pill-success'}"><span class="pmi-dot ${isPend ? 'pmi-dot-info' : 'pmi-dot-success'}"></span>${isPend ? 'Pendiente de entrega' : 'Entregado'}</span>
          </div>
        </div>
        <div class="pmi-grid pmi-grid-2" style="width:340px;gap:8px;">
          <div class="ui-card-inner pmi-p-4"><div class="pmi-label">Fecha</div><div class="pmi-text-sm">${fmtDT(prestamo.Fecha_prestamo)}</div></div>
          <div class="ui-card-inner pmi-p-4"><div class="pmi-label">Estado</div><div class="pmi-text-sm">${isPend ? 'Pendiente de entrega' : 'Entregado'}</div></div>
          <div class="ui-card-inner pmi-p-4"><div class="pmi-label">Solicitante</div><div class="pmi-text-sm pmi-truncate">${escapeHtml(prestamo.usuario_solicitante)}</div></div>
          <div class="ui-card-inner pmi-p-4"><div class="pmi-label">Responsable</div><div class="pmi-text-sm pmi-truncate">${escapeHtml(prestamo.usuario_responsable)}</div></div>
        </div>
      </div>
      <div class="pmi-alert pmi-alert-info" style="margin-top:20px;"><b>Que sigue</b><div style="margin-top:4px;">${hint}</div></div>
    </div>

    <div class="pmi-grid pmi-grid-2" style="margin-top:20px;align-items:start;">
      <div class="pmi-flex-col pmi-gap-6">
        <section class="ui-card pmi-p-8">
          <div class="pmi-title">Informacion del prestamo</div>
          <div class="ui-card-inner pmi-p-4" style="margin-top:16px;">
            <div class="pmi-grid pmi-grid-2">
              <div><div class="pmi-label">Fecha prestamo</div><div class="pmi-text-sm" style="margin-top:4px;">${fmtDT(prestamo.Fecha_prestamo)}</div></div>
              <div><div class="pmi-label">Hora entrega</div><div class="pmi-text-sm" style="margin-top:4px;">${fmtDT(prestamo.Hora_entrega)}</div></div>
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
          Lunes a Viernes de 08:00 am a 6:00 pm<br />No salir del campus<br />Trabajador confirma entrega/devolucion
        </div>
      </aside>
    </div>
  `;

  root.querySelector('#pmi-back').addEventListener('click', () => navigate('/mis-solicitudes'));
}
