// Cliente del REST API del plugin (pmi/v1). Equivalente a los fetch("/api/...")
// del frontend original, adaptado a rest_url('pmi/v1/') + nonce de WordPress.

const BASE = (window.PMI_CONFIG && window.PMI_CONFIG.restUrl) || '/wp-json/pmi/v1/';
const NONCE = (window.PMI_CONFIG && window.PMI_CONFIG.nonce) || '';

/**
 * encodeURIComponent() escapa "@" como %40, y el enrutamiento de la REST
 * API de WordPress en este sitio (nginx + WP rewrite) no lo decodifica de
 * vuelta de forma confiable, asi que /users/{correo}%40... termina dando
 * 404 "Usuario no encontrado". "@" es un caracter valido sin escapar dentro
 * de un segmento de ruta (RFC 3986 pchar), asi que lo dejamos literal.
 * @param {string} v Valor a usar como segmento de la URL (ej. un correo).
 * @returns {string} Valor codificado con "@" preservado.
 */
function encodeSegment(v) {
  return encodeURIComponent(v).replace(/%40/g, '@').replace(/%2C/g, ',');
}

/** Error lanzado por `request()` cuando la respuesta HTTP no es `ok`, con el status incluido. */
class ApiError extends Error {
  /**
   * @param {string} message Mensaje de error (del backend o generico).
   * @param {number} status Codigo HTTP de la respuesta.
   */
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

/**
 * Helper base de todas las llamadas del `api`: arma la URL contra `BASE`,
 * agrega el nonce de WordPress en mutaciones, serializa el body a JSON
 * (salvo `isForm`, para subidas de archivos con FormData), y lanza
 * `ApiError` si la respuesta no es exitosa.
 * @param {string} path Ruta relativa dentro de `pmi/v1/` (sin slash inicial).
 * @param {Object} [opts]
 * @param {string} [opts.method='GET'] Verbo HTTP.
 * @param {Object|FormData} [opts.body] Cuerpo de la peticion.
 * @param {boolean} [opts.isForm=false] Si `body` es un FormData (no se serializa ni se manda Content-Type JSON).
 * @returns {Promise<*>} El JSON parseado de la respuesta, o `null` si es 204 o vacia.
 * @throws {ApiError} Si la respuesta HTTP no es `ok`.
 */
async function request(path, { method = 'GET', body, isForm = false } = {}) {
  const headers = {};
  if (!isForm) headers['Content-Type'] = 'application/json';
  if (method !== 'GET') headers['X-WP-Nonce'] = NONCE;

  const res = await fetch(BASE + path.replace(/^\//, ''), {
    method,
    credentials: 'include',
    headers,
    body: body === undefined ? undefined : (isForm ? body : JSON.stringify(body)),
  });

  if (res.status === 204) return null;

  let data = null;
  try { data = await res.json(); } catch { /* respuesta vacia o no-JSON */ }

  if (!res.ok) {
    throw new ApiError((data && data.message) || `Error ${res.status}`, res.status);
  }
  return data;
}

/**
 * Cliente REST del plugin, un metodo por endpoint de `pmi/v1/`. Todos
 * devuelven la Promise de `request()` (JSON parseado o `null`); los que
 * escriben datos usan el nonce de WordPress automaticamente via `request`.
 */
export const api = {
  // ---- Usuarios ----
  /**
   * `POST pmi/v1/login`. Inicia sesion con correo y contrasena.
   * @param {string} Correo
   * @param {string} Contrasena
   * @returns {Promise<Object>} Datos del usuario autenticado.
   */
  login: (Correo, Contrasena) => request('login', { method: 'POST', body: { Correo, Contrasena } }),
  /**
   * `POST pmi/v1/logout`. Cierra la sesion actual en el backend.
   * @returns {Promise<*>}
   */
  logout: () => request('logout', { method: 'POST' }),
  /**
   * `GET pmi/v1/users`. Lista todos los usuarios.
   * @returns {Promise<Array<Object>>}
   */
  getUsers: () => request('users'),
  /**
   * `GET pmi/v1/users/{correo}`. Obtiene un usuario por correo.
   * @param {string} correo
   * @returns {Promise<Object>}
   */
  getUser: (correo) => request(`users/${encodeSegment(correo)}`),
  /**
   * `POST pmi/v1/users`. Crea un usuario.
   * @param {Object} payload Datos del nuevo usuario.
   * @returns {Promise<Object>} Usuario creado.
   */
  createUser: (payload) => request('users', { method: 'POST', body: payload }),
  /**
   * `PUT pmi/v1/users/{correo}`. Actualiza campos de un usuario existente.
   * @param {string} correo
   * @param {Object} payload Campos a actualizar.
   * @returns {Promise<Object>}
   */
  updateUser: (correo, payload) => request(`users/${encodeSegment(correo)}`, { method: 'PUT', body: payload }),
  /**
   * `DELETE pmi/v1/users/{correo}`. Elimina un usuario.
   * @param {string} correo
   * @returns {Promise<*>}
   */
  deleteUser: (correo) => request(`users/${encodeSegment(correo)}`, { method: 'DELETE' }),

  // ---- Recursos ----
  /**
   * `GET pmi/v1/resources`. Lista todos los recursos del catalogo.
   * @returns {Promise<Array<Object>>}
   */
  getResources: () => request('resources'),
  /**
   * `GET pmi/v1/resources/{id}`. Obtiene un recurso por id.
   * @param {string} id idRecurso.
   * @returns {Promise<Object>}
   */
  getResource: (id) => request(`resources/${encodeSegment(id)}`),
  /**
   * `POST pmi/v1/resources`. Crea un recurso (multipart, incluye imagen opcional).
   * @param {FormData} formData
   * @returns {Promise<Object>} Recurso creado.
   */
  createResource: (formData) => request('resources', { method: 'POST', body: formData, isForm: true }),
  /**
   * `PUT pmi/v1/resources/{id}`. Actualiza un recurso (multipart).
   * @param {string} id idRecurso.
   * @param {FormData} formData
   * @returns {Promise<Object>}
   */
  updateResource: (id, formData) => request(`resources/${encodeSegment(id)}`, { method: 'PUT', body: formData, isForm: true }),
  /**
   * `DELETE pmi/v1/resources/{id}`. Elimina un recurso.
   * @param {string} id idRecurso.
   * @returns {Promise<*>}
   */
  deleteResource: (id) => request(`resources/${encodeSegment(id)}`, { method: 'DELETE' }),
  /**
   * Construye (sin llamar a `request`) la URL publica de la imagen de un recurso.
   * `GET pmi/v1/resources/{id}/imagen`.
   * @param {string} id idRecurso.
   * @returns {string} URL absoluta de la imagen.
   */
  resourceImageUrl: (id) => BASE + `resources/${encodeSegment(id)}/imagen`,

  // ---- Prestamos ----
  /**
   * `GET pmi/v1/loans`. Lista todos los prestamos.
   * @returns {Promise<Array<Object>>}
   */
  getLoans: () => request('loans'),
  /**
   * `GET pmi/v1/loans/{id}`. Obtiene un prestamo por id.
   * @param {number} id idPrestamo.
   * @returns {Promise<Object>}
   */
  getLoan: (id) => request(`loans/${id}`),
  /**
   * `POST pmi/v1/loans`. Crea un prestamo.
   * @param {Object} payload Datos del prestamo.
   * @returns {Promise<Object>} Prestamo creado (incluye idPrestamo).
   */
  createLoan: (payload) => request('loans', { method: 'POST', body: payload }),
  /**
   * `PUT pmi/v1/loans/{id}`. Actualiza campos de un prestamo (ej. marcar entregado).
   * @param {number} id idPrestamo.
   * @param {Object} payload Campos a actualizar.
   * @returns {Promise<Object>}
   */
  updateLoan: (id, payload) => request(`loans/${id}`, { method: 'PUT', body: payload }),
  /**
   * `DELETE pmi/v1/loans/{id}`. Elimina un prestamo.
   * @param {number} id idPrestamo.
   * @returns {Promise<*>}
   */
  deleteLoan: (id) => request(`loans/${id}`, { method: 'DELETE' }),

  // ---- Detalles ----
  /**
   * `GET pmi/v1/loans/alldetails`. Trae los detalles (recurso + cantidad) de todos los prestamos, en una sola llamada.
   * @returns {Promise<Array<Object>>}
   */
  getAllDetails: () => request('loans/alldetails'),
  /**
   * `GET pmi/v1/loans/{id}/details`. Detalles de un prestamo especifico;
   * si el backend responde 404 (sin detalles), devuelve `[]` en vez de rechazar.
   * @param {number} id idPrestamo.
   * @returns {Promise<Array<Object>>}
   */
  getLoanDetails: (id) => request(`loans/${id}/details`).catch((e) => (e.status === 404 ? [] : Promise.reject(e))),
  /**
   * `POST pmi/v1/loans/{id}/details`. Agrega el detalle de recursos (con cantidades) de un prestamo.
   * @param {number} id idPrestamo.
   * @param {Array<{id: string, cantidad: number}>} recursos
   * @returns {Promise<*>}
   */
  addLoanDetails: (id, recursos) => request(`loans/${id}/details`, { method: 'POST', body: { recurso: recursos } }),

  // ---- Busqueda ----
  /**
   * `GET pmi/v1/admin/baneados`. Lista usuarios baneados; si el backend
   * responde 404, devuelve `[]` en vez de rechazar.
   * @returns {Promise<Array<Object>>}
   */
  searchByBan: () => request('admin/baneados').catch((e) => (e.status === 404 ? [] : Promise.reject(e))),
};

export { ApiError };
