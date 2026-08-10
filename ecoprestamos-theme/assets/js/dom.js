// Helpers pequenos usados por todas las vistas.

export function h(strings, ...values) {
  return strings.reduce((out, str, i) => out + str + (i < values.length ? String(values[i]) : ''), '');
}

export function escapeHtml(v) {
  return String(v ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

export function fmtDT(val) {
  if (!val) return '—';
  const d = new Date(String(val).replace(' ', 'T'));
  if (isNaN(d.getTime())) return String(val);
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} - ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function todayISO() {
  const t = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}`;
}

export function navigate(path) {
  window.location.hash = path;
}

export function qs(params) {
  const sp = new URLSearchParams(params);
  const s = sp.toString();
  return s ? `?${s}` : '';
}
