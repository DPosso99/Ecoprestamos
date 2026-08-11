// Estado global de la app, equivalente a los React contexts del proyecto
// original (Contexto_Autorizacion, Contexto_Catalogo, Contexto_Prestamos,
// Contexto_Usuario, Contexto_Ticket). Sin reactividad fina: cada mutacion
// dispara store.emit(), y el router vuelve a renderizar la vista actual.

import { api } from './api.js';

const LS_USER = 'medialab_user';

const listeners = new Set();
/** Notifica a todos los suscriptores del store (dispara un re-render global via el router). */
function emit() { listeners.forEach((fn) => fn()); }
/**
 * Registra una funcion a llamar cada vez que el store cambia.
 * @param {Function} fn Callback sin argumentos.
 * @returns {Function} Funcion para cancelar la suscripcion.
 */
function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }

/**
 * Parsea JSON de forma segura (usado para leer sessionStorage), devolviendo
 * un valor por defecto si `raw` es vacio o invalido.
 * @param {string|null} raw Texto JSON crudo.
 * @param {*} fallback Valor a devolver si no se puede parsear.
 * @returns {*} El valor parseado o `fallback`.
 */
function safeParse(raw, fallback) {
  if (!raw) return fallback;
  try { return JSON.parse(raw); } catch { return fallback; }
}

// =========================
// Auth
// =========================
/**
 * Sub-store de autenticacion: usuario actual (persistido en
 * sessionStorage), y las acciones de login/registro/logout.
 */
const auth = {
  user: safeParse(sessionStorage.getItem(LS_USER), null),
  /** @returns {boolean} true si hay una sesion iniciada. */
  get isAuthed() { return !!auth.user; },
  /** @returns {boolean} true si el usuario actual tiene rol Trabajador. */
  get isWorker() { return auth.user?.Rol === 'Trabajador'; },

  /**
   * Inicia sesion contra `POST pmi/v1/login`, guarda el usuario devuelto
   * en memoria y en sessionStorage, y notifica a los suscriptores.
   * @param {string} Correo
   * @param {string} Contrasena
   * @returns {Promise<void>}
   */
  async login(Correo, Contrasena) {
    const data = await api.login(Correo, Contrasena);
    auth.user = data;
    sessionStorage.setItem(LS_USER, JSON.stringify(data));
    emit();
  },

  /**
   * Registra un nuevo usuario (siempre con Rol 'Estudiante') via
   * `POST pmi/v1/users`, e inicia sesion con los datos normalizados.
   * @param {string} Correo
   * @param {string} Contrasena
   * @param {string} numero Celular con codigo de pais.
   * @param {string} Nombre
   * @returns {Promise<void>}
   */
  async register(Correo, Contrasena, numero, Nombre) {
    const data = await api.createUser({
      Correo, Contrasena, numero, Nombre,
      Rol: 'Estudiante', Baneado: 0, Trabajo: null,
    });
    auth.user = normalizeUser(data);
    sessionStorage.setItem(LS_USER, JSON.stringify(auth.user));
    emit();
  },

  /**
   * Cierra sesion: avisa al backend (`POST pmi/v1/logout`, sin bloquear si
   * falla), limpia el usuario de memoria/sessionStorage y vacia la cache
   * local de catalogo/prestamos/usuarios.
   * @returns {Promise<void>}
   */
  async logout() {
    try { await api.logout(); } catch { /* no bloquea */ }
    auth.user = null;
    sessionStorage.removeItem(LS_USER);
    catalog.recursos = [];
    loans.prestamos = [];
    users.usuarios = [];
    emit();
  },
};

/**
 * El backend devuelve columnas en snake_case (correo, nombre, rol, baneado);
 * normalizamos a las llaves que usa la UI (Correo, Nombre, Rol, Baneado).
 * @param {Object} row Fila cruda del backend.
 * @returns {Object} Usuario normalizado.
 */
function normalizeUser(row) {
  return {
    Correo: row.Correo ?? row.correo,
    Nombre: row.Nombre ?? row.nombre,
    Rol: row.Rol ?? row.rol,
    Baneado: Number(row.Baneado ?? row.baneado ?? 0),
    numero: row.numero,
    Trabajo: row.Trabajo ?? row.trabajo ?? null,
  };
}

