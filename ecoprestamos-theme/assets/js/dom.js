// Helpers pequenos usados por todas las vistas.

/**
 * Tagged template helper para armar HTML por concatenacion simple
 * (sin escapar nada por si mismo: usar junto a `escapeHtml` para valores
 * que vengan de datos del usuario).
 * @param {TemplateStringsArray} strings
 * @param {...*} values
 * @returns {string} El HTML resultante.
 */
export function h(strings, ...values) {
  return strings.reduce((out, str, i) => out + str + (i < values.length ? String(values[i]) : ''), '');
}

/**
 * Escapa caracteres especiales de HTML para insertar valores dinamicos de
 * forma segura dentro de template strings.
 * @param {*} v Valor a escapar (se castea a string; `null`/`undefined` -> '').
 * @returns {string} Texto seguro para HTML.
 */
export function escapeHtml(v) {
  return String(v ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

/**
 * Formatea una fecha/hora (string del backend, ej. "YYYY-MM-DD HH:mm:ss")
 * como "DD/MM/YYYY - HH:mm" para mostrar en la UI.
 * @param {string|number|Date|null|undefined} val Valor de fecha a formatear.
 * @returns {string} Fecha formateada, el valor original si no es parseable, o "—" si esta vacio.
 */
export function fmtDT(val) {
  if (!val) return '—';
  const d = new Date(String(val).replace(' ', 'T'));
  if (isNaN(d.getTime())) return String(val);
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} - ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * @returns {string} La fecha de hoy en formato `YYYY-MM-DD` (hora local).
 */
export function todayISO() {
  const t = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}`;
}

/**
 * Navega a otra ruta de la SPA cambiando el hash de la URL (dispara el router).
 * @param {string} path Ruta destino (ej. "/catalogo").
 */
export function navigate(path) {
  window.location.hash = path;
}

/**
 * Serializa un objeto de parametros como query string, incluyendo el "?".
 * @param {Object} params
 * @returns {string} Query string (ej. "?q=foo"), o "" si no hay parametros.
 */
export function qs(params) {
  const sp = new URLSearchParams(params);
  const s = sp.toString();
  return s ? `?${s}` : '';
}

/**
 * Preloader generico (spinner + mensaje) para mostrar mientras se espera
 * una carga de datos, en vez de dejar la pantalla en blanco. `fullscreen`
 * lo centra en toda la ventana (para cuando todavia no hay ni topbar);
 * si es false, ocupa solo el contenedor donde se inserte.
 */
export function loaderHtml(message, fullscreen = true) {
  return `
    <div class="pmi-loader ${fullscreen ? 'pmi-loader-fullscreen' : ''}">
      <div class="pmi-spinner"></div>
      <div class="pmi-muted pmi-text-sm" style="margin-top:14px;">${escapeHtml(message)}</div>
    </div>
  `;
}
