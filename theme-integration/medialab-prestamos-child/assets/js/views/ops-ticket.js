import { store } from '../state.js';
import { escapeHtml, fmtDT, navigate } from '../dom.js';

export async function renderOpsTicket(root, { params }) {
  await store.loans.reload();
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
  const canMark = prestamo.Entregado === 0;
  const items = await store.loans.getLoanDetailItems(prestamo.idPrestamo);
  const totalUnidades = items.reduce((sum, it) => sum + (it.cantidad || 1), 0);

  function itemRowHtml(it) {
    return `
      <div class="pmi-flex pmi-justify-between pmi-items-center pmi-gap-3" style="padding:10px 0;border-top:1px solid var(--eafit-border);">
        <div class="pmi-min-w-0">
          <div class="pmi-text-sm pmi-truncate" style="font-weight:600;">${escapeHtml(it.nombre)}</div>
          <div class="pmi-text-xs pmi-muted">${escapeHtml(it.tipo || '')}${it.ubicacion ? ` &middot; ${escapeHtml(it.ubicacion)}` : ''} &middot; <span style="color:var(--eafit-text);">${escapeHtml(it.recursoId)}</span></div>
        </div>
        <div class="pmi-text-sm" style="flex-shrink:0;">&times; <b>${it.cantidad}</b></div>
      </div>
    `;
  }

  function full() {
    root.innerHTML = `
      <div class="pmi-flex pmi-justify-between pmi-items-start pmi-gap-4" style="flex-wrap:wrap;">
        <div>
          <div class="pmi-h1">Prestamo #${prestamo.idPrestamo}</div>
          <div style="margin-top:10px;">
            <span class="pmi-pill ${canMark ? 'pmi-pill-info' : 'pmi-pill-success'}"><span class="pmi-dot ${canMark ? 'pmi-dot-info' : 'pmi-dot-success'}"></span>${canMark ? 'Pendiente entrega' : 'Entregado'}</span>
          </div>
          <div class="pmi-alert pmi-alert-info" style="margin-top:14px;max-width:520px;">
            <b>Siguiente accion</b>
            <div style="margin-top:4px;">${canMark ? 'Marca como entregado cuando el recurso haya sido entregado al solicitante.' : 'Este prestamo ya fue marcado como entregado.'}</div>
          </div>
        </div>
        <button class="ui-btn ui-btn-primary ui-btn-sm" id="pmi-back">&larr; Solicitudes</button>
      </div>

      <div class="pmi-grid pmi-grid-2" style="margin-top:28px;align-items:start;">
        <div class="pmi-flex-col pmi-gap-6">
          <section class="ui-card pmi-p-6">
            <div class="pmi-title">Informacion del prestamo</div>
            <div class="ui-card-inner pmi-p-4" style="margin-top:16px;">
              <div class="pmi-grid pmi-grid-2">
                <div><div class="pmi-label">Fecha prestamo</div><div class="pmi-text-sm" style="margin-top:4px;">${fmtDT(prestamo.Fecha_prestamo)}</div></div>
                <div><div class="pmi-label">Hora entrega</div><div class="pmi-text-sm" style="margin-top:4px;">${fmtDT(prestamo.Hora_entrega)}</div></div>
                <div><div class="pmi-label">Solicitante</div><div class="pmi-text-sm" style="margin-top:4px;">${escapeHtml(prestamo.usuario_solicitante)}</div></div>
                <div><div class="pmi-label">Responsable</div><div class="pmi-text-sm" style="margin-top:4px;">${escapeHtml(prestamo.usuario_responsable)}</div></div>
                <div style="grid-column:1/-1;"><div class="pmi-label">Notas</div><div class="pmi-text-sm" style="margin-top:4px;white-space:pre-wrap;">${escapeHtml(prestamo.Notas?.trim() || 'Sin notas.')}</div></div>
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
            ${canMark
              ? `<button class="ui-btn ui-btn-primary ui-btn-block" id="pmi-marcar" style="height:48px;" ${busy ? 'disabled' : ''}>${busy ? 'Procesando...' : 'Marcar como entregado'}</button>`
              : `<div class="ui-card-inner pmi-p-4 pmi-text-sm pmi-muted">No hay acciones disponibles para este estado.</div>`
            }
          </div>
        </aside>
      </div>
    `;

    root.querySelector('#pmi-back').addEventListener('click', () => navigate('/ops'));
    root.querySelector('#pmi-marcar')?.addEventListener('click', async () => {
      busy = true; error = ''; full();
      try {
        await store.loans.marcarEntregado(prestamo.idPrestamo);
        navigate('/ops/solicitudes?tab=entregado');
      } catch (e) {
        error = e.message || 'No se pudo marcar como entregado.';
        busy = false; full();
      }
    });
  }

  full();
}
