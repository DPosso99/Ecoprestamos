import { store } from '../state.js';
import { api } from '../api.js';
import { escapeHtml, navigate } from '../dom.js';
import { openModal, closeModal } from '../components/modal.js';

/**
 * Renderiza la administracion de usuarios del trabajador (ruta
 * `/ops/usuarios`): lista buscable/filtrable con modales para crear,
 * editar, banear/desbanear y eliminar usuarios.
 * @param {HTMLElement} root Elemento contenedor donde se monta la vista.
 * @returns {Promise<void>}
 */
export async function renderOpsUsuarios(root) {
  await store.users.reload();

  let q = '';
  let filterMode = 'todos';

  const norm = (s) => (s ?? '').toString().toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '').trim();

  /** @returns {Array<Object>} Usuarios que pasan la busqueda y el filtro de rol/baneo actuales. */
  function list() {
    const nq = norm(q);
    let items = !nq ? store.users.usuarios : store.users.usuarios.filter((u) => norm(`${u.Nombre} ${u.Correo} ${u.Rol} ${u.numero}`).includes(nq));
    if (filterMode === 'estudiantes') items = items.filter((u) => u.Rol === 'Estudiante');
    if (filterMode === 'docentes') items = items.filter((u) => u.Rol === 'Docente');
    if (filterMode === 'trabajadores') items = items.filter((u) => u.Rol === 'Trabajador');
    if (filterMode === 'baneados') items = items.filter((u) => u.Baneado === 1);
    return items;
  }

  /**
   * @param {Object} u Usuario.
   * @returns {string} HTML de la fila de un usuario en la lista de administracion.
   */
  function itemHtml(u) {
    const isMe = u.Correo === store.auth.user?.Correo;
    return `
      <div class="ui-card-inner pmi-p-4 pmi-user-item pmi-flex pmi-justify-between pmi-items-center pmi-gap-4">
        <div class="pmi-min-w-0" style="flex:1;">
          <div class="pmi-flex pmi-items-center pmi-gap-2 pmi-wrap">
            <div class="pmi-title pmi-truncate">${escapeHtml(u.Nombre)}</div>
            ${isMe ? '<span class="ui-chip ui-chip-on" style="padding:2px 8px;">Tu</span>' : ''}
            <span class="ui-chip ui-chip-off" style="padding:2px 8px;">${u.Rol === 'Trabajador' ? escapeHtml(u.Trabajo || 'Trabajador') : (u.Rol === 'Docente' ? 'Docente' : 'Estudiante')}</span>
            ${u.Baneado === 1 ? '<span class="pmi-pill pmi-pill-danger" style="height:auto;padding:2px 8px;">Baneado</span>' : ''}
          </div>
          <div class="pmi-text-sm pmi-muted pmi-truncate" style="margin-top:4px;">${escapeHtml(u.Correo)}</div>
          ${u.numero ? `<div class="pmi-text-xs pmi-muted" style="margin-top:2px;">${escapeHtml(u.numero)}</div>` : ''}
        </div>
        ${!isMe ? `
          <div class="pmi-user-actions pmi-flex pmi-gap-2 pmi-wrap">
            <button class="ui-btn ui-btn-ghost ui-btn-sm" data-edit="${escapeHtml(u.Correo)}">Editar</button>
            ${u.Rol === 'Estudiante' || u.Rol === 'Docente' ? `<button class="ui-btn ui-btn-ghost ui-btn-sm" data-ban="${escapeHtml(u.Correo)}">${u.Baneado === 1 ? 'Desbanear' : 'Banear'}</button>` : ''}
            <button class="ui-btn ui-btn-danger ui-btn-sm" data-delete="${escapeHtml(u.Correo)}">Eliminar</button>
          </div>
        ` : ''}
      </div>
    `;
  }

  /** Renderiza la vista completa (buscador, filtros, lista) y engancha sus listeners. */
  function full() {
    const items = list();
    const filters = [['todos', 'Todos'], ['estudiantes', 'Estudiantes'], ['docentes', 'Docentes'], ['trabajadores', 'Trabajadores'], ['baneados', 'Baneados']];

    root.innerHTML = `
      <div class="pmi-admin-header pmi-flex pmi-justify-between pmi-items-start pmi-gap-4">
        <div>
          <div class="pmi-h1">Administración de usuarios</div>
          <div class="pmi-text-sm pmi-muted pmi-admin-subtitle">Agregar, editar, banear y eliminar usuarios del sistema.</div>
        </div>
        <div class="pmi-admin-header-actions">
          <button class="ui-btn ui-btn-ghost" id="pmi-back">&larr; Volver</button>
          <button class="ui-btn ui-btn-primary" id="pmi-new">+ Nuevo usuario</button>
        </div>
      </div>

      <div class="ui-card pmi-p-6" style="margin-top:20px;">
        <div class="pmi-flex pmi-items-center pmi-gap-3" style="flex-wrap:wrap;">
          <input class="ui-input" id="pmi-search" placeholder="Buscar por nombre, correo, rol..." value="${escapeHtml(q)}" style="flex:1;min-width:200px;" />
          <div class="pmi-text-sm pmi-muted" style="flex-shrink:0;">${items.length} usuarios</div>
        </div>
        <div class="pmi-flex pmi-gap-2 pmi-wrap" style="margin-top:12px;">
          ${filters.map(([v, l]) => `<button type="button" class="ui-chip ${filterMode === v ? 'ui-chip-on' : 'ui-chip-off'}" data-filter="${v}">${l}</button>`).join('')}
        </div>
        <div class="pmi-flex-col pmi-gap-3" style="margin-top:20px;">
          ${items.length === 0 ? '<div class="pmi-text-sm pmi-muted" style="text-align:center;padding:32px;">No hay usuarios.</div>' : items.map(itemHtml).join('')}
        </div>
      </div>
    `;

    root.querySelector('#pmi-back').addEventListener('click', () => navigate('/ops'));
    root.querySelector('#pmi-new').addEventListener('click', () => openEditor());
    root.querySelector('#pmi-search').addEventListener('input', (e) => { q = e.target.value; full(); });
    root.querySelectorAll('[data-filter]').forEach((btn) => btn.addEventListener('click', () => { filterMode = btn.dataset.filter; full(); }));
    root.querySelectorAll('[data-edit]').forEach((btn) => btn.addEventListener('click', () => openEditor(btn.dataset.edit)));
    root.querySelectorAll('[data-delete]').forEach((btn) => btn.addEventListener('click', () => openDelete(btn.dataset.delete)));
    root.querySelectorAll('[data-ban]').forEach((btn) => btn.addEventListener('click', () => toggleBan(btn.dataset.ban)));
  }

  /**
   * Abre el modal de creacion/edicion de usuario, precargado si `correo` existe.
   * @param {string} [correo] Correo del usuario a editar; si se omite, es un usuario nuevo.
   */
  function openEditor(correo) {
    const editing = correo ? store.users.getByCorreo(correo) : null;

    const bodyHtml = `
      <form id="pmi-user-form" class="pmi-flex-col pmi-gap-3">
        <label class="pmi-field">
          <span class="pmi-label">Nombre</span>
          <input class="ui-input" name="Nombre" value="${escapeHtml(editing?.Nombre || '')}" required />
        </label>
        <label class="pmi-field">
          <span class="pmi-label">Correo</span>
          <input class="ui-input" name="Correo" type="email" value="${escapeHtml(editing?.Correo || '')}" placeholder="nombre@eafit.edu.co" ${editing ? 'readonly' : ''} required />
        </label>
        ${!editing ? `
          <label class="pmi-field">
            <span class="pmi-label">Contrasena (opcional)</span>
            <input class="ui-input" name="Contrasena" type="password" placeholder="Minimo 8 caracteres" autocomplete="new-password" />
            <p class="pmi-text-xs pmi-muted">Si la dejas vacia, se usa la contrasena temporal <code>Medialab2026!</code> (el usuario puede cambiarla despues).</p>
          </label>
        ` : ''}
        <label class="pmi-field">
          <span class="pmi-label">Celular</span>
          <input class="ui-input" name="numero" type="tel" value="${escapeHtml(editing?.numero || '')}" placeholder="300 000 0000" />
        </label>
        <label class="pmi-field">
          <span class="pmi-label">Rol</span>
          <select class="ui-input" name="Rol" id="pmi-rol">
            <option value="Estudiante" ${editing?.Rol === 'Estudiante' ? 'selected' : ''}>Estudiante</option>
            <option value="Docente" ${editing?.Rol === 'Docente' ? 'selected' : ''}>Docente</option>
            <option value="Trabajador" ${editing?.Rol === 'Trabajador' ? 'selected' : ''}>Trabajador</option>
          </select>
        </label>
        <label class="pmi-field" id="pmi-trabajo-field" style="display:${editing?.Rol === 'Trabajador' ? 'grid' : 'none'};">
          <span class="pmi-label">Tipo de trabajador</span>
          <select class="ui-input" name="Trabajo">
            <option value="Trabajador" ${(editing?.Trabajo || 'Trabajador') === 'Trabajador' ? 'selected' : ''}>Trabajador</option>
            <option value="Practicante" ${editing?.Trabajo === 'Practicante' ? 'selected' : ''}>Practicante</option>
          </select>
        </label>
        <div id="pmi-user-error"></div>
      </form>
    `;

    openModal({
      title: editing ? 'Editar usuario' : 'Nuevo usuario',
      bodyHtml,
      footerHtml: `
        <div class="pmi-flex pmi-justify-between">
          <button class="ui-btn ui-btn-ghost" id="pmi-cancel">Cancelar</button>
          <button class="ui-btn ui-btn-primary" id="pmi-save">Guardar</button>
        </div>
      `,
      onMount: (panel) => {
        panel.querySelector('#pmi-cancel').addEventListener('click', closeModal);
        panel.querySelector('#pmi-rol').addEventListener('change', (e) => {
          panel.querySelector('#pmi-trabajo-field').style.display = e.target.value === 'Trabajador' ? 'grid' : 'none';
        });
        panel.querySelector('#pmi-save').addEventListener('click', () => saveUser(panel, editing));
      },
    });
  }

  /**
   * Valida y guarda el formulario de usuario del modal (crea o actualiza
   * segun `editing`, via `api.createUser`/`api.updateUser`), y recarga la
   * lista de usuarios al terminar.
   * @param {HTMLElement} panel Elemento `.pmi-modal` del modal abierto.
   * @param {Object|null} editing Usuario que se esta editando, o `null` si es uno nuevo.
   * @returns {Promise<void>}
   */
  async function saveUser(panel, editing) {
    const fd = new FormData(panel.querySelector('#pmi-user-form'));
    const errorSlot = panel.querySelector('#pmi-user-error');
    const Nombre = String(fd.get('Nombre') || '').trim();
    const Correo = String(fd.get('Correo') || '').trim();
    const Rol = fd.get('Rol');
    const Trabajo = Rol === 'Trabajador' ? (fd.get('Trabajo') || null) : null;

    if (!Nombre || !Correo || !/^\S+@\S+\.\S+$/.test(Correo)) {
      errorSlot.innerHTML = '<div class="pmi-alert pmi-alert-danger" style="margin-top:10px;">Revisa nombre y correo.</div>';
      return;
    }
    if (Rol === 'Trabajador' && !Trabajo) {
      errorSlot.innerHTML = '<div class="pmi-alert pmi-alert-danger" style="margin-top:10px;">Selecciona el tipo de trabajador.</div>';
      return;
    }

    const Contrasena = String(fd.get('Contrasena') || '').trim();
    if (!editing && Contrasena && Contrasena.length < 8) {
      errorSlot.innerHTML = '<div class="pmi-alert pmi-alert-danger" style="margin-top:10px;">La contrasena debe tener minimo 8 caracteres.</div>';
      return;
    }

    const payload = { Nombre, Correo, numero: fd.get('numero') || undefined, Rol, Trabajo, adminCreated: true };
    if (!editing && Contrasena) payload.Contrasena = Contrasena;
    const btn = panel.querySelector('#pmi-save');
    btn.disabled = true; btn.textContent = 'Guardando...';

    try {
      if (editing) await api.updateUser(editing.Correo, payload);
      else await api.createUser(payload);
      closeModal();
      await store.users.reload();
      full();
    } catch (err) {
      errorSlot.innerHTML = `<div class="pmi-alert pmi-alert-danger" style="margin-top:10px;">${escapeHtml(err.message || 'Error guardando usuario')}</div>`;
      btn.disabled = false; btn.textContent = 'Guardar';
    }
  }

  /**
   * Abre el modal de confirmacion de eliminacion de un usuario.
   * @param {string} correo Correo del usuario a eliminar.
   */
  function openDelete(correo) {
    openModal({
      title: 'Eliminar usuario',
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
            await api.deleteUser(correo);
            closeModal();
            await store.users.reload();
            full();
          } catch (err) {
            panel.querySelector('.pmi-modal-body').innerHTML = `<div class="pmi-alert pmi-alert-danger">${escapeHtml(err.message || 'Error eliminando usuario')}</div>`;
            btn.disabled = false; btn.textContent = 'Si, eliminar';
          }
        });
      },
    });
  }

  /**
   * Alterna el estado de baneo de un usuario (`api.updateUser` con
   * `Baneado` invertido) y recarga la lista.
   * @param {string} correo Correo del usuario.
   * @returns {Promise<void>}
   */
  async function toggleBan(correo) {
    const u = store.users.getByCorreo(correo);
    if (!u) return;
    try {
      await api.updateUser(correo, { Baneado: u.Baneado === 1 ? 0 : 1 });
      await store.users.reload();
      full();
    } catch (err) {
      console.error('Error al banear/desbanear:', err);
    }
  }

  full();
}
