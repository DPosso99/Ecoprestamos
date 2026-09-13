import { store } from '../state.js';
import { api } from '../api.js';
import { escapeHtml, navigate } from '../dom.js';
import { openModal, closeModal } from '../components/modal.js';

const UBICACIONES = ['201A', '201B', '201C', '201D', '315', '206', '208', 'Acustica', 'Gessel (auditorio)', 'Gessel (VIP)', 'Gessel (camara)', 'Gessel (cuarto de control)'];

/**
 * Descompone un recurso en sus unidades fisicas, con un estado por unidad.
 * `idRecurso` es la lista autoritativa de unidades; `Estado` es la lista
 * paralela de estados, pero las filas hechas a mano traen un solo estado
 * para todo el grupo (en ese caso aplica a todas las unidades).
 * @param {Object} r Recurso.
 * @returns {{ unitIds: Array<string>, unitEstados: Array<string> }} Unidades y su estado, del mismo largo.
 */
function unitBreakdown(r) {
  const unitIds = (r.idRecurso || '').split(',').map((s) => s.trim()).filter(Boolean);
  const rawEstados = (r.Estado || 'Disponible').split(',').map((s) => s.trim()).filter(Boolean);
  const count = unitIds.length || 1;
  const unitEstados = Array.from({ length: count }, (_, i) => rawEstados[i] || (rawEstados.length === 1 ? rawEstados[0] : 'Disponible'));
  return { unitIds, unitEstados };
}

/**
 * @param {Object} d Fila de detalle de prestamo (`store.loans.detailsObjectsMap`).
 * @returns {Array<string>} IDs de las unidades fisicas asignadas a ese detalle (vacio en registros viejos).
 */
function detalleUnidades(d) {
  return String(d.unidades || '').split(',').map((s) => s.trim()).filter(Boolean);
}

/**
 * Renderiza la gestion de catalogo del trabajador (ruta `/ops/catalogo`):
 * lista buscable de recursos con modales para crear, editar (incluye
 * subida de imagen) y eliminar.
 * @param {HTMLElement} root Elemento contenedor donde se monta la vista.
 * @returns {Promise<void>}
 */
