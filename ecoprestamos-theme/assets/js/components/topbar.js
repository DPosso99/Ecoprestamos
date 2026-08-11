import { store } from '../state.js';
import { escapeHtml, navigate } from '../dom.js';

/**
 * Genera el HTML de la barra superior (logo, buscador, navegacion y menu
 * de usuario), adaptada segun si hay sesion y si el usuario es Trabajador.
 * @returns {string} HTML de la topbar.
 */
export function topbarHtml() {
  const { user, isWorker } = store.auth;
  const letter = ((user?.Nombre || '').trim()[0] || (user?.Correo || 'U')[0] || 'U').toUpperCase();
  const first = (user?.Nombre || 'Cuenta').split(' ')[0];

  const navLinks = isWorker
    ? `<a href="#/ops" data-path="/ops">Dashboard</a><a href="#/ops/solicitudes" data-path="/ops/solicitudes">Solicitudes</a>`
    : `<a href="#/mis-prestamos" data-path="/mis-prestamos">Mis prestamos</a>`;

  const menuOps = isWorker ? `
    <button class="pmi-menu-item" data-go="/ops">Ir a Dashboard</button>
    <button class="pmi-menu-item" data-go="/ops/solicitudes">Ir a Solicitudes</button>
    <div class="pmi-divider" style="margin:6px 0;"></div>
  ` : '';

  return `
    <header class="pmi-topbar ${isWorker ? 'is-ops' : ''}">
      ${isWorker ? '<div class="pmi-topbar-accent"></div>' : ''}
      <div class="pmi-container pmi-topbar-inner">
        <a href="#${isWorker ? '/ops' : '/catalogo'}" class="pmi-logo">
          <div class="pmi-logo-mark">E</div>
          <div class="pmi-logo-text pmi-hidden-xs">
            <div class="pmi-logo-title">EAFIT &middot; MediaLab</div>
            <div class="pmi-logo-sub">${isWorker ? 'Panel de trabajador' : 'Prestamo de recursos'}</div>
          </div>
        </a>

        <div class="pmi-grow">
          <button type="button" class="pmi-search-btn" id="pmi-search-btn">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M10.5 18a7.5 7.5 0 1 1 0-15 7.5 7.5 0 0 1 0 15Z" stroke="currentColor" stroke-width="2"/><path d="M16.5 16.5 21 21" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
            <span class="pmi-truncate">Buscar...</span>
          </button>
        </div>

        <nav class="pmi-nav">${navLinks}</nav>

        <div class="pmi-flex pmi-items-center pmi-gap-2">
          ${!user ? `
            <a href="#/login" class="ui-btn ui-btn-ghost">Iniciar sesion</a>
          ` : `
            <div class="pmi-user">
              <button type="button" class="pmi-user-btn" id="pmi-user-btn">
                <span class="pmi-avatar ${isWorker ? 'is-ops' : ''}">${escapeHtml(letter)}</span>
                <span class="pmi-text-sm pmi-hidden-xs">${escapeHtml(first)}</span>
              </button>
              <div class="pmi-user-menu pmi-hidden" id="pmi-user-menu">
                <div class="pmi-user-menu-head">
                  <div class="pmi-text-xs pmi-muted">${isWorker ? 'Trabajador' : 'Estudiante'}</div>
                  <div class="pmi-title pmi-truncate">${escapeHtml(user.Nombre || 'Cuenta')}</div>
                  <div class="pmi-text-xs pmi-muted pmi-truncate">${escapeHtml(user.Correo || '')}</div>
                </div>
                <div class="pmi-user-menu-body">
                  ${menuOps}
                  <button class="pmi-menu-item is-danger" id="pmi-logout-btn">Cerrar sesion</button>
                </div>
              </div>
            </div>
          `}
        </div>
      </div>
    </header>
  `;
}

/**
 * Engancha los listeners de la topbar ya insertada en el DOM: resalta el
 * link activo, abre/cierra el menu de usuario, navega desde los botones
 * `data-go`, maneja logout y el boton de busqueda.
 * @param {HTMLElement} root Contenedor donde se inserto `topbarHtml()`.
 */
export function attachTopbar(root) {
  const path = window.location.hash.replace(/^#/, '').split('?')[0] || '/';
  root.querySelectorAll('.pmi-nav a').forEach((a) => {
    if (a.dataset.path === path) a.classList.add('is-active');
  });

  const userBtn = root.querySelector('#pmi-user-btn');
  const userMenu = root.querySelector('#pmi-user-menu');
  if (userBtn && userMenu) {
    userBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      userMenu.classList.toggle('pmi-hidden');
    });
    document.addEventListener('click', () => userMenu.classList.add('pmi-hidden'), { once: true });
  }

  root.querySelectorAll('[data-go]').forEach((btn) => {
    btn.addEventListener('click', () => navigate(btn.dataset.go));
  });

  const logoutBtn = root.querySelector('#pmi-logout-btn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
      await store.auth.logout();
      navigate('/login');
    });
  }

  const searchBtn = root.querySelector('#pmi-search-btn');
  if (searchBtn) {
    searchBtn.addEventListener('click', () => {
      if (!store.auth.isAuthed) { navigate('/login'); return; }
      const q = window.prompt('Buscar:');
      if (!q) return;
      const target = store.auth.isWorker ? '/ops/solicitudes' : '/catalogo';
      navigate(`${target}?q=${encodeURIComponent(q)}`);
    });
  }
}
