import { store, loanEstado, LOAN_ESTADO_LABEL } from '../state.js';
import { escapeHtml, fmtDT, navigate, todayISO } from '../dom.js';

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
 * Renderiza la bandeja histórica de solicitudes del trabajador con filtros avanzados y buscador fluido.
 * @param {HTMLElement} root Elemento contenedor donde se monta la vista.
 * @param {{ params: Object, query: Object }} ctx
 * @returns {Promise<void>}
 */
export async function renderOpsSolicitudes(root, { query }) {
  await Promise.all([store.loans.reload(), store.users.reload(), store.catalog.reload()]);

  let q = (query.q || '').trim();
  const ESTADOS = ['pendiente', 'afuera', 'devuelto'];
  const ESTADO_PILL = { pendiente: 'pmi-pill-info', afuera: 'pmi-pill-warning', devuelto: 'pmi-pill-success' };
  const ESTADO_DOT = { pendiente: 'pmi-dot-info', afuera: 'pmi-dot-warning', devuelto: 'pmi-dot-success' };
  let filterState = ESTADOS.includes(query.tab) ? query.tab : 'todos';
  let filterDate = 'todos'; // 'todos' | 'hoy' | 'semana' | 'mes'
  let filterCategory = 'todos';
  let filterWorker = 'todos';

  let sortKey = 'fecha'; // 'ticket' | 'fecha' | 'estado'
  let sortOrder = 'desc'; // 'asc' | 'desc'

  // todayISO() usa la hora local: con toISOString() la fecha salia en UTC y
  // despues de las 19:00 en Bogota el filtro "hoy" ya apuntaba al dia siguiente.
  const todayStr = todayISO();

  /**
   * Ordena una lista de préstamos según la clave y dirección seleccionadas.
   * @param {Array<Object>} items
   * @returns {Array<Object>}
   */
  function sortList(items) {
    return [...items].sort((a, b) => {
      let comparison = 0;
      if (sortKey === 'ticket') {
        comparison = (a.idPrestamo || 0) - (b.idPrestamo || 0);
      } else if (sortKey === 'fecha') {
        const timeA = new Date(a.Fecha_prestamo || 0).getTime();
        const timeB = new Date(b.Fecha_prestamo || 0).getTime();
        comparison = timeA - timeB;
      } else if (sortKey === 'estado') {
        const orden = { pendiente: 0, afuera: 1, devuelto: 2 };
        comparison = orden[loanEstado(a)] - orden[loanEstado(b)];
      }
      return sortOrder === 'asc' ? comparison : -comparison;
    });
  }

  /**
   * Determina si una fecha pertenece a la semana actual.
   * @param {string} dateStr
   * @returns {boolean}
   */
  function isThisWeek(dateStr) {
    if (!dateStr) return false;
    const d = new Date(dateStr);
    const now = new Date();
    const firstDay = new Date(now.setDate(now.getDate() - now.getDay() + 1));
    firstDay.setHours(0, 0, 0, 0);
    return d >= firstDay;
  }

  /** @returns {Array<Object>} Préstamos filtrados por todas las condiciones activas y ordenados. */
  function filtered() {
    const queryNorm = q.toLowerCase().replace(/^#/, '').trim();
    const all = store.loans.prestamos;

    const matched = all.filter((p) => {
      // 1. Filtro de Estado
      if (filterState !== 'todos' && loanEstado(p) !== filterState) return false;

      // 2. Filtro de Fecha
      const pDate = (p.Fecha_prestamo || '').slice(0, 10);
      if (filterDate === 'hoy' && pDate !== todayStr) return false;
      if (filterDate === 'semana' && !isThisWeek(p.Fecha_prestamo)) return false;
      if (filterDate === 'mes' && pDate.slice(0, 7) !== todayStr.slice(0, 7)) return false;

      // 3. Filtro de Trabajador
      if (filterWorker !== 'todos' && p.usuario_responsable !== filterWorker) return false;

      // 4. Filtro de Categoría de recurso
      const detailsObjs = store.loans.detailsObjectsMap?.[p.idPrestamo] || [];
      if (filterCategory !== 'todos') {
        const hasCategory = detailsObjs.some((d) => d.Tipo === filterCategory);
        if (!hasCategory) return false;
      }

      // 5. Buscador de Texto (ID, Solicitante, Teléfono, Correo, Equipo, Activo, Notas)
      if (queryNorm) {
        const borrower = getBorrowerInfo(p);
        const detailsStrings = store.loans.detailsMap?.[p.idPrestamo] || [];
        const detailsKeywords = detailsObjs.map((d) => `${d.Nombre} ${d.recurso_id} ${d.activo || ''}`).join(' ');

        const corpus = [
          String(p.idPrestamo),
          borrower.name,
          borrower.email,
          borrower.phone,
          borrower.role,
          p.usuario_responsable,
          p.Notas || '',
          ...detailsStrings,
          detailsKeywords,
        ].join(' ').toLowerCase();

        if (!corpus.includes(queryNorm)) return false;
      }

      return true;
    });

    return sortList(matched);
  }

  /** Renderiza solo las filas de la tabla y contadores sin redibujar los inputs para no perder foco. */
  function renderTableRows() {
    const list = filtered();
    const countBadge = root.querySelector('#pmi-count-badge');
    if (countBadge) {
      countBadge.textContent = `Mostrando ${list.length} de ${store.loans.prestamos.length} registros`;
    }

    const tableBody = root.querySelector('#pmi-table-body');
    if (!tableBody) return;

    if (list.length === 0) {
      tableBody.innerHTML = `
        <tr>
          <td colspan="7" style="text-align:center;padding:48px 20px;">
            <div class="pmi-title pmi-text-base">No se encontraron solicitudes</div>
            <div class="pmi-text-sm pmi-muted" style="margin-top:4px;">Prueba ajustando los filtros o el término de búsqueda.</div>
          </td>
        </tr>
      `;
      return;
    }

    tableBody.innerHTML = list.map((p) => {
      const estado = loanEstado(p);
      const borrower = getBorrowerInfo(p);
      const details = store.loans.detailsObjectsMap?.[p.idPrestamo] || [];
      const stringDetails = store.loans.detailsMap?.[p.idPrestamo] || [];

      let itemsBadges = '';
      if (details.length > 0) {
        itemsBadges = details.map((d) => `
          <span class="pmi-pill pmi-pill-neutral" style="font-size:11px;padding:2px 8px;font-weight:600;margin-bottom:2px;display:inline-block;">
            ${escapeHtml(d.Nombre)} &times;${d.cantidad_prestada ?? 1}
          </span>
        `).join(' ');
      } else if (stringDetails.length > 0) {
        itemsBadges = stringDetails.map((s) => `
          <span class="pmi-pill pmi-pill-neutral" style="font-size:11px;padding:2px 8px;font-weight:600;margin-bottom:2px;display:inline-block;">
            ${escapeHtml(s)}
          </span>
        `).join(' ');
      } else {
        itemsBadges = '<span class="pmi-text-xs pmi-muted">1 recurso</span>';
      }

      return `
        <tr>
          <td>
            <span style="background:var(--eafit-primary);color:#fff;font-weight:700;font-family:monospace;padding:3px 8px;border-radius:6px;font-size:12px;">
              #${p.idPrestamo}
            </span>
          </td>
          <td>
            <div style="font-weight:700;color:var(--eafit-text);display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
              ${escapeHtml(borrower.name)}
              ${borrower.isTeacher ? '<span class="pmi-pill pmi-pill-warning" style="font-size:10px;font-weight:700;padding:1px 6px;height:auto;">Docente</span>' : ''}
            </div>
            <div class="pmi-text-xs pmi-muted">${escapeHtml(borrower.email)}</div>
            <div class="pmi-text-xs" style="color:var(--eafit-secondary);font-weight:600;margin-top:2px;">Tel: ${escapeHtml(borrower.phone)}</div>
          </td>
          <td>
            <div style="font-weight:600;font-size:13px;">${fmtDT(p.Fecha_prestamo)}</div>
            ${(p.Fecha_prestamo || '').startsWith(todayStr) ? '<span class="pmi-pill pmi-pill-info" style="font-size:10px;padding:1px 6px;height:18px;margin-top:3px;">Hoy</span>' : ''}
            ${p.es_indefinido ? '<div class="pmi-text-xs" style="color:var(--status-info);font-weight:600;margin-top:3px;">Indefinido</div>' : (p.fecha_devolucion ? `<div class="pmi-text-xs" style="color:var(--status-info);font-weight:600;margin-top:3px;">Dev: ${fmtDT(p.fecha_devolucion)}</div>` : '')}
          </td>
          <td style="max-width:240px;">
            ${itemsBadges}
          </td>
          <td>
            <span class="pmi-pill ${ESTADO_PILL[estado]}" style="font-size:11px;padding:2px 8px;">
              <span class="pmi-dot ${ESTADO_DOT[estado]}"></span>
              ${LOAN_ESTADO_LABEL[estado]}
            </span>
          </td>
          <td class="pmi-text-xs pmi-muted pmi-truncate" style="max-width:160px;" title="${escapeHtml(p.Notas || '')}">
            ${p.Notas ? escapeHtml(p.Notas) : '—'}
          </td>
          <td style="text-align:right;">
            <div class="pmi-flex pmi-items-center pmi-gap-2" style="justify-content:flex-end;flex-wrap:wrap;">
              ${estado === 'pendiente' ? `
                <button class="ui-btn ui-btn-primary ui-btn-sm" data-deliver="${p.idPrestamo}" style="font-weight:600;">
                  Marcar como entregado
                </button>
              ` : ''}
              ${estado === 'afuera' ? `
                <button class="ui-btn ui-btn-primary ui-btn-sm" data-return="${p.idPrestamo}" style="font-weight:600;">
                  Registrar devolución
                </button>
              ` : ''}
              <button class="ui-btn ui-btn-ghost ui-btn-sm" data-open="${p.idPrestamo}" style="font-weight:600;">
                Ver ticket &rarr;
              </button>
            </div>
          </td>
        </tr>
      `;
    }).join('');

    tableBody.querySelectorAll('[data-open]').forEach((btn) => {
      btn.addEventListener('click', () => navigate(`/ops/ticket/${btn.dataset.open}`));
    });

    /**
     * Engancha los botones de un hito de la tabla: deshabilita, ejecuta y
     * repinta las filas para que el préstamo muestre su estado nuevo.
     * @param {string} attr Atributo de datos con el id (`deliver` o `return`).
     * @param {Function} accion Hito del store, recibe el id del préstamo.
     * @param {string} etiqueta Texto original del botón (si el hito falla).
     * @param {string} mensajeError Texto de respaldo para el error.
     */
    function bindHito(attr, accion, etiqueta, mensajeError) {
      tableBody.querySelectorAll(`[data-${attr}]`).forEach((btn) => {
        btn.addEventListener('click', async () => {
          const id = Number(btn.dataset[attr]);
          btn.disabled = true;
          btn.textContent = 'Guardando...';
          try {
            await accion(id);
            renderTableRows();
          } catch (err) {
            alert(err.message || mensajeError);
            btn.disabled = false;
            btn.textContent = etiqueta;
          }
        });
      });
    }

    // Dos hitos separados: la entrega NO libera stock, la devolución sí.
    bindHito('deliver', (id) => store.loans.marcarEntregado(id), 'Marcar como entregado', 'No se pudo marcar como entregado.');
    bindHito('return', (id) => store.loans.marcarDevuelto(id), 'Registrar devolución', 'No se pudo registrar la devolución.');
  }

  /** Renderiza la estructura visual completa (filtros superiores, tabla y listeners). */
  function full() {
    const workers = store.users.usuarios.filter((u) => u.Rol === 'Trabajador');

    root.innerHTML = `
      <div class="pmi-admin-header pmi-flex pmi-justify-between pmi-items-start pmi-gap-4">
        <div>
          <div class="pmi-h1">Historial de solicitudes</div>
          <div class="pmi-muted pmi-admin-subtitle">Búsqueda y consulta de todos los préstamos registrados en el Medialab.</div>
          <div id="pmi-count-badge" class="pmi-text-xs pmi-muted" style="margin-top:6px;font-weight:600;"></div>
        </div>
        <div class="pmi-admin-header-actions">
          <button class="ui-btn ui-btn-ghost" id="pmi-back">&larr; Volver al panel</button>
        </div>
      </div>

      <!-- Barra de Búsqueda y Filtros Avanzados -->
      <div class="ui-card pmi-p-5" style="margin-top:20px;">
        <!-- Fila 1: Buscador de texto completo -->
        <div class="pmi-flex pmi-gap-3 pmi-items-center" style="flex-wrap:wrap;">
          <div style="flex:1;min-width:280px;position:relative;">
            <input class="ui-input" id="pmi-search" placeholder="Buscar por #ID, estudiante, correo, teléfono, artículo o notas..." value="${escapeHtml(q)}" style="height:42px;font-size:14px;" />
          </div>
          <button class="ui-btn ui-btn-ghost ui-btn-sm" id="pmi-reset-filters" style="font-weight:600;">
            Limpiar filtros
          </button>
        </div>

        <!-- Fila 2: Selectores de Filtro por Ítem -->
        <div class="pmi-grid pmi-grid-4" style="margin-top:16px;gap:12px;">
          <label class="pmi-field">
            <span class="pmi-label" style="font-size:11px;font-weight:700;">Estado de entrega</span>
            <select class="ui-input" id="pmi-filter-estado" style="font-size:13px;height:38px;">
              <option value="todos" ${filterState === 'todos' ? 'selected' : ''}>Todos los estados</option>
              <option value="pendiente" ${filterState === 'pendiente' ? 'selected' : ''}>Pendientes de entrega</option>
              <option value="afuera" ${filterState === 'afuera' ? 'selected' : ''}>En prestamo (sin devolver)</option>
              <option value="devuelto" ${filterState === 'devuelto' ? 'selected' : ''}>Devueltos</option>
            </select>
          </label>

          <label class="pmi-field">
            <span class="pmi-label" style="font-size:11px;font-weight:700;">Período / Fecha</span>
            <select class="ui-input" id="pmi-filter-date" style="font-size:13px;height:38px;">
              <option value="todos" ${filterDate === 'todos' ? 'selected' : ''}>Todo el historial</option>
              <option value="hoy" ${filterDate === 'hoy' ? 'selected' : ''}>Préstamos de hoy</option>
              <option value="semana" ${filterDate === 'semana' ? 'selected' : ''}>Esta semana</option>
              <option value="mes" ${filterDate === 'mes' ? 'selected' : ''}>Este mes</option>
            </select>
          </label>

          <label class="pmi-field">
            <span class="pmi-label" style="font-size:11px;font-weight:700;">Categoría de equipo</span>
            <select class="ui-input" id="pmi-filter-category" style="font-size:13px;height:38px;">
              <option value="todos" ${filterCategory === 'todos' ? 'selected' : ''}>Todas las categorías</option>
              <option value="Realidad virtual" ${filterCategory === 'Realidad virtual' ? 'selected' : ''}>Realidad virtual</option>
              <option value="Audiovisual" ${filterCategory === 'Audiovisual' ? 'selected' : ''}>Audiovisual</option>
              <option value="Animación" ${filterCategory === 'Animación' ? 'selected' : ''}>Animación</option>
            </select>
          </label>

          <label class="pmi-field">
            <span class="pmi-label" style="font-size:11px;font-weight:700;">Trabajador responsable</span>
            <select class="ui-input" id="pmi-filter-worker" style="font-size:13px;height:38px;">
              <option value="todos" ${filterWorker === 'todos' ? 'selected' : ''}>Todos los responsables</option>
              ${workers.map((w) => `
                <option value="${escapeHtml(w.Correo)}" ${filterWorker === w.Correo ? 'selected' : ''}>
                  ${escapeHtml(w.Nombre.split(' ')[0])} (${escapeHtml(w.Correo.split('@')[0])})
                </option>
              `).join('')}
            </select>
          </label>
        </div>
      </div>

      <!-- Tabla de Solicitudes Históricas -->
      <div class="ui-card pmi-table-wrap" style="margin-top:20px;">
        <table class="pmi-table">
          <thead>
            <tr>
              <th style="width:110px;cursor:pointer;user-select:none;" data-sort="ticket" title="Clic para ordenar por Ticket">
                <div class="pmi-flex pmi-items-center pmi-gap-1">
                  <span>Ticket</span>
                  <span class="pmi-sort-arrow" style="font-size:12px;opacity:0.35;">⇅</span>
                </div>
              </th>
              <th>Solicitante</th>
              <th style="cursor:pointer;user-select:none;" data-sort="fecha" title="Clic para ordenar por Fecha y hora">
                <div class="pmi-flex pmi-items-center pmi-gap-1">
                  <span>Fecha y hora</span>
                  <span class="pmi-sort-arrow" style="font-size:12px;opacity:0.35;">⇅</span>
                </div>
              </th>
              <th>Artículos y cant.</th>
              <th style="cursor:pointer;user-select:none;" data-sort="estado" title="Clic para ordenar por Estado">
                <div class="pmi-flex pmi-items-center pmi-gap-1">
                  <span>Estado</span>
                  <span class="pmi-sort-arrow" style="font-size:12px;opacity:0.35;">⇅</span>
                </div>
              </th>
              <th>Notas</th>
              <th style="text-align:right;">Acción</th>
            </tr>
          </thead>
          <tbody id="pmi-table-body">
          </tbody>
        </table>
      </div>
    `;

    /** Actualiza visualmente el indicador de flecha y el resalte en la columna ordenada. */
    function updateSortHeaders() {
      root.querySelectorAll('th[data-sort]').forEach((th) => {
        const key = th.dataset.sort;
        const arrow = th.querySelector('.pmi-sort-arrow');
        if (key === sortKey) {
          th.style.color = 'var(--eafit-primary)';
          if (arrow) {
            arrow.textContent = sortOrder === 'asc' ? '▲' : '▼';
            arrow.style.opacity = '1';
          }
        } else {
          th.style.color = '';
          if (arrow) {
            arrow.textContent = '⇅';
            arrow.style.opacity = '0.35';
          }
        }
      });
    }

    renderTableRows();
    updateSortHeaders();

    root.querySelector('#pmi-back').addEventListener('click', () => navigate('/ops'));

    // Listeners de ordenamiento en las cabeceras de la tabla
    root.querySelectorAll('th[data-sort]').forEach((th) => {
      th.addEventListener('click', () => {
        const key = th.dataset.sort;
        if (sortKey === key) {
          sortOrder = sortOrder === 'asc' ? 'desc' : 'asc';
        } else {
          sortKey = key;
          // Fecha y Ticket inician descendente (más reciente o mayor ID primero)
          // Estado inicia ascendente (Pendientes de entrega primero)
          sortOrder = key === 'estado' ? 'asc' : 'desc';
        }
        updateSortHeaders();
        renderTableRows();
      });
    });

    const searchInput = root.querySelector('#pmi-search');
    searchInput.addEventListener('input', (e) => {
      q = e.target.value;
      renderTableRows();
    });

    root.querySelector('#pmi-filter-estado').addEventListener('change', (e) => {
      filterState = e.target.value;
      renderTableRows();
    });

    root.querySelector('#pmi-filter-date').addEventListener('change', (e) => {
      filterDate = e.target.value;
      renderTableRows();
    });

    root.querySelector('#pmi-filter-category').addEventListener('change', (e) => {
      filterCategory = e.target.value;
      renderTableRows();
    });

    root.querySelector('#pmi-filter-worker').addEventListener('change', (e) => {
      filterWorker = e.target.value;
      renderTableRows();
    });

    root.querySelector('#pmi-reset-filters').addEventListener('click', () => {
      q = '';
      filterState = 'todos';
      filterDate = 'todos';
      filterCategory = 'todos';
      filterWorker = 'todos';
      sortKey = 'fecha';
      sortOrder = 'desc';
      searchInput.value = '';
      root.querySelector('#pmi-filter-estado').value = 'todos';
      root.querySelector('#pmi-filter-date').value = 'todos';
      root.querySelector('#pmi-filter-category').value = 'todos';
      root.querySelector('#pmi-filter-worker').value = 'todos';
      updateSortHeaders();
      renderTableRows();
    });

    // Escuchar búsqueda desde la barra superior si ocurre
    window.addEventListener('pmi:search', (e) => {
      if (document.body.contains(searchInput)) {
        q = e.detail || '';
        searchInput.value = q;
        renderTableRows();
      }
    });
  }

  full();
}