export async function renderOpsCatalogo(root) {
  await Promise.all([
    store.catalog.reload(),
    store.loans.reload(),
    store.users.reload(),
  ]);

  let q = '';
  let selectedCategory = 'Todos';
  let editingId = null;
  let imageFile = null;

  const norm = (s) => (s ?? '').toString().toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '').trim();

  /** @returns {Array<Object>} Recursos del catalogo que coinciden con la busqueda y categoria actual. */
  function list() {
    let items = store.catalog.recursos || [];
    if (selectedCategory && selectedCategory !== 'Todos') {
      items = items.filter((r) => r.Tipo === selectedCategory);
    }
    const nq = norm(q);
    if (!nq) return items;
    return items.filter((r) => norm(`${r.Nombre} ${r.Tipo} ${r.Ubicacion} ${r.idRecurso} ${r.activo}`).includes(nq));
  }

  /**
   * Mapea cada unidad física (índice 0, 1, ...) con su respectivo préstamo abierto/activo.
   * @param {Object} r Recurso
   * @param {Array<string>} unitIds Lista de IDs de unidades
   * @returns {Array<Object|null>} Array con la info del préstamo asignado a cada unidad
   */
  function getActiveUnitLoans(r, unitIds) {
    const activeLoans = (store.loans.prestamos || [])
      // Un prestamo entregado y sin devolver sigue ocupando su unidad: lo
      // que la libera es la devolucion, no la entrega.
      .filter((p) => Number(p.Devuelto) === 0)
      .sort((a, b) => a.idPrestamo - b.idPrestamo);

    const unitLoans = new Array(unitIds.length).fill(null);

    /**
     * @param {Object} p Prestamo activo.
     * @returns {Object} Datos del prestamo y del solicitante que se muestran sobre la unidad.
     */
    const loanInfo = (p) => {
      const userObj = store.users.getByCorreo(p.usuario_solicitante);
      return {
        idPrestamo: p.idPrestamo,
        usuario_solicitante: p.usuario_solicitante,
        userEmail: p.usuario_solicitante,
        userName: userObj?.Nombre || p.usuario_solicitante.split('@')[0],
        userTel: userObj?.numero || '',
        fecha: p.Fecha_prestamo,
        entregado: p.Entregado,
      };
    };

    // Primera pasada: los detalles que registran las unidades fisicas
    // concretas mandan, porque dicen exactamente cual unidad se entrego.
    for (const p of activeLoans) {
      for (const d of store.loans.detailsObjectsMap[p.idPrestamo] || []) {
        detalleUnidades(d).forEach((uid) => {
          const idx = unitIds.indexOf(uid);
          if (idx >= 0) unitLoans[idx] = loanInfo(p);
        });
      }
    }

    // Segunda pasada: detalles viejos que no guardaron las unidades; se
    // reparten por orden sobre las que quedaron libres.
    for (const p of activeLoans) {
      for (const d of store.loans.detailsObjectsMap[p.idPrestamo] || []) {
        if (detalleUnidades(d).length > 0 || d.recurso_id !== r.idRecurso) continue;
        let pending = Number(d.cantidad_prestada) || 1;
        for (let i = 0; i < unitLoans.length && pending > 0; i++) {
          if (unitLoans[i]) continue;
          unitLoans[i] = loanInfo(p);
          pending--;
        }
      }
    }

    return unitLoans;
  }

  /**
   * @param {Object} r Recurso.
   * @returns {string} HTML de la fila de un recurso en la lista de administracion.
   */
  function itemHtml(r) {
    const { unitIds, unitEstados } = unitBreakdown(r);
    const unitActivos = (r.activo || 'N/A').split(',').map((s) => s.trim());
    const totalUnits = r.Cantidad_total != null ? Number(r.Cantidad_total) : (unitIds.length || 1);
    const dispUnits = r.Cantidad_disponible != null ? Number(r.Cantidad_disponible) : unitEstados.filter((e) => e === 'Disponible').length;
    const unitLoans = getActiveUnitLoans(r, unitIds);
    const loanedUnits = unitEstados.filter((e, idx) => e === 'Prestado' || e === 'Ocupado' || !!unitLoans[idx]).length;
    const maintUnits = unitEstados.filter((e) => e === 'En mantenimiento').length;
    const notDispUnits = unitEstados.filter((e) => e === 'No disponible').length;
    const fixedUnits = unitEstados.filter((e) => e === 'Activo fijo').length;

    return `
      <div class="pmi-resource-manage-card">
        <!-- Fila Superior: Datos Principales y Acciones -->
        <div class="pmi-resource-card-head pmi-flex pmi-justify-between pmi-items-start pmi-gap-4">
          <div class="pmi-flex pmi-gap-4 pmi-items-center" style="min-width:240px;flex:1;">
            <div style="width:60px;height:60px;border-radius:10px;overflow:hidden;border:1px solid var(--eafit-border);background:var(--eafit-surface);display:grid;place-items:center;flex-shrink:0;">
              ${r.tieneImagen
                ? `<img src="${escapeHtml(r.imagenUrl)}" loading="lazy" onerror="this.style.display='none'" style="width:100%;height:100%;object-fit:cover;" />`
                : `<div class="pmi-avatar" style="width:100%;height:100%;font-size:18px;font-weight:700;border-radius:0;">${escapeHtml((r.Nombre || '?').slice(0, 2).toUpperCase())}</div>`}
            </div>
            <div class="pmi-min-w-0" style="flex:1;">
              <div class="pmi-flex pmi-items-center pmi-gap-2" style="flex-wrap:wrap;">
                <h3 class="pmi-title" style="font-size:16px;font-weight:700;margin:0;">${escapeHtml(r.Nombre)}</h3>
                <span class="pmi-pill ${dispUnits > 0 ? 'pmi-pill-success' : 'pmi-pill-danger'}" style="font-size:11px;padding:2px 8px;font-weight:600;">
                  <span class="pmi-dot ${dispUnits > 0 ? 'pmi-dot-success' : 'pmi-dot-danger'}"></span>
                  ${dispUnits} de ${totalUnits} disponibles
                </span>
              </div>
              <div class="pmi-flex pmi-items-center pmi-gap-2" style="margin-top:6px;flex-wrap:wrap;">
                <span class="pmi-pill pmi-pill-neutral" style="font-size:11px;padding:2px 8px;">${escapeHtml(r.Tipo)}</span>
                <span class="pmi-pill pmi-pill-neutral" style="font-size:11px;padding:2px 8px;">${r.Ubicacion ? (r.Ubicacion.startsWith('Bloque 38') ? escapeHtml(r.Ubicacion) : `Bloque 38 - ${escapeHtml(r.Ubicacion)}`) : 'Bloque 38'}</span>
                ${loanedUnits > 0 ? `<span class="pmi-pill pmi-pill-warning" style="font-size:11px;padding:2px 8px;"><span class="pmi-dot pmi-dot-warning"></span>${loanedUnits} en uso</span>` : ''}
                ${notDispUnits > 0 ? `<span class="pmi-pill pmi-pill-danger" style="font-size:11px;padding:2px 8px;"><span class="pmi-dot pmi-dot-danger"></span>${notDispUnits} no disponible</span>` : ''}
                ${maintUnits > 0 ? `<span class="pmi-pill pmi-pill-warning" style="font-size:11px;padding:2px 8px;"><span class="pmi-dot pmi-dot-warning"></span>${maintUnits} en mant.</span>` : ''}
                ${fixedUnits > 0 ? `<span class="pmi-pill pmi-pill-neutral" style="font-size:11px;padding:2px 8px;"><span class="pmi-dot pmi-dot-neutral"></span>${fixedUnits} activo fijo</span>` : ''}
              </div>
            </div>
          </div>

          <div class="pmi-resource-card-actions pmi-flex pmi-gap-2">
            <button class="ui-btn ui-btn-ghost ui-btn-sm" data-edit="${escapeHtml(r.idRecurso)}">
              Editar
            </button>
            <button class="ui-btn ui-btn-danger ui-btn-sm" data-delete="${escapeHtml(r.idRecurso)}">
              Eliminar
            </button>
          </div>
        </div>

        <!-- Fila Inferior: Desglose de Unidades Físicas -->
        <div style="margin-top:16px;padding-top:14px;border-top:1px solid var(--eafit-border);">
          <div class="pmi-text-xs pmi-muted" style="font-weight:600;text-transform:uppercase;letter-spacing:0.04em;margin-bottom:10px;">
            Unidades físicas registradas (${unitIds.length})
          </div>
          <div style="display:grid;grid-template-columns:repeat(auto-fill, minmax(200px, 1fr));gap:10px;">
            ${unitIds.map((uid, idx) => {
              const uest = unitEstados[idx] || unitEstados[0] || 'Disponible';
              const uact = unitActivos[idx] || unitActivos[0] || 'N/A';
              const isDisp = uest === 'Disponible';
              const isMaint = uest === 'En mantenimiento';
              const isNotDisp = uest === 'No disponible';
              const isFixed = uest === 'Activo fijo';

              const loan = unitLoans[idx];
              const isLoaned = !isDisp && (uest === 'Prestado' || !!loan);
              const borrowerName = loan ? (loan.userName || loan.usuario_solicitante.split('@')[0]) : null;

              return `
                <div class="pmi-unit-micro-card ${isLoaned ? 'is-loaned' : ''}">
                  <div class="pmi-flex pmi-justify-between pmi-items-center">
                    <span style="font-family:monospace;font-weight:700;color:var(--eafit-text);font-size:13px;">${escapeHtml(uid)}</span>
                    <span style="font-size:11px;color:var(--eafit-muted);">${uact !== 'N/A' ? `Activo: <b>${escapeHtml(uact)}</b>` : 'Sin activo'}</span>
                  </div>
                  <div style="margin-top:4px;font-size:11px;">
                    ${isDisp 
                      ? '<span class="pmi-flex pmi-items-center pmi-gap-1" style="color:var(--status-success);font-weight:600;"><span class="pmi-dot pmi-dot-success"></span>Disponible</span>' 
                      : isLoaned 
                        ? `<div class="pmi-flex pmi-items-center pmi-gap-1" style="color:var(--eafit-primary);font-weight:600;"><span class="pmi-dot pmi-dot-info"></span>Prestado ${borrowerName ? `a ${escapeHtml(borrowerName)}` : ''} ${loan ? `<a href="#/ops/ticket/${loan.idPrestamo}" style="text-decoration:underline;color:var(--eafit-primary);margin-left:2px;">(#${loan.idPrestamo})</a>` : ''}</div>` 
                        : isMaint 
                          ? '<span class="pmi-flex pmi-items-center pmi-gap-1" style="color:var(--status-warning);font-weight:600;"><span class="pmi-dot pmi-dot-warning"></span>En mantenimiento</span>' 
                          : isNotDisp
                            ? '<span class="pmi-flex pmi-items-center pmi-gap-1" style="color:var(--status-danger);font-weight:600;"><span class="pmi-dot pmi-dot-danger"></span>No disponible</span>'
                            : '<span class="pmi-flex pmi-items-center pmi-gap-1" style="color:var(--eafit-muted);font-weight:600;"><span class="pmi-dot pmi-dot-neutral"></span>Activo fijo</span>'}
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        </div>
      </div>
    `;
  }

  /** Renderiza la vista completa (buscador + lista) y engancha sus listeners. */
  /** Renderiza solo la lista de recursos sin alterar el input ni perder el foco. */
  function renderItems() {
    const items = list();
    const container = root.querySelector('#pmi-items-container');
    if (!container) return;

    container.innerHTML = items.length === 0 ? `
      <div class="ui-card pmi-p-8 pmi-text-center" style="padding:48px 20px;">
        <div class="pmi-title pmi-text-base">No se encontraron equipos</div>
        <div class="pmi-text-sm pmi-muted" style="margin-top:4px;">Prueba ajustando los términos de búsqueda o el filtro de categoría.</div>
      </div>
    ` : items.map(itemHtml).join('');

    container.querySelectorAll('[data-edit]').forEach((btn) => btn.addEventListener('click', () => openEditor(btn.dataset.edit)));
    container.querySelectorAll('[data-delete]').forEach((btn) => btn.addEventListener('click', () => openDelete(btn.dataset.delete)));
  }

  /** Renderiza la vista completa (buscador + lista) y engancha sus listeners. */
  function full() {
    const allResources = store.catalog.recursos || [];
    const totalModelos = allResources.length;
    const totalUnidades = allResources.reduce((acc, r) => {
      const { unitIds } = unitBreakdown(r);
      const uCount = r.Cantidad_total != null ? Number(r.Cantidad_total) : (unitIds.length || 1);
      return acc + (isNaN(uCount) ? 0 : uCount);
    }, 0);
    const totalDisponibles = allResources.reduce((acc, r) => {
      const { unitEstados } = unitBreakdown(r);
      const dCount = r.Cantidad_disponible != null ? Number(r.Cantidad_disponible) : unitEstados.filter((e) => e === 'Disponible').length;
      return acc + (isNaN(dCount) ? 0 : dCount);
    }, 0);
    const totalEnPrestamo = Math.max(0, totalUnidades - totalDisponibles);

    root.innerHTML = `
      <div class="pmi-admin-header pmi-flex pmi-justify-between pmi-items-start pmi-gap-4">
        <div>
          <div class="pmi-h1">Gestión de catálogo</div>
          <div class="pmi-text-sm pmi-muted pmi-admin-subtitle">Inventario, control de unidades físicas y disponibilidad del Medialab.</div>
        </div>
        <div class="pmi-admin-header-actions">
          <button class="ui-btn ui-btn-ghost" id="pmi-back">&larr; Volver</button>
          <button class="ui-btn ui-btn-primary" id="pmi-new">+ Nuevo recurso</button>
        </div>
      </div>

      <!-- KPIs del Inventario -->
      <div class="pmi-kpi-grid" style="margin-top:20px;">
        <div class="pmi-kpi-card">
          <div class="pmi-kpi-header">
            <span class="pmi-kpi-lbl">Equipos / Modelos</span>
            <span class="pmi-dot pmi-dot-neutral"></span>
          </div>
          <div class="pmi-kpi-val">${totalModelos}</div>
          <div class="pmi-kpi-sub">Referencias registradas</div>
        </div>

        <div class="pmi-kpi-card">
          <div class="pmi-kpi-header">
            <span class="pmi-kpi-lbl">Unidades Totales</span>
            <span class="pmi-dot pmi-dot-info"></span>
          </div>
          <div class="pmi-kpi-val">${totalUnidades}</div>
          <div class="pmi-kpi-sub">Inventario físico total</div>
        </div>

        <div class="pmi-kpi-card">
          <div class="pmi-kpi-header">
            <span class="pmi-kpi-lbl">Disponibles</span>
            <span class="pmi-dot pmi-dot-success"></span>
          </div>
          <div class="pmi-kpi-val" style="color:var(--status-success);">${totalDisponibles}</div>
          <div class="pmi-kpi-sub">Listas para préstamo</div>
        </div>

        <div class="pmi-kpi-card">
          <div class="pmi-kpi-header">
            <span class="pmi-kpi-lbl">En Préstamo</span>
            <span class="pmi-dot pmi-dot-warning"></span>
          </div>
          <div class="pmi-kpi-val" style="${totalEnPrestamo > 0 ? 'color:var(--status-warning);' : ''}">${totalEnPrestamo}</div>
          <div class="pmi-kpi-sub">Actualmente solicitadas</div>
        </div>
      </div>

      <!-- Barra de Búsqueda y Filtros de Categoría -->
      <div class="ui-card pmi-p-4" style="margin-top:20px;">
        <div class="pmi-flex pmi-justify-between pmi-items-center pmi-gap-4" style="flex-wrap:wrap;">
          <div class="pmi-flex pmi-items-center pmi-gap-2" style="flex:1;min-width:260px;">
            <input class="ui-input" id="pmi-search" placeholder="Buscar por nombre, ID, activo o ubicación..." value="${escapeHtml(q)}" style="height:40px;" />
          </div>
          <div class="pmi-flex pmi-gap-2" id="pmi-cat-filters" style="flex-wrap:wrap;">
            ${['Todos', 'Realidad virtual', 'Audiovisual', 'Animación'].map((cat) => `
              <button class="ui-btn ui-btn-sm ${selectedCategory === cat ? 'ui-btn-primary' : 'ui-btn-ghost'}" data-cat="${cat}" style="font-weight:600;">
                ${cat}
              </button>
            `).join('')}
          </div>
        </div>
      </div>

      <!-- Contenedor dinámico de Recursos -->
      <div id="pmi-items-container" class="pmi-flex-col pmi-gap-4" style="margin-top:16px;">
      </div>
    `;

    renderItems();

    root.querySelector('#pmi-back').addEventListener('click', () => navigate('/ops'));
    root.querySelector('#pmi-new').addEventListener('click', () => openEditor());
    
    const searchInput = root.querySelector('#pmi-search');
    searchInput.addEventListener('input', (e) => {
      q = e.target.value;
      renderItems();
    });

    root.querySelectorAll('[data-cat]').forEach((btn) => btn.addEventListener('click', (e) => {
      selectedCategory = e.currentTarget.dataset.cat;
      root.querySelectorAll('[data-cat]').forEach((b) => {
        b.className = `ui-btn ui-btn-sm ${b.dataset.cat === selectedCategory ? 'ui-btn-primary' : 'ui-btn-ghost'}`;
      });
      renderItems();
    }));
  }

  /**
   * Helper para generar el siguiente ID en secuencia segun un offset.
   * Ej: "GMQ-01" + 1 -> "GMQ-02", "CAM-9" + 1 -> "CAM-10", "ITEM" + 1 -> "ITEM-2".
   * @param {string} baseId ID base escrito por el usuario.
   * @param {number} offset Numero a sumar.
   * @returns {string} ID generado en secuencia.
   */
  function sequenceId(baseId, offset) {
    if (!baseId) return '';
    const match = baseId.match(/^(.*?)(\d+)$/);
    if (match) {
      const prefix = match[1];
      const numStr = match[2];
      const nextNum = parseInt(numStr, 10) + offset;
      return `${prefix}${String(nextNum).padStart(numStr.length, '0')}`;
    }
    return `${baseId}-${offset + 1}`;
  }

  /**
   * Helper para autosecuenciar el número de activo si el primero es un número/código.
   * Si es "N/A" o está vacío, mantiene "N/A".
   * @param {string} baseActivo Número de activo de la unidad 1.
   * @param {number} offset Número a sumar.
   * @returns {string} Activo generado o "N/A".
   */
  function sequenceActivo(baseActivo, offset) {
    if (!baseActivo || baseActivo.trim().toUpperCase() === 'N/A') return 'N/A';
    const trimmed = baseActivo.trim();
    const match = trimmed.match(/^(.*?)(\d+)$/);
    if (match) {
      const prefix = match[1];
      const numStr = match[2];
      const nextNum = parseInt(numStr, 10) + offset;
      return `${prefix}${String(nextNum).padStart(numStr.length, '0')}`;
    }
    return trimmed;
  }

  /**
   * Abre el modal de creacion/edicion de recurso, precargado si `id` existe.
   * @param {string} [id] idRecurso a editar; si se omite, es un recurso nuevo.
   */
  async function openEditor(id) {
    editingId = id || null;
    imageFile = null;
    const r = editingId ? store.catalog.getById(editingId) : null;
    let qty = 1;
    let currentIds = [''];
    let currentActivos = ['N/A'];
    let currentEstados = ['Disponible'];

    if (editingId && r) {
      if (r.idRecurso && r.idRecurso.includes(',')) {
        currentIds = r.idRecurso.split(',').map((s) => s.trim()).filter(Boolean);
        const rawActivos = (r.activo || 'N/A').split(',').map((s) => s.trim());
        const rawEstados = (r.Estado || 'Disponible').split(',').map((s) => s.trim());
        currentActivos = currentIds.map((_, i) => rawActivos[i] || rawActivos[0] || 'N/A');
        currentEstados = currentIds.map((_, i) => rawEstados[i] || rawEstados[0] || 'Disponible');
        qty = currentIds.length;
      } else {
        currentIds = [r.idRecurso || ''];
        currentActivos = [r.activo || 'N/A'];
        currentEstados = [r.Estado || 'Disponible'];
        qty = r.Cantidad_total ?? 1;
      }
    }

    const unitLoans = editingId && r ? getActiveUnitLoans(r, currentIds) : [];

    const renderIdFieldsHtml = (count) => {
      return `
        <div class="ui-card-inner pmi-p-4" style="background:var(--eafit-subtle);border:1px solid var(--eafit-border);border-radius:14px;">
          <div class="pmi-flex pmi-justify-between pmi-items-center" style="margin-bottom:12px;">
            <div>
              <div class="pmi-title pmi-text-sm" style="font-weight:700;font-size:14px;color:var(--eafit-text);">Unidades y activos registrados (${count} ${count === 1 ? 'unidad' : 'unidades'})</div>
              <div class="pmi-text-xs pmi-muted" style="margin-top:2px;">Configura el ID institucional, el número de activo y el estado operativo individual de cada equipo.</div>
            </div>
            ${count > 1 ? `<span class="pmi-pill pmi-pill-neutral" style="font-size:11px;padding:3px 10px;">Autosecuenciación</span>` : ''}
          </div>

          <div class="pmi-flex-col pmi-gap-3">
            ${Array.from({ length: count }, (_, i) => {
              const loan = unitLoans[i];
              const estActual = currentEstados[i] || (loan ? 'Prestado' : 'Disponible');
              const isLoaned = estActual === 'Prestado' || !!loan;
              const isAvailable = estActual === 'Disponible';
              const isMaintenance = estActual === 'En mantenimiento';
              const isNotAvailable = estActual === 'No disponible';

              const badgeClass = isAvailable 
                ? 'pmi-pill-success' 
                : isLoaned 
                  ? 'pmi-pill-info' 
                  : isMaintenance 
                    ? 'pmi-pill-warning' 
                    : isNotAvailable
                      ? 'pmi-pill-danger'
                      : 'pmi-pill-neutral';

              return `
                <div class="pmi-unit-row ${isLoaned ? 'is-loaned' : ''}">
                  <div class="pmi-flex pmi-justify-between pmi-items-center" style="margin-bottom:8px;">
                    <div class="pmi-flex pmi-items-center pmi-gap-2">
                      <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${isAvailable ? 'var(--status-success)' : isLoaned ? 'var(--status-info)' : isMaintenance ? 'var(--status-warning)' : isNotAvailable ? 'var(--status-danger)' : 'var(--eafit-muted)'};"></span>
                      <span style="font-size:12px;font-weight:700;color:var(--eafit-text);">UNIDAD ${i + 1}</span>
                    </div>
                    <span class="pmi-pill ${badgeClass}" style="font-size:11px;font-weight:600;padding:2px 10px;height:auto;">
                      ${loan ? `En préstamo &middot; Ticket #${loan.idPrestamo}` : escapeHtml(estActual)}
                    </span>
                  </div>

                  <div style="display:grid;grid-template-columns:1.2fr 1fr 1.3fr;gap:12px;align-items:end;">
                    <label class="pmi-field">
                      <span class="pmi-label" style="font-size:11px;font-weight:700;color:var(--eafit-muted);">ID Recurso</span>
                      <input class="ui-input pmi-unit-id" data-index="${i}" value="${escapeHtml(currentIds[i] || '')}" placeholder="ej. GMQ-${String(i + 1).padStart(2, '0')}" style="font-family:monospace;font-weight:600;font-size:13px;" required />
                    </label>

                    <label class="pmi-field">
                      <span class="pmi-label" style="font-size:11px;font-weight:700;color:var(--eafit-muted);">Número de activo</span>
                      <input class="ui-input pmi-unit-activo" data-index="${i}" value="${escapeHtml(currentActivos[i] || 'N/A')}" maxlength="50" placeholder="12345 o N/A" style="font-size:13px;" />
                    </label>

                    <label class="pmi-field">
                      <span class="pmi-label" style="font-size:11px;font-weight:700;color:var(--eafit-muted);">Estado actual</span>
                      <select class="ui-input pmi-unit-estado" data-index="${i}" style="font-size:13px;font-weight:500;">
                        <option value="Disponible" ${estActual === 'Disponible' ? 'selected' : ''}>Disponible</option>
                        <option value="Prestado" ${estActual === 'Prestado' ? 'selected' : ''}>Prestado / Ocupado</option>
                        <option value="En mantenimiento" ${estActual === 'En mantenimiento' ? 'selected' : ''}>En mantenimiento</option>
                        <option value="No disponible" ${estActual === 'No disponible' ? 'selected' : ''}>No disponible</option>
                        <option value="Activo fijo" ${estActual === 'Activo fijo' ? 'selected' : ''}>Activo fijo (No prestable)</option>
                      </select>
                    </label>
                  </div>

                  ${loan ? `
                    <div style="margin-top:10px;background:rgba(37,99,235,0.06);border:1px solid rgba(37,99,235,0.25);border-radius:8px;padding:8px 12px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;">
                      <div style="font-size:12px;color:var(--eafit-primary);">
                        <b>Prestado a:</b> <span style="font-weight:600;">${escapeHtml(loan.userName)}</span> &middot; <span style="opacity:0.85;">${escapeHtml(loan.userEmail)}</span>
                        ${loan.userTel ? ` &middot; Tel: <b>${escapeHtml(loan.userTel)}</b>` : ''}
                      </div>
                      <a href="#/ops/ticket/${loan.idPrestamo}" style="font-size:12px;color:var(--eafit-primary);font-weight:700;text-decoration:none;display:inline-flex;align-items:center;gap:4px;" target="_blank">
                        Ver Ticket #${loan.idPrestamo} &rarr;
                      </a>
                    </div>
                  ` : ''}
                </div>
              `;
            }).join('')}
          </div>
        </div>
      `;
    };

    const bodyHtml = `
      <form id="pmi-resource-form" class="pmi-flex-col pmi-gap-4">
        <div class="ui-card-inner pmi-p-4" style="background:var(--eafit-subtle);border:1px solid var(--eafit-border);border-radius:14px;">
          <div style="display:grid;grid-template-columns:130px 1fr;gap:20px;align-items:start;">
            <div style="display:flex;flex-direction:column;align-items:center;gap:10px;">
              <div id="pmi-preview" style="height:110px;width:100%;border-radius:12px;overflow:hidden;border:1px solid var(--eafit-border);background:var(--eafit-surface);display:grid;place-items:center;box-shadow:0 1px 3px rgba(0,0,0,0.05);">
                ${r?.tieneImagen ? `<img src="${escapeHtml(r.imagenUrl)}" loading="lazy" style="height:100%;width:100%;object-fit:cover;" onerror="this.style.display='none'" />` : '<span class="pmi-text-xs pmi-muted" style="font-weight:500;">Sin foto</span>'}
              </div>
              <label class="ui-btn ui-btn-ghost ui-btn-sm" style="cursor:pointer;width:100%;text-align:center;font-size:12px;height:32px;">
                Subir foto
                <input type="file" id="pmi-image-input" accept="image/png,image/jpeg,image/jpg,image/webp" style="display:none;" />
              </label>
            </div>

            <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;">
              <label class="pmi-field" style="grid-column:1/-1;">
                <span class="pmi-label" style="font-size:12px;font-weight:700;letter-spacing:0.02em;">Nombre del equipo</span>
                <input class="ui-input" name="Nombre" value="${escapeHtml(r?.Nombre || '')}" placeholder="ej. Gafas Meta Quest 3s" required style="font-size:15px;font-weight:600;" />
              </label>

              <label class="pmi-field">
                <span class="pmi-label" style="font-size:12px;font-weight:700;">Categoría / Tipo</span>
                <select class="ui-input" name="Tipo">
                  ${['Realidad virtual', 'Audiovisual', 'Animación'].map((t) => `<option ${r?.Tipo === t ? 'selected' : ''}>${t}</option>`).join('')}
                </select>
              </label>

              <label class="pmi-field">
                <span class="pmi-label" style="font-size:12px;font-weight:700;">Ubicación física</span>
                <select class="ui-input" name="Ubicacion">
                  ${UBICACIONES.map((u) => `<option ${r?.Ubicacion === u ? 'selected' : ''}>${u}</option>`).join('')}
                </select>
              </label>

              <label class="pmi-field" style="grid-column:1/-1;">
                <div class="pmi-flex pmi-justify-between pmi-items-center">
                  <span class="pmi-label" style="font-size:12px;font-weight:700;">Cantidad total de unidades</span>
                  <span class="pmi-text-xs pmi-muted">El sistema adapta automáticamente las filas inferiores</span>
                </div>
                <input class="ui-input" type="number" id="pmi-qty-input" name="Cantidad_total" min="1" max="200" value="${qty}" style="max-width:140px;font-weight:700;" />
              </label>
            </div>
          </div>
        </div>

        <div id="pmi-ids-container" class="pmi-flex-col pmi-gap-3">
          ${renderIdFieldsHtml(qty)}
        </div>

        <div id="pmi-resource-error"></div>
      </form>
    `;

    const footerHtml = `
      <div class="pmi-flex pmi-justify-between">
        <button class="ui-btn ui-btn-ghost" id="pmi-cancel">Cancelar</button>
        <button class="ui-btn ui-btn-primary" id="pmi-save">Guardar</button>
      </div>
    `;

    openModal({
      title: editingId ? 'Editar recurso' : 'Nuevo recurso',
      bodyHtml, footerHtml,
      onMount: (panel) => {
        panel.querySelector('#pmi-cancel').addEventListener('click', closeModal);
        panel.querySelector('#pmi-image-input').addEventListener('change', (e) => {
          imageFile = e.target.files?.[0] || null;
          if (imageFile) {
            panel.querySelector('#pmi-preview').innerHTML = `<img src="${URL.createObjectURL(imageFile)}" style="height:100%;width:100%;object-fit:cover;" />`;
          }
        });

        const syncCurrentValues = () => {
          panel.querySelectorAll('.pmi-unit-id').forEach((inp) => {
            const idx = Number(inp.dataset.index);
            currentIds[idx] = inp.value;
          });
          panel.querySelectorAll('.pmi-unit-activo').forEach((inp) => {
            const idx = Number(inp.dataset.index);
            currentActivos[idx] = inp.value;
          });
          panel.querySelectorAll('.pmi-unit-estado').forEach((sel) => {
            const idx = Number(sel.dataset.index);
            currentEstados[idx] = sel.value;
          });
        };

        const attachIdListeners = () => {
          const firstIdInput = panel.querySelector('.pmi-unit-id[data-index="0"]');
          if (firstIdInput && !editingId) {
            firstIdInput.addEventListener('input', (e) => {
              const val = e.target.value.trim();
              currentIds[0] = val;
              const otherInputs = panel.querySelectorAll('.pmi-unit-id:not([data-index="0"])');
              otherInputs.forEach((inp) => {
                const idx = Number(inp.dataset.index);
                const seq = sequenceId(val, idx);
                inp.value = seq;
                currentIds[idx] = seq;
              });
            });
          }

          const firstActivoInput = panel.querySelector('.pmi-unit-activo[data-index="0"]');
          if (firstActivoInput && !editingId) {
            firstActivoInput.addEventListener('input', (e) => {
              const val = e.target.value.trim();
              currentActivos[0] = val;
              const otherActivos = panel.querySelectorAll('.pmi-unit-activo:not([data-index="0"])');
              otherActivos.forEach((inp) => {
                const idx = Number(inp.dataset.index);
                const seq = sequenceActivo(val, idx);
                inp.value = seq;
                currentActivos[idx] = seq;
              });
            });
          }

          panel.querySelectorAll('.pmi-unit-id').forEach((inp) => {
            inp.addEventListener('input', syncCurrentValues);
          });
          panel.querySelectorAll('.pmi-unit-activo').forEach((inp) => {
            inp.addEventListener('input', syncCurrentValues);
          });
          panel.querySelectorAll('.pmi-unit-estado').forEach((sel) => {
            sel.addEventListener('change', syncCurrentValues);
          });
        };

        const qtyInput = panel.querySelector('#pmi-qty-input');
        if (qtyInput) {
          qtyInput.addEventListener('input', (e) => {
            syncCurrentValues();
            const newQty = Math.max(1, Math.min(200, parseInt(e.target.value, 10) || 1));
            qty = newQty;
            const container = panel.querySelector('#pmi-ids-container');
            if (container) {
              if (currentIds[0]) {
                for (let i = 1; i < qty; i++) {
                  if (!currentIds[i]) {
                    currentIds[i] = sequenceId(currentIds[0], i);
                  }
                  if (!currentActivos[i] || currentActivos[i] === 'N/A') {
                    currentActivos[i] = sequenceActivo(currentActivos[0] || 'N/A', i);
                  }
                  if (!currentEstados[i]) {
                    currentEstados[i] = 'Disponible';
                  }
                }
              }
              container.innerHTML = renderIdFieldsHtml(qty);
              attachIdListeners();
            }
          });
        }

        attachIdListeners();
        panel.querySelector('#pmi-save').addEventListener('click', () => saveResource(panel));
      },
    });
  }

  /**
   * Valida y guarda el formulario de recurso del modal (crea o actualiza
   * segun `editingId`, via `api.createResource`/`api.updateResource`), y
   * recarga el catalogo al terminar.
   * @param {HTMLElement} panel Elemento `.pmi-modal` del modal abierto.
   * @returns {Promise<void>}
   */
  async function saveResource(panel) {
    const form = panel.querySelector('#pmi-resource-form');
    const fd = new FormData(form);
    const errorSlot = panel.querySelector('#pmi-resource-error');
    const nombre = String(fd.get('Nombre') || '').trim();

    if (!nombre) {
      errorSlot.innerHTML = '<div class="pmi-alert pmi-alert-danger" style="margin-top:10px;">El nombre es obligatorio.</div>';
      return;
    }

    const saveBtn = panel.querySelector('#pmi-save');
    const idInputs = Array.from(panel.querySelectorAll('.pmi-unit-id'));
    const activoInputs = Array.from(panel.querySelectorAll('.pmi-unit-activo'));
    const estadoSelects = Array.from(panel.querySelectorAll('.pmi-unit-estado'));
    const count = idInputs.length || 1;

    const items = [];
    for (let i = 0; i < count; i++) {
      const idVal = (idInputs[i]?.value || '').trim();
      const activoVal = (activoInputs[i]?.value || 'N/A').trim() || 'N/A';
      const estadoVal = (estadoSelects[i]?.value || 'Disponible').trim();
      if (!idVal) {
        errorSlot.innerHTML = `<div class="pmi-alert pmi-alert-danger" style="margin-top:10px;">El ID del recurso ${count > 1 ? i + 1 : ''} es obligatorio.</div>`;
        return;
      }
      items.push({ id: idVal, activo: activoVal, estado: estadoVal });
    }

    // Validar IDs duplicados entre si
    const idsSet = new Set(items.map((it) => it.id));
    if (idsSet.size < items.length) {
      errorSlot.innerHTML = '<div class="pmi-alert pmi-alert-danger" style="margin-top:10px;">Los IDs de los recursos no pueden repetirse entre sí.</div>';
      return;
    }

    const idRecursoFinal = items.map((it) => it.id).join(',');
    const activoFinal = items.map((it) => it.activo).join(',');
    const estadoFinal = items.map((it) => it.estado).join(',');
    const cantidadDisponible = items.filter((it) => it.estado === 'Disponible').length;

    const body = new FormData();
    body.append('idRecurso', idRecursoFinal);
    body.append('Nombre', nombre);
    body.append('Tipo', fd.get('Tipo'));
    body.append('Ubicacion', fd.get('Ubicacion'));
    body.append('Estado', estadoFinal);
    body.append('Cantidad_total', String(count));
    body.append('Cantidad_disponible', String(cantidadDisponible));
    body.append('activo', activoFinal);
    if (imageFile) body.append('Imagen', imageFile);

    saveBtn.disabled = true;
    saveBtn.textContent = 'Guardando...';

    if (editingId) {
      try {
        await api.updateResource(editingId, body);
        closeModal();
        await store.catalog.reload();
        full();
      } catch (err) {
        errorSlot.innerHTML = `<div class="pmi-alert pmi-alert-danger" style="margin-top:10px;">${escapeHtml(err.message || 'Error guardando recurso')}</div>`;
        saveBtn.disabled = false;
        saveBtn.textContent = 'Guardar';
      }
      return;
    }

    try {
      await api.createResource(body);
      closeModal();
      await store.catalog.reload();
      full();
    } catch (err) {
      errorSlot.innerHTML = `<div class="pmi-alert pmi-alert-danger" style="margin-top:10px;">${escapeHtml(err.message || 'Error guardando recurso')}</div>`;
      saveBtn.disabled = false;
      saveBtn.textContent = 'Guardar';
    }
  }

  /**
   * Abre el modal de confirmacion de eliminacion de un recurso.
   * @param {string} id idRecurso a eliminar.
   */
  function openDelete(id) {
    editingId = id;
    openModal({
      title: 'Eliminar recurso',
      bodyHtml: '<div class="pmi-alert pmi-alert-danger">Esta accion no se puede deshacer.</div>',
      footerHtml: `
        <div class="pmi-flex pmi-justify-between">
          <button class="ui-btn ui-btn-ghost" id="pmi-cancel-delete">Cancelar</button>
          <button class="ui-btn ui-btn-danger" id="pmi-confirm-delete">Si, eliminar</button>
        </div>
      `,
      onMount: (panel) => {
        panel.querySelector('#pmi-cancel-delete').addEventListener('click', closeModal);
        panel.querySelector('#pmi-confirm-delete').addEventListener('click', async () => {
          const btn = panel.querySelector('#pmi-confirm-delete');
          btn.disabled = true; btn.textContent = 'Eliminando...';
          try {
            await api.deleteResource(id);
            closeModal();
            await store.catalog.reload();
            full();
          } catch (err) {
            panel.querySelector('.pmi-modal-body').innerHTML = `<div class="pmi-alert pmi-alert-danger">${escapeHtml(err.message || 'Error eliminando recurso')}</div>`;
            btn.disabled = false; btn.textContent = 'Si, eliminar';
          }
        });
      },
    });
  }

  full();
}