// =========================
// Catalogo (recursos)
// =========================
/**
 * Sub-store del catalogo de recursos: lista normalizada de recursos,
 * flag de carga, y helpers de recarga/consulta.
 */
const catalog = {
  recursos: [],
  loading: false,

  /**
   * Recarga el catalogo completo desde `GET pmi/v1/resources`, normaliza
   * cada fila y notifica a los suscriptores antes y despues (para que la UI
   * pueda mostrar el estado de carga). En error, deja `recursos` vacio.
   * @returns {Promise<void>}
   */
  async reload() {
    catalog.loading = true; emit();
    try {
      const rows = await api.getResources();
      catalog.recursos = (Array.isArray(rows) ? rows : []).map(normalizeResource);
    } catch (e) {
      console.error('[catalog]', e);
      catalog.recursos = [];
    } finally {
      catalog.loading = false; emit();
    }
  },

  /**
   * @param {string} id idRecurso a buscar.
   * @returns {Object|undefined} El recurso con ese id, si existe en cache.
   */
  getById(id) { return catalog.recursos.find((r) => r.idRecurso === id); },
};

/**
 * Normaliza una fila cruda de recurso (snake_case del backend) a las
 * llaves usadas por la UI, y agrega la URL de su imagen.
 * @param {Object} row Fila cruda del backend.
 * @returns {Object} Recurso normalizado.
 */
function normalizeResource(row) {
  const idRecurso = row.idRecurso ?? row.id_recurso;
  return {
    idRecurso,
    Nombre: row.Nombre ?? row.nombre,
    Ubicacion: row.Ubicacion ?? row.ubicacion,
    Estado: row.Estado ?? row.estado,
    Dia_compra: row.Dia_compra ?? row.dia_compra ?? null,
    Tipo: row.Tipo ?? row.tipo,
    Cantidad_total: row.Cantidad_total ?? row.cantidad_total ?? null,
    Cantidad_disponible: row.Cantidad_disponible ?? row.cantidad_disponible ?? null,
    activo: row.activo ?? 'N/A',
    imagenUrl: api.resourceImageUrl(idRecurso),
  };
}

// =========================
// Prestamos
// =========================
/**
 * Sub-store de prestamos: lista normalizada de prestamos, mapa de detalles
 * por prestamo (para mostrar los recursos sin una llamada extra por fila),
 * y las acciones de creacion/entrega.
 */
