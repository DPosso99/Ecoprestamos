import { store, loanEstado, LOAN_ESTADO_LABEL } from '../state.js';
import { escapeHtml, fmtDT, navigate, todayISO } from '../dom.js';

/** Clases de pastilla y punto por estado del ciclo de vida. */
const ESTADO_PILL = { pendiente: 'pmi-pill-info', afuera: 'pmi-pill-warning', devuelto: 'pmi-pill-success' };
const ESTADO_DOT = { pendiente: 'pmi-dot-info', afuera: 'pmi-dot-warning', devuelto: 'pmi-dot-success' };

/**
 * Extrae la información limpia del solicitante (nombre, correo, teléfono)
 * a partir del objeto de préstamo y la lista de usuarios.
 * @param {Object} p Préstamo.
 * @returns {{ name: string, email: string, phone: string }}
 */
function getBorrowerInfo(p) {
  const email = p.usuario_solicitante || '';
  const user = store.users.usuarios.find((u) => u.Correo?.toLowerCase() === email.toLowerCase());
  const name = user?.Nombre || email.split('@')[0];

  let phone = 'Sin teléfono';
  if (p.Notas) {
    const match = p.Notas.match(/(?:Tel(?:\.|\s*contacto)?|Cel(?:ular)?):?\s*([0-9+\-\s()]{7,15})/i);
    if (match) {
      phone = match[1].trim();
    }
  }
  if (phone === 'Sin teléfono' && user?.numero && user.numero !== 'N/A') {
    phone = user.numero;
  }

  // Quitar el indicativo +57 si está presente
  if (phone && phone !== 'Sin teléfono') {
    phone = phone.replace(/^\+57\s*/, '').trim();
  }

  return { name, email, phone, isTeacher: user?.Rol === 'Docente', role: user?.Rol || 'Estudiante' };
}

/**
 * Genera el HTML de una tarjeta de préstamo detallada para el dashboard. La
 * pastilla de estado y los botones de acción se derivan del estado real del
 * préstamo (cada bloque del panel ya lista un solo estado).
 * @param {Object} p Préstamo.
 * @returns {string} HTML de la tarjeta.
 */
