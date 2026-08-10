import { store } from '../state.js';
import { escapeHtml, navigate } from '../dom.js';
import { openModal, closeModal } from '../components/modal.js';

const norm = (s) => (s ?? '').toString().toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '').trim();

const ESTADO_META = {
  Disponible: { text: 'Disponible', cls: 'pmi-pill-success', dot: 'pmi-dot-success', disabled: false, helper: '' },
  Ocupado: { text: 'Ocupado', cls: 'pmi-pill-warning', dot: 'pmi-dot-warning', disabled: true, helper: 'Esta prestado actualmente.' },
  'Activo fijo': { text: 'Activo fijo', cls: 'pmi-pill-neutral', dot: 'pmi-dot-neutral', disabled: true, helper: 'Este recurso no esta disponible para prestamo.' },
};

export async function renderCatalogo(root, { query }) {
  await store.catalog.reload();

  let searchQuery = query.q || '';
  let selectedTipo = 'todos';
  let selectedDisponibilidad = 'todos';

  const visibleResources = () => store.catalog.recursos.filter((r) => store.auth.isWorker || r.Estado !== 'Activo fijo');

  function tipos() {
    return Array.from(new Set(visibleResources().map((r) => r.Tipo))).sort();
  }

  function filtered() {
    const q = norm(searchQuery);
    return visibleResources().filter((r) => {
      const okTipo = selectedTipo === 'todos' || r.Tipo === selectedTipo;
      const okDisp = selectedDisponibilidad === 'todos' || r.Estado === selectedDisponibilidad;
      const hay = norm(`${r.idRecurso} ${r.Nombre} ${r.Tipo} ${r.Ubicacion}`);
      const okSearch = !q || hay.includes(q);
      return okTipo && okDisp && okSearch;
    });
  }

  function resourceCardHtml(r) {
    const s = ESTADO_META[r.Estado] || ESTADO_META.Disponible;
    const selected = store.ticket.draft.selectedIds.includes(r.idRecurso);
    const canAdd = r.Estado === 'Disponible';
    const media = r.imagenUrl
      ? `<img src="${escapeHtml(r.imagenUrl)}" alt="${escapeHtml(r.Nombre)}" onerror="this.style.display='none'" />`
      : `<div class="pmi-resource-placeholder"><div class="pmi-avatar">${escapeHtml((r.Nombre || '?').slice(0, 1).toUpperCase())}</div><div class="pmi-text-xs">${escapeHtml(r.Tipo)}</div></div>`;

    return `
      <article class="ui-card ui-card-hover" data-id="${escapeHtml(r.idRecurso)}" style="overflow:hidden;${selected ? 'outline:2px solid var(--eafit-secondary);' : ''}">
        <div class="pmi-resource-media" data-open-detail style="cursor:pointer;">
          ${media}
        </div>
        <div class="pmi-p-5 pmi-flex-col pmi-gap-3">
          <div>
            <h3 class="pmi-title pmi-truncate">${escapeHtml(r.Nombre)}</h3>
            <div class="pmi-text-xs pmi-muted" style="margin-top:4px;">
              ${escapeHtml(r.Tipo)} &middot; ${escapeHtml(r.Ubicacion)}
              ${r.Cantidad_disponible != null ? ` (${r.Cantidad_disponible} disponibles)` : ''}
            </div>
          </div>
          <span class="pmi-pill ${s.cls}"><span class="pmi-dot ${s.dot}"></span>${s.text}</span>
          <div class="pmi-resource-actions">
            <button type="button" class="ui-btn ui-btn-ghost ui-btn-sm" data-open-detail>Ver detalle</button>
            <button type="button" class="ui-btn ui-btn-sm ${s.disabled ? '' : selected ? 'ui-btn-secondary' : 'ui-btn-primary'}" data-toggle ${s.disabled ? 'disabled' : ''}>
              ${s.disabled ? 'No disponible' : selected ? 'Agregado' : 'Agregar'}
            </button>
          </div>
        </div>
      </article>
    `;
  }

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

  function headerHtml(list) {
    const hasFilters = selectedTipo !== 'todos' || selectedDisponibilidad !== 'todos' || norm(searchQuery).length > 0;
    let disponible = 0, ocupado = 0;
    visibleResources().forEach((r) => { r.Estado === 'Disponible' ? disponible++ : ocupado++; });

    return `
      <div class="ui-card pmi-p-6" style="margin-bottom:20px;">
        <div class="pmi-h1">Catalogo</div>
        <div class="pmi-text-sm pmi-muted" style="margin-top:6px;">
          ${hasFilters
            ? `${list.length} ${list.length === 1 ? 'resultado' : 'resultados'} &middot; filtros aplicados`
            : `<span class="pmi-pill pmi-pill-success" style="height:auto;padding:2px 8px;"><span class="pmi-dot pmi-dot-success"></span>${disponible} disponibles</span> ${ocupado > 0 ? `<span class="pmi-pill pmi-pill-warning" style="height:auto;padding:2px 8px;margin-left:8px;"><span class="pmi-dot pmi-dot-warning"></span>${ocupado} ocupados</span>` : ''}`
          }
        </div>
        ${hasFilters ? `<div style="margin-top:12px;"><button class="ui-chip ui-chip-off" id="pmi-clear-filters">Limpiar filtros</button></div>` : ''}
      </div>
    `;
  }

  function filtersHtml() {
    const opts = ['todos', ...tipos()];
    return `
      <aside class="ui-card pmi-p-6" style="width:280px;flex-shrink:0;">
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
          ${['todos', 'Disponible', 'Ocupado'].map((d) => `
            <label class="pmi-checkbox-row" style="cursor:pointer;">
              <input type="radio" name="disp" value="${d}" ${selectedDisponibilidad === d ? 'checked' : ''} />
              <span class="pmi-text-sm">${d === 'todos' ? 'Todos' : d}</span>
            </label>
          `).join('')}
        </div>
      </aside>
    `;
  }

  function full() {
    const list = filtered();
    root.innerHTML = `
      <div class="pmi-flex pmi-gap-6" style="align-items:flex-start;flex-wrap:wrap;">
        ${filtersHtml()}
        <section class="pmi-grow" style="min-width:280px;">
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
        store.ticket.toggleSelectedId(id, { canAdd: r.Estado === 'Disponible' });
        full();
      });
      card.querySelectorAll('[data-open-detail]').forEach((el) => {
        el.addEventListener('click', () => openDetail(id));
      });
    });
  }

  function clearAll() {
    selectedTipo = 'todos';
    selectedDisponibilidad = 'todos';
    searchQuery = '';
    full();
  }

  function openDetail(id) {
    const r = store.catalog.getById(id);
    if (!r) return;
    const s = ESTADO_META[r.Estado] || ESTADO_META.Disponible;
    const selected = store.ticket.draft.selectedIds.includes(id);
    const disabled = !selected && s.disabled;

    openModal({
      title: 'Detalle del recurso',
      bodyHtml: `
        <div class="pmi-grid pmi-grid-2">
          <div class="ui-card pmi-resource-media" style="height:220px;">
            ${r.imagenUrl ? `<img src="${escapeHtml(r.imagenUrl)}" alt="${escapeHtml(r.Nombre)}" onerror="this.style.display='none'" />` : `<div class="pmi-resource-placeholder"><div class="pmi-avatar">${escapeHtml((r.Nombre || '?').slice(0, 1))}</div></div>`}
          </div>
          <div class="pmi-flex-col pmi-gap-3">
            <div>
              <h3 class="pmi-h2">${escapeHtml(r.Nombre)}</h3>
              <p class="pmi-muted pmi-text-sm">${escapeHtml(r.Tipo)}</p>
            </div>
            <div class="pmi-grid pmi-grid-2" style="gap:8px;">
              <div class="ui-card-inner pmi-p-4"><div class="pmi-label">ID</div><div class="pmi-text-sm">${escapeHtml(r.idRecurso)}</div></div>
              <div class="ui-card-inner pmi-p-4"><div class="pmi-label">Estado</div><div class="pmi-text-sm">${escapeHtml(r.Estado)}</div></div>
              <div class="ui-card-inner pmi-p-4"><div class="pmi-label">Ubicacion</div><div class="pmi-text-sm">${escapeHtml(r.Ubicacion)}</div></div>
              <div class="ui-card-inner pmi-p-4"><div class="pmi-label">Disponibles</div><div class="pmi-text-sm">${r.Cantidad_disponible ?? '—'}</div></div>
            </div>
          </div>
        </div>
      `,
      footerHtml: `
        <div class="pmi-flex pmi-justify-between pmi-items-center pmi-gap-3" style="flex-wrap:wrap;">
          <div class="pmi-text-sm pmi-muted">${selected ? 'Ya esta en tu solicitud.' : disabled ? `Recurso ${s.text.toLowerCase()} — no se puede agregar.` : 'Revisa la informacion y agregalo.'}</div>
          <div class="pmi-flex pmi-gap-2">
            <button class="ui-btn ui-btn-ghost ui-btn-sm" id="pmi-detail-close">Cerrar</button>
            <button class="ui-btn ui-btn-sm ${disabled ? '' : selected ? 'ui-btn-secondary' : 'ui-btn-primary'}" id="pmi-detail-toggle" ${disabled ? 'disabled' : ''}>${disabled ? 'No disponible' : selected ? 'Quitar' : 'Agregar'}</button>
          </div>
        </div>
      `,
      onMount: (panel) => {
        panel.querySelector('#pmi-detail-close').addEventListener('click', closeModal);
        panel.querySelector('#pmi-detail-toggle')?.addEventListener('click', () => {
          store.ticket.toggleSelectedId(id, { canAdd: r.Estado === 'Disponible' });
          closeModal();
          full();
        });
      },
    });
  }

  full();
}
