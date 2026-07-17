// Cliente del REST API del plugin (pmi/v1). Equivalente a los fetch("/api/...")
// del frontend original, adaptado a rest_url('pmi/v1/') + nonce de WordPress.

const BASE = (window.PMI_CONFIG && window.PMI_CONFIG.restUrl) || '/wp-json/pmi/v1/';
const NONCE = (window.PMI_CONFIG && window.PMI_CONFIG.nonce) || '';

// encodeURIComponent() escapa "@" como %40, y el enrutamiento de la REST
// API de WordPress en este sitio (nginx + WP rewrite) no lo decodifica de
// vuelta de forma confiable, asi que /users/{correo}%40... termina dando
// 404 "Usuario no encontrado". "@" es un caracter valido sin escapar dentro
// de un segmento de ruta (RFC 3986 pchar), asi que lo dejamos literal.
function encodeSegment(v) {
  return encodeURIComponent(v).replace(/%40/g, '@');
}

class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

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

export const api = {
  // ---- Usuarios ----
  login: (Correo, Contrasena) => request('login', { method: 'POST', body: { Correo, Contrasena } }),
  logout: () => request('logout', { method: 'POST' }),
  getUsers: () => request('users'),
  getUser: (correo) => request(`users/${encodeSegment(correo)}`),
  createUser: (payload) => request('users', { method: 'POST', body: payload }),
  updateUser: (correo, payload) => request(`users/${encodeSegment(correo)}`, { method: 'PUT', body: payload }),
  deleteUser: (correo) => request(`users/${encodeSegment(correo)}`, { method: 'DELETE' }),

  // ---- Recursos ----
  getResources: () => request('resources'),
  getResource: (id) => request(`resources/${encodeURIComponent(id)}`),
  createResource: (formData) => request('resources', { method: 'POST', body: formData, isForm: true }),
  updateResource: (id, formData) => request(`resources/${encodeURIComponent(id)}`, { method: 'PUT', body: formData, isForm: true }),
  deleteResource: (id) => request(`resources/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  resourceImageUrl: (id) => BASE + `resources/${encodeURIComponent(id)}/imagen`,

  // ---- Prestamos ----
  getLoans: () => request('loans'),
  getLoan: (id) => request(`loans/${id}`),
  createLoan: (payload) => request('loans', { method: 'POST', body: payload }),
  updateLoan: (id, payload) => request(`loans/${id}`, { method: 'PUT', body: payload }),
  deleteLoan: (id) => request(`loans/${id}`, { method: 'DELETE' }),

  // ---- Detalles ----
  getAllDetails: () => request('loans/alldetails'),
  getLoanDetails: (id) => request(`loans/${id}/details`).catch((e) => (e.status === 404 ? [] : Promise.reject(e))),
  addLoanDetails: (id, recursos) => request(`loans/${id}/details`, { method: 'POST', body: { recurso: recursos } }),

  // ---- Busqueda ----
  searchByBan: () => request('admin/baneados').catch((e) => (e.status === 404 ? [] : Promise.reject(e))),
};

export { ApiError };
