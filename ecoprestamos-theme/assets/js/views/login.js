import { store } from '../state.js';
import { escapeHtml, navigate } from '../dom.js';

/** @returns {boolean} true si `email` tiene dominio institucional @eafit.edu.co. */
const isEafitEmail = (email) => /^[^\s@]+@eafit\.edu\.co$/i.test(email.trim());

// Paises soportados para el celular: EAFIT recibe tanto estudiantes locales
// (Colombia, +57) como de intercambio, asi que el codigo de pais es
// seleccionable en vez de asumir siempre +57. "digits" es la cantidad de
// digitos esperada del numero local (sin el codigo de pais) para ese pais,
// usada tanto para limitar lo que se puede escribir como para validar.
const COUNTRIES = [
  { code: 'CO', dial: '+57', name: 'Colombia', digits: 10 },
  { code: 'US', dial: '+1', name: 'Estados Unidos', digits: 10 },
  { code: 'MX', dial: '+52', name: 'Mexico', digits: 10 },
  { code: 'AR', dial: '+54', name: 'Argentina', digits: 10 },
  { code: 'BR', dial: '+55', name: 'Brasil', digits: 11 },
  { code: 'CL', dial: '+56', name: 'Chile', digits: 9 },
  { code: 'EC', dial: '+593', name: 'Ecuador', digits: 9 },
  { code: 'PE', dial: '+51', name: 'Peru', digits: 9 },
  { code: 'VE', dial: '+58', name: 'Venezuela', digits: 10 },
  { code: 'ES', dial: '+34', name: 'España', digits: 9 },
];
const DEFAULT_COUNTRY_CODE = 'CO';
/**
 * @param {string} code Codigo de pais (ej. 'CO').
 * @returns {Object} La entrada de `COUNTRIES` correspondiente, o Colombia por defecto si no se encuentra.
 */
const findCountry = (code) => COUNTRIES.find((c) => c.code === code) || COUNTRIES[0];

const REGISTER_FIELDS = ['Correo', 'Nombre', 'numero', 'Contrasena'];

// Mensajes que van rotando en el loader de exito, para que la espera se
// sienta como progreso real en vez de un spinner mudo.
const SUCCESS_MESSAGES = [
  'Estamos creando tu cuenta...',
  'Ya casi puedes pedir tus equipos...',
  'Configurando tu perfil de EAFIT...',
  'Todo listo, un momento mas...',
];
const SUCCESS_MESSAGE_INTERVAL_MS = 900;

/**
 * Reglas de validacion por campo, compartidas entre la validacion en vivo
 * (mientras el usuario escribe) y la validacion final al enviar el form.
 * @param {string} name Nombre del campo ('Correo', 'Nombre', 'numero', 'Contrasena').
 * @param {string} value Valor actual del campo.
 * @param {Object} [country] Pais seleccionado (para validar cantidad de digitos del celular).
 * @returns {string} Mensaje de error, o '' si el valor es valido.
 */
function fieldError(name, value, country) {
  switch (name) {
    case 'Correo':
      if (!value) return 'El correo es requerido.';
      if (!isEafitEmail(value)) return 'Debe ser un correo institucional (@eafit.edu.co).';
      return '';
    case 'Nombre':
      if (!value) return 'El nombre es requerido.';
      if (value.length < 3) return 'Ingresa tu nombre completo.';
      return '';
    case 'numero':
      if (!value) return 'El celular es requerido.';
      if (!/^\d+$/.test(value)) return 'Solo se permiten numeros.';
      if (country && value.length !== country.digits) {
        return `Debe tener ${country.digits} digitos para ${country.name}.`;
      }
      return '';
    case 'Contrasena':
      if (!value) return 'La contrasena es requerida.';
      if (value.length < 8) return 'Minimo 8 caracteres.';
      return '';
    default:
      return '';
  }
}

/**
 * Valida los campos del formulario de registro usando `fieldError`.
 * @param {FormData} fd Datos del formulario de registro.
 * @param {string} countryCode Codigo de pais seleccionado (para el celular).
 * @returns {Object} Mapa de errores por nombre de campo (vacio si todo es valido).
 */
