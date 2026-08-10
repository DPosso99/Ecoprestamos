import { store } from '../state.js';
import { escapeHtml, fmtDT, navigate } from '../dom.js';

const MAX_ITEMS = 6;

function sectionHtml(title, items, emptyText, pillCls, dotCls, pillText) {
  const sliced = items.slice(0, MAX_ITEMS);
  const hasMore = items.length > MAX_ITEMS;
  return `
    <div class="ui-card" style="overflow:hidden;">
      <div style="padding:16px 24px;border-bottom:1px solid var(--eafit-border);" class="pmi-title">${title}</div>
      ${items.length === 0 ? `<div class="pmi-empty"><div class="pmi-text-sm pmi-muted">${emptyText}</div></div>` : `
        <div style="max-height:420px;overflow:auto;">
          ${sliced.map((p) => `
            <button type="button" data-open="${p.idPrestamo}" style="width:100%;text-align:left;padding:16px 24px;border:none;border-top:1px solid var(--eafit-border);background:none;cursor:pointer;font-family:inherit;">
              <div class="pmi-flex pmi-justify-between pmi-items-start pmi-gap-4">
                <div>
                  <div class="pmi-title">Prestamo #${p.idPrestamo}</div>
                  <div class="pmi-text-sm pmi-muted" style="margin-top:4px;">${escapeHtml(p.usuario_solicitante)} &middot; ${fmtDT(p.Fecha_prestamo)}</div>
                </div>
                <span class="pmi-pill ${pillCls}"><span class="pmi-dot ${dotCls}"></span>${pillText}</span>
              </div>
            </button>
          `).join('')}
        </div>
        ${hasMore ? `<div style="padding:12px 24px;border-top:1px solid var(--eafit-border);"><button class="ui-btn ui-btn-ghost ui-btn-sm" data-viewall>Ver ${items.length - MAX_ITEMS} mas &rarr;</button></div>` : ''}
      `}
    </div>
  `;
}

export async function renderOpsDashboard(root) {
  await store.loans.reload();
  const pendientes = store.loans.prestamos.filter((p) => p.Entregado === 0);
  const entregados = store.loans.prestamos.filter((p) => p.Entregado === 1);

  root.innerHTML = `
    <div class="pmi-flex pmi-justify-between pmi-items-start pmi-gap-4" style="flex-wrap:wrap;">
      <div>
        <div class="pmi-h1">Panel &middot; Trabajador</div>
        <div class="pmi-muted" style="margin-top:6px;">Resumen operativo del laboratorio.</div>
      </div>
      <div class="pmi-flex pmi-gap-2 pmi-wrap">
        <button class="ui-btn ui-btn-ghost ui-btn-sm" id="pmi-catalogo">Gestionar catalogo</button>
        <button class="ui-btn ui-btn-secondary ui-btn-sm" id="pmi-usuarios">Administrar usuarios</button>
        <button class="ui-btn ui-btn-primary ui-btn-sm" id="pmi-solicitudes">Ver solicitudes &rarr;</button>
      </div>
    </div>

    <div class="pmi-grid pmi-grid-2" style="margin-top:28px;">
      <div class="ui-card pmi-p-6">
        <div class="pmi-flex pmi-justify-between pmi-items-center"><div class="pmi-title">Pendientes de entrega</div><span class="pmi-dot pmi-dot-info"></span></div>
        <div style="font-size:32px;font-weight:700;margin-top:8px;">${pendientes.length}</div>
        <div class="pmi-text-sm pmi-muted" style="margin-top:10px;">Solicitudes listas para entregar</div>
      </div>
      <div class="ui-card pmi-p-6">
        <div class="pmi-flex pmi-justify-between pmi-items-center"><div class="pmi-title">Entregados</div><span class="pmi-dot pmi-dot-warning"></span></div>
        <div style="font-size:32px;font-weight:700;margin-top:8px;">${entregados.length}</div>
        <div class="pmi-text-sm pmi-muted" style="margin-top:10px;">Prestamos ya entregados</div>
      </div>
    </div>

    <div class="pmi-grid pmi-grid-2" style="margin-top:28px;align-items:start;">
      ${sectionHtml('Pendientes de entrega', pendientes, 'No hay entregas pendientes.', 'pmi-pill-info', 'pmi-dot-info', 'Pendiente')}
      ${sectionHtml('Entregados', entregados, 'No hay prestamos entregados.', 'pmi-pill-warning', 'pmi-dot-warning', 'Entregado')}
    </div>
  `;

  root.querySelector('#pmi-catalogo').addEventListener('click', () => navigate('/ops/catalogo'));
  root.querySelector('#pmi-usuarios').addEventListener('click', () => navigate('/ops/usuarios'));
  root.querySelector('#pmi-solicitudes').addEventListener('click', () => navigate('/ops/solicitudes'));
  root.querySelectorAll('[data-open]').forEach((btn) => btn.addEventListener('click', () => navigate(`/ops/ticket/${btn.dataset.open}`)));
  root.querySelectorAll('[data-viewall]').forEach((btn) => btn.addEventListener('click', () => navigate('/ops/solicitudes')));
}
