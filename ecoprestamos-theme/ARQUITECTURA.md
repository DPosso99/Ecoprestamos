# Arquitectura del frontend (`assets/js/`)

Guía de cómo está armada la SPA en JavaScript plano que vive en
`ecoprestamos-theme/assets/js/`. Complementa el resumen de
[`README.md`](README.md) con el detalle de cada pieza: cómo se comunican
entre sí, el ciclo de vida de un render, y el patrón que siguen todas las
vistas.

No hay build ni framework: son módulos ES nativos (`<script
type="module">`), cargados directo por el navegador. `functions.php` del
tema encola un único punto de entrada (`app.js`) con `type="module"`; el
resto de módulos se cargan vía `import` cuando el navegador los necesita.

## Mapa de módulos

```
app.js            Punto de entrada: arranca el router al cargar el DOM.
router.js         Ruteo por hash + guards de rol + orquesta el ciclo de render.
state.js          Estado global (store) con pubsub simple: auth, catalog, loans, users, ticket.
api.js            Cliente fetch hacia /wp-json/pmi/v1/, con nonce automático en escrituras.
dom.js            Helpers puros: escapeHtml, formato de fecha, navigate(), loaderHtml().
components/
  topbar.js         Barra superior (logo, buscador, menú de usuario) — se re-renderiza en cada navegación.
  modal.js          Modal genérico (backdrop + panel), usado por las vistas de gestión (ops-catalogo, ops-usuarios).
views/*.js         Una función renderXxx(root, ctx) por pantalla — ver tabla en README.md.
```

## El store (`state.js`): pubsub, no reactividad fina

No hay Virtual DOM ni bindings reactivos. `state.js` expone un único
objeto `store` con sub-stores (`auth`, `catalog`, `loans`, `users`,
`ticket`) y una función `emit()` compartida:

```js
const listeners = new Set();
function emit() { listeners.forEach((fn) => fn()); }
function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }
```

Cada sub-store es un objeto plano con propiedades mutables directas (ej.
`store.catalog.recursos = [...]`) y métodos que mutan + llaman `emit()`
al terminar. **No hay setters mágicos ni proxies**: cualquier código que
mute un array/objeto del store a mano debe acordarse de llamar `emit()`
él mismo (varios métodos lo hacen explícitamente al final).

En la práctica, `emit()` casi nunca se consume por suscripción directa:
el propio router se re-invoca completo vía el evento custom
`pmi:rerender` (ver más abajo) en vez de que cada vista se suscriba al
store — es un patrón de "vuelve a renderizar todo" en lugar de
actualizaciones granulares, deliberadamente simple porque no hay
reconciliación de DOM (cada vista hace `root.innerHTML = ...` completo).

### Sub-stores

| Sub-store | Qué guarda | Métodos clave |
|---|---|---|
| `auth` | Usuario actual (`user`, persistido en `sessionStorage['medialab_user']`), getters `isAuthed`/`isWorker` | `login()`, `register()`, `logout()` |
| `catalog` | `recursos[]` (normalizados desde la respuesta de la API) | `reload()`, `getById(id)` |
| `loans` | `prestamos[]` + `detailsMap` (id de préstamo → lista de "Nombre ×cantidad" para mostrar en las tablas sin pedir el detalle completo) | `reload()`, `reloadDetails()`, `getPrestamo(id)`, `getLoanDetailItems(id)`, `crearPrestamo()`, `marcarEntregado()` |
| `users` | `usuarios[]` | `reload()`, `getByCorreo(correo)` |
| `ticket` | Borrador de la solicitud en curso (wizard de 3 pasos): recursos seleccionados, cantidades, fecha/hora, responsable, checkboxes de aceptación | `toggleSelectedId()`, `setQuantity()`, `removeSelected()`, `setFechaPrestamo()`, `setHoraPrestamo()`, `setNotas()`, `setAcceptCampusRule()`, `setAcceptTerms()`, `setResponsable()`, `clear()` |

Todas las respuestas de la API llegan en `snake_case` desde PHP
(`correo`, `id_recurso`, `fecha_prestamo`...); cada `reload()` pasa los
datos por una función `normalizeXxx()` que los traduce a las llaves
`PascalCase`/mixtas que usa el resto de la UI (`Correo`, `idRecurso`,
`Fecha_prestamo`...). Esa normalización es el único lugar donde el
frontend conoce la forma cruda de la respuesta del backend.

