import { store } from './state.js';
import { api } from './api.js';
import { topbarHtml, attachTopbar } from './components/topbar.js';
import { loaderHtml } from './dom.js';

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

/**
 * Convierte una ruta declarativa (ej. `/mis-solicitudes/:id`) en un objeto
 * con su expresion regular de match y la lista de nombres de parametros,
 * para poder resolverla contra el hash actual en `matchRoute`.
 * @param {Object} route Definicion de ruta (path, guard, render, etc.).
 * @returns {Object} La misma ruta mas `regex` (RegExp) y `keys` (string[]).
 */
function compile(route) {
  const keys = [];
  const pattern = route.path.replace(/:([a-zA-Z]+)/g, (_, k) => { keys.push(k); return '([^/]+)'; });
  return { ...route, regex: new RegExp(`^${pattern}$`), keys };
}
const compiled = routes.map(compile);

/**
 * Lee el hash actual de la URL y lo separa en path y query string.
 * @returns {{ path: string, query: Object }} Ruta (sin `#`) y parametros de query parseados.
 */
function parseHash() {
  const raw = window.location.hash.replace(/^#/, '') || '/';
  const [path, queryStr] = raw.split('?');
  const query = Object.fromEntries(new URLSearchParams(queryStr || ''));
  return { path: path || '/', query };
}

/**
 * Busca, entre las rutas compiladas, la primera cuyo patron matchee `path`,
 * y extrae los parametros dinamicos (ej. `:id`) ya decodificados.
 * @param {string} path Ruta actual (sin query string).
 * @returns {{ route: Object, params: Object }|null} La ruta encontrada y sus params, o `null` si ninguna matchea.
 */
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
/**
 * Carga (una sola vez por sesion de la SPA) los datos globales que
 * necesitan casi todas las vistas autenticadas: catalogo, prestamos y
 * usuarios. Llamadas repetidas no vuelven a pedir nada mientras
 * `dataLoaded` siga en true.
 * @returns {Promise<void>}
 */
async function ensureData() {
  if (dataLoaded) return;
  dataLoaded = true;
  await Promise.all([store.catalog.reload(), store.loans.reload(), store.users.reload()]);
}

/**
 * Vuelve a consultar al backend el usuario actual, por si algo cambio del
 * lado del servidor despues de que esta sesion ya habia iniciado: que lo
 * hayan baneado (equivalente a router/Banear_Usuarios.tsx del proyecto
 * original), o que un administrador le haya cambiado el Rol/Trabajo desde
 * wp-admin (Medialab Prestamos > Usuarios) -- sin esto, sessionStorage se
 * queda con el Rol viejo hasta que la persona vuelve a iniciar sesion, y
 * el home ("/") la sigue mandando a /catalogo en vez de /ops.
 * @returns {Promise<void>}
 */
async function refreshUserStatus() {
  if (!store.auth.user?.Correo) return;
  try {
    const row = await api.getUser(store.auth.user.Correo);
    const next = {
      ...store.auth.user,
      Baneado: Number(row.Baneado ?? row.baneado ?? 0),
      Rol: row.Rol ?? row.rol,
      Trabajo: row.Trabajo ?? row.trabajo ?? null,
      Nombre: row.Nombre ?? row.nombre,
    };
    if (JSON.stringify(next) !== JSON.stringify(store.auth.user)) {
      store.auth.user = next;
      sessionStorage.setItem('medialab_user', JSON.stringify(next));
    }
  } catch { /* si falla la consulta, no bloquear al usuario */ }
}

/**
 * Reemplaza el contenido del contenedor por la pantalla de "cuenta
 * suspendida", con boton para cerrar sesion.
 * @param {HTMLElement} container Elemento donde se monta la pantalla.
 */
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

/**
 * Handler central del router: resuelve la ruta actual a partir del hash,
 * aplica los guards de autenticacion/rol/baneo correspondientes, y
 * finalmente delega el renderizado al `render` de la vista que matchee.
 * Se ejecuta en cada `hashchange` y cada vez que se dispara `pmi:rerender`.
 * @returns {Promise<void>}
 */
async function render() {
  const root = document.getElementById('root');
  if (!root) return;

  const { path, query } = parseHash();
  let match = matchRoute(path);

  if (!match && path === '/') match = { route: compiled.find((r) => r.path === '/'), params: {} };
  if (!match) { window.location.hash = store.auth.isAuthed ? (store.auth.isWorker ? '/ops' : '/catalogo') : '/login'; return; }

  let { route, params } = match;

  if (route.guard === 'public') {
    if (store.auth.isAuthed) { window.location.hash = store.auth.isWorker ? '/ops' : '/catalogo'; return; }
    root.innerHTML = '<div id="pmi-main"></div>';
    await route.render(document.getElementById('pmi-main'), { params, query });
    return;
  }

  // A partir de aqui todas las rutas requieren sesion.
  if (!store.auth.isAuthed) { window.location.hash = '/login'; return; }

  // Refresca Rol/Trabajo/Baneado desde el servidor ANTES de decidir nada
  // basado en el rol: si un administrador cambio el Rol de esta persona
  // desde wp-admin (Medialab Prestamos > Usuarios) mientras la sesion
  // seguia abierta, el valor cacheado en sessionStorage queda desactualizado
  // y sin este refresco el guard de "/" seguiria mandando a /catalogo aunque
  // ya sea Trabajador, hasta que la persona cerrara sesion y volviera a
  // entrar.
  if (!dataLoaded) {
    root.innerHTML = loaderHtml('Cargando tu informacion...');
  }
  await refreshUserStatus();

  if (store.auth.user?.Baneado === 1) {
    root.innerHTML = `<div class="pmi-shell"><div id="pmi-topbar-slot"></div><main class="pmi-container pmi-main" id="pmi-main"></main></div>`;
    document.getElementById('pmi-topbar-slot').innerHTML = topbarHtml();
    attachTopbar(document.getElementById('pmi-topbar-slot'));
    renderBanned(document.getElementById('pmi-main'));
    return;
  }

  // Guard: entry ("/") redirige segun rol (ya actualizado arriba)
  if (route.guard === 'entry') {
    window.location.hash = store.auth.isWorker ? '/ops' : '/catalogo';
    return;
  }

  if (route.guard === 'student' && store.auth.isWorker) { window.location.hash = '/ops'; return; }
  if (route.guard === 'worker' && !store.auth.isWorker) { window.location.hash = '/catalogo'; return; }

  // La primera vez que se cargan los datos de la app (justo despues de
  // iniciar sesion o al entrar directo a una URL) puede tardar varios
  // segundos; sin esto la pantalla se quedaba completamente en blanco
  // (ni siquiera la barra superior) mientras tanto.
  if (!dataLoaded) {
    root.innerHTML = loaderHtml('Cargando tu informacion...');
  }
  await ensureData();

  root.innerHTML = `<div class="pmi-shell"><div id="pmi-topbar-slot"></div><main class="pmi-container pmi-main" id="pmi-main"></main></div>`;
  document.getElementById('pmi-topbar-slot').innerHTML = topbarHtml();
  attachTopbar(document.getElementById('pmi-topbar-slot'));

  // Loader liviano (dentro del contenedor, con la barra superior ya
  // visible) mientras la vista en si vuelve a pedir sus propios datos.
  document.getElementById('pmi-main').innerHTML = loaderHtml('Cargando...', false);

  window.scrollTo({ top: 0 });
  await route.render(document.getElementById('pmi-main'), { params, query });
}

/**
 * Inicializa el router de la SPA: engancha `render` a los cambios de hash
 * y al evento interno `pmi:rerender`, y dispara el primer render.
 */
export function startRouter() {
  window.addEventListener('hashchange', render);
  window.addEventListener('pmi:rerender', render);
  render();
}

/**
 * Fuerza un nuevo render de la vista actual sin cambiar de ruta (por
 * ejemplo, despues de una mutacion de estado que no toca el hash).
 */
export function rerender() {
  window.dispatchEvent(new Event('pmi:rerender'));
}
