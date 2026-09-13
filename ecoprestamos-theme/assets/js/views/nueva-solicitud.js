import { store } from '../state.js';
import { api } from '../api.js';
import { escapeHtml, navigate, todayISO } from '../dom.js';

const BUSINESS_START = 8 * 60;
const BUSINESS_END = 18 * 60;

/**
 * @param {string} dateISO Fecha en formato `YYYY-MM-DD`.
 * @returns {boolean} true si esa fecha cae de lunes a viernes.
 */
function isWeekday(dateISO) {
  const [y, m, d] = dateISO.split('-').map(Number);
  const day = new Date(y, m - 1, d).getDay();
  return day >= 1 && day <= 5;
}

/**
 * Suma dias a una fecha en formato YYYY-MM-DD.
 * @param {string} dateStr
 * @param {number} days
 * @returns {string} Fecha resultante en formato YYYY-MM-DD.
 */
function addDaysISO(dateStr, days) {
  const [y, m, d] = (dateStr || todayISO()).split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + days);
  const yyyy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  const dd = String(dt.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Retorna la fecha aproximada de fin de semestre (30 de junio o 30 de noviembre).
 * @param {string} dateStr
 * @returns {string} Fecha en formato YYYY-MM-DD.
 */
function semesterEndISO(dateStr) {
  const [y, m] = (dateStr || todayISO()).split('-').map(Number);
  return m <= 6 ? `${y}-06-30` : `${y}-11-30`;
}
/**
 * @param {string} time Hora en formato `HH:mm`.
 * @returns {boolean} true si esta dentro del horario de atencion (08:00-18:00).
 */
function inBusinessHours(time) {
  if (!time) return false;
  const [hh, mm] = time.split(':').map(Number);
  const minutes = hh * 60 + mm;
  return minutes >= BUSINESS_START && minutes <= BUSINESS_END;
}
/**
 * @param {Date} [date] Fecha a describir (por defecto, hoy).
 * @returns {string} Nombre del dia de la semana en espanol (ej. "lunes").
 */
function weekdayLabelES(date = new Date()) {
  return date.toLocaleDateString('es-CO', { weekday: 'long' });
}
/**
 * Formatea una hora en formato 24h (HH:mm) a 12h (hh:mm AM/PM).
 * @param {string} time24 Hora en formato `HH:mm`.
 * @returns {string} Hora en formato `hh:mm AM/PM`.
 */
function formatTime12(time24) {
  if (!time24) return '';
  const [hh, mm] = time24.split(':').map(Number);
  const ampm = hh >= 12 ? 'PM' : 'AM';
  const h12 = hh % 12 || 12;
  return `${String(h12).padStart(2, '0')}:${String(mm).padStart(2, '0')} ${ampm}`;
}

/**
 * Convierte valores de 12 horas a formato 24h (HH:mm).
 * @param {string|number} h12 Hora (1-12).
 * @param {string|number} mm Minutos (00-59).
 * @param {string} ampm 'AM' | 'PM'.
 * @returns {string} Hora en formato `HH:mm`.
 */
function parseTime12to24(h12, mm, ampm) {
  let h = parseInt(h12, 10);
  if (ampm === 'PM' && h < 12) h += 12;
  if (ampm === 'AM' && h === 12) h = 0;
  return `${String(h).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

/** @returns {string} Fecha y hora combinadas para mostrar ("YYYY-MM-DD · hh:mm AM/PM"), o "—" si falta alguna. */
function formatWhen(d, t) { return (!d || !t) ? '—' : `${d} · ${formatTime12(t)}`; }

/**
 * Renderiza el flujo de creacion de solicitud en 3 pasos (ruta
 * `/solicitud/nueva`, vista de estudiante o docente): recursos y cantidades, dia y
 * hora/período, y confirmacion con envio al backend.
 * @param {HTMLElement} root Elemento contenedor donde se monta la vista.
 * @returns {Promise<void>}
 */
export async function renderNuevaSolicitud(root) {
  // Asegurar que la lista de trabajadores encargados esté actualizada desde la base de datos
  try {
    await store.users.reload();
  } catch (err) {
    console.warn('[nueva-solicitud] Error al recargar trabajadores:', err);
  }

  const draft = store.ticket.draft;
  const isTeacher = () => {
    const r = (store.auth.user?.Rol || store.auth.user?.rol || '').trim().toLowerCase();
    return r === 'docente' || r === 'profesor' || Boolean(store.auth.isTeacher);
  };
  const TODAY = todayISO();
  const isTodayWeekday = isWeekday(TODAY);
  const dueText = () => isTeacher()
    ? (draft.esIndefinido ? 'Devolución: Tiempo indefinido.' : `Devolución estimada: ${draft.fechaDevolucion || 'Mismo día'}`)
    : `Devolucion: el mismo dia antes de las 6:00 PM (${TODAY}).`;

  let step = 1;
  let submitted = false;
  let submitting = false;
  let submitError = null;

  // Bloqueo: solicitud activa (solo aplica a estudiantes; los docentes pueden solicitar múltiples préstamos)
  // Un prestamo cuenta como activo hasta que se devuelve el equipo, no hasta
  // que se entrega: mientras el solicitante lo tenga, no puede pedir otro.
  const ticketActivo = store.loans.prestamos.find((p) => p.usuario_solicitante === store.auth.user?.Correo && !p.Devuelto);
  if (ticketActivo && !isTeacher()) {
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

  /** @returns {Array<Object>} Los recursos del catalogo correspondientes a los ids seleccionados en el ticket. */
  function selectedResources() {
    return draft.selectedIds.map((id) => store.catalog.getById(id)).filter(Boolean);
  }
  /** @returns {number} Suma de unidades solicitadas entre todos los recursos seleccionados. */
  function totalQuantity() {
    return draft.selectedIds.reduce((sum, id) => sum + (draft.quantities[id] ?? 1), 0);
  }
  /** @returns {Object} Mapa idRecurso -> mensaje de error cuando la cantidad pedida excede lo disponible. */
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

  /** @returns {boolean} true si el paso 1 (recursos y cantidades) es valido. */
  function step1Ok() { return draft.selectedIds.length > 0 && Object.keys(quantityErrors()).length === 0; }
  /** @returns {boolean} true si el paso 2 (dia y hora/duracion) es valido. */
  function step2Ok() {
    if (isTeacher()) {
      const okTime = !!draft.horaPrestamo && inBusinessHours(draft.horaPrestamo);
      const okDate = Boolean(draft.fechaPrestamo && draft.fechaPrestamo >= TODAY);
      const okDev = draft.esIndefinido || Boolean(draft.fechaDevolucion && draft.fechaDevolucion >= (draft.fechaPrestamo || TODAY));
      return okTime && okDate && okDev;
    }
    return draft.fechaPrestamo === TODAY && isTodayWeekday && !!draft.horaPrestamo && inBusinessHours(draft.horaPrestamo);
  }
  /** @returns {boolean} true si el paso 3 (confirmacion) es valido: condiciones aceptadas, trabajador seleccionado y numero de contacto ingresado. */
  function step3Ok() {
    const hasResponsable = Boolean(draft.responsableCorreo && draft.responsableCorreo.trim());
    const hasContacto = Boolean(draft.contacto && draft.contacto.trim().length >= 7);
    return draft.acceptCampusRule && draft.acceptTerms && hasContacto && hasResponsable;
  }

  /** @returns {Array<string>} Lista de mensajes de error a mostrar segun el paso actual. */
  function errorsList() {
    const e = [];
    if (draft.selectedIds.length === 0) e.push('Debes seleccionar al menos 1 recurso.');
    Object.values(quantityErrors()).forEach((m) => e.push(m));
    if (step >= 2) {
      if (!isTeacher()) {
        if (!isTodayWeekday) e.push('Hoy no es dia habil. El prestamo solo aplica Lunes a Viernes.');
        if (!draft.horaPrestamo) e.push('Selecciona una hora.');
        else if (!inBusinessHours(draft.horaPrestamo)) e.push('La hora debe estar entre 08:00 AM y 6:00 PM.');
      } else {
        if (!draft.horaPrestamo) e.push('Selecciona una hora de recogida.');
        else if (!inBusinessHours(draft.horaPrestamo)) e.push('La hora de recogida debe estar entre 08:00 AM y 06:00 PM.');
        if (!draft.fechaPrestamo) e.push('Selecciona la fecha de recogida.');
        else if (draft.fechaPrestamo < TODAY) e.push('La fecha de recogida no puede estar en el pasado.');
        if (!draft.esIndefinido) {
          if (!draft.fechaDevolucion) e.push('Debes seleccionar una fecha estimada de devolución o marcar la opción de tiempo indefinido.');
          else if (draft.fechaDevolucion < (draft.fechaPrestamo || TODAY)) e.push('La fecha de devolución debe ser posterior o igual a la fecha de inicio.');
        }
      }
    }
    if (step === 3) {
      if (!draft.responsableCorreo || !draft.responsableCorreo.trim()) {
        e.push('Debes seleccionar el trabajador encargado.');
      }
      if (!draft.contacto || !draft.contacto.trim()) {
        e.push('Debes ingresar tu número de contacto / celular.');
      } else if (draft.contacto.trim().length < 7) {
        e.push('El número de contacto debe tener al menos 7 dígitos.');
      }
      if (!draft.acceptCampusRule || !draft.acceptTerms) {
        e.push('Debes aceptar las condiciones para continuar.');
      }
    }
    return e;
  }

  /**
   * @param {number} n Numero de paso (1-3).
   * @param {string} label Etiqueta a mostrar.
   * @returns {string} HTML del chip de navegacion de un paso, con su estado (activo/completado/pendiente).
   */
  function stepChip(n, label) {
    const cls = step === n ? 'is-active' : step > n ? 'is-done' : '';
    return `<button type="button" class="pmi-step ${cls}" data-step="${n}">${label}</button>`;
  }

  /** @returns {string} HTML del paso 1: lista de recursos seleccionados con cantidad editable. */
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
                  <div class="pmi-text-xs" data-qty-error="${escapeHtml(r.idRecurso)}" style="color:var(--status-danger);">${err ? escapeHtml(err) : ''}</div>
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

  /** @returns {string} HTML del paso 2: selector de fecha y hora del prestamo (con duracion extendida o indefinida para docentes). */
  function step2Html() {
    let currentH12 = '08';
    let currentMin = '00';
    let currentAmPm = 'AM';

    if (draft.horaPrestamo) {
      const [h24, m] = draft.horaPrestamo.split(':');
      const hNum = parseInt(h24, 10);
      currentAmPm = hNum >= 12 ? 'PM' : 'AM';
      currentH12 = String(hNum % 12 || 12).padStart(2, '0');
      currentMin = String(m || '00').padStart(2, '0');
    }

    const hoursOptions = ['08', '09', '10', '11', '12', '01', '02', '03', '04', '05', '06'];
    const minutesOptions = ['00', '05', '10', '15', '20', '25', '30', '35', '40', '45', '50', '55'];

    if (isTeacher()) {
      return `
        <h2 class="pmi-h2">Horario y período de préstamo (Docente)</h2>
        <p class="pmi-muted" style="margin-top:6px;line-height:1.5;">
          Como docente, puedes solicitar equipos por días, semanas, meses o por <b>tiempo indefinido</b>.<br>
          Durante el préstamo, los artículos asignados pasarán al estado <b style="color:var(--status-danger);">"No disponible"</b> en el catálogo hasta que registres la devolución.
        </p>

        <div class="pmi-grid pmi-grid-2" style="margin-top:20px;">
          <label class="pmi-field">
            <span class="pmi-label">Fecha de recogida / inicio</span>
            <input type="date" class="ui-input" id="pmi-teacher-fecha-inicio" min="${TODAY}" value="${draft.fechaPrestamo || TODAY}" style="background:var(--eafit-surface);color:var(--eafit-text);font-weight:600;" />
            <div class="pmi-text-xs pmi-muted" style="margin-top:4px;">Día en el que retirarás el equipo en el Medialab.</div>
          </label>

          <label class="pmi-field">
            <span class="pmi-label">Hora estimada de recogida (Formato 12h)</span>
            <div class="pmi-flex pmi-gap-2 pmi-items-center" style="margin-top:2px;">
              <select class="ui-input" id="pmi-hora-12" style="text-align:center;">
                ${hoursOptions.map((h) => `<option value="${h}" ${currentH12 === h ? 'selected' : ''}>${h}</option>`).join('')}
              </select>
              <span style="font-weight:bold;color:var(--eafit-muted);">:</span>
              <select class="ui-input" id="pmi-min-12" style="text-align:center;">
                ${minutesOptions.map((m) => `<option value="${m}" ${currentMin === m ? 'selected' : ''}>${m}</option>`).join('')}
              </select>
              <select class="ui-input" id="pmi-ampm-12" style="text-align:center;font-weight:600;">
                <option value="AM" ${currentAmPm === 'AM' ? 'selected' : ''}>AM</option>
                <option value="PM" ${currentAmPm === 'PM' ? 'selected' : ''}>PM</option>
              </select>
            </div>
            ${draft.horaPrestamo && !inBusinessHours(draft.horaPrestamo) ? '<div class="pmi-field-error" style="color:var(--status-danger);margin-top:4px;">La hora debe estar entre 08:00 AM y 06:00 PM.</div>' : ''}
          </label>
        </div>

        <div class="ui-card-inner pmi-p-5" style="margin-top:20px;border:1px solid var(--eafit-border);border-radius:12px;background:var(--eafit-subtle);">
          <div class="pmi-title">Duración del préstamo</div>
          <div class="pmi-text-sm pmi-muted" style="margin-top:4px;">Selecciona el tiempo estimado que tendrás el equipo o déjalo sin fecha fija.</div>

          <div class="pmi-flex-col pmi-gap-3" style="margin-top:16px;">
            <label class="pmi-checkbox-row" style="cursor:pointer;">
              <input type="radio" name="teacher-duration-mode" id="pmi-mode-range" value="range" ${!draft.esIndefinido ? 'checked' : ''} />
              <div>
                <div style="font-weight:700;font-size:14px;color:var(--eafit-text);">Definir fecha estimada de devolución</div>
                <div class="pmi-text-xs pmi-muted">Puedes usar los atajos rápidos o elegir cualquier fecha en el calendario.</div>
              </div>
            </label>

            <div id="pmi-range-controls" style="display:${!draft.esIndefinido ? 'block' : 'none'};margin-left:28px;margin-top:6px;">
              <div class="pmi-flex pmi-gap-2 pmi-wrap" style="margin-bottom:12px;">
                <button type="button" class="ui-chip ui-chip-off" data-preset="7">+1 Semana</button>
                <button type="button" class="ui-chip ui-chip-off" data-preset="14">+2 Semanas</button>
                <button type="button" class="ui-chip ui-chip-off" data-preset="30">+1 Mes</button>
                <button type="button" class="ui-chip ui-chip-off" data-preset="semestre">Fin de Semestre</button>
              </div>
              <label class="pmi-field">
                <span class="pmi-label">Fecha de devolución estimada</span>
                <input type="date" class="ui-input" id="pmi-fecha-devolucion" min="${draft.fechaPrestamo || TODAY}" value="${draft.fechaDevolucion || ''}" style="max-width:240px;background:var(--eafit-surface);font-weight:600;" />
              </label>
            </div>

            <label class="pmi-checkbox-row" style="cursor:pointer;margin-top:10px;">
              <input type="radio" name="teacher-duration-mode" id="pmi-mode-indefinite" value="indefinite" ${draft.esIndefinido ? 'checked' : ''} />
              <div>
                <div style="font-weight:700;font-size:14px;color:var(--eafit-text);">Préstamo por tiempo indefinido</div>
                <div class="pmi-text-xs pmi-muted">Sin fecha límite prefijada (hasta aviso o entrega física en el Medialab).</div>
              </div>
            </label>
          </div>
        </div>

        <div class="ui-card-inner pmi-p-4" style="margin-top:20px;background:var(--eafit-subtle);border:1px solid var(--eafit-border);border-left:4px solid var(--eafit-primary);border-radius:10px;">
          <div style="font-weight:700;font-size:13px;color:var(--eafit-text);">Condiciones para Docentes</div>
          <div class="pmi-text-sm" style="margin-top:6px;color:var(--eafit-text);line-height:1.6;">
            <div>&bull; <b>Lugar de retiro:</b> Medialab &middot; <b>Bloque 38 - 206</b>.</div>
            <div>&bull; <b>Catálogo:</b> Los artículos asignados pasarán al estado <b style="color:var(--status-danger);">No disponible</b> para otros usuarios mientras dure el préstamo.</div>
            <div>&bull; <b>Retorno:</b> Solo al devolverlos físicamente al personal del Medialab regresarán a estado <b style="color:var(--status-success);">Disponible</b>.</div>
          </div>
        </div>
      `;
    }

    return `
      <h2 class="pmi-h2">Hora de recogida</h2>
      <p class="pmi-muted" style="margin-top:6px;line-height:1.5;">
        Selecciona la hora estimada en la que pasarás por el artículo en el <b>Medialab (Bloque 38 - 206)</b>.<br>
        Los préstamos son exclusivos para el <b>mismo día</b> y deben retirarse hoy entre <b style="color:var(--status-danger);">08:00 AM</b> y <b style="color:var(--status-danger);">06:00 PM</b>.
      </p>

      ${!isTodayWeekday ? `<div class="pmi-alert pmi-alert-danger" style="margin-top:14px;"><b>Hoy (${escapeHtml(weekdayLabelES())}) no hay atención.</b><div style="margin-top:4px;">Los préstamos inmediatos solo se agendan de lunes a viernes.</div></div>` : ''}

      <div class="pmi-grid pmi-grid-2" style="margin-top:20px;">
        <label class="pmi-field">
          <div class="pmi-flex pmi-justify-between pmi-items-center">
            <span class="pmi-label">Fecha del préstamo (Hoy)</span>
            <span class="pmi-pill pmi-pill-neutral" style="font-size:10px;padding:2px 8px;font-weight:600;">Mismo día</span>
          </div>
          <input type="date" class="ui-input" value="${TODAY}" disabled style="background:var(--eafit-subtle);color:var(--eafit-text);font-weight:600;" />
          <div class="pmi-text-xs pmi-muted" style="margin-top:4px;">Los equipos se solicitan y se retiran en la fecha en curso.</div>
        </label>

        <label class="pmi-field">
          <span class="pmi-label">Hora estimada de recogida (Formato 12h)</span>
          <div class="pmi-flex pmi-gap-2 pmi-items-center" style="margin-top:2px;">
            <select class="ui-input" id="pmi-hora-12" style="text-align:center;" ${!isTodayWeekday ? 'disabled' : ''}>
              ${hoursOptions.map((h) => `<option value="${h}" ${currentH12 === h ? 'selected' : ''}>${h}</option>`).join('')}
            </select>
            <span style="font-weight:bold;color:var(--eafit-muted);">:</span>
            <select class="ui-input" id="pmi-min-12" style="text-align:center;" ${!isTodayWeekday ? 'disabled' : ''}>
              ${minutesOptions.map((m) => `<option value="${m}" ${currentMin === m ? 'selected' : ''}>${m}</option>`).join('')}
            </select>
            <select class="ui-input" id="pmi-ampm-12" style="text-align:center;font-weight:600;" ${!isTodayWeekday ? 'disabled' : ''}>
              <option value="AM" ${currentAmPm === 'AM' ? 'selected' : ''}>AM</option>
              <option value="PM" ${currentAmPm === 'PM' ? 'selected' : ''}>PM</option>
            </select>
          </div>
          ${draft.horaPrestamo && !inBusinessHours(draft.horaPrestamo) ? '<div class="pmi-field-error" style="color:var(--status-danger);margin-top:4px;">La hora debe estar entre 08:00 AM y 06:00 PM.</div>' : ''}
        </label>
      </div>

      <div class="ui-card-inner pmi-p-4" style="margin-top:20px;background:var(--eafit-subtle);border:1px solid var(--eafit-border);border-left:4px solid var(--eafit-primary);border-radius:10px;">
        <div style="font-weight:700;font-size:13px;color:var(--eafit-text);">Condiciones de entrega y devolución</div>
        <div class="pmi-text-sm" style="margin-top:6px;color:var(--eafit-text);line-height:1.6;">
          <div>&bull; <b>Lugar de retiro:</b> Medialab &middot; <b>Bloque 38 - 206</b>.</div>
          <div>&bull; <b>Límite de devolución:</b> Todos los préstamos deben devolverse el <b>mismo día antes de las <span style="color:var(--status-danger);font-weight:700;">06:00 PM</span> (${TODAY})</b>.</div>
        </div>
      </div>
    `;
  }

  /** @returns {string} HTML del paso 3: resumen, selector de trabajador responsable, notas y checkboxes de aceptacion. */
  function step3Html() {
    // "Practicante Ecolabs" siempre debe estar disponible en la lista
    const defaultWorker = {
      Correo: 'practicante.ecolabs@eafit.edu.co',
      Nombre: 'Practicante Ecolabs',
      Rol: 'Trabajador',
      Trabajo: 'Practicante',
    };
    const registeredWorkers = store.users.usuarios.filter((u) => u.Rol === 'Trabajador' && !u.Baneado);
    const mapWorkers = new Map();
    mapWorkers.set(defaultWorker.Correo.toLowerCase(), defaultWorker);
    for (const w of registeredWorkers) {
      if (w.Correo) {
        mapWorkers.set(w.Correo.toLowerCase(), w);
      }
    }
    const workers = Array.from(mapWorkers.values());
    workers.sort((a, b) => {
      if (a.Correo.toLowerCase() === defaultWorker.Correo.toLowerCase()) return -1;
      if (b.Correo.toLowerCase() === defaultWorker.Correo.toLowerCase()) return 1;
      return (a.Nombre || '').localeCompare(b.Nombre || '');
    });

    const periodoLabel = isTeacher()
      ? (draft.esIndefinido ? 'Tiempo indefinido (hasta aviso de entrega)' : `Devolución estimada: ${draft.fechaDevolucion || 'Mismo día'}`)
      : `Devolución el mismo día antes de 6:00 PM (${TODAY})`;

    return `
      <h2 class="pmi-h2">Confirmacion</h2>
      <p class="pmi-muted" style="margin-top:4px;">Verifica la informacion y acepta las condiciones.</p>
      <div class="ui-card-inner pmi-p-5" style="margin-top:20px;">
        <div class="pmi-title">Resumen de la solicitud</div>
        <div class="pmi-grid pmi-grid-2" style="margin-top:12px;">
          <div><div class="pmi-text-xs pmi-muted">Recursos</div><div class="pmi-text-sm">${draft.selectedIds.length} tipo(s) &middot; ${totalQuantity()} unidad(es)</div></div>
          <div><div class="pmi-text-xs pmi-muted">Fecha y hora de recogida</div><div class="pmi-text-sm">${escapeHtml(formatWhen(draft.fechaPrestamo, draft.horaPrestamo))}</div></div>
          <div style="grid-column:1/-1;margin-top:10px;padding-top:10px;border-top:1px solid var(--eafit-border);">
            <div class="pmi-text-xs pmi-muted">Período de préstamo</div>
            <div class="pmi-text-sm" style="font-weight:700;color:var(--eafit-primary);margin-top:2px;">${escapeHtml(periodoLabel)}</div>
          </div>
        </div>
      </div>
      <label class="pmi-field" style="margin-top:20px;">
        <span class="pmi-label">Trabajador encargado <span style="color:var(--status-danger);font-weight:700;">*</span></span>
        <select class="ui-input" id="pmi-responsable" style="${submitError && !draft.responsableCorreo ? 'border-color:var(--status-danger);' : ''}">
          <option value="">Selecciona un trabajador encargado...</option>
          ${workers.map((w) => `<option value="${escapeHtml(w.Correo)}" ${draft.responsableCorreo === w.Correo ? 'selected' : ''}>${escapeHtml(w.Nombre)}${w.Trabajo && w.Trabajo !== w.Nombre ? ` &middot; ${escapeHtml(w.Trabajo)}` : ''}</option>`).join('')}
        </select>
        ${submitError && !draft.responsableCorreo ? '<div class="pmi-field-error" style="color:var(--status-danger);font-size:12px;margin-top:4px;font-weight:600;">* Debes seleccionar el trabajador encargado.</div>' : '<div class="pmi-text-xs pmi-muted" style="margin-top:4px;">Selecciona la persona del laboratorio encargada de recibir o entregar tu solicitud.</div>'}
      </label>
      <label class="pmi-field" style="margin-top:20px;">
        <span class="pmi-label">Numero de contacto / Celular <span style="color:var(--status-danger);font-weight:700;">*</span></span>
        <input type="tel" class="ui-input" id="pmi-contacto" placeholder="Ej: 3001234567" value="${escapeHtml(draft.contacto || '')}" required style="${submitError && (!draft.contacto || draft.contacto.trim().length < 7) ? 'border-color:var(--status-danger);' : ''}" />
        ${submitError && (!draft.contacto || draft.contacto.trim().length < 7) ? '<div class="pmi-field-error" style="color:var(--status-danger);font-size:12px;margin-top:4px;font-weight:600;">* Debes ingresar tu número de contacto / celular (mínimo 7 dígitos).</div>' : '<div class="pmi-text-xs pmi-muted" style="margin-top:4px;">Numero para que el personal del Medialab pueda comunicarse contigo.</div>'}
      </label>
      <label class="pmi-field" style="margin-top:20px;">
        <span class="pmi-label">Notas (opcional)</span>
        <textarea class="ui-input" id="pmi-notas" placeholder="Curso, proyecto o informacion adicional...">${escapeHtml(draft.Notas || '')}</textarea>
      </label>
      <div class="pmi-flex-col pmi-gap-3" style="margin-top:20px;">
        <label class="pmi-checkbox-row">
          <input type="checkbox" id="pmi-accept-campus" ${draft.acceptCampusRule ? 'checked' : ''} />
          <span class="pmi-text-sm">Acepto que el recurso no saldra del campus.</span>
        </label>
        <label class="pmi-checkbox-row">
          <input type="checkbox" id="pmi-accept-terms" ${draft.acceptTerms ? 'checked' : ''} />
          <span class="pmi-text-sm">Acepto las politicas de prestamo del Medialab.</span>
        </label>
      </div>
    `;
  }

  /** @returns {string} HTML de la pantalla final de exito tras crear el prestamo. */
  function successHtml() {
    return `
      <div class="ui-card pmi-p-8 pmi-text-center" style="max-width:540px;margin:0 auto;">
        <div class="pmi-avatar pmi-avatar-lg" style="margin:0 auto;background:var(--eafit-secondary);color:#fff;">&#10003;</div>
        <h2 class="pmi-h1" style="margin-top:16px;">Solicitud enviada</h2>
        <p class="pmi-muted" style="margin-top:6px;">Tu solicitud fue registrada con exito.</p>
        <div class="ui-card-inner pmi-p-4" style="margin-top:20px;text-align:left;">
          <div class="pmi-title">Que sigue</div>
          <div class="pmi-text-sm pmi-muted" style="margin-top:6px;">Acercate al Medialab a la hora seleccionada para que un trabajador te entregue los recursos.</div>
        </div>
        <button class="ui-btn ui-btn-primary ui-btn-lg" id="pmi-volver-catalogo" style="margin-top:24px;">Volver al catalogo</button>
      </div>
    `;
  }

  /**
   * Id del elemento que tiene el foco dentro de la vista, o cadena vacia.
   *
   * `full()` reemplaza todo el arbol, asi que cualquier repintado que ocurra
   * mientras alguien interactua deja el foco en <body>: el clic que lo provoco
   * cae en un nodo recien reemplazado y las teclas siguientes se pierden. Es lo
   * que pasaba al pasar del telefono de contacto al campo de Notas.
   * @returns {string}
   */
  function idConFoco() {
    const activo = document.activeElement;
    return activo && root.contains(activo) && activo.id ? activo.id : '';
  }

  /**
   * Devuelve el foco a un elemento de la vista recien pintada, si sigue existiendo.
   * @param {string} id Id capturado antes de repintar.
   */
  function restaurarFoco(id) {
    if (!id) return;
    const el = root.querySelector('#' + CSS.escape(id));
    if (el && el !== document.activeElement) el.focus();
  }

  /**
   * Actualiza en su sitio lo que depende de las cantidades: el aviso de stock
   * insuficiente de cada recurso, la marca del campo y el estado del boton
   * Continuar.
   *
   * No usa `full()` a proposito: repintar todo el paso dentro del `change` de la
   * cantidad reemplazaba el arbol justo cuando el clic pasaba al boton, el clic
   * caia en un nodo ya reemplazado y habia que pulsar "Continuar" dos veces.
   */
  function sincronizarCantidades() {
    const errs = quantityErrors();
    root.querySelectorAll('[data-qty]').forEach((input) => {
      const err = errs[input.dataset.qty];
      input.classList.toggle('ui-input-error', Boolean(err));
      const aviso = root.querySelector(`[data-qty-error="${CSS.escape(input.dataset.qty)}"]`);
      if (aviso) aviso.textContent = err || '';
    });
    const boton = root.querySelector('#pmi-next');
    if (boton) boton.disabled = !((step === 1 && step1Ok()) || (step === 2 && step2Ok()) || (step === 3 && step3Ok()));
  }

  /** Renderiza el paso actual (o la pantalla de exito) y engancha sus listeners. */
  function full() {
    const focoPrevio = idConFoco();

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
          ${stepChip(2, isTeacher() ? 'Período y horario' : 'Hora de recogida')}<div class="pmi-step-connector"></div>
          ${stepChip(3, 'Confirmar')}
        </div>
      </div>

      <div class="ui-card pmi-p-8" style="margin-top:20px;">
        ${step === 1 ? step1Html() : step === 2 ? step2Html() : step3Html()}

        ${errs.length > 0 ? `<div class="pmi-alert pmi-alert-danger" style="margin-top:20px;"><ul style="margin:0;padding-left:18px;">${errs.map((x) => `<li>${escapeHtml(x)}</li>`).join('')}</ul></div>` : ''}
        ${submitError ? `<div class="pmi-alert pmi-alert-danger" style="margin-top:12px;">${escapeHtml(submitError)}</div>` : ''}

        <div class="pmi-flex pmi-justify-between pmi-items-center pmi-gap-3" style="margin-top:28px;">
          <button type="button" class="ui-btn ui-btn-primary ui-btn-lg" id="pmi-back">&larr; ${step === 1 ? 'Volver al catalogo' : 'Atras'}</button>
          ${step < 3
            ? `<button type="button" class="ui-btn ui-btn-primary ui-btn-lg" id="pmi-next" ${!canGoNext ? 'disabled' : ''}>${step === 2 && !isTeacher() && !isTodayWeekday ? 'No disponible hoy' : 'Continuar &rarr;'}</button>`
            : `<button type="button" class="ui-btn ui-btn-primary ui-btn-lg" id="pmi-submit" ${submitting ? 'disabled' : ''}>${submitting ? 'Enviando...' : 'Confirmar solicitud'}</button>`
          }
        </div>
      </div>
    `;

    attach();
    restaurarFoco(focoPrevio);
  }

  /** Engancha los listeners de navegacion entre pasos, edicion del ticket y envio final. */
  function attach() {
    root.querySelectorAll('[data-step]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const n = Number(btn.dataset.step);
        if (n === 1 || (n === 2 && step1Ok()) || (n === 3 && step1Ok() && step2Ok())) { step = n; full(); }
      });
    });

    root.querySelector('#pmi-cancelar')?.addEventListener('click', () => {
      store.ticket.clear();
      navigate('/catalogo');
    });
    root.querySelector('#pmi-back')?.addEventListener('click', () => { if (step === 1) navigate('/catalogo'); else { step -= 1; full(); } });
    root.querySelector('#pmi-next')?.addEventListener('click', () => {
      if (step === 2 && !isTeacher() && draft.fechaPrestamo !== TODAY) store.ticket.setFechaPrestamo(TODAY);
      step += 1; full();
    });
    root.querySelector('#pmi-add-more')?.addEventListener('click', () => navigate('/catalogo'));

    root.querySelectorAll('[data-qty]').forEach((input) => {
      input.addEventListener('input', () => {
        store.ticket.setQuantity(input.dataset.qty, Number(input.value) || 1);
        sincronizarCantidades();
      });
      input.addEventListener('change', sincronizarCantidades);
    });
    root.querySelectorAll('[data-remove]').forEach((btn) => {
      btn.addEventListener('click', () => { store.ticket.removeSelected(btn.dataset.remove); full(); });
    });

    const syncTime12 = () => {
      const hEl = root.querySelector('#pmi-hora-12');
      const mEl = root.querySelector('#pmi-min-12');
      const ampmEl = root.querySelector('#pmi-ampm-12');
      if (hEl && mEl && ampmEl) {
        const time24 = parseTime12to24(hEl.value, mEl.value, ampmEl.value);
        store.ticket.setHoraPrestamo(time24);
        full();
      }
    };

    root.querySelector('#pmi-hora-12')?.addEventListener('change', syncTime12);
    root.querySelector('#pmi-min-12')?.addEventListener('change', syncTime12);
    root.querySelector('#pmi-ampm-12')?.addEventListener('change', syncTime12);

    // Controles específicos de docentes
    root.querySelector('#pmi-teacher-fecha-inicio')?.addEventListener('change', (e) => {
      store.ticket.setFechaPrestamo(e.target.value);
      if (draft.fechaDevolucion && draft.fechaDevolucion < e.target.value) {
        store.ticket.setFechaDevolucion(e.target.value);
      }
      full();
    });
    root.querySelector('#pmi-mode-range')?.addEventListener('change', () => {
      store.ticket.setEsIndefinido(false);
      if (!draft.fechaDevolucion) {
        store.ticket.setFechaDevolucion(addDaysISO(draft.fechaPrestamo || TODAY, 7));
      }
      full();
    });
    root.querySelector('#pmi-mode-indefinite')?.addEventListener('change', () => {
      store.ticket.setEsIndefinido(true);
      full();
    });
    root.querySelectorAll('[data-preset]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const start = draft.fechaPrestamo || TODAY;
        let target = '';
        if (btn.dataset.preset === 'semestre') {
          target = semesterEndISO(start);
        } else {
          target = addDaysISO(start, Number(btn.dataset.preset));
        }
        store.ticket.setEsIndefinido(false);
        store.ticket.setFechaDevolucion(target);
        full();
      });
    });
    root.querySelector('#pmi-fecha-devolucion')?.addEventListener('change', (e) => {
      store.ticket.setFechaDevolucion(e.target.value);
      full();
    });

    root.querySelector('#pmi-responsable')?.addEventListener('change', (e) => {
      const val = e.target.value;
      let name = '';
      if (val && val.toLowerCase() === 'practicante.ecolabs@eafit.edu.co') {
        name = 'Practicante Ecolabs';
      }
      const w = store.users.usuarios.find((u) => (u.Correo || '').toLowerCase() === (val || '').toLowerCase());
      if (w) name = w.Nombre;
      store.ticket.setResponsable(val || undefined, name || undefined);
      submitError = null;
      full();
    });
    root.querySelector('#pmi-contacto')?.addEventListener('input', (e) => {
      store.ticket.setContacto(e.target.value);
    });
    root.querySelector('#pmi-contacto')?.addEventListener('change', () => {
      // Solo hay que repintar si habia un error que limpiar: repintar siempre
      // reemplazaba el arbol justo cuando el foco pasaba al campo siguiente
      // (Notas), que se quedaba sin recibir el clic ni lo que se escribia.
      if (!submitError) return;
      submitError = null;
      full();
    });
    root.querySelector('#pmi-notas')?.addEventListener('input', (e) => store.ticket.setNotas(e.target.value));
    root.querySelector('#pmi-accept-campus')?.addEventListener('change', (e) => {
      store.ticket.setAcceptCampusRule(e.target.checked);
      submitError = null;
      full();
    });
    root.querySelector('#pmi-accept-terms')?.addEventListener('change', (e) => {
      store.ticket.setAcceptTerms(e.target.checked);
      submitError = null;
      full();
    });

    root.querySelector('#pmi-submit')?.addEventListener('click', async (e) => {
      e.preventDefault();
      if (submitting || step !== 3) return;
      if (!step1Ok() || !step2Ok() || !step3Ok()) {
        submitError = 'Por favor completa todos los campos obligatorios (*) antes de confirmar.';
        full();
        if (!draft.responsableCorreo) {
          root.querySelector('#pmi-responsable')?.focus();
        } else if (!draft.contacto || draft.contacto.trim().length < 7) {
          root.querySelector('#pmi-contacto')?.focus();
        } else if (!draft.acceptCampusRule) {
          root.querySelector('#pmi-accept-campus')?.focus();
        } else if (!draft.acceptTerms) {
          root.querySelector('#pmi-accept-terms')?.focus();
        }
        return;
      }
      submitting = true; submitError = null; full();
      try {
        const fechaInicio = isTeacher() ? (draft.fechaPrestamo || TODAY) : TODAY;
        const fechaFin = isTeacher() && !draft.esIndefinido ? (draft.fechaDevolucion ? `${draft.fechaDevolucion}T18:00:00` : null) : null;
        const esIndef = isTeacher() && draft.esIndefinido ? 1 : 0;

        const contactoClean = (draft.contacto || '').trim();
        const notasConContacto = [
          draft.Notas?.trim() ? draft.Notas.trim() : '',
          contactoClean ? `Tel. contacto: ${contactoClean}` : ''
        ].filter(Boolean).join(' | ');

        await store.loans.crearPrestamo({
          Notas: notasConContacto || null,
          Fecha_prestamo: `${fechaInicio}T${draft.horaPrestamo}:00`,
          usuario_solicitante: store.auth.user?.Correo ?? '',
          usuario_responsable: draft.responsableCorreo ?? store.auth.user?.Correo ?? '',
          fecha_devolucion: fechaFin,
          es_indefinido: esIndef,
          recursos: draft.selectedIds.map((id) => {
            const item = { id, cantidad: draft.quantities[id] ?? 1 };
            // Si el estudiante/docente eligio unidades especificas en el
            // catalogo (por numero de activo, por ejemplo), se respetan; si
            // no, el backend asigna automaticamente las primeras libres.
            const elegidas = draft.unidadesElegidas?.[id];
            if (elegidas && elegidas.length) item.unidades = elegidas;
            return item;
          }),
        });

        // Actualizar el teléfono del perfil del usuario si cambió
        if (contactoClean && store.auth.user && store.auth.user.numero !== contactoClean) {
          try {
            await api.updateUser(store.auth.user.Correo, { numero: contactoClean });
            store.auth.user.numero = contactoClean;
          } catch { /* no bloquea el flujo */ }
        }

        submitted = true;
      } catch (err) {
        submitError = err.message ?? 'Error al crear la solicitud';
      } finally {
        submitting = false; full();
      }
    });
  }

  if (!draft.fechaPrestamo) store.ticket.setFechaPrestamo(TODAY);
  if (!draft.horaPrestamo) store.ticket.setHoraPrestamo('08:00');
  if (isTeacher() && !draft.fechaDevolucion && !draft.esIndefinido) {
    store.ticket.setFechaDevolucion(addDaysISO(TODAY, 7));
  }
  if (!draft.contacto && store.auth.user?.numero) store.ticket.setContacto(store.auth.user.numero);
  // Siempre exigir que el usuario marque activamente los términos en el Paso 3
  store.ticket.setAcceptCampusRule(false);
  store.ticket.setAcceptTerms(false);
  full();
}
