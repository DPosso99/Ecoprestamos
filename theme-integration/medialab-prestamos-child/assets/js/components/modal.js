// Modal generico (backdrop + panel). Equivalente simplificado de components/Modal.tsx
// (sin trampa de foco ni animaciones, pero con cierre por ESC/backdrop).

let current = null;

export function openModal({ title, bodyHtml, footerHtml = '', onMount }) {
  closeModal();

  const backdrop = document.createElement('div');
  backdrop.className = 'pmi-modal-backdrop';
  backdrop.innerHTML = `
    <div class="pmi-modal" role="dialog" aria-modal="true">
      <div class="pmi-modal-head">
        <div class="pmi-title pmi-truncate">${title}</div>
        <button type="button" class="ui-btn ui-btn-ghost ui-btn-sm" id="pmi-modal-close">&times;</button>
      </div>
      <div class="pmi-modal-body">${bodyHtml}</div>
      ${footerHtml ? `<div class="pmi-modal-foot">${footerHtml}</div>` : ''}
    </div>
  `;

  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) closeModal();
  });
  backdrop.querySelector('#pmi-modal-close').addEventListener('click', closeModal);

  const onKey = (e) => { if (e.key === 'Escape') closeModal(); };
  document.addEventListener('keydown', onKey);

  document.body.appendChild(backdrop);
  document.body.style.overflow = 'hidden';

  current = { backdrop, onKey };
  if (onMount) onMount(backdrop.querySelector('.pmi-modal'));

  return backdrop;
}

export function closeModal() {
  if (!current) return;
  document.removeEventListener('keydown', current.onKey);
  current.backdrop.remove();
  document.body.style.overflow = '';
  current = null;
}