const loans = {
  prestamos: [],
  detailsMap: {},
  loading: false,

  /**
   * Recarga la lista de prestamos desde `GET pmi/v1/loans`, los normaliza,
   * y de paso refresca `detailsMap` con `reloadDetails()`.
   * @returns {Promise<void>}
   */
  async reload() {
    loans.loading = true; emit();
    try {
      const rows = await api.getLoans();
      loans.prestamos = (Array.isArray(rows) ? rows : []).map(normalizeLoan);
    } catch (e) {
      console.error('[loans]', e);
      loans.prestamos = [];
    } finally {
      loans.loading = false;
    }
    await loans.reloadDetails();
    emit();
  },

  /**
   * Trae de una vez los detalles (recursos + cantidad) de todos los
   * prestamos via `GET pmi/v1/loans/alldetails`, y arma `detailsMap`
   * (idPrestamo -> string[] "Nombre ×cantidad") para listados rapidos.
   * @returns {Promise<void>}
   */
  async reloadDetails() {
    try {
      const rows = await api.getAllDetails();
      const map = {};
      for (const r of (rows || [])) {
        if (!map[r.prestamo_id]) map[r.prestamo_id] = [];
        map[r.prestamo_id].push(`${r.Nombre} ×${r.cantidad_prestada ?? 1}`);
      }
      loans.detailsMap = map;
    } catch { /* no bloquea */ }
  },

  /**
   * @param {number} id idPrestamo a buscar.
   * @returns {Object|undefined} El prestamo con ese id, si existe en cache.
   */
  getPrestamo(id) { return loans.prestamos.find((p) => p.idPrestamo === id); },

  /**
   * Detalle completo (con cantidad) de un prestamo especifico, para las
   * pantallas de detalle (estudiante y trabajador).
   * @param {number} id idPrestamo.
   * @returns {Promise<Array<Object>>} Items del prestamo, o `[]` si falla la consulta.
   */
  async getLoanDetailItems(id) {
    try {
      const rows = await api.getLoanDetails(id);
      return (rows || []).map((r) => ({
        recursoId: r.recurso_id,
        nombre: r.Nombre,
        tipo: r.Tipo,
        ubicacion: r.Ubicacion,
        estado: r.Estado,
        cantidad: r.cantidad_prestada ?? 1,
      }));
    } catch {
      return [];
    }
  },

  /**
   * Crea una solicitud de prestamo (`POST pmi/v1/loans`) y, si trae
   * recursos, sus detalles (`POST pmi/v1/loans/:id/details`). Al final
   * recarga prestamos y catalogo para reflejar la disponibilidad nueva.
   * @param {Object} datos
   * @param {string|null} datos.Notas
   * @param {string} datos.Fecha_prestamo Fecha/hora ISO local del prestamo.
   * @param {string} datos.usuario_solicitante Correo del solicitante.
   * @param {string} datos.usuario_responsable Correo del trabajador responsable.
   * @param {Array<{id: string, cantidad: number}>} datos.recursos
   * @returns {Promise<number>} El idPrestamo creado.
   */
  async crearPrestamo({ Notas, Fecha_prestamo, usuario_solicitante, usuario_responsable, recursos }) {
    const data = await api.createLoan({
      Notas, Fecha_prestamo, Hora_entrega: null, Entregado: 0,
      usuario_solicitante, usuario_responsable,
    });
    const idPrestamo = data.idPrestamo;
    if (recursos.length > 0) {
      await api.addLoanDetails(idPrestamo, recursos);
    }
    await loans.reload();
    await catalog.reload();
    return idPrestamo;
  },

  /**
   * Marca un prestamo como entregado (`PUT pmi/v1/loans/:id`) con la hora
   * actual, y recarga prestamos y catalogo.
   * @param {number} idPrestamo
   * @returns {Promise<void>}
   */
  async marcarEntregado(idPrestamo) {
    await api.updateLoan(idPrestamo, { Entregado: 1, Hora_entrega: localDateTimeISO() });
    await loans.reload();
    await catalog.reload();
  },
};

/**
 * Normaliza una fila cruda de prestamo (snake_case del backend) a las
 * llaves usadas por la UI.
 * @param {Object} row Fila cruda del backend.
 * @returns {Object} Prestamo normalizado.
 */
function normalizeLoan(row) {
  return {
    idPrestamo: Number(row.idPrestamo ?? row.id_prestamo),
    Notas: row.Notas ?? row.notas,
    Fecha_prestamo: row.Fecha_prestamo ?? row.fecha_prestamo,
    Hora_entrega: row.Hora_entrega ?? row.hora_entrega,
    Entregado: Number(row.Entregado ?? row.entregado ?? 0),
    usuario_solicitante: row.usuario_solicitante,
    usuario_responsable: row.usuario_responsable,
  };
}

/**
 * Formatea una fecha local (sin conversion a UTC) como `YYYY-MM-DDTHH:mm:ss`,
 * usado para registrar la hora de entrega tal como la ve el trabajador.
 * @param {Date} [date] Fecha a formatear (por defecto, ahora).
 * @returns {string} Fecha/hora en formato ISO local.
 */
