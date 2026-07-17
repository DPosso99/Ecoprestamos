import { store } from '../state.js';
import { escapeHtml, navigate } from '../dom.js';

const isEafitEmail = (email) => /^[^\s@]+@eafit\.edu\.co$/i.test(email.trim());

export async function renderLogin(root) {
  let tab = 'login';

  function html() {
    return `
      <div class="pmi-auth-shell">
        <div class="pmi-auth-box">
          <div style="text-align:center; margin-bottom:16px;">
            <div class="pmi-h1">Medialab</div>
            <div class="pmi-muted pmi-text-sm">Sistema de prestamos</div>
          </div>

          <div class="ui-card pmi-p-8">
            <h1 class="pmi-h2" style="text-align:center;">${tab === 'login' ? 'Iniciar sesion' : 'Crear cuenta'}</h1>
            ${tab === 'register' ? '<p class="pmi-muted pmi-text-sm" style="text-align:center;margin-top:6px;">Registrate con tu correo @eafit.edu.co.</p>' : ''}

            <div class="pmi-tabs" style="margin-top:20px;">
              <button type="button" class="pmi-tab ${tab === 'login' ? 'is-active' : ''}" data-tab="login">Ingresar</button>
              <button type="button" class="pmi-tab ${tab === 'register' ? 'is-active' : ''}" data-tab="register">Registrarse</button>
            </div>

            <div id="pmi-auth-form" style="margin-top:20px;"></div>
          </div>
        </div>
      </div>
    `;
  }

  function loginFormHtml(error, loading) {
    return `
      <form id="pmi-login-form" class="pmi-flex-col pmi-gap-4">
        <label class="pmi-field">
          <span class="pmi-label">Correo</span>
          <input class="ui-input" type="text" name="Correo" placeholder="Correo institucional" required autocomplete="username" />
        </label>
        <label class="pmi-field">
          <span class="pmi-label">Contrasena</span>
          <input class="ui-input" type="password" name="Contrasena" placeholder="********" required autocomplete="current-password" />
        </label>
        ${error ? `<div class="pmi-alert pmi-alert-danger">${escapeHtml(error)}</div>` : ''}
        <button type="submit" class="ui-btn ui-btn-primary ui-btn-block ui-btn-lg" ${loading ? 'disabled' : ''}>${loading ? 'Entrando...' : 'Entrar'}</button>
      </form>
    `;
  }

  function registerFormHtml(errors, error, loading) {
    const fieldError = (k) => errors[k] ? `<p class="pmi-field-error">${escapeHtml(errors[k])}</p>` : '';
    return `
      <form id="pmi-register-form" class="pmi-flex-col pmi-gap-4">
        <label class="pmi-field">
          <span class="pmi-label">Correo</span>
          <input class="ui-input ${errors.Correo ? 'ui-input-error' : ''}" type="email" name="Correo" placeholder="Correo institucional" autocomplete="username" />
          ${fieldError('Correo')}
        </label>
        <label class="pmi-field">
          <span class="pmi-label">Nombre completo</span>
          <input class="ui-input ${errors.Nombre ? 'ui-input-error' : ''}" type="text" name="Nombre" placeholder="Nombre y apellidos" autocomplete="name" />
          ${fieldError('Nombre')}
        </label>
        <label class="pmi-field">
          <span class="pmi-label">Celular</span>
          <input class="ui-input ${errors.numero ? 'ui-input-error' : ''}" type="tel" name="numero" placeholder="Numero celular" autocomplete="tel" />
          ${fieldError('numero')}
        </label>
        <label class="pmi-field">
          <span class="pmi-label">Contrasena</span>
          <input class="ui-input ${errors.Contrasena ? 'ui-input-error' : ''}" type="password" name="Contrasena" placeholder="Minimo 8 caracteres" autocomplete="new-password" />
          ${fieldError('Contrasena')}
        </label>
        ${error ? `<div class="pmi-alert pmi-alert-danger">${escapeHtml(error)}</div>` : ''}
        <button type="submit" class="ui-btn ui-btn-primary ui-btn-block ui-btn-lg" ${loading ? 'disabled' : ''}>${loading ? 'Creando cuenta...' : 'Crear cuenta'}</button>
      </form>
    `;
  }

  function mountForm() {
    const slot = root.querySelector('#pmi-auth-form');
    if (tab === 'login') {
      slot.innerHTML = loginFormHtml(null, false);
      slot.querySelector('#pmi-login-form').addEventListener('submit', onLoginSubmit);
    } else {
      slot.innerHTML = registerFormHtml({}, null, false);
      slot.querySelector('#pmi-register-form').addEventListener('submit', onRegisterSubmit);
    }
  }

  async function onLoginSubmit(e) {
    e.preventDefault();
    const fd = new FormData(e.target);
    const slot = root.querySelector('#pmi-auth-form');
    slot.innerHTML = loginFormHtml(null, true);
    try {
      await store.auth.login(String(fd.get('Correo') || '').trim(), String(fd.get('Contrasena') || ''));
      navigate('/');
    } catch (err) {
      slot.innerHTML = loginFormHtml(err.message || 'No se pudo iniciar sesion.', false);
      slot.querySelector('#pmi-login-form').addEventListener('submit', onLoginSubmit);
    }
  }

  function validateRegister(fd) {
    const errors = {};
    const Correo = String(fd.get('Correo') || '').trim();
    const Nombre = String(fd.get('Nombre') || '').trim();
    const numero = String(fd.get('numero') || '').trim();
    const Contrasena = String(fd.get('Contrasena') || '');

    if (!Correo) errors.Correo = 'El correo es requerido.';
    else if (!isEafitEmail(Correo)) errors.Correo = 'Debe ser un correo institucional (@eafit.edu.co).';
    if (!Nombre) errors.Nombre = 'El nombre es requerido.';
    if (!numero) errors.numero = 'El celular es requerido.';
    if (!Contrasena) errors.Contrasena = 'La contrasena es requerida.';
    else if (Contrasena.length < 8) errors.Contrasena = 'Minimo 8 caracteres.';

    return errors;
  }

  async function onRegisterSubmit(e) {
    e.preventDefault();
    const fd = new FormData(e.target);
    const errors = validateRegister(fd);
    const slot = root.querySelector('#pmi-auth-form');

    if (Object.keys(errors).length > 0) {
      slot.innerHTML = registerFormHtml(errors, null, false);
      slot.querySelector('#pmi-register-form').addEventListener('submit', onRegisterSubmit);
      return;
    }

    slot.innerHTML = registerFormHtml({}, null, true);
    try {
      await store.auth.register(
        String(fd.get('Correo')).trim(),
        String(fd.get('Contrasena')),
        String(fd.get('numero')).trim(),
        String(fd.get('Nombre')).trim()
      );
      navigate('/');
    } catch (err) {
      slot.innerHTML = registerFormHtml({}, err.message || 'No se pudo crear la cuenta.', false);
      slot.querySelector('#pmi-register-form').addEventListener('submit', onRegisterSubmit);
    }
  }

  function full() {
    root.innerHTML = html();
    mountForm();
    root.querySelectorAll('.pmi-tab').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (tab === btn.dataset.tab) return;
        tab = btn.dataset.tab;
        full();
      });
    });
  }

  full();
}