function loanCardHtml(p) {
  const borrower = getBorrowerInfo(p);
  const details = store.loans.detailsObjectsMap?.[p.idPrestamo] || [];
  const stringDetails = store.loans.detailsMap?.[p.idPrestamo] || [];

  let itemsHtml = '';
  if (details.length > 0) {
    itemsHtml = details.map((d) => `
      <span class="pmi-pill pmi-pill-neutral" style="font-size:11px;padding:3px 8px;font-weight:600;">
        ${escapeHtml(d.Nombre)} &times;${d.cantidad_prestada ?? 1}
      </span>
    `).join('');
  } else if (stringDetails.length > 0) {
    itemsHtml = stringDetails.map((s) => `
      <span class="pmi-pill pmi-pill-neutral" style="font-size:11px;padding:3px 8px;font-weight:600;">
        ${escapeHtml(s)}
      </span>
    `).join('');
  } else {
    itemsHtml = '<span class="pmi-text-xs pmi-muted">1 recurso</span>';
  }

  return `
    <div class="ui-card-inner pmi-loan-card">
      <!-- Fila 1: ID de Ticket, Hora y Estado -->
      <div class="pmi-loan-card-head pmi-flex pmi-justify-between pmi-items-center pmi-gap-2">
        <div class="pmi-flex pmi-items-center pmi-gap-2" style="flex-wrap:wrap;">
          <span class="pmi-loan-ticket-badge">
            #${p.idPrestamo}
          </span>
          <span class="pmi-text-xs pmi-muted" style="font-weight:600;">
            ${fmtDT(p.Fecha_prestamo)}
          </span>
          ${p.Devuelto && p.Hora_devolucion ? `
            <span class="pmi-text-xs pmi-loan-closed-badge">
              Cerrado: ${fmtDT(p.Hora_devolucion)}
            </span>
          ` : (p.es_indefinido ? `
            <span class="pmi-pill pmi-pill-info" style="font-size:10.5px;font-weight:600;padding:2px 6px;height:auto;">
              Indefinido
            </span>
          ` : (p.fecha_devolucion ? `
            <span class="pmi-pill pmi-pill-info" style="font-size:10.5px;font-weight:600;padding:2px 6px;height:auto;">
              Dev: ${fmtDT(p.fecha_devolucion)}
            </span>
          ` : ''))}
        </div>
        <div class="pmi-flex pmi-items-center pmi-gap-1" style="flex-shrink:0;">
          ${borrower.isTeacher ? `
            <span class="pmi-pill pmi-pill-warning" style="font-size:11px;font-weight:700;padding:2px 7px;height:auto;">
              Docente
            </span>
          ` : ''}
          <span class="pmi-pill ${ESTADO_PILL[loanEstado(p)]}" style="font-size:11px;padding:2px 8px;height:24px;">
            <span class="pmi-dot ${ESTADO_DOT[loanEstado(p)]}"></span>${LOAN_ESTADO_LABEL[loanEstado(p)]}
          </span>
        </div>
      </div>

      <!-- Fila 2: Solicitante (Nombre, Correo, Teléfono) -->
      <div class="pmi-loan-borrower-box">
        <div class="pmi-flex pmi-justify-between pmi-items-center" style="flex-wrap:wrap;gap:6px;">
          <div style="font-weight:700;color:var(--eafit-text);font-size:15px;">
            ${escapeHtml(borrower.name)}
          </div>
          <div style="color:var(--eafit-primary);font-size:13.5px;font-weight:600;">
            Tel: <b>${escapeHtml(borrower.phone)}</b>
          </div>
        </div>
        <div style="font-size:13px;color:var(--eafit-muted);margin-top:4px;font-weight:500;word-break:break-word;">
          ${escapeHtml(borrower.email)}
        </div>
      </div>

      <!-- Fila 3: Artículos y Cantidades -->
      <div style="margin-top:10px;">
        <div class="pmi-text-xs pmi-muted" style="font-weight:700;text-transform:uppercase;letter-spacing:0.03em;margin-bottom:6px;">
          Artículos solicitados:
        </div>
        <div class="pmi-flex pmi-wrap pmi-gap-1">
          ${itemsHtml}
        </div>
      </div>

      <!-- Fila 4: Pie con notas y botones de acción -->
      <div class="pmi-loan-card-foot pmi-flex pmi-justify-between pmi-items-center pmi-gap-3">
        <div class="pmi-text-xs pmi-muted pmi-loan-notes" title="${escapeHtml(p.Notas || '')}">
          ${p.Notas ? escapeHtml(p.Notas) : '<span style="opacity:0.6;">Sin notas adicionales</span>'}
        </div>
        <div class="pmi-loan-card-actions pmi-flex pmi-items-center pmi-gap-2">
          ${loanEstado(p) === 'pendiente' ? `
            <button class="ui-btn ui-btn-primary ui-btn-sm" data-deliver="${p.idPrestamo}" style="font-weight:600;height:32px;font-size:12px;padding:0 10px;">
              Marcar como entregado
            </button>
          ` : ''}
          ${loanEstado(p) === 'afuera' ? `
            <button class="ui-btn ui-btn-primary ui-btn-sm" data-return="${p.idPrestamo}" style="font-weight:600;height:32px;font-size:12px;padding:0 10px;">
              Registrar devolución
            </button>
          ` : ''}
          <button class="ui-btn ${loanEstado(p) !== 'devuelto' ? 'ui-btn-ghost' : 'ui-btn-primary'} ui-btn-sm" data-open="${p.idPrestamo}" style="font-weight:600;height:32px;font-size:12px;padding:0 10px;">
            Ver ticket &rarr;
          </button>
        </div>
      </div>
    </div>
  `;
}

/**
 * Genera el HTML de una sección de listado (pendientes / fuera / historial).
 * @param {string} title Título de la sección.
 * @param {Array<Object>} items Préstamos a listar.
 * @param {string} emptyText Texto a mostrar si items está vacío.
 * @returns {string} HTML de la sección.
 */