function localDateTimeISO(date = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

// =========================
// Usuarios
// =========================
/**
 * Sub-store de usuarios: lista normalizada de usuarios y helpers de
 * recarga/consulta, usado por las vistas de administracion (ops-usuarios)
 * y por selects de responsable/trabajador en otras vistas.
 */
const users = {
  usuarios: [],
  loading: false,

  /**
   * Recarga la lista de usuarios desde `GET pmi/v1/users` y la normaliza.
   * @returns {Promise<void>}
   */
  async reload() {
    users.loading = true; emit();
    try {
      const rows = await api.getUsers();
      users.usuarios = (Array.isArray(rows) ? rows : []).map(normalizeUser);
    } catch (e) {
      console.error('[users]', e);
      users.usuarios = [];
    } finally {
      users.loading = false; emit();
    }
  },

  /**
   * @param {string} correo Correo a buscar.
   * @returns {Object|undefined} El usuario con ese correo, si existe en cache.
   */
  getByCorreo(correo) { return users.usuarios.find((u) => u.Correo === correo); },
};

// =========================
// Ticket (borrador de solicitud)
// =========================
/** @returns {Object} Estado inicial (vacio) del borrador de solicitud. */
const initialDraft = () => ({
  selectedIds: [],
  quantities: {},
  fechaPrestamo: undefined,
  horaPrestamo: undefined,
  Notas: '',
  responsableCorreo: undefined,
  responsableNombre: undefined,
  acceptCampusRule: false,
  acceptTerms: false,
});

/**
 * Sub-store del "ticket": el borrador de solicitud de prestamo que se va
 * armando entre el catalogo y el flujo de nueva-solicitud (recursos
 * seleccionados, cantidades, fecha/hora, responsable, aceptacion de
 * condiciones). No pega al backend; solo mantiene estado local en memoria.
 */
const ticket = {
  draft: initialDraft(),

  /**
   * Agrega o quita un recurso del borrador. Si se agrega, inicializa su
   * cantidad en 1; si se quita, borra su cantidad. `opts.canAdd === false`
   * bloquea el agregado (ej. recurso no disponible).
   * @param {string} id idRecurso.
   * @param {{ canAdd?: boolean }} [opts]
   */
  toggleSelectedId(id, opts = {}) {
    const has = ticket.draft.selectedIds.includes(id);
    if (has) {
      ticket.draft.selectedIds = ticket.draft.selectedIds.filter((x) => x !== id);
      delete ticket.draft.quantities[id];
    } else {
      if (opts.canAdd === false) return;
      ticket.draft.selectedIds = [...ticket.draft.selectedIds, id];
      ticket.draft.quantities[id] = 1;
    }
    emit();
  },

  /**
   * Actualiza la cantidad solicitada de un recurso ya seleccionado
   * (no-op si el recurso no esta en el borrador). El valor se redondea y
   * se limita a un minimo de 1.
   * @param {string} id idRecurso.
   * @param {number} qty Cantidad deseada.
   */
  setQuantity(id, qty) {
    if (!ticket.draft.selectedIds.includes(id)) return;
    ticket.draft.quantities[id] = Math.max(1, Math.round(qty));
    emit();
  },

  /**
   * Quita un recurso del borrador (equivalente a `toggleSelectedId` cuando
   * ya esta seleccionado, expuesto aparte para el boton "Quitar").
   * @param {string} id idRecurso.
   */
  removeSelected(id) {
    ticket.draft.selectedIds = ticket.draft.selectedIds.filter((x) => x !== id);
    delete ticket.draft.quantities[id];
    emit();
  },

  /** @param {string|undefined} d Fecha (YYYY-MM-DD) del prestamo. */
  setFechaPrestamo(d) { ticket.draft.fechaPrestamo = d || undefined; },
  /** @param {string|undefined} t Hora (HH:mm) del prestamo. */
  setHoraPrestamo(t) { ticket.draft.horaPrestamo = t || undefined; emit(); },
  /** @param {string} n Notas libres de la solicitud. */
  setNotas(n) { ticket.draft.Notas = n ?? ''; },
  /** @param {boolean} v Acepta que los recursos no salen del campus. */
  setAcceptCampusRule(v) { ticket.draft.acceptCampusRule = v; emit(); },
  /** @param {boolean} v Acepta las condiciones del prestamo. */
  setAcceptTerms(v) { ticket.draft.acceptTerms = v; emit(); },
  /**
   * Fija el trabajador responsable elegido para la solicitud.
   * @param {string|undefined} correo
   * @param {string|undefined} nombre
   */
  setResponsable(correo, nombre) { ticket.draft.responsableCorreo = correo; ticket.draft.responsableNombre = nombre; emit(); },
  /** Reinicia el borrador a su estado vacio (tras enviar o cancelar la solicitud). */
  clear() { ticket.draft = initialDraft(); emit(); },
};

/**
 * Store global de la app: agrupa los sub-stores de dominio (auth, catalog,
 * loans, users, ticket) junto con `subscribe`/`emit` para que las vistas
 * (o el router) puedan reaccionar a cambios de estado.
 */
export const store = { auth, catalog, loans, users, ticket, subscribe, emit };