## `api.js`: cliente REST

Una única función `request(path, opts)` hace el `fetch()` real; el objeto
exportado `api` es una lista plana de funciones de una línea que la
envuelven (`api.getUsers()`, `api.createLoan(payload)`, etc.), una por
endpoint de `pmi/v1`. Reglas fijas:

- `credentials: 'include'` siempre (para que viaje la cookie `pmi_session`).
- Header `X-WP-Nonce` se agrega automáticamente en cualquier método
  distinto de `GET`, leyendo `window.PMI_CONFIG.nonce` (inyectado por
  `functions.php` vía `wp_localize_script`).
- Los errores no-2xx se lanzan como `ApiError` (subclase de `Error` con
  `.status`), para que las vistas puedan hacer `err.message` /
  `err.status === 404` sin parsear nada.
- `encodeSegment()` es un `encodeURIComponent` especial que no escapa `@`
  (necesario para `/users/{correo}`, ver nota en el propio archivo).

## `router.js`: ciclo de render

Ruteo **por hash** (`#/catalogo`, `#/ops/ticket/123`), no por
`history.pushState` — así la app funciona igual sin importar en qué URL o
nivel de anidación del sitio de WordPress viva la página (no depende de
rutas del servidor).

1. **Tabla de rutas** (`routes`): cada entrada tiene `path` (con
   parámetros `:id` estilo Express), `guard` (`public | entry | student |
   worker`) y `render` (la función de la vista). Se compila a una regex en
   el arranque (`compile()`).
2. **`parseHash()`** separa el hash actual en `path` + `query` (los query
   params tras un `?` dentro del propio hash, ej.
   `#/catalogo?q=camara`).
3. **`matchRoute(path)`** encuentra la primera ruta cuya regex matchea y
   extrae los parámetros nombrados.
4. **`render()`** (el corazón del router) hace, en orden:
   - Si no matchea nada, redirige a `/` (que a su vez redirige según auth).
   - Si el guard es `public` (login) y ya hay sesión, redirige a `/ops` o
     `/catalogo` según rol.
   - Si no hay sesión y la ruta no es pública, redirige a `/login`.
   - **`refreshUserStatus()`**: vuelve a pedir `GET /users/{correo}` al
     servidor en cada navegación protegida, para detectar si el usuario
     fue baneado o le cambiaron el rol desde `wp-admin` mientras la
     sesión seguía abierta (`sessionStorage` por sí solo quedaría
     desactualizado). Si cambió algo, actualiza el store y
     `sessionStorage`.
   - Si `Baneado === 1`, muestra una pantalla de cuenta suspendida en vez
     de la ruta pedida (con opción de cerrar sesión), sin importar qué
     guard tenía la ruta.
   - Resuelve el guard `entry` (`/`) redirigiendo según rol ya
     actualizado.
   - Rechaza cruces de guard (`student` intentando ir a `/ops...` o
     viceversa) redirigiendo a la home de su propio rol.
   - **`ensureData()`**: la primera vez que se entra a una ruta protegida
     en la sesión del navegador, precarga en paralelo catálogo + préstamos
     + usuarios (`Promise.all`) antes de montar cualquier vista, para que
     las vistas no tengan que lidiar con "el store todavía no tiene
     nada". Las cargas siguientes son responsabilidad de cada vista
     (la mayoría hace su propio `store.xxx.reload()` al montar, para
     tener datos frescos sin depender del timing de otra vista).
   - Monta el layout (`topbar` + `<main id="pmi-main">`) y llama a
     `route.render(container, { params, query })`.
5. **`startRouter()`** se llama una sola vez desde `app.js` y engancha:
   - `window.addEventListener('hashchange', render)` — navegación normal.
   - `window.addEventListener('pmi:rerender', render)` — re-render forzado
     sin cambiar el hash (ver `rerender()` exportado, aunque en la
     práctica cada vista prefiere llamar a su propia función local
     `full()` para repintar solo su propio árbol en vez de disparar todo
     el router de nuevo).

## Patrón de cada vista (`views/*.js`)

