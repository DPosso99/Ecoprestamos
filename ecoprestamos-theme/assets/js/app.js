import { startRouter } from './router.js';

/**
 * Punto de entrada de la SPA: arranca el router en cuanto el DOM está listo.
 * Si el documento ya fue parseado (readyState interactivo o completo),
 * arranca de inmediato sin esperar el evento DOMContentLoaded.
 */
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', startRouter);
} else {
  startRouter();
}
