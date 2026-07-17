import { store } from '../state.js';
import { api } from '../api.js';
import { escapeHtml, navigate } from '../dom.js';
import { openModal, closeModal } from '../components/modal.js';

const UBICACIONES = ['201A', '201B', '201C', '201D', '315', '206', '208', 'Acustica', 'Gessel (auditorio)', 'Gessel (VIP)', 'Gessel (camara)', 'Gessel (cuarto de control)'];

export async function renderOpsCatalogo(root) {
  await store.catalog.reload();

  let q = '';
  let editingId = null;
  let imageFile = null;

  const norm = (s) => (s ?? '').toString().toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '').trim();

  function list() {
    const nq = norm(q);
    if (!nq) return store.catalog.recursos;
    return store.catalog.recursos.filter((r) => norm(`${r.Nombre} ${r.Tipo} ${r.Ubicacion} ${r.idRecurso}`).includes(nq));
  }

  function itemHtml(r) {
    return `
      <div class="ui-card-inner pmi-p-4 pmi-flex pmi-justify-between pmi-items-start pmi-gap-4">
        <div class="pmi-flex pmi-gap-3 pmi-min-w-0">
          ${r.imagenUrl ? `<img src="${escapeHtml(r.imagenUrl)}" onerror="this.style.display='none'" style="height:56px;width:56px;border-radius:10px;object-fit:cover;border:1px solid var(--eafit-border);flex-shrink:0;" />` : ''}
          <div class="pmi-min-w-0">
            <div class="pmi-title pmi-truncate">${escapeHtml(r.Nombre)}</div>
            <div class="pmi-text-sm pmi-muted">${escapeHtml(r.Tipo)} &middot; <b>${escapeHtml(r.idRecurso)}</b></div>
            <div class="pmi-text-xs pmi-muted" style="margin-top:4px;">${escapeHtml(r.Ubicacion)} &middot; ${escapeHtml(r.Estado)} &middot; Disp: ${r.Cantidad_disponible ?? '—'} &middot; Activo: ${escapeHtml(r.activo ?? 'N/A')}</div>
          </div>
        </div>
        <div class="pmi-flex pmi-gap-2" style="flex-shrink:0;">
          <button class="ui-btn ui-btn-ghost" data-edit="${escapeHtml(r.idRecurso)}">Editar</button>
          <button class="ui-btn ui-btn-danger" data-delete="${escapeHtml(r.idRecurso)}">Eliminar</button>
        </div>
      </div>
    `;
  }

  function full() {
    const items = list();
    root.innerHTML = `
      <div class="pmi-flex pmi-justify-between pmi-items-start pmi-gap-4" style="flex-wrap:wrap;">
        <div>
          <div class="pmi-h1">Gestion de catalogo</div>
          <div class="pmi-text-sm pmi-muted" style="margin-top:6px;">Agregar, editar o eliminar recursos del laboratorio.</div>
        </div>
        <div class="pmi-flex pmi-gap-2">
          <button class="ui-btn ui-btn-ghost" id="pmi-back">&larr; Volver</button>
          <button class="ui-btn ui-btn-primary" id="pmi-new">+ Nuevo recurso</button>
        </div>
      </div>

      <div class="ui-card pmi-p-6" style="margin-top:20px;">
        <div class="pmi-flex pmi-items-center pmi-gap-3">
          <input class="ui-input" id="pmi-search" placeholder="Buscar por nombre, tipo, ubicacion..." value="${escapeHtml(q)}" />
          <div class="pmi-text-sm pmi-muted" style="flex-shrink:0;">${items.length} items</div>
        </div>
        <div class="pmi-flex-col pmi-gap-3" style="margin-top:20px;">
          ${items.length === 0 ? '<div class="pmi-text-sm pmi-muted" style="text-align:center;padding:32px;">No hay resultados.</div>' : items.map(itemHtml).join('')}
        </div>
      </div>
    `;

    root.querySelector('#pmi-back').addEventListener('click', () => navigate('/ops'));
    root.querySelector('#pmi-new').addEventListener('click', () => openEditor());
    root.querySelector('#pmi-search').addEventListener('input', (e) => { q = e.target.value; full(); });
    root.querySelectorAll('[data-edit]').forEach((btn) => btn.addEventListener('click', () => openEditor(btn.dataset.edit)));
    root.querySelectorAll('[data-delete]').forEach((btn) => btn.addEventListener('click', () => openDelete(btn.dataset.delete)));
  }

  function openEditor(id) {
    editingId = id || null;
    imageFile = null;
    const r = editingId ? store.catalog.getById(editingId) : null;

    const bodyHtml = `
      <form id="pmi-resource-form" class="pmi-flex-col pmi-gap-3">
        <div class="ui-card-inner pmi-p-4">
          <div class="pmi-flex pmi-gap-3 pmi-items-center pmi-wrap">
            <div id="pmi-preview" style="height:96px;width:140px;border-radius:12px;overflow:hidden;border:1px solid var(--eafit-border);background:#fff;display:grid;place-items:center;flex-shrink:0;">
              ${r?.imagenUrl ? `<img src="${escapeHtml(r.imagenUrl)}" style="height:100%;width:100%;object-fit:cover;" onerror="this.style.display='none'" />` : '<span class="pmi-text-xs pmi-muted">Sin foto</span>'}
            </div>
            <label class="ui-btn ui-btn-ghost" style="cursor:pointer;">
              Subir archivo
              <input type="file" id="pmi-image-input" accept="image/png,image/jpeg,image/jpg,image/webp" style="display:none;" />
            </label>
          </div>
        </div>
        <label class="pmi-field">
          <span class="pmi-label">ID recurso</span>
          <input class="ui-input" name="idRecurso" value="${escapeHtml(r?.idRecurso || '')}" placeholder="MQ3-01, CAM-01..." ${editingId ? 'readonly' : ''} required />
        </label>
        <label class="pmi-field">
          <span class="pmi-label">Nombre</span>
          <input class="ui-input" name="Nombre" value="${escapeHtml(r?.Nombre || '')}" required />
        </label>
        <label class="pmi-field">
          <span class="pmi-label">Tipo</span>
          <select class="ui-input" name="Tipo">
            ${['Realidad virtual', 'Audiovisual', 'Animación'].map((t) => `<option ${r?.Tipo === t ? 'selected' : ''}>${t}</option>`).join('')}
          </select>
        </label>
        <label class="pmi-field">
          <span class="pmi-label">Ubicacion</span>
          <select class="ui-input" name="Ubicacion">
            ${UBICACIONES.map((u) => `<option ${r?.Ubicacion === u ? 'selected' : ''}>${u}</option>`).join('')}
          </select>
        </label>
        <label class="pmi-field">
          <span class="pmi-label">Estado</span>
          <select class="ui-input" name="Estado" id="pmi-estado">
            ${['Disponible', 'Ocupado', 'Activo fijo'].map((e) => `<option ${r?.Estado === e ? 'selected' : ''}>${e}</option>`).join('')}
          </select>
          <p class="pmi-text-xs" id="pmi-estado-warning" style="color:var(--status-warning);display:${r?.Estado === 'Activo fijo' ? 'block' : 'none'};">Los recursos con estado Activo fijo no son visibles para estudiantes ni pueden prestarse.</p>
        </label>
        <label class="pmi-field">
          <span class="pmi-label">Numero de activo</span>
          <input class="ui-input" name="activo" value="${escapeHtml(r?.activo || 'N/A')}" maxlength="5" placeholder="12345 o N/A" />
        </label>
        <label class="pmi-field">
          <span class="pmi-label">Cantidad total</span>
          <input class="ui-input" type="number" name="Cantidad_total" min="1" value="${r?.Cantidad_total ?? 1}" />
        </label>
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
        panel.querySelector('#pmi-estado').addEventListener('change', (e) => {
          panel.querySelector('#pmi-estado-warning').style.display = e.target.value === 'Activo fijo' ? 'block' : 'none';
        });
        panel.querySelector('#pmi-image-input').addEventListener('change', (e) => {
          imageFile = e.target.files?.[0] || null;
          if (imageFile) {
            panel.querySelector('#pmi-preview').innerHTML = `<img src="${URL.createObjectURL(imageFile)}" style="height:100%;width:100%;object-fit:cover;" />`;
          }
        });
        panel.querySelector('#pmi-save').addEventListener('click', () => saveResource(panel));
      },
    });
  }

  async function saveResource(panel) {
    const form = panel.querySelector('#pmi-resource-form');
    const fd = new FormData(form);
    const errorSlot = panel.querySelector('#pmi-resource-error');
    const idRecurso = String(fd.get('idRecurso') || '').trim();

    if (!idRecurso || !String(fd.get('Nombre') || '').trim()) {
      errorSlot.innerHTML = '<div class="pmi-alert pmi-alert-danger" style="margin-top:10px;">ID y Nombre son obligatorios.</div>';
      return;
    }

    const body = new FormData();
    body.append('idRecurso', idRecurso);
    body.append('Nombre', String(fd.get('Nombre') || '').trim());
    body.append('Tipo', fd.get('Tipo'));
    body.append('Ubicacion', fd.get('Ubicacion'));
    body.append('Estado', fd.get('Estado'));
    body.append('Cantidad_total', fd.get('Cantidad_total') || '1');
    body.append('activo', String(fd.get('activo') || 'N/A').trim() || 'N/A');
    if (imageFile) body.append('Imagen', imageFile);

    const saveBtn = panel.querySelector('#pmi-save');
    saveBtn.disabled = true;
    saveBtn.textContent = 'Procesando...';

    try {
      if (editingId) await api.updateResource(editingId, body);
      else await api.createResource(body);
      closeModal();
      await store.catalog.reload();
      full();
    } catch (err) {
      errorSlot.innerHTML = `<div class="pmi-alert pmi-alert-danger" style="margin-top:10px;">${escapeHtml(err.message || 'Error guardando recurso')}</div>`;
      saveBtn.disabled = false;
      saveBtn.textContent = 'Guardar';
    }
  }

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
