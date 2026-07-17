import { store } from './state.js';
import { api } from './api.js';
import { topbarHtml, attachTopbar } from './components/topbar.js';

import { renderLogin } from './views/login.js';
import { renderCatalogo } from './views/catalogo.js';
import { renderNuevaSolicitud } from './views/nueva-solicitud.js';
import { renderMisSolicitudes } from './views/mis-solicitudes.js';
import { renderDetallePedido } from './views/detalle-pedido.js';
import { renderMisPrestamos } from './views/mis-prestamos.js';
import { renderOpsDashboard } from './views/ops-dashboard.js';
import { renderOpsSolicitudes } from './views/ops-solicitudes.js';
import { renderOpsTicket } from './views/ops-ticket.js';
import { renderOpsCatalogo } from './views/ops-catalogo.js';
import { renderOpsUsuarios } from './views/ops-usuarios.js';

// guard: 'public' | 'student' | 'worker' | 'auth'
const routes = [
  { path: '/login', guard: 'public', render: renderLogin, chrome: false },
  { path: '/', guard: 'entry' },
  { path: '/catalogo', guard: 'student', render: renderCatalogo },
  { path: '/solicitud/nueva', guard: 'student', render: renderNuevaSolicitud },
  { path: '/mis-solicitudes', guard: 'student', render: renderMisSolicitudes },
  { path: '/mis-solicitudes/:id', guard: 'student', render: renderDetallePedido },
  { path: '/mis-prestamos', guard: 'student', render: renderMisPrestamos },
  { path: '/ops', guard: 'worker', render: renderOpsDashboard },
  { path: '/ops/solicitudes', guard: 'worker', render: renderOpsSolicitudes },
  { path: '/ops/ticket/:id', guard: 'worker', render: renderOpsTicket },
  { path: '/ops/catalogo', guard: 'worker', render: renderOpsCatalogo },
  { path: '/ops/usuarios', guard: 'worker', render: renderOpsUsuarios },
];

function compile(route) {
  const keys = [];
  const pattern = route.path.replace(/:([a-zA-Z]+)/g, (_, k) => { keys.push(k); return '([^/]+)'; });
  return { ...route, regex: new RegExp(`^${pattern}$`), keys };
}
const compiled = routes.map(compile);

function parseHash() {
  const raw = window.location.hash.replace(/^#/, '') || '/';
  const [path, queryStr] = raw.split('?');
  const query = Object.fromEntries(new URLSearchParams(queryStr || ''));
  return { path: path || '/', query };
}

function matchRoute(path) {
  for (const r of compiled) {
    const m = r.regex.exec(path);
    if (m) {
      const params = {};
      r.keys.forEach((k, i) => { params[k] = decodeURIComponent(m[i + 1]); });
      return { route: r, params };
    }
  }
  return null;
}

let dataLoaded = false;
async function ensureData() {
  if (dataLoaded) return;
  dataLoaded = true;
  await Promise.all([store.catalog.reload(), store.loans.reload(), store.users.reload()]);
}

// Vuelve a consultar al backend si el usuario sigue baneado, por si un
// trabajador lo baneo despues de que esta sesion ya habia iniciado
// (equivalente a router/Banear_Usuarios.tsx del proyecto original).
async function refreshBanStatus() {
  if (!store.auth.user?.Correo) return;
  try {
    const row = await api.getUser(store.auth.user.Correo);
    const baneado = Number(row.Baneado ?? row.baneado ?? 0);
    if (baneado !== store.auth.user.Baneado) {
      store.auth.user = { ...store.auth.user, Baneado: baneado };
      sessionStorage.setItem('medialab_user', JSON.stringify(store.auth.user));
    }
  } catch { /* si falla la consulta, no bloquear al usuario */ }
}

function renderBanned(container) {
  container.innerHTML = `
    <div class="pmi-auth-shell">
      <div class="pmi-auth-box" style="text-align:center;">
        <h1 class="pmi-h1">Cuenta suspendida temporalmente</h1>
        <p class="pmi-muted" style="margin-top:8px;">Tu cuenta ha sido suspendida por un administrador. Si crees que esto es un error, contacta al equipo de Medialab.</p>
        <div class="ui-card pmi-p-6" style="margin-top:20px;">
          <div class="pmi-alert pmi-alert-danger">No puedes acceder al sistema mientras tu cuenta este suspendida.</div>
          <button class="ui-btn ui-btn-primary ui-btn-block" style="margin-top:16px;" id="pmi-banned-logout">Cerrar sesion</button>
        </div>
      </div>
    </div>
  `;
  container.querySelector('#pmi-banned-logout').addEventListener('click', async () => {
    await store.auth.logout();
    window.location.hash = '/login';
  });
}

async function render() {
  const root = document.getElementById('root');
  if (!root) return;

  const { path, query } = parseHash();
  let match = matchRoute(path);

  if (!match && path === '/') match = { route: compiled.find((r) => r.path === '/'), params: {} };
  if (!match) { window.location.hash = store.auth.isAuthed ? (store.auth.isWorker ? '/ops' : '/catalogo') : '/login'; return; }

  let { route, params } = match;

  // Guard: entry ("/") redirige segun rol
  if (route.guard === 'entry') {
    if (!store.auth.isAuthed) { window.location.hash = '/login'; return; }
    window.location.hash = store.auth.isWorker ? '/ops' : '/catalogo';
    return;
  }

  if (route.guard === 'public') {
    if (store.auth.isAuthed) { window.location.hash = store.auth.isWorker ? '/ops' : '/catalogo'; return; }
    root.innerHTML = '<div id="pmi-main"></div>';
    await route.render(document.getElementById('pmi-main'), { params, query });
    return;
  }

  // Rutas protegidas
  if (!store.auth.isAuthed) { window.location.hash = '/login'; return; }

  if (route.guard === 'student' && store.auth.isWorker) { window.location.hash = '/ops'; return; }
  if (route.guard === 'worker' && !store.auth.isWorker) { window.location.hash = '/catalogo'; return; }

  await ensureData();

  root.innerHTML = `<div class="pmi-shell"><div id="pmi-topbar-slot"></div><main class="pmi-container pmi-main" id="pmi-main"></main></div>`;
  document.getElementById('pmi-topbar-slot').innerHTML = topbarHtml();
  attachTopbar(document.getElementById('pmi-topbar-slot'));

  await refreshBanStatus();
  if (store.auth.user?.Baneado === 1) {
    renderBanned(document.getElementById('pmi-main'));
    return;
  }

  window.scrollTo({ top: 0 });
  await route.render(document.getElementById('pmi-main'), { params, query });
}

export function startRouter() {
  window.addEventListener('hashchange', render);
  window.addEventListener('pmi:rerender', render);
  render();
}

export function rerender() {
  window.dispatchEvent(new Event('pmi:rerender'));
}
