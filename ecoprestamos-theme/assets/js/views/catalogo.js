import { closeModal, openModal } from '../components/modal.js';
import { escapeHtml, navigate } from '../dom.js';
import { store } from '../state.js';

/** Normaliza texto para busqueda: minusculas, sin tildes, sin espacios sobrantes. */
const norm = (s) => (s ?? '').toString().toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '').trim();

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
 * Listener global de `pmi:search` de la visita anterior a la vista: como
 * `renderCatalogo()` no tiene hook de desmontaje, hay que quitarlo a mano al
 * volver a montar (si no, se acumula uno por visita).
 * @type {((e: CustomEvent) => void)|null}
 */
let searchListener = null;

/**
 * Determina el estado consolidado de un recurso para la vista de catálogo.
 * @param {Object} r Recurso.
 * @returns {{ key: 'Disponible'|'Ocupado'|'Activo fijo', text: string, cls: string, dot: string, disabled: boolean, dispCount: number, totalCount: number, canAdd: boolean }}
 */
function getResourceStatus(r) {
  const { unitIds, unitEstados } = unitBreakdown(r);
  const isActivoFijo = unitEstados.every((e) => e === 'Activo fijo');
  const totalCount = r.Cantidad_total != null ? Number(r.Cantidad_total) : (unitIds.length || 1);
  const dispCount = r.Cantidad_disponible != null ? Number(r.Cantidad_disponible) : unitEstados.filter((e) => e === 'Disponible').length;
  const loanedCount = unitEstados.filter((e) => e === 'Prestado' || e === 'Ocupado').length;
  const notDispCount = unitEstados.filter((e) => e === 'No disponible').length;
  const maintCount = unitEstados.filter((e) => e === 'En mantenimiento').length;
  const fixedCount = unitEstados.filter((e) => e === 'Activo fijo').length;

  if (isActivoFijo) {
    return {
      key: 'Activo fijo',
      text: 'Activo fijo',
      cls: 'pmi-pill-neutral',
      dot: 'pmi-dot-neutral',
      disabled: true,
      dispCount: 0,
      totalCount,
      loanedCount: 0,
      notDispCount: 0,
      maintCount: 0,
      fixedCount,
      canAdd: false,
    };
  }

  if (dispCount > 0) {
    return {
      key: 'Disponible',
      text: `${dispCount} ${dispCount === 1 ? 'disponible' : 'disponibles'}`,
      cls: 'pmi-pill-success',
      dot: 'pmi-dot-success',
      disabled: false,
      dispCount,
      totalCount,
      loanedCount,
      notDispCount,
      maintCount,
      fixedCount,
      canAdd: true,
    };
  }

  // dispCount === 0: Desglose según el estado real de las unidades
  if (notDispCount > 0 && loanedCount === 0 && maintCount === 0) {
    return {
      key: 'No disponible',
      text: 'No disponible',
      cls: 'pmi-pill-danger',
      dot: 'pmi-dot-danger',
      disabled: true,
      dispCount: 0,
      totalCount,
      loanedCount: 0,
      notDispCount,
      maintCount: 0,
      fixedCount,
      canAdd: false,
    };
  }

  if (maintCount > 0 && loanedCount === 0 && notDispCount === 0) {
    return {
      key: 'En mantenimiento',
      text: 'En mantenimiento',
      cls: 'pmi-pill-warning',
      dot: 'pmi-dot-warning',
      disabled: true,
      dispCount: 0,
      totalCount,
      loanedCount: 0,
      notDispCount: 0,
      maintCount,
      fixedCount,
      canAdd: false,
    };
  }

  if (loanedCount > 0 && notDispCount === 0 && maintCount === 0) {
    return {
      key: 'Ocupado',
      text: 'En uso / Prestado',
      cls: 'pmi-pill-warning',
      dot: 'pmi-dot-warning',
      disabled: true,
      dispCount: 0,
      totalCount,
      loanedCount,
      notDispCount: 0,
      maintCount: 0,
      fixedCount,
      canAdd: false,
    };
  }

  // Mixto cuando no hay disponibles
  const parts = [];
  if (loanedCount > 0) parts.push(`${loanedCount} en uso`);
  if (notDispCount > 0) parts.push(`${notDispCount} no disponible`);
  if (maintCount > 0) parts.push(`${maintCount} en mant.`);

  return {
    key: notDispCount > 0 && loanedCount === 0 ? 'No disponible' : 'Ocupado',
    text: parts.join(' · ') || 'No disponible',
    cls: notDispCount > 0 && loanedCount === 0 ? 'pmi-pill-danger' : 'pmi-pill-warning',
    dot: notDispCount > 0 && loanedCount === 0 ? 'pmi-dot-danger' : 'pmi-dot-warning',
    disabled: true,
    dispCount: 0,
    totalCount,
    loanedCount,
    notDispCount,
    maintCount,
    fixedCount,
    canAdd: false,
  };
}