No hay un micro-framework de componentes: cada `views/xxx.js` exporta una
única función `async function renderXxx(root, { params, query })` que
sigue siempre la misma forma interna (sin que exista una clase base o
helper que la imponga — es una convención repetida a mano en cada
archivo):

1. **Carga de datos** al inicio: `await store.xxx.reload()` (o lectura
   directa del store si ya se cargó en `ensureData()`).
2. **Estado local** de la vista como variables `let` normales en el
   closure de la función (no hay `useState`): filtros de búsqueda, paso
   actual de un wizard, flags de `loading`/`submitting`, etc. Vive y
   muere con cada `renderXxx()` — al navegar fuera y volver, se
   reinicia (el estado *persistente* entre navegaciones vive en el
   store, ej. `store.ticket.draft`).
3. **`function full()`**: arma el HTML completo de la vista (template
   strings con interpolación, ver `dom.js::h` como helper trivial) y lo
   asigna de una vez a `root.innerHTML`. Siempre vuelve a llamar a
   `attach()` al final — no hay diffing, cada `full()` destruye y
   reconstruye el árbol DOM completo de la vista.
4. **`function attach()`**: engancha listeners de eventos sobre los
   elementos recién insertados (`root.querySelector(...)`). Como
   `full()` reemplaza el DOM en cada render, los listeners viejos se
   descartan solos junto con los nodos (no hace falta `removeEventListener`
   manual).
5. Los handlers que cambian estado local o del store simplemente llaman
   `full()` de nuevo al final (patrón "mutar y re-renderizar", análogo a
   `setState` pero explícito y sin batching).

Ejemplo mínimo del patrón (`mis-prestamos.js` es el más corto y limpio
para verlo completo):

```js
export async function renderMisPrestamos(root) {
  await store.loans.reload();
  let q = '';                      // estado local
  function full() {                // 1. pinta todo
    root.innerHTML = `...${q}...`;
    attach();                      // 2. engancha eventos
  }
  function attach() {
    root.querySelector('#pmi-search')
      .addEventListener('input', (e) => { q = e.target.value; full(); });
  }
  full();
}
```

### Vistas con más lógica propia

- **`login.js`**: maneja tabs login/registro, validación en vivo del
  formulario de registro (por campo, con reglas de país/celular), y una
  secuencia de mensajes rotando en un loader de éxito tras registrarse.
- **`nueva-solicitud.js`**: wizard de 3 pasos (recursos → día/hora →
  confirmación) con validación por paso y reglas de negocio hardcodeadas
  en el cliente (horario 08:00–18:00, solo día actual, solo días hábiles)
  — son un espejo de lo que igualmente valida/permite el backend, no un
  reemplazo de esa validación.
- **`catalogo.js`** y **`ops-catalogo.js`** / **`ops-usuarios.js`**: usan
  `components/modal.js` para el detalle de recurso y los formularios de
  alta/edición/baja (CRUD completo desde modales, sin navegar a otra
  ruta).

## CSS (`assets/css/app.css`)

Sistema de diseño propio (tokens de color en variables CSS, componentes
`.ui-btn`, `.ui-card`, `.pmi-*` de layout) — no usa Tailwind ni ningún
framework de utilidades, a diferencia del proyecto original en React. Se
enlaza como hoja de estilos normal (`wp_enqueue_style`), sin preprocesador
ni paso de build.

## Dónde tocar qué

| Quiero... | Archivo(s) |
|---|---|
| Agregar una pantalla nueva | `views/nueva-vista.js` + registrar la ruta en `router.js` (`routes[]`) + importarla en `app.js`/`router.js` |
| Cambiar qué endpoint llama la app | `api.js` |
| Cambiar cómo se guarda/lee el usuario en sesión del navegador | `state.js` (`auth`) |
| Cambiar el layout compartido (topbar, menú de usuario) | `components/topbar.js` |
| Cambiar reglas de acceso por rol | `router.js` (`guard` de cada ruta + la lógica de `render()`) |
| Cambiar estilos globales / tokens de color | `assets/css/app.css` |

Ver también [`../NOTES.md`](../NOTES.md) (decisiones de migración) y
[`../ecoprestamos-plugin/API.md`](../ecoprestamos-plugin/API.md)
(referencia completa de los endpoints que consume `api.js`).
