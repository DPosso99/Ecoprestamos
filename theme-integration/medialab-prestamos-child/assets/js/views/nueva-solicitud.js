import { store } from '../state.js';
import { escapeHtml, navigate, todayISO } from '../dom.js';

const BUSINESS_START = 8 * 60;
const BUSINESS_END = 18 * 60;

function isWeekday(dateISO) {
  const [y, m, d] = dateISO.split('-').map(Number);
  const day = new Date(y, m - 1, d).getDay();
  return day >= 1 && day <= 5;
}
function inBusinessHours(time) {
  if (!time) return false;
  const [hh, mm] = time.split(':').map(Number);
  const minutes = hh * 60 + mm;
  return minutes >= BUSINESS_START && minutes <= BUSINESS_END;
}
function weekdayLabelES(date = new Date()) {
  return date.toLocaleDateString('es-CO', { weekday: 'long' });
}
function formatWhen(d, t) { return (!d || !t) ? '—' : `${d} · ${t}`; }

export async function renderNuevaSolicitud(root) {
  const draft = store.ticket.draft;
  const TODAY = todayISO();
  const isTodayWeekday = isWeekday(TODAY);
  const dueText = `Devolucion: el mismo dia antes de las 6:00pm (${TODAY}).`;

  let step = 1;
  let submitted = false;
  let submitting = false;
  let submitError = null;

  // Bloqueo: solicitud activa
  const ticketActivo = store.loans.prestamos.find((p) => p.usuario_solicitante === store.auth.user?.Correo && !p.Entregado);
  if (ticketActivo) {
    root.innerHTML = `
      <div class="ui-card pmi-p-8" style="max-width:640px;margin:0 auto;">
        <div class="pmi-h1">Ya tienes una solicitud activa</div>
        <p class="pmi-muted" style="margin-top:6px;">Debes esperar a que se complete tu solicitud actual.</p>
        <div class="ui-card-inner pmi-p-4" style="margin-top:16px;">
          <div class="pmi-title">Solicitud en curso</div>
          <div class="pmi-text-sm pmi-muted" style="margin-top:6px;">Prestamo: <b class="pmi-text-sm" style="color:var(--eafit-text);">#${ticketActivo.idPrestamo}</b></div>
        </div>
        <div class="pmi-flex pmi-gap-3" style="margin-top:24px;">
          <button class="ui-btn ui-btn-primary ui-btn-lg" id="pmi-ver-activa">Ver solicitud activa &rarr;</button>
          <button class="ui-btn ui-btn-ghost ui-btn-lg" id="pmi-volver">Volver al catalogo</button>
        </div>
      </div>
    `;
    root.querySelector('#pmi-ver-activa').addEventListener('click', () => navigate(`/mis-solicitudes/${ticketActivo.idPrestamo}`));
    root.querySelector('#pmi-volver').addEventListener('click', () => navigate('/catalogo'));
    return;
  }

  if (draft.selectedIds.length === 0) {
    root.innerHTML = `
      <div class="ui-card pmi-p-8" style="max-width:640px;margin:0 auto;text-align:center;">
        <div class="pmi-h1">No hay recursos seleccionados</div>
        <p class="pmi-muted" style="margin-top:8px;">Vuelve al catalogo y agrega al menos un recurso.</p>
        <button class="ui-btn ui-btn-primary ui-btn-lg" id="pmi-volver" style="margin-top:16px;">Ir al catalogo</button>
      </div>
    `;
    root.querySelector('#pmi-volver').addEventListener('click', () => navigate('/catalogo'));
    return;
  }

  function selectedResources() {
    return draft.selectedIds.map((id) => store.catalog.getById(id)).filter(Boolean);
  }
  function totalQuantity() {
    return draft.selectedIds.reduce((sum, id) => sum + (draft.quantities[id] ?? 1), 0);
  }
  function quantityErrors() {
    const errs = {};
    for (const id of draft.selectedIds) {
      const r = store.catalog.getById(id);
      if (!r) continue;
      const qty = draft.quantities[id] ?? 1;
      if (r.Cantidad_disponible != null && qty > r.Cantidad_disponible) {
        errs[id] = `Solo hay ${r.Cantidad_disponible} disponible(s) de "${r.Nombre}"`;
      }
    }
    return errs;
  }

  function step1Ok() { return draft.selectedIds.length > 0 && Object.keys(quantityErrors()).length === 0; }
  function step2Ok() {
    return draft.fechaPrestamo === TODAY && isTodayWeekday && !!draft.horaPrestamo && inBusinessHours(draft.horaPrestamo);
  }
  function step3Ok() { return draft.acceptCampusRule && draft.acceptTerms; }

  function errorsList() {
    const e = [];
    if (draft.selectedIds.length === 0) e.push('Debes seleccionar al menos 1 recurso.');
    Object.values(quantityErrors()).forEach((m) => e.push(m));
    if (step >= 2) {
      if (!isTodayWeekday) e.push('Hoy no es dia habil. El prestamo solo aplica Lunes a Viernes.');
      if (!draft.horaPrestamo) e.push('Selecciona una hora.');
      else if (!inBusinessHours(draft.horaPrestamo)) e.push('La hora debe estar entre 08:00 y 18:00.');
    }
    if (step === 3 && !step3Ok()) e.push('Debes aceptar las condiciones para continuar.');
    return e;
  }

  function stepChip(n, label) {
    const cls = step === n ? 'is-active' : step > n ? 'is-done' : '';
    return `<button type="button" class="pmi-step ${cls}" data-step="${n}">${label}</button>`;
  }

  function step1Html() {
    return `
      <h2 class="pmi-h2">Recursos</h2>
      <p class="pmi-muted" style="margin-top:4px;">Revisa y ajusta los recursos de tu solicitud.</p>
      <div class="pmi-flex-col pmi-gap-3" style="margin-top:20px;">
        ${selectedResources().map((r) => {
          const err = quantityErrors()[r.idRecurso];
          return `
            <div class="ui-card-inner pmi-p-4 pmi-flex pmi-items-center pmi-justify-between pmi-gap-4">
              <div class="pmi-min-w-0" style="flex:1;">
                <div class="pmi-title pmi-truncate">${escapeHtml(r.Nombre)}</div>
                <div class="pmi-text-sm pmi-muted">${escapeHtml(r.Tipo)}</div>
              </div>
              <div class="pmi-flex pmi-items-center pmi-gap-3">
                <div>
                  <label class="pmi-flex pmi-items-center pmi-gap-2 pmi-text-sm pmi-muted">
                    Cant.
                    <input type="number" min="1" max="${r.Cantidad_disponible ?? ''}" data-qty="${escapeHtml(r.idRecurso)}"
                      class="ui-input ${err ? 'ui-input-error' : ''}" style="height:36px;width:64px;text-align:center;"
                      value="${draft.quantities[r.idRecurso] ?? 1}" />
                  </label>
                  ${r.Cantidad_disponible != null ? `<div class="pmi-text-xs pmi-muted">Disponible: ${r.Cantidad_disponible}</div>` : ''}
                  ${err ? `<div class="pmi-text-xs" style="color:var(--status-danger);">${escapeHtml(err)}</div>` : ''}
                </div>
                <button type="button" class="ui-btn ui-btn-ghost ui-btn-sm" data-remove="${escapeHtml(r.idRecurso)}">Quitar</button>
              </div>
            </div>
          `;
        }).join('')}
      </div>
      <button type="button" class="ui-btn ui-btn-ghost ui-btn-sm" id="pmi-add-more" style="margin-top:16px;">+ Agregar mas recursos</button>
    `;
  }

  function step2Html() {
    return `
      <h2 class="pmi-h2">Dia y hora</h2>
      <p class="pmi-muted" style="margin-top:4px;">Selecciona la hora para pasar por el laboratorio. Solo <b>hoy</b> entre <b>08:00 y 18:00</b>.</p>
      ${!isTodayWeekday ? `<div class="pmi-alert pmi-alert-danger" style="margin-top:14px;"><b>Hoy (${escapeHtml(weekdayLabelES())}) no hay atencion.</b><div style="margin-top:4px;">Los prestamos inmediatos solo se agendan lunes a viernes.</div></div>` : ''}
      <div class="pmi-grid pmi-grid-2" style="margin-top:20px;">
        <label class="pmi-field">
          <span class="pmi-label">Dia</span>
          <input type="date" class="ui-input" value="${TODAY}" disabled />
        </label>
        <label class="pmi-field">
          <span class="pmi-label">Hora (hh:mm)</span>
          <input type="time" class="ui-input" id="pmi-hora" value="${draft.horaPrestamo ?? ''}" min="08:00" max="18:00" ${!isTodayWeekday ? 'disabled' : ''} />
          ${draft.horaPrestamo && !inBusinessHours(draft.horaPrestamo) ? '<div class="pmi-field-error">Debe estar entre 08:00 y 18:00.</div>' : ''}
        </label>
      </div>
      <div class="ui-card-inner pmi-p-4" style="margin-top:20px;">
        <div class="pmi-title">Regla de devolucion</div>
        <div class="pmi-text-sm pmi-muted" style="margin-top:4px;">${escapeHtml(dueText)}</div>
      </div>
    `;
  }

  function step3Html() {
    const workers = store.users.usuarios.filter((u) => u.Rol === 'Trabajador');
    return `
      <h2 class="pmi-h2">Confirmacion</h2>
      <p class="pmi-muted" style="margin-top:4px;">Verifica la informacion y acepta las condiciones.</p>
      <div class="ui-card-inner pmi-p-5" style="margin-top:20px;">
        <div class="pmi-title">Resumen de la solicitud</div>
        <div class="pmi-grid pmi-grid-2" style="margin-top:12px;">
          <div><div class="pmi-text-xs pmi-muted">Recursos</div><div class="pmi-text-sm">${draft.selectedIds.length} tipo(s) &middot; ${totalQuantity()} unidad(es)</div></div>
          <div><div class="pmi-text-xs pmi-muted">Fecha y hora</div><div class="pmi-text-sm">${escapeHtml(formatWhen(draft.fechaPrestamo, draft.horaPrestamo))}</div></div>
        </div>
      </div>
      <label class="pmi-field" style="margin-top:20px;">
        <span class="pmi-label">Trabajador encargado</span>
        ${workers.length === 0 ? '<div class="pmi-text-sm pmi-muted">No hay trabajadores registrados aun.</div>' : `
          <select class="ui-input" id="pmi-responsable">
            <option value="">Sin asignar</option>
            ${workers.map((w) => `<option value="${escapeHtml(w.Correo)}" ${draft.responsableCorreo === w.Correo ? 'selected' : ''}>${escapeHtml(w.Nombre.split(' ')[0])}</option>`).join('')}
          </select>
        `}
      </label>
      <label class="pmi-field" style="margin-top:20px;">
        <span class="pmi-label">Notas (opcional)</span>
        <textarea class="ui-input" id="pmi-notas" placeholder="Curso, proyecto o informacion adicional...">${escapeHtml(draft.Notas || '')}</textarea>
      </label>
      <div class="pmi-flex-col pmi-gap-3" style="margin-top:20px;">
        <label class="pmi-checkbox-row">
          <input type="checkbox" id="pmi-accept-campus" ${draft.acceptCampusRule ? 'checked' : ''} />
          <span class="pmi-text-sm">Confirmo que los recursos <b>no saldran del campus</b>.</span>
        </label>
        <label class="pmi-checkbox-row">
          <input type="checkbox" id="pmi-accept-terms" ${draft.acceptTerms ? 'checked' : ''} />
          <span class="pmi-text-sm">Acepto las condiciones del prestamo y el control de entrega/devolucion por parte del trabajador.</span>
        </label>
      </div>
    `;
  }

  function successHtml() {
    return `
      <div class="ui-card pmi-p-8" style="max-width:640px;margin:0 auto;">
        <div class="pmi-flex pmi-items-center pmi-gap-4">
          <div class="pmi-avatar" style="width:48px;height:48px;background:rgba(22,163,74,.15);color:var(--status-success);font-size:22px;">&check;</div>
          <div>
            <div class="pmi-h1">Solicitud enviada</div>
            <div class="pmi-text-sm" style="color:var(--status-success);font-weight:600;">Pendiente de entrega</div>
          </div>
        </div>
        <div class="pmi-divider"></div>
        <div class="pmi-alert pmi-alert-info">Acercate al trabajador del laboratorio en el horario seleccionado para confirmar la entrega de los recursos.</div>
        <div class="pmi-grid pmi-grid-2" style="margin-top:20px;">
          <div><div class="pmi-text-xs pmi-muted">Fecha y hora</div><div class="pmi-text-sm">${escapeHtml(formatWhen(draft.fechaPrestamo, draft.horaPrestamo))}</div></div>
          <div><div class="pmi-text-xs pmi-muted">Devolucion</div><div class="pmi-text-sm">${escapeHtml(dueText)}</div></div>
        </div>
        <button class="ui-btn ui-btn-primary ui-btn-lg" id="pmi-volver-catalogo" style="margin-top:24px;">Volver al catalogo</button>
      </div>
    `;
  }

  function full() {
    if (submitted) {
      root.innerHTML = successHtml();
      root.querySelector('#pmi-volver-catalogo').addEventListener('click', () => { store.ticket.clear(); navigate('/catalogo'); });
      return;
    }

    const errs = errorsList();
    const canGoNext = (step === 1 && step1Ok()) || (step === 2 && step2Ok()) || (step === 3 && step3Ok());

    root.innerHTML = `
      <div class="pmi-flex pmi-justify-between pmi-items-center pmi-gap-4" style="flex-wrap:wrap;">
        <div>
          <div class="pmi-h1">Crear solicitud</div>
          <div class="pmi-text-sm pmi-muted">Paso ${step} de 3 &middot; ${draft.selectedIds.length} recurso(s)</div>
        </div>
        <button class="ui-btn ui-btn-primary ui-btn-sm" id="pmi-cancelar">Cancelar</button>
      </div>

      <div class="ui-card pmi-p-4" style="margin-top:20px;">
        <div class="pmi-flex pmi-items-center pmi-gap-2" style="flex-wrap:wrap;">
          ${stepChip(1, 'Recursos')}<div class="pmi-step-connector"></div>
          ${stepChip(2, 'Dia y hora')}<div class="pmi-step-connector"></div>
          ${stepChip(3, 'Confirmar')}
        </div>
      </div>

      <div class="ui-card pmi-p-8" style="margin-top:20px;">
        ${step === 1 ? step1Html() : step === 2 ? step2Html() : step3Html()}

        ${errs.length > 0 ? `<div class="pmi-alert pmi-alert-danger" style="margin-top:20px;"><ul style="margin:0;padding-left:18px;">${errs.map((x) => `<li>${escapeHtml(x)}</li>`).join('')}</ul></div>` : ''}
        ${submitError ? `<div class="pmi-alert pmi-alert-danger" style="margin-top:12px;">${escapeHtml(submitError)}</div>` : ''}

        <div class="pmi-flex pmi-justify-between pmi-items-center pmi-gap-3" style="margin-top:28px;">
          <button class="ui-btn ui-btn-primary ui-btn-lg" id="pmi-back">&larr; ${step === 1 ? 'Volver al catalogo' : 'Atras'}</button>
          ${step < 3
            ? `<button class="ui-btn ui-btn-primary ui-btn-lg" id="pmi-next" ${!canGoNext ? 'disabled' : ''}>${step === 2 && !isTodayWeekday ? 'No disponible hoy' : 'Continuar &rarr;'}</button>`
            : `<button class="ui-btn ui-btn-primary ui-btn-lg" id="pmi-submit" ${!(step1Ok() && step2Ok() && step3Ok()) || submitting ? 'disabled' : ''}>${submitting ? 'Enviando...' : 'Confirmar solicitud'}</button>`
          }
        </div>
      </div>
    `;

    attach();
  }

  function attach() {
    root.querySelectorAll('[data-step]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const n = Number(btn.dataset.step);
        if (n === 1 || (n === 2 && step1Ok()) || (n === 3 && step1Ok() && step2Ok())) { step = n; full(); }
      });
    });

    root.querySelector('#pmi-cancelar')?.addEventListener('click', () => navigate('/catalogo'));
    root.querySelector('#pmi-back')?.addEventListener('click', () => { if (step === 1) navigate('/catalogo'); else { step -= 1; full(); } });
    root.querySelector('#pmi-next')?.addEventListener('click', () => {
      if (step === 2 && draft.fechaPrestamo !== TODAY) store.ticket.setFechaPrestamo(TODAY);
      step += 1; full();
    });
    root.querySelector('#pmi-add-more')?.addEventListener('click', () => navigate('/catalogo'));

    root.querySelectorAll('[data-qty]').forEach((input) => {
      input.addEventListener('input', () => {
        store.ticket.setQuantity(input.dataset.qty, Number(input.value) || 1);
      });
      input.addEventListener('change', full);
    });
    root.querySelectorAll('[data-remove]').forEach((btn) => {
      btn.addEventListener('click', () => { store.ticket.removeSelected(btn.dataset.remove); full(); });
    });

    root.querySelector('#pmi-hora')?.addEventListener('change', (e) => { store.ticket.setHoraPrestamo(e.target.value || undefined); full(); });
    root.querySelector('#pmi-responsable')?.addEventListener('change', (e) => {
      const w = store.users.usuarios.find((u) => u.Correo === e.target.value);
      store.ticket.setResponsable(w?.Correo, w?.Nombre);
    });
    root.querySelector('#pmi-notas')?.addEventListener('input', (e) => store.ticket.setNotas(e.target.value));
    root.querySelector('#pmi-accept-campus')?.addEventListener('change', (e) => { store.ticket.setAcceptCampusRule(e.target.checked); full(); });
    root.querySelector('#pmi-accept-terms')?.addEventListener('change', (e) => { store.ticket.setAcceptTerms(e.target.checked); full(); });

    root.querySelector('#pmi-submit')?.addEventListener('click', async () => {
      if (submitting) return;
      submitting = true; submitError = null; full();
      try {
        store.ticket.setFechaPrestamo(TODAY);
        await store.loans.crearPrestamo({
          Notas: draft.Notas || null,
          Fecha_prestamo: `${TODAY}T${draft.horaPrestamo}:00`,
          usuario_solicitante: store.auth.user?.Correo ?? '',
          usuario_responsable: draft.responsableCorreo ?? store.auth.user?.Correo ?? '',
          recursos: draft.selectedIds.map((id) => ({ id, cantidad: draft.quantities[id] ?? 1 })),
        });
        submitted = true;
      } catch (err) {
        submitError = err.message ?? 'Error al crear la solicitud';
      } finally {
        submitting = false; full();
      }
    });
  }

  if (!draft.fechaPrestamo) store.ticket.setFechaPrestamo(TODAY);
  full();
}