/**
 * Renderiza el catalogo de recursos (ruta `/catalogo`, vista de estudiante):
 * grilla filtrable de recursos con seleccion multiple hacia el ticket de
 * solicitud, y modal de detalle por recurso.
 * @param {HTMLElement} root Elemento contenedor donde se monta la vista.
 * @param {{ params: Object, query: Object }} ctx Parametros de ruta (sin uso aqui) y query (`q` precarga la busqueda).
 * @returns {Promise<void>}
 */
export async function renderCatalogo(root, { query }) {
  await store.catalog.reload();

  let searchQuery = query.q || '';
  let selectedTipo = 'todos';
  let selectedDisponibilidad = 'todos';

  const onSearch = (e) => {
    searchQuery = e.detail || '';
    full();
  };
  if (searchListener) window.removeEventListener('pmi:search', searchListener);
  searchListener = onSearch;
  window.addEventListener('pmi:search', onSearch);

  /** @returns {Array<Object>} Recursos visibles segun rol (los "Activo fijo" solo los ve el Trabajador). */
  const visibleResources = () => store.catalog.recursos.filter((r) => store.auth.isWorker || getResourceStatus(r).key !== 'Activo fijo');

  /** @returns {Array<string>} Lista ordenada y sin duplicados de tipos de recurso disponibles para filtrar. */
  function tipos() {
    return Array.from(new Set(visibleResources().map((r) => r.Tipo))).sort();
  }

  /** @returns {Array<Object>} Recursos visibles que pasan los filtros de tipo, disponibilidad y busqueda actuales. */
  function filtered() {
    const q = norm(searchQuery);
    return visibleResources().filter((r) => {
      const status = getResourceStatus(r);
      const okTipo = selectedTipo === 'todos' || r.Tipo === selectedTipo;

      let okDisp = true;
      if (selectedDisponibilidad === 'Disponible') {
        okDisp = status.dispCount > 0;
      } else if (selectedDisponibilidad === 'No disponible') {
        // Coincide con cualquier artículo que tenga unidades en uso, fuera de servicio o agotadas
        okDisp = status.dispCount === 0 || status.notDispCount > 0 || status.loanedCount > 0 || status.maintCount > 0;
      }

      const hay = norm(`${r.idRecurso} ${r.Nombre} ${r.Tipo} ${r.Ubicacion}`);
      const okSearch = !q || hay.includes(q);
      return okTipo && okDisp && okSearch;
    });
  }

  /**
   * @param {Object} r Recurso.
   * @returns {string} HTML del placeholder que reemplaza la imagen de la tarjeta si no carga.
   */
  function cardPlaceholderHtml(r) {
    return `<div class="pmi-resource-placeholder"><div class="pmi-avatar">${escapeHtml((r?.Nombre || '?').slice(0, 1).toUpperCase())}</div><div class="pmi-text-xs">${escapeHtml(r?.Tipo)}</div></div>`;
  }

  /**
   * @param {Object} r Recurso.
   * @returns {string} HTML de la tarjeta de un recurso en la grilla del catalogo.
   */
  function resourceCardHtml(r) {
    const status = getResourceStatus(r);
    const selected = store.ticket.draft.selectedIds.includes(r.idRecurso);
    // Si el backend dice que no hay foto, se pinta el placeholder directamente:
    // pedirla daria un 404 por recurso. El respaldo de `attach()` sigue ahi por
    // si la imagen existe pero falla al cargar.
    const media = r.tieneImagen
      ? `<img src="${escapeHtml(r.imagenUrl)}" alt="${escapeHtml(r.Nombre)}" loading="lazy" data-media-img />`
      : cardPlaceholderHtml(r);

    // Pastillas complementarias para mostrar claramente el estado de las unidades si coexisten
    let extraPills = '';
    if (status.dispCount > 0) {
      if (status.loanedCount > 0) {
        extraPills += `<span class="pmi-pill pmi-pill-warning" style="font-size:11px;padding:2px 7px;"><span class="pmi-dot pmi-dot-warning"></span>${status.loanedCount} en uso</span>`;
      }
      if (status.notDispCount > 0) {
        extraPills += `<span class="pmi-pill pmi-pill-danger" style="font-size:11px;padding:2px 7px;"><span class="pmi-dot pmi-dot-danger"></span>${status.notDispCount} ${status.notDispCount === 1 ? 'no disponible' : 'no disponibles'}</span>`;
      }
      if (status.maintCount > 0) {
        extraPills += `<span class="pmi-pill pmi-pill-warning" style="font-size:11px;padding:2px 7px;"><span class="pmi-dot pmi-dot-warning"></span>${status.maintCount} en mant.</span>`;
      }
    }

    return `
      <article class="ui-card ui-card-hover" data-id="${escapeHtml(r.idRecurso)}" style="overflow:hidden;${selected ? 'outline:2px solid var(--eafit-secondary);' : ''}">
        <div class="pmi-resource-media" data-open-detail style="cursor:pointer;">
          ${media}
        </div>
        <div class="pmi-p-5 pmi-flex-col pmi-gap-3">
          <div>
            <h3 class="pmi-title pmi-truncate">${escapeHtml(r.Nombre)}</h3>
            <div class="pmi-text-xs pmi-muted" style="margin-top:4px;">
              ${escapeHtml(r.Tipo)} &middot; ${r.Ubicacion ? (r.Ubicacion.startsWith('Bloque 38') ? escapeHtml(r.Ubicacion) : `Bloque 38 - ${escapeHtml(r.Ubicacion)}`) : 'Bloque 38'}
            </div>
          </div>
          <div class="pmi-flex pmi-items-center pmi-gap-1 pmi-wrap">
            <span class="pmi-pill ${status.cls}"><span class="pmi-dot ${status.dot}"></span>${status.text}</span>
            ${extraPills}
          </div>
          <div class="pmi-resource-actions">
            <button type="button" class="ui-btn ui-btn-ghost ui-btn-sm" data-open-detail>Ver detalle</button>
            <button type="button" class="ui-btn ui-btn-sm ${status.disabled ? '' : selected ? 'ui-btn-secondary' : 'ui-btn-primary'}" data-toggle ${status.disabled ? 'disabled' : ''}>
              ${status.disabled ? (status.key === 'No disponible' ? 'No disponible' : 'Agotado') : selected ? 'Agregado' : 'Agregar'}
            </button>
          </div>
        </div>
      </article>
    `;
  }

  /** @returns {string} HTML de la barra flotante "Crear solicitud" (vacio si no hay recursos seleccionados). */
  function ticketBarHtml() {
    const count = store.ticket.draft.selectedIds.length;
    if (count <= 0) return '';
    return `
      <div class="pmi-ticketbar">
        <div class="pmi-ticketbar-card">
          <div class="pmi-flex pmi-items-center pmi-gap-3">
            <span class="pmi-ticketbar-count">${count}</span>
            <div>
              <div class="pmi-title">Listo para crear tu solicitud</div>
              <div class="pmi-text-xs pmi-muted">${count === 1 ? 'Recurso seleccionado' : 'Recursos seleccionados'}</div>
            </div>
          </div>
          <button type="button" class="ui-btn ui-btn-primary ui-btn-lg" id="pmi-go-solicitud">Crear solicitud &rarr;</button>
        </div>
      </div>
    `;
  }

  /**
   * @param {Array<Object>} list Lista ya filtrada, para mostrar el conteo de resultados.
   * @returns {string} HTML del encabezado del catalogo (titulo, contadores, boton limpiar filtros).
   */
  function headerHtml(list) {
    const hasFilters = selectedTipo !== 'todos' || selectedDisponibilidad !== 'todos' || norm(searchQuery).length > 0;
    let disponible = 0, ocupado = 0, noDisponible = 0;
    visibleResources().forEach((r) => {
      const status = getResourceStatus(r);
      disponible += status.dispCount;
      ocupado += status.loanedCount;
      noDisponible += status.notDispCount + status.maintCount;
    });

    return `
      <div class="ui-card pmi-p-6" style="margin-bottom:20px;">
        <div class="pmi-h1">Catálogo</div>
        <div class="pmi-text-sm pmi-muted" style="margin-top:6px;">
          ${hasFilters
            ? `${list.length} ${list.length === 1 ? 'resultado' : 'resultados'} &middot; filtros aplicados`
            : `<span class="pmi-pill pmi-pill-success" style="height:auto;padding:2px 8px;"><span class="pmi-dot pmi-dot-success"></span>${disponible} unidades disponibles</span> ${ocupado > 0 ? `<span class="pmi-pill pmi-pill-warning" style="height:auto;padding:2px 8px;margin-left:8px;"><span class="pmi-dot pmi-dot-warning"></span>${ocupado} en uso</span>` : ''} ${noDisponible > 0 ? `<span class="pmi-pill pmi-pill-danger" style="height:auto;padding:2px 8px;margin-left:8px;"><span class="pmi-dot pmi-dot-danger"></span>${noDisponible} no disponibles</span>` : ''}`
          }
        </div>
        ${hasFilters ? `<div style="margin-top:12px;"><button class="ui-chip ui-chip-off" id="pmi-clear-filters">Limpiar filtros</button></div>` : ''}
      </div>
    `;
  }

  /** @returns {string} HTML del panel lateral de filtros (tipo y disponibilidad). */
  function filtersHtml() {
    const opts = ['todos', ...tipos()];
    return `
      <aside class="ui-card pmi-p-6 pmi-catalog-filters">
        <div class="pmi-title">Filtros</div>
        <div class="pmi-text-xs pmi-muted" style="margin-top:4px;">Ajusta por tipo y disponibilidad.</div>
        <div class="pmi-divider"></div>
        <label class="pmi-field">
          <span class="pmi-label">Tipo</span>
          <select class="ui-input" id="pmi-filter-tipo">
            ${opts.map((t) => `<option value="${escapeHtml(t)}" ${t === selectedTipo ? 'selected' : ''}>${t === 'todos' ? 'Todos los tipos' : escapeHtml(t)}</option>`).join('')}
          </select>
        </label>
        <div class="pmi-divider"></div>
        <div class="pmi-label" style="margin-bottom:8px;">Disponibilidad</div>
        <div class="pmi-flex-col pmi-gap-2">
          ${[
            { id: 'todos', label: 'Todos' },
            { id: 'Disponible', label: 'Disponibles' },
            { id: 'No disponible', label: 'No disponibles / En uso' },
          ].map((d) => `
            <label class="pmi-checkbox-row" style="cursor:pointer;">
              <input type="radio" name="disp" value="${d.id}" ${selectedDisponibilidad === d.id ? 'checked' : ''} />
              <span class="pmi-text-sm">${d.label}</span>
            </label>
          `).join('')}
        </div>
      </aside>
    `;
  }

  /** Renderiza la vista completa (filtros + grilla + barra de ticket) y engancha sus listeners. */
  function full() {
    const list = filtered();
    root.innerHTML = `
      <div class="pmi-flex pmi-gap-6 pmi-catalog-layout">
        ${filtersHtml()}
        <section class="pmi-grow pmi-catalog-content">
          ${headerHtml(list)}
          ${list.length === 0 ? `
            <div class="ui-card pmi-empty">
              <div class="pmi-empty-icon">&#128269;</div>
              <div class="pmi-title">Sin resultados</div>
              <div class="pmi-text-sm pmi-muted">Prueba otra busqueda o limpia los filtros.</div>
              <button class="ui-btn ui-btn-primary ui-btn-sm" id="pmi-clear-filters-2">Limpiar filtros</button>
            </div>
          ` : `<div class="pmi-grid pmi-grid-cards">${list.map(resourceCardHtml).join('')}</div>`}
        </section>
      </div>
      ${ticketBarHtml()}
    `;
    attach();
  }

  /** Engancha los listeners de filtros, tarjetas y barra de ticket tras cada `full()`. */
  function attach() {
    root.querySelector('#pmi-filter-tipo')?.addEventListener('change', (e) => { selectedTipo = e.target.value; full(); });
    root.querySelectorAll('input[name="disp"]').forEach((r) => {
      r.addEventListener('change', (e) => { selectedDisponibilidad = e.target.value; full(); });
    });
    root.querySelector('#pmi-clear-filters')?.addEventListener('click', clearAll);
    root.querySelector('#pmi-clear-filters-2')?.addEventListener('click', clearAll);
    root.querySelector('#pmi-go-solicitud')?.addEventListener('click', () => navigate('/solicitud/nueva'));

    root.querySelectorAll('[data-id]').forEach((card) => {
      const id = card.dataset.id;
      card.querySelector('[data-toggle]')?.addEventListener('click', () => {
        const r = store.catalog.getById(id);
        const status = getResourceStatus(r);
        store.ticket.toggleSelectedId(id, { canAdd: status.canAdd });
        full();
      });
      card.querySelectorAll('[data-open-detail]').forEach((el) => {
        el.addEventListener('click', () => openDetail(id));
      });
      const img = card.querySelector('[data-media-img]');
      img?.addEventListener('error', () => {
        img.parentElement.innerHTML = cardPlaceholderHtml(store.catalog.getById(id));
      });
    });
  }

  /** Restablece filtros y busqueda a su estado por defecto. */
  function clearAll() {
    selectedTipo = 'todos';
    selectedDisponibilidad = 'todos';
    searchQuery = '';
    const topInput = document.querySelector('#pmi-topbar-search-input');
    if (topInput) topInput.value = '';
    full();
  }

  /**
   * Abre el modal de detalle de un recurso, con boton para agregarlo/quitarlo del ticket.
   * @param {string} id idRecurso.
   */
  function openDetail(id) {
    const r = store.catalog.getById(id);
    if (!r) return;
    const status = getResourceStatus(r);
    const selected = store.ticket.draft.selectedIds.includes(id);
    const disabled = !selected && status.disabled;

    const { unitIds, unitEstados } = unitBreakdown(r);
    const unitActivos = (r.activo || 'N/A').split(',').map((s) => s.trim());
    const totalUnits = r.Cantidad_total != null ? Number(r.Cantidad_total) : (unitIds.length || 1);
    const dispUnits = r.Cantidad_disponible != null ? Number(r.Cantidad_disponible) : unitEstados.filter((e) => e === 'Disponible').length;

    const summaryParts = [`${dispUnits} disponibles`];
    if (status.loanedCount > 0) summaryParts.push(`${status.loanedCount} en uso`);
    if (status.notDispCount > 0) summaryParts.push(`${status.notDispCount} no disponible`);
    if (status.maintCount > 0) summaryParts.push(`${status.maintCount} en mantenimiento`);
    if (status.fixedCount > 0) summaryParts.push(`${status.fixedCount} activo fijo`);

    // Elegir unidades especificas (por ID o numero de activo) es opcional: si
    // el recurso ya esta en la solicitud, se puede elegir tantas como su
    // cantidad actual; si aun no se agrega, "Agregar" lo hace con cantidad 1,
    // asi que aqui solo se puede pre-elegir 1. Si no se elige ninguna, el
    // backend asigna automaticamente las primeras unidades disponibles.
    const maxElegibles = selected ? (store.ticket.draft.quantities[id] ?? 1) : 1;
    let chosen = (store.ticket.draft.unidadesElegidas[id] || []).filter((uid) => unitIds.includes(uid));
    if (chosen.length !== maxElegibles) chosen = [];
    const puedeElegir = !disabled && dispUnits > 0;

    openModal({
      title: 'Detalle del recurso',
      bodyHtml: `
        <div class="pmi-grid pmi-grid-2" style="gap:24px;align-items:start;">
          <div class="ui-card pmi-resource-media" style="height:230px;border-radius:12px;overflow:hidden;border:1px solid var(--eafit-border);">
            ${r.tieneImagen
              ? `<img src="${escapeHtml(r.imagenUrl)}" alt="${escapeHtml(r.Nombre)}" loading="lazy" data-media-img style="width:100%;height:100%;object-fit:cover;" />`
              : cardPlaceholderHtml(r)}
          </div>

          <div class="pmi-flex-col pmi-gap-3">
            <div>
              <h3 class="pmi-h2" style="font-size:20px;font-weight:700;margin:0;">${escapeHtml(r.Nombre)}</h3>
              <p class="pmi-muted pmi-text-sm" style="margin-top:4px;">${escapeHtml(r.Tipo)}</p>
            </div>

            <!-- Fila Superior: Disponibilidad y Ubicación -->
            <div class="pmi-grid pmi-grid-2" style="gap:12px;">
              <div class="ui-card-inner" style="border:1px solid var(--eafit-border);border-radius:10px;padding:12px 14px;background:var(--eafit-subtle);display:flex;flex-direction:column;justify-content:center;">
                <div class="pmi-label" style="font-size:11px;font-weight:600;letter-spacing:0.02em;text-transform:uppercase;color:var(--eafit-muted);">Disponibilidad</div>
                <div style="font-size:14px;font-weight:700;color:${status.dispCount > 0 ? 'var(--status-success)' : status.key === 'No disponible' ? 'var(--status-danger)' : 'var(--status-warning)'};margin-top:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
                  ${status.dispCount} de ${status.totalCount} disponibles ${status.dispCount === 0 ? `(${status.text})` : ''}
                </div>
              </div>
              <div class="ui-card-inner" style="border:1px solid var(--eafit-border);border-radius:10px;padding:12px 14px;background:var(--eafit-subtle);display:flex;flex-direction:column;justify-content:center;">
                <div class="pmi-label" style="font-size:11px;font-weight:600;letter-spacing:0.02em;text-transform:uppercase;color:var(--eafit-muted);">Ubicación física</div>
                <div style="font-size:14px;font-weight:600;color:var(--eafit-text);margin-top:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
                  ${r.Ubicacion ? (r.Ubicacion.startsWith('Bloque 38') ? escapeHtml(r.Ubicacion) : `Bloque 38 - ${escapeHtml(r.Ubicacion)}`) : 'Bloque 38'}
                </div>
              </div>
            </div>

            <!-- Cuadro Unificado de Unidades Físicas, Activos y Estados con Menú Desplegable -->
            <div class="ui-card-inner" style="border:1px solid var(--eafit-border);border-radius:10px;overflow:hidden;background:var(--eafit-surface);margin-top:4px;">
              <button type="button" id="pmi-toggle-units" style="width:100%;padding:12px 14px;background:var(--eafit-subtle);border:none;display:flex;align-items:center;justify-content:space-between;cursor:pointer;font-family:inherit;text-align:left;">
                <div>
                  <div style="font-weight:600;font-size:13px;color:var(--eafit-text);">
                    Unidades físicas y activos (${unitIds.length})
                  </div>
                  <div class="pmi-text-xs pmi-muted" style="margin-top:2px;">
                    ${summaryParts.join(' &middot; ')}
                  </div>
                </div>
                <div style="display:flex;align-items:center;gap:6px;">
                  <span class="pmi-text-xs pmi-muted" style="font-weight:500;" id="pmi-toggle-label">Ver listado</span>
                  <svg id="pmi-accordion-arrow" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="transition:transform 0.2s;transform:rotate(0deg);">
                    <path d="M6 9l6 6 6-6" stroke-linecap="round" stroke-linejoin="round"/>
                  </svg>
                </div>
              </button>

              <div id="pmi-units-list" class="pmi-hidden" style="max-height:280px;overflow-y:auto;padding:8px 14px;border-top:1px solid var(--eafit-border);background:var(--eafit-surface);">
                ${puedeElegir ? `
                  <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:8px;flex-wrap:wrap;">
                    <div class="pmi-text-xs pmi-muted" style="max-width:340px;">
                      Elige hasta <b>${maxElegibles}</b> unidad(es) específica(s) por ID o número de activo (opcional). Si no eliges ninguna, se asignan automáticamente las primeras disponibles.
                    </div>
                    <div style="display:flex;align-items:center;gap:8px;flex-shrink:0;">
                      <span class="pmi-text-xs" id="pmi-unit-pick-count" style="font-weight:600;color:var(--eafit-text);white-space:nowrap;">${chosen.length}/${maxElegibles} elegidas</span>
                      <button type="button" id="pmi-unit-pick-clear" class="ui-btn ui-btn-ghost ui-btn-sm" style="height:26px;font-size:11px;padding:0 8px;" ${chosen.length === 0 ? 'disabled' : ''}>Limpiar</button>
                      ${selected ? `<button type="button" id="pmi-unit-pick-save" class="ui-btn ui-btn-secondary ui-btn-sm" style="height:26px;font-size:11px;padding:0 10px;">Guardar selección</button>` : ''}
                    </div>
                  </div>
                ` : ''}
                <table style="width:100%;border-collapse:collapse;font-size:12px;">
                  <thead>
                    <tr style="border-bottom:1px solid var(--eafit-border);color:var(--eafit-muted);text-align:left;">
                      ${puedeElegir ? '<th style="padding:6px 8px;font-weight:600;width:28px;">Elegir</th>' : ''}
                      <th style="padding:6px 8px;font-weight:600;">ID Recurso</th>
                      <th style="padding:6px 8px;font-weight:600;">Número de activo</th>
                      <th style="padding:6px 8px;font-weight:600;text-align:right;">Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${unitIds.map((uid, idx) => {
                      const uact = unitActivos[idx] || unitActivos[0] || 'N/A';
                      const uest = unitEstados[idx] || unitEstados[0] || 'Disponible';
                      const isDisp = uest === 'Disponible';
                      const isLoaned = uest === 'Prestado' || uest === 'Ocupado';
                      const isMaint = uest === 'En mantenimiento';
                      const isNotDisp = uest === 'No disponible';
                      const isChecked = chosen.includes(uid);

                      return `
                        <tr style="border-bottom:1px solid var(--eafit-border);">
                          ${puedeElegir ? `
                            <td style="padding:6px 8px;">
                              <input type="checkbox" data-unit-check="${escapeHtml(uid)}" data-unit-disponible="${isDisp ? '1' : '0'}" ${isChecked ? 'checked' : ''} ${!isDisp ? 'disabled' : ''} style="width:15px;height:15px;cursor:${isDisp ? 'pointer' : 'not-allowed'};" />
                            </td>
                          ` : ''}
                          <td style="padding:6px 8px;font-family:monospace;font-weight:600;font-size:12px;color:var(--eafit-text);">${escapeHtml(uid)}</td>
                          <td style="padding:6px 8px;color:var(--eafit-muted);font-size:12px;">${uact !== 'N/A' ? `<b>${escapeHtml(uact)}</b>` : 'Sin activo'}</td>
                          <td style="padding:6px 8px;text-align:right;">
                            <span class="pmi-pill ${isDisp ? 'pmi-pill-success' : isLoaned ? 'pmi-pill-info' : isMaint ? 'pmi-pill-warning' : isNotDisp ? 'pmi-pill-danger' : 'pmi-pill-neutral'}" style="font-size:11px;height:22px;padding:0 8px;font-weight:500;">
                              <span class="pmi-dot ${isDisp ? 'pmi-dot-success' : isLoaned ? 'pmi-dot-info' : isMaint ? 'pmi-dot-warning' : isNotDisp ? 'pmi-dot-danger' : 'pmi-dot-neutral'}"></span>
                              ${escapeHtml(uest)}
                            </span>
                          </td>
                        </tr>
                      `;
                    }).join('')}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      `,
      footerHtml: `
        <div class="pmi-flex pmi-justify-between pmi-items-center pmi-gap-3" style="flex-wrap:wrap;">
          <div class="pmi-text-sm pmi-muted" style="font-size:14px;">${selected ? 'Ya esta en tu solicitud.' : disabled ? `Recurso ${status.text.toLowerCase()} — no se puede agregar.` : 'Revisa la información y agrégalo.'}</div>
          <div class="pmi-flex pmi-gap-2">
            <button class="ui-btn ui-btn-ghost" id="pmi-detail-close" style="font-size:14px;font-weight:600;height:40px;padding:0 18px;">Cerrar</button>
            <button class="ui-btn ${disabled ? '' : selected ? 'ui-btn-secondary' : 'ui-btn-primary'}" id="pmi-detail-toggle" ${disabled ? 'disabled' : ''} style="font-size:14px;font-weight:600;height:40px;padding:0 20px;">${disabled ? 'No disponible' : selected ? 'Quitar' : 'Agregar'}</button>
          </div>
        </div>
      `,
      onMount: (panel) => {
        const media = panel.querySelector('[data-media-img]');
        media?.addEventListener('error', () => {
          media.parentElement.innerHTML = `<div class="pmi-resource-placeholder"><div class="pmi-avatar" style="width:64px;height:64px;font-size:24px;font-weight:700;">${escapeHtml((r.Nombre || '?').slice(0, 2).toUpperCase())}</div></div>`;
        });

        panel.querySelector('#pmi-detail-close').addEventListener('click', closeModal);
        panel.querySelector('#pmi-detail-toggle')?.addEventListener('click', () => {
          const seRecienAgrega = !selected;
          store.ticket.toggleSelectedId(id, { canAdd: status.canAdd });
          // Si el recurso se acaba de agregar (queda con cantidad 1) y se
          // habia elegido exactamente 1 unidad, esa eleccion se aplica de
          // una vez; si se quita del ticket, la eleccion no aplica a nada.
          if (seRecienAgrega && chosen.length === 1) {
            store.ticket.setUnidadesElegidas(id, chosen);
          }
          closeModal();
          full();
        });

        // Eleccion manual de unidades especificas (opcional): checkboxes
        // limitados a `maxElegibles`, con contador y botones de limpiar/guardar.
        const unitChecks = Array.from(panel.querySelectorAll('[data-unit-check]'));
        const countLabel = panel.querySelector('#pmi-unit-pick-count');
        const clearBtn = panel.querySelector('#pmi-unit-pick-clear');
        const saveBtn = panel.querySelector('#pmi-unit-pick-save');

        /** Sincroniza checkboxes, contador y botones con el estado de `chosen`. */
        function refreshUnitPicker() {
          unitChecks.forEach((box) => {
            const uid = box.dataset.unitCheck;
            const isChosen = chosen.includes(uid);
            box.checked = isChosen;
            // Las unidades no disponibles (prestadas, en mantenimiento, etc.)
            // quedan siempre deshabilitadas; solo las Disponibles se
            // habilitan/deshabilitan segun si ya se alcanzo el maximo a elegir.
            if (box.dataset.unitDisponible === '1') {
              box.disabled = !isChosen && chosen.length >= maxElegibles;
            }
          });
          if (countLabel) countLabel.textContent = `${chosen.length}/${maxElegibles} elegidas`;
          if (clearBtn) clearBtn.disabled = chosen.length === 0;
          if (saveBtn) saveBtn.disabled = chosen.length !== 0 && chosen.length !== maxElegibles;
        }

        unitChecks.forEach((box) => {
          box.addEventListener('change', () => {
            const uid = box.dataset.unitCheck;
            if (box.checked) {
              if (chosen.length >= maxElegibles) {
                box.checked = false;
                return;
              }
              chosen = [...chosen, uid];
            } else {
              chosen = chosen.filter((x) => x !== uid);
            }
            refreshUnitPicker();
          });
        });

        clearBtn?.addEventListener('click', () => {
          chosen = [];
          refreshUnitPicker();
        });

        saveBtn?.addEventListener('click', () => {
          store.ticket.setUnidadesElegidas(id, chosen);
          const original = saveBtn.textContent;
          saveBtn.textContent = 'Guardado ✓';
          setTimeout(() => { saveBtn.textContent = original; }, 1200);
        });

        const toggleBtn = panel.querySelector('#pmi-toggle-units');
        const unitsList = panel.querySelector('#pmi-units-list');
        const arrow = panel.querySelector('#pmi-accordion-arrow');
        const toggleLabel = panel.querySelector('#pmi-toggle-label');

        if (toggleBtn && unitsList) {
          toggleBtn.addEventListener('click', () => {
            const isHidden = unitsList.classList.toggle('pmi-hidden');
            if (arrow) {
              arrow.style.transform = isHidden ? 'rotate(0deg)' : 'rotate(180deg)';
            }
            if (toggleLabel) {
              toggleLabel.textContent = isHidden ? 'Ver listado' : 'Ocultar listado';
            }
          });
        }
      },
    });
  }

  full();
}