function validateRegister(fd, countryCode) {
  const country = findCountry(countryCode);
  const errors = {};
  REGISTER_FIELDS.forEach((name) => {
    const value = String(fd.get(name) || '').trim();
    const message = fieldError(name, value, country);
    if (message) errors[name] = message;
  });
  return errors;
}

/**
 * Renderiza la pantalla de login/registro (ruta `/login`, publica).
 * Maneja internamente el estado de la pestana activa (login o registro),
 * la validacion en vivo del formulario de registro, y las llamadas de
 * autenticacion contra el store.
 * @param {HTMLElement} root Elemento contenedor donde se monta la vista.
 * @returns {Promise<void>}
 */
export async function renderLogin(root) {
  let tab = 'login';
  let selectedCountryCode = DEFAULT_COUNTRY_CODE;

  /** @returns {string} HTML del shell de la pantalla (logo, tabs, slot del formulario). */
  function html() {
    const pluginVersion = window.PMI_CONFIG?.pluginVersion;
    const themeVersion = window.PMI_CONFIG?.themeVersion;
    const versionLine = (pluginVersion || themeVersion)
      ? `<div id="pmi-version-line" class="pmi-muted pmi-text-xs" style="text-align:center; margin-top:16px; opacity:0; transition:opacity .6s ease;">${[
          pluginVersion ? `Plugin v${escapeHtml(pluginVersion)}` : '',
          themeVersion ? `Tema v${escapeHtml(themeVersion)}` : '',
        ].filter(Boolean).join(' &middot; ')}</div>`
      : '';

    return `
      <div class="pmi-auth-shell">
        <div class="pmi-auth-box">
          <div style="text-align:center; margin-bottom:16px;">
            <img src="https://ecolabs.eafit.edu.co/wp-content/uploads/2026/08/logo-eafit-azul-scaled.png" alt="EAFIT" style="max-width:180px; height:auto; margin-bottom:12px;" />
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

          ${versionLine}
        </div>
      </div>
    `;
  }

  /**
   * @param {string|null} error Error general a mostrar (ej. credenciales invalidas).
   * @param {boolean} loading Si el submit esta en curso (deshabilita el boton).
   * @returns {string} HTML del formulario de login.
   */
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

  /**
   * @param {Object} errors  Mensajes de error por campo (se muestran de entrada, ej. tras un submit fallido).
   * @param {string} error   Error general del server (correo duplicado, etc.).
   * @param {boolean} loading
   * @param {Object} values  Valores a repoblar (para no perder lo escrito si el form se re-renderiza).
   * @returns {string} HTML del formulario de registro.
   */
  function registerFormHtml(errors, error, loading, values) {
    const v = values || {};
    const country = findCountry(selectedCountryCode);
    const fieldErrorHtml = (k) => `<p class="pmi-field-error" id="err-${k}">${errors[k] ? escapeHtml(errors[k]) : ''}</p>`;
    const countryOptions = COUNTRIES.map((c) => (
      `<option value="${c.code}" ${c.code === selectedCountryCode ? 'selected' : ''}>${c.dial} ${c.name}</option>`
    )).join('');

    return `
      <form id="pmi-register-form" class="pmi-flex-col pmi-gap-4" novalidate>
        <label class="pmi-field">
          <span class="pmi-label">Correo</span>
          <input class="ui-input ${errors.Correo ? 'ui-input-error' : ''}" type="email" name="Correo" placeholder="Correo institucional" autocomplete="username" value="${escapeHtml(v.Correo || '')}" />
          ${fieldErrorHtml('Correo')}
        </label>
        <label class="pmi-field">
          <span class="pmi-label">Nombre completo</span>
          <input class="ui-input ${errors.Nombre ? 'ui-input-error' : ''}" type="text" name="Nombre" placeholder="Nombre y apellidos" autocomplete="name" value="${escapeHtml(v.Nombre || '')}" />
          ${fieldErrorHtml('Nombre')}
        </label>
        <label class="pmi-field">
          <span class="pmi-label">Celular</span>
          <div class="pmi-flex pmi-gap-2">
            <select class="ui-input" name="paisCelular" style="max-width:130px; flex-shrink:0;">${countryOptions}</select>
            <input class="ui-input ${errors.numero ? 'ui-input-error' : ''}" type="tel" inputmode="numeric" name="numero" placeholder="${'0'.repeat(country.digits)}" maxlength="${country.digits}" autocomplete="tel-national" value="${escapeHtml(v.numero || '')}" />
          </div>
          ${fieldErrorHtml('numero')}
        </label>
        <label class="pmi-field">
          <span class="pmi-label">Contrasena</span>
          <input class="ui-input ${errors.Contrasena ? 'ui-input-error' : ''}" type="password" name="Contrasena" placeholder="Minimo 8 caracteres" autocomplete="new-password" />
          ${fieldErrorHtml('Contrasena')}
        </label>
        ${error ? `<div class="pmi-alert pmi-alert-danger">${escapeHtml(error)}</div>` : ''}
        <button type="submit" class="ui-btn ui-btn-primary ui-btn-block ui-btn-lg" disabled ${loading ? 'disabled' : ''}>${loading ? 'Creando cuenta...' : 'Crear cuenta'}</button>
      </form>
    `;
  }

  /** @returns {string} HTML de la pantalla de "creando cuenta" con spinner y mensaje rotativo. */
  function renderSuccessLoaderHtml() {
    return `
      <div class="pmi-auth-shell">
        <div class="pmi-auth-box">
          <div class="ui-card pmi-p-8" style="text-align:center;">
            <div class="pmi-spinner" style="margin:0 auto 24px;"></div>
            <div id="pmi-success-msg" class="pmi-h2">${escapeHtml(SUCCESS_MESSAGES[0])}</div>
          </div>
        </div>
      </div>
    `;
  }

  /**
   * Muestra el loader de exito rotando mensajes; resuelve cuando termina el ciclo.
   * @returns {Promise<void>}
   */
  function showSuccessLoader() {
    root.innerHTML = renderSuccessLoaderHtml();
    const msgEl = root.querySelector('#pmi-success-msg');
    let i = 0;
    const interval = window.setInterval(() => {
      i = (i + 1) % SUCCESS_MESSAGES.length;
      if (msgEl) msgEl.textContent = SUCCESS_MESSAGES[i];
    }, SUCCESS_MESSAGE_INTERVAL_MS);

    return new Promise((resolve) => {
      window.setTimeout(() => {
        window.clearInterval(interval);
        resolve();
      }, SUCCESS_MESSAGE_INTERVAL_MS * SUCCESS_MESSAGES.length);
    });
  }

  /**
   * Validacion en vivo del form de registro: revisa cada campo mientras el
   * usuario escribe (mostrando cual esta mal o falta, sin esperar al
   * submit), limita el celular a solo digitos segun el pais elegido, y
   * habilita "Crear cuenta" solo cuando los 4 campos tienen algo escrito
   * (la validez completa se re-chequea igual al enviar).
   * @param {HTMLFormElement} form Formulario de registro ya insertado en el DOM.
   */
  function attachRegisterLiveValidation(form) {
    const submitBtn = form.querySelector('button[type="submit"]');
    const countrySelect = form.querySelector('[name="paisCelular"]');
    const numeroInput = form.querySelector('[name="numero"]');

    /** Muestra u oculta el mensaje/estilo de error de un campo puntual. */
    function showFieldError(name, message) {
      const input = form.querySelector(`[name="${name}"]`);
      const errorEl = form.querySelector(`#err-${name}`);
      if (input) input.classList.toggle('ui-input-error', !!message);
      if (errorEl) errorEl.textContent = message || '';
    }

    /**
     * Valida un solo campo y refleja el resultado en la UI.
     * @param {string} name Nombre del campo.
     * @returns {boolean} true si el campo es valido.
     */
    function validateOne(name) {
      const input = form.querySelector(`[name="${name}"]`);
      const value = (input?.value || '').trim();
      const message = fieldError(name, value, findCountry(countrySelect.value));
      showFieldError(name, message);
      return !message;
    }

    /** Habilita/deshabilita el boton de submit segun si todos los campos requeridos tienen valor. */
    function updateSubmitState() {
      const allFilled = REGISTER_FIELDS.every((name) => {
        const input = form.querySelector(`[name="${name}"]`);
        return input && input.value.trim() !== '';
      });
      submitBtn.disabled = !allFilled;
    }

    REGISTER_FIELDS.forEach((name) => {
      const input = form.querySelector(`[name="${name}"]`);
      if (!input) return;

      input.addEventListener('input', () => {
        if (name === 'numero') {
          const maxDigits = findCountry(countrySelect.value).digits;
          input.value = input.value.replace(/\D/g, '').slice(0, maxDigits);
        }
        updateSubmitState();
        // No molestar con el error mientras el campo esta vacio y aun no se toco;
        // en cuanto tiene algo, se valida en vivo para avisar de inmediato.
        if (input.value.trim() !== '') {
          validateOne(name);
        } else {
          showFieldError(name, '');
        }
      });

      input.addEventListener('blur', () => {
        if (input.value.trim() !== '') validateOne(name);
      });
    });

    countrySelect.addEventListener('change', () => {
      selectedCountryCode = countrySelect.value;
      const maxDigits = findCountry(selectedCountryCode).digits;
      numeroInput.setAttribute('maxlength', String(maxDigits));
      numeroInput.placeholder = '0'.repeat(maxDigits);
      numeroInput.value = numeroInput.value.replace(/\D/g, '').slice(0, maxDigits);
      if (numeroInput.value.trim() !== '') validateOne('numero');
      updateSubmitState();
    });

    updateSubmitState();
  }

  /** Monta el formulario correspondiente a la pestana activa y engancha sus listeners. */
  function mountForm() {
    const slot = root.querySelector('#pmi-auth-form');
    if (tab === 'login') {
      slot.innerHTML = loginFormHtml(null, false);
      slot.querySelector('#pmi-login-form').addEventListener('submit', onLoginSubmit);
    } else {
      slot.innerHTML = registerFormHtml({}, null, false, {});
      const form = slot.querySelector('#pmi-register-form');
      form.addEventListener('submit', onRegisterSubmit);
      attachRegisterLiveValidation(form);
    }
  }

  /**
   * Handler de submit del formulario de login: intenta autenticar contra
   * el store y navega a "/" (que redirige segun rol); en error, re-renderiza
   * el formulario con el mensaje de error.
   * @param {SubmitEvent} e
   * @returns {Promise<void>}
   */
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

  /**
   * Handler de submit del formulario de registro: valida todos los campos,
   * si hay errores los muestra sin llamar al backend; si son validos, crea
   * la cuenta, muestra el loader de exito y navega a "/".
   * @param {SubmitEvent} e
   * @returns {Promise<void>}
   */
  async function onRegisterSubmit(e) {
    e.preventDefault();
    const fd = new FormData(e.target);
    const values = {
      Correo: String(fd.get('Correo') || ''),
      Nombre: String(fd.get('Nombre') || ''),
      numero: String(fd.get('numero') || ''),
      Contrasena: '',
    };
    const errors = validateRegister(fd, selectedCountryCode);
    const slot = root.querySelector('#pmi-auth-form');

    if (Object.keys(errors).length > 0) {
      slot.innerHTML = registerFormHtml(errors, null, false, values);
      const form = slot.querySelector('#pmi-register-form');
      form.addEventListener('submit', onRegisterSubmit);
      attachRegisterLiveValidation(form);
      return;
    }

    slot.innerHTML = registerFormHtml({}, null, true, values);

    const country = findCountry(selectedCountryCode);
    const numeroConPais = country.dial + String(fd.get('numero')).trim();

    try {
      await store.auth.register(
        String(fd.get('Correo')).trim(),
        String(fd.get('Contrasena')),
        numeroConPais,
        String(fd.get('Nombre')).trim()
      );
      await showSuccessLoader();
      navigate('/');
    } catch (err) {
      slot.innerHTML = registerFormHtml({}, err.message || 'No se pudo crear la cuenta.', false, values);
      const form = slot.querySelector('#pmi-register-form');
      form.addEventListener('submit', onRegisterSubmit);
      attachRegisterLiveValidation(form);
    }
  }

  /** Renderiza el shell completo y monta el formulario activo; engancha el cambio de pestanas. */
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

    // Aparece 5s despues de montada la vista, para no competir por atencion
    // con el formulario de login mientras carga.
    window.setTimeout(() => {
      const versionLine = root.querySelector('#pmi-version-line');
      if (versionLine) versionLine.style.opacity = '1';
    }, 5000);
  }

  full();
}
