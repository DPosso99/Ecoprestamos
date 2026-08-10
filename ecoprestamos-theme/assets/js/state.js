// Estado global de la app, equivalente a los React contexts del proyecto
// original (Contexto_Autorizacion, Contexto_Catalogo, Contexto_Prestamos,
// Contexto_Usuario, Contexto_Ticket). Sin reactividad fina: cada mutacion
// dispara store.emit(), y el router vuelve a renderizar la vista actual.

import { api } from './api.js';

const LS_USER = 'medialab_user';

const listeners = new Set();
function emit() { listeners.forEach((fn) => fn()); }
function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }

function safeParse(raw, fallback) {
  if (!raw) return fallback;
  try { return JSON.parse(raw); } catch { return fallback; }
}

// =========================
// Auth
// =========================
const auth = {
  user: safeParse(sessionStorage.getItem(LS_USER), null),
  get isAuthed() { return !!auth.user; },
  get isWorker() { return auth.user?.Rol === 'Trabajador'; },

  async login(Correo, Contrasena) {
    const data = await api.login(Correo, Contrasena);
    auth.user = data;
    sessionStorage.setItem(LS_USER, JSON.stringify(data));
    emit();
  },

  async register(Correo, Contrasena, numero, Nombre) {
    const data = await api.createUser({
      Correo, Contrasena, numero, Nombre,
      Rol: 'Estudiante', Baneado: 0, Trabajo: null,
    });
    auth.user = normalizeUser(data);
    sessionStorage.setItem(LS_USER, JSON.stringify(auth.user));
    emit();
  },

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

// El backend devuelve columnas en snake_case (correo, nombre, rol, baneado);
// normalizamos a las llaves que usa la UI (Correo, Nombre, Rol, Baneado).
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
const catalog = {
  recursos: [],
  loading: false,

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

  getById(id) { return catalog.recursos.find((r) => r.idRecurso === id); },
};

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
const loans = {
  prestamos: [],
  detailsMap: {},
  loading: false,

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

  getPrestamo(id) { return loans.prestamos.find((p) => p.idPrestamo === id); },

  /** Detalle completo (con cantidad) de un prestamo especifico, para las
   * pantallas de detalle (estudiante y trabajador). */
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

  async marcarEntregado(idPrestamo) {
    await api.updateLoan(idPrestamo, { Entregado: 1, Hora_entrega: localDateTimeISO() });
    await loans.reload();
    await catalog.reload();
  },
};

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

function localDateTimeISO(date = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

// =========================
// Usuarios
// =========================
const users = {
  usuarios: [],
  loading: false,

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

  getByCorreo(correo) { return users.usuarios.find((u) => u.Correo === correo); },
};

// =========================
// Ticket (borrador de solicitud)
// =========================
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

const ticket = {
  draft: initialDraft(),

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

  setQuantity(id, qty) {
    if (!ticket.draft.selectedIds.includes(id)) return;
    ticket.draft.quantities[id] = Math.max(1, Math.round(qty));
    emit();
  },

  removeSelected(id) {
    ticket.draft.selectedIds = ticket.draft.selectedIds.filter((x) => x !== id);
    delete ticket.draft.quantities[id];
    emit();
  },

  setFechaPrestamo(d) { ticket.draft.fechaPrestamo = d || undefined; },
  setHoraPrestamo(t) { ticket.draft.horaPrestamo = t || undefined; emit(); },
  setNotas(n) { ticket.draft.Notas = n ?? ''; },
  setAcceptCampusRule(v) { ticket.draft.acceptCampusRule = v; emit(); },
  setAcceptTerms(v) { ticket.draft.acceptTerms = v; emit(); },
  setResponsable(correo, nombre) { ticket.draft.responsableCorreo = correo; ticket.draft.responsableNombre = nombre; emit(); },
  clear() { ticket.draft = initialDraft(); emit(); },
};

export const store = { auth, catalog, loans, users, ticket, subscribe, emit };
