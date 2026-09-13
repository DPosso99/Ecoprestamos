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
    : `<a href="#/catalogo" data-path="/catalogo">Catálogo</a><a href="#/mis-solicitudes" data-path="/mis-solicitudes">Mis solicitudes</a><a href="#/mis-prestamos" data-path="/mis-prestamos">Historial</a>`;

  const menuOps = isWorker ? `
    <button class="pmi-menu-item" data-go="/ops">Ir a Dashboard</button>
    <button class="pmi-menu-item" data-go="/ops/solicitudes">Ir a Solicitudes</button>
    <div class="pmi-divider" style="margin:6px 0;"></div>
  ` : `
    <button class="pmi-menu-item" data-go="/catalogo">Ir al Catálogo</button>
    <button class="pmi-menu-item" data-go="/mis-solicitudes">Mis solicitudes</button>
    <button class="pmi-menu-item" data-go="/mis-prestamos">Historial de préstamos</button>
    <div class="pmi-divider" style="margin:6px 0;"></div>
  `;

  const roleLabel = isWorker ? 'Trabajador' : (user?.Rol === 'Docente' ? 'Docente' : 'Estudiante');

  const logoUrl = window.PMI_CONFIG?.logoUrl || '/wp-content/themes/ecoprestamos-theme/pix/Logo_EAFIT.svg';
  const mascotUrl = window.PMI_CONFIG?.mascotUrl || (window.PMI_CONFIG?.themeUrl ? window.PMI_CONFIG.themeUrl + '/pix/Armadillo_libro.png' : '/wp-content/themes/ecoprestamos-theme/pix/Armadillo_libro.png');

  return `
    <header class="pmi-topbar ${isWorker ? 'is-ops' : ''}">
      ${isWorker ? '<div class="pmi-topbar-accent"></div>' : ''}
      <div class="pmi-container pmi-topbar-inner">
        <a href="#${isWorker ? '/ops' : '/catalogo'}" class="pmi-logo" title="MediaLab EAFIT">
          <img src="${logoUrl}" alt="Logo EAFIT" class="pmi-logo-img" onerror="this.style.display='none';if(this.nextElementSibling)this.nextElementSibling.style.display='grid';" />
          <div class="pmi-logo-mark" style="display:none;">E</div>
          <div class="pmi-logo-divider"></div>
          <img src="${mascotUrl}" alt="Mascota MediaLab" class="pmi-mascot-img" onerror="this.style.display='none';" />
          <div class="pmi-logo-text pmi-hidden-xs">
            <div class="pmi-logo-title">MediaLab</div>
            <div class="pmi-logo-sub">${isWorker ? 'Panel de trabajador' : (user?.Rol === 'Docente' ? 'Préstamo a Docentes' : 'Préstamo de recursos')}</div>
          </div>
        </a>

        <div class="pmi-grow">
          <form class="pmi-topbar-search-form" id="pmi-topbar-search-form" style="position:relative;width:100%;max-width:420px;display:flex;align-items:center;" onsubmit="return false;">
            <svg style="position:absolute;left:12px;top:50%;transform:translateY(-50%);pointer-events:none;color:var(--eafit-muted);" width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M10.5 18a7.5 7.5 0 1 1 0-15 7.5 7.5 0 0 1 0 15Z" stroke="currentColor" stroke-width="2"/><path d="M16.5 16.5 21 21" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
            <input type="search" class="ui-input pmi-topbar-search-input" id="pmi-topbar-search-input" placeholder="${isWorker ? 'Buscar por #ID, estudiante, correo, tel o equipo...' : 'Buscar en el catálogo...'}" style="width:100%;padding-left:36px;height:40px;border-radius:var(--radius-input);background:var(--eafit-bg);border:1px solid var(--eafit-border);font-size:13px;" autocomplete="off" />
          </form>
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
                  <div class="pmi-text-xs pmi-muted">${escapeHtml(roleLabel)}</div>
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
 * `data-go`, maneja logout y el input de busqueda integrada.
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
    const closeOnOutsideClick = () => userMenu.classList.add('pmi-hidden');
    userBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const willOpen = userMenu.classList.contains('pmi-hidden');
      userMenu.classList.toggle('pmi-hidden');
      // El cierre por clic afuera se engancha al abrir el menu, no al montar
      // la topbar: registrado en el montaje, el `once` lo consumia el primer
      // clic en cualquier parte de la pagina y ya nunca volvia a cerrarlo.
      // Vivir solo mientras el menu esta abierto tambien evita dejar un
      // listener fijo en `document` por cada navegacion.
      if (willOpen) document.addEventListener('click', closeOnOutsideClick, { once: true });
      else document.removeEventListener('click', closeOnOutsideClick);
    });
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

  const searchForm = root.querySelector('#pmi-topbar-search-form');
  const searchInput = root.querySelector('#pmi-topbar-search-input');
  if (searchInput) {
    const doSearch = (queryVal) => {
      const q = (queryVal ?? searchInput.value).trim();
      // 1. Sincronizar con el buscador interno de la página si existe
      const pageSearch = document.querySelector('#pmi-view-root #pmi-search');
      if (pageSearch && pageSearch !== searchInput) {
        pageSearch.value = q;
        pageSearch.dispatchEvent(new Event('input', { bubbles: true }));
      }
      // 2. Disparar evento global para el catálogo y otras vistas
      window.dispatchEvent(new CustomEvent('pmi:search', { detail: q }));
    };

    searchInput.addEventListener('input', () => {
      doSearch(searchInput.value);
    });

    searchForm?.addEventListener('submit', (e) => {
      e.preventDefault();
      const q = searchInput.value.trim();
      const currentPath = window.location.hash.replace(/^#/, '').split('?')[0] || '/';

      if (!store.auth.isAuthed) {
        navigate('/login');
        return;
      }

      if (currentPath === '/catalogo') {
        doSearch(q);
      } else if (store.auth.isWorker) {
        navigate(`/ops/solicitudes?q=${encodeURIComponent(q)}`);
      } else {
        navigate(`/catalogo?q=${encodeURIComponent(q)}`);
      }
    });
  }
}