function sectionHtml(title, items, emptyText) {
  return `
    <div class="ui-card pmi-section-card" style="overflow:hidden;">
      <div class="pmi-section-card-head pmi-flex pmi-justify-between pmi-items-center">
        <span class="pmi-title">${title}</span>
        <span class="pmi-pill pmi-pill-neutral" style="font-size:11px;padding:2px 8px;font-weight:700;">${items.length}</span>
      </div>
      <div class="pmi-section-card-body">
        ${items.length === 0 ? `
          <div class="pmi-empty" style="padding:32px 16px;">
            <div class="pmi-text-sm pmi-muted">${emptyText}</div>
          </div>
        ` : items.map((p) => loanCardHtml(p)).join('')}
      </div>
    </div>
  `;
}

/**
 * Renderiza el panel principal del trabajador (ruta `/ops`).
 * @param {HTMLElement} root Elemento contenedor donde se monta la vista.
 * @returns {Promise<void>}
 */
export async function renderOpsDashboard(root) {
  await Promise.all([store.loans.reload(), store.users.reload(), store.catalog.reload()]);

  // todayISO() usa la hora local: con toISOString() la fecha salia en UTC y
  // despues de las 19:00 en Bogota los paneles de "hoy" quedaban en cero.
  const todayStr = todayISO();
  // Préstamos del día: los que tienen Fecha_prestamo correspondiente a hoy
  const isFromToday = (p) => (p.Fecha_prestamo || '').startsWith(todayStr);

  // Helper para ordenar por hora de cierre/devolución (más reciente primero)
  const getSortTime = (p) => {
    const d = p.Hora_devolucion || p.Hora_entrega || p.Fecha_prestamo || '';
    return d ? new Date(d.replace(' ', 'T')).getTime() : 0;
  };

  let viewFilter = 'hoy'; // 'hoy' | 'todos'

  function renderDashboardContent() {
    // Tres bloques, uno por estado del ciclo de vida: por entregar, fuera del
    // laboratorio (pendientes de devolucion) e historial (ya devueltos).
    const allPendientesEntrega = store.loans.prestamos.filter((p) => loanEstado(p) === 'pendiente');
    const allPendientesDevolucion = store.loans.prestamos.filter((p) => loanEstado(p) === 'afuera');
    const allHistorial = store.loans.prestamos.filter((p) => loanEstado(p) === 'devuelto');

    // Ordenar historial: primero los más recientemente cerrados (Hora_devolucion DESC, id DESC)
    allHistorial.sort((a, b) => {
      const timeDiff = getSortTime(b) - getSortTime(a);
      return timeDiff !== 0 ? timeDiff : (b.idPrestamo - a.idPrestamo);
    });

    allPendientesEntrega.sort((a, b) => b.idPrestamo - a.idPrestamo);
    allPendientesDevolucion.sort((a, b) => b.idPrestamo - a.idPrestamo);

    // Préstamos de hoy: únicamente los programados o creados para la fecha de hoy
    const pendientesEntregaHoy = allPendientesEntrega.filter(isFromToday);
    const pendientesDevolucionHoy = allPendientesDevolucion.filter(isFromToday);
    const historialHoy = allHistorial.filter(isFromToday);

    const displayPendientesEntrega = viewFilter === 'hoy' ? pendientesEntregaHoy : allPendientesEntrega;
    const displayPendientesDevolucion = viewFilter === 'hoy' ? pendientesDevolucionHoy : allPendientesDevolucion;
    const displayHistorial = viewFilter === 'hoy' ? historialHoy : allHistorial;

    const totalHoy = pendientesEntregaHoy.length + pendientesDevolucionHoy.length + historialHoy.length;
    const totalSistema = store.loans.prestamos.length;

    // Métricas de inventario de catálogo (equipos en uso, no disponibles o en mantenimiento)
    let totalEquiposCatalogo = 0;
    let totalNoDisponibles = 0;
    let totalEnUso = 0;
    let totalMantenimiento = 0;
    let totalDeshabilitados = 0;

    (store.catalog.recursos || []).forEach((r) => {
      const unitEstados = (r.Estado || 'Disponible').split(',').map((s) => s.trim());
      const count = r.Cantidad_total != null ? Number(r.Cantidad_total) : (unitEstados.length || 1);
      totalEquiposCatalogo += count;

      unitEstados.forEach((est) => {
        if (est === 'Prestado' || est === 'Ocupado') {
          totalEnUso++;
          totalNoDisponibles++;
        } else if (est === 'En mantenimiento') {
          totalMantenimiento++;
          totalNoDisponibles++;
        } else if (est === 'No disponible') {
          totalDeshabilitados++;
          totalNoDisponibles++;
        }
      });
    });

    root.innerHTML = `
      <div class="pmi-ops-header pmi-flex pmi-justify-between pmi-items-start pmi-gap-4">
        <div>
          <div class="pmi-h1">Panel &middot; Trabajador</div>
          <div class="pmi-muted pmi-ops-subtitle">Control de entregas del día y gestión operativa del Medialab.</div>
        </div>
        <div class="pmi-ops-header-actions">
          <button class="ui-btn ui-btn-ghost ui-btn-sm" id="pmi-catalogo">Gestionar catálogo</button>
          <button class="ui-btn ui-btn-secondary ui-btn-sm" id="pmi-usuarios">Administrar usuarios</button>
          <button class="ui-btn ui-btn-primary ui-btn-sm" id="pmi-solicitudes">Ver solicitudes históricas &rarr;</button>
        </div>
      </div>

      <!-- KPIs Operativos -->
      <div class="pmi-kpi-grid pmi-ops-kpis" style="margin-top:24px;">
        <div class="pmi-kpi-card">
          <div class="pmi-kpi-header">
            <span class="pmi-kpi-lbl">Pendientes Hoy</span>
            <span class="pmi-dot pmi-dot-info"></span>
          </div>
          <div class="pmi-kpi-val" style="color:var(--status-info);">${pendientesEntregaHoy.length}</div>
          <div class="pmi-kpi-sub">Por entregar hoy</div>
        </div>

        <div class="pmi-kpi-card" title="${allPendientesDevolucion.length} préstamo(s) con equipos fuera del laboratorio">
          <div class="pmi-kpi-header">
            <span class="pmi-kpi-lbl">Fuera del laboratorio</span>
            <span class="pmi-dot ${allPendientesDevolucion.length > 0 ? 'pmi-dot-warning' : 'pmi-dot-neutral'}"></span>
          </div>
          <div class="pmi-kpi-val" style="${allPendientesDevolucion.length > 0 ? 'color:var(--status-warning);' : ''}">${allPendientesDevolucion.length}</div>
          <div class="pmi-kpi-sub">Pendientes de devolución</div>
        </div>

        <div class="pmi-kpi-card" title="${totalEnUso} en uso &middot; ${totalMantenimiento} en mantenimiento &middot; ${totalDeshabilitados} no disponibles">
          <div class="pmi-kpi-header">
            <span class="pmi-kpi-lbl">En uso / No disponibles</span>
            <span class="pmi-dot ${totalNoDisponibles > 0 ? 'pmi-dot-warning' : 'pmi-dot-neutral'}"></span>
          </div>
          <div class="pmi-kpi-val" style="${totalNoDisponibles > 0 ? 'color:var(--status-warning);' : ''}">${totalNoDisponibles}</div>
          <div class="pmi-kpi-sub">De ${totalEquiposCatalogo} en catálogo (incluye mant.)</div>
        </div>

        <div class="pmi-kpi-card">
          <div class="pmi-kpi-header">
            <span class="pmi-kpi-lbl">Total Histórico</span>
            <span class="pmi-dot pmi-dot-success"></span>
          </div>
          <div class="pmi-kpi-val">${totalSistema}</div>
          <div class="pmi-kpi-sub">Registros en sistema</div>
        </div>
      </div>

      <!-- Selector de Vista: Hoy vs Todos los préstamos -->
      <div class="ui-card pmi-filter-card" style="margin-top:24px;">
        <div class="pmi-filter-bar">
          <div class="pmi-filter-btn-group">
            <button class="ui-btn ui-btn-sm ${viewFilter === 'hoy' ? 'ui-btn-primary' : 'ui-btn-ghost'}" id="pmi-filter-hoy" style="font-weight:600;">
              Préstamos de hoy (${totalHoy})
            </button>
            <button class="ui-btn ui-btn-sm ${viewFilter === 'todos' ? 'ui-btn-primary' : 'ui-btn-ghost'}" id="pmi-filter-todos" style="font-weight:600;">
              Todos los préstamos (${totalSistema})
            </button>
          </div>
          <div class="pmi-text-xs pmi-muted pmi-filter-caption">
            Mostrando préstamos ${viewFilter === 'hoy' ? 'solicitados para la fecha de hoy' : 'e historial completo registrados en el sistema'}.
          </div>
        </div>
      </div>

      <!-- Columnas Operativas: por entregar, pendientes de devolución e historial -->
      <div class="pmi-grid pmi-grid-2 pmi-ops-sections-grid" style="margin-top:20px;align-items:start;">
        <div class="pmi-flex-col pmi-gap-6">
          ${sectionHtml(
            'Pendientes de entrega',
            displayPendientesEntrega,
            viewFilter === 'hoy' ? 'No hay entregas pendientes para hoy.' : 'No hay entregas pendientes.'
          )}
          ${sectionHtml(
            'Pendientes de devolución',
            displayPendientesDevolucion,
            viewFilter === 'hoy' ? 'No hay devoluciones pendientes de hoy.' : 'No hay equipos fuera del laboratorio.'
          )}
        </div>
        ${sectionHtml(
          viewFilter === 'hoy' ? 'Historial del día' : 'Historial completo',
          displayHistorial,
          viewFilter === 'hoy' ? 'No hay préstamos devueltos hoy.' : 'No hay préstamos en el historial.'
        )}
      </div>
    `;

    root.querySelector('#pmi-catalogo').addEventListener('click', () => navigate('/ops/catalogo'));
    root.querySelector('#pmi-usuarios').addEventListener('click', () => navigate('/ops/usuarios'));
    root.querySelector('#pmi-solicitudes').addEventListener('click', () => navigate('/ops/solicitudes'));
    
    root.querySelector('#pmi-filter-hoy').addEventListener('click', () => {
      viewFilter = 'hoy';
      renderDashboardContent();
    });
    root.querySelector('#pmi-filter-todos').addEventListener('click', () => {
      viewFilter = 'todos';
      renderDashboardContent();
    });

    root.querySelectorAll('[data-open]').forEach((btn) => btn.addEventListener('click', () => navigate(`/ops/ticket/${btn.dataset.open}`)));

    /**
     * Engancha los botones de un hito del panel: deshabilita, ejecuta y
     * repinta, de modo que la tarjeta salte al bloque de su estado nuevo.
     * @param {string} selector Selector de los botones del hito.
     * @param {Function} accion Hito del store, recibe el id del préstamo.
     * @param {string} etiqueta Texto original del botón (si el hito falla).
     * @param {string} mensajeError Texto de respaldo para el error.
     */
    function bindHito(selector, accion, etiqueta, mensajeError) {
      root.querySelectorAll(selector).forEach((btn) => {
        btn.addEventListener('click', async (e) => {
          e.stopPropagation();
          const id = Number(btn.dataset.deliver ?? btn.dataset.return);
          btn.disabled = true;
          btn.textContent = 'Guardando...';
          try {
            await accion(id);
            renderDashboardContent();
          } catch (err) {
            alert(err.message || mensajeError);
            btn.disabled = false;
            btn.textContent = etiqueta;
          }
        });
      });
    }

    // Dos hitos separados: la entrega NO libera stock, la devolucion si.
    bindHito('[data-deliver]', (id) => store.loans.marcarEntregado(id), 'Marcar como entregado', 'No se pudo marcar como entregado.');
    bindHito('[data-return]', (id) => store.loans.marcarDevuelto(id), 'Registrar devolución', 'No se pudo registrar la devolución.');
  }

  renderDashboardContent();
}
