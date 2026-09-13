<?php
if (!defined('ABSPATH')) {
    exit;
}

/**
 * Autenticacion propia del plugin (tabla pmi_usuario, no wp_users).
 *
 * Reemplaza el JWT + cookie httpOnly del backend Node original por:
 *  - Una cookie propia firmada (HMAC-SHA256) que identifica al usuario.
 *  - El sistema de nonces de WordPress (X-WP-Nonce) como proteccion CSRF
 *    en cada request de escritura (POST/PUT/DELETE), igual que cualquier
 *    otro endpoint de la REST API de WP.
 *
 * No depende de wp_users: Rol/Trabajo/Baneado siguen viviendo en la tabla
 * propia, tal como en el proyecto original.
 */
class PMI_Auth
{
    const COOKIE_NAME = 'pmi_session';
    const SESSION_TTL = DAY_IN_SECONDS; // igual al expiresIn: '1d' del JWT original

    private static $current_user = null;
    private static $current_user_loaded = false;

    /**
     * Secreto usado para firmar la cookie de sesion propia (opcion
     * pmi_auth_secret generada en la activacion, con fallback al salt de WP).
     *
     * @return string Secreto HMAC.
     */
    private static function secret()
    {
        $secret = get_option('pmi_auth_secret');
        if (!$secret) {
            // Fallback defensivo si el plugin nunca paso por la activacion.
            $secret = wp_salt('auth');
        }
        return $secret;
    }

    /**
     * Firma un payload con HMAC-SHA256 usando el secreto del plugin.
     *
     * @param string $payload Cadena a firmar (payload en base64 de la cookie de sesion).
     * @return string Firma HMAC-SHA256 en hexadecimal.
     */
    private static function sign($payload)
    {
        return hash_hmac('sha256', $payload, self::secret());
    }

    /**
     * Huella de las credenciales actuales de un usuario, derivada de su hash
     * de contrasena. Va dentro de la cookie firmada para que un cambio de
     * contrasena invalide las sesiones abiertas: la cookie es autocontenida
     * (no hay tabla de sesiones que borrar), asi que sin esto un token
     * copiado seguiria sirviendo las 24 horas completas.
     *
     * @param string $correo Correo del usuario.
     * @return string Huella corta, o cadena vacia si el usuario no existe.
     */
    private static function credential_fingerprint($correo)
    {
        global $wpdb;

        $hash = $wpdb->get_var($wpdb->prepare(
            'SELECT contrasena FROM ' . PMI_DB::usuario() . ' WHERE correo = %s',
            $correo
        ));

        if (!$hash) {
            return '';
        }

        return substr(hash_hmac('sha256', $hash, self::secret()), 0, 16);
    }

    /**
     * Crea el valor de cookie de sesion para un usuario ya autenticado.
     *
     * @param string $correo Correo del usuario autenticado.
     * @return void
     */
    public static function issue_session_cookie($correo)
    {
        $payload = base64_encode(wp_json_encode(array(
            'correo' => $correo,
            'exp' => time() + self::SESSION_TTL,
            'fp' => self::credential_fingerprint($correo),
        )));
        $signature = self::sign($payload);
        $token = $payload . '.' . $signature;

        $secure = is_ssl();
        setcookie(
            self::COOKIE_NAME,
            $token,
            array(
                'expires' => time() + self::SESSION_TTL,
                'path' => defined('COOKIEPATH') && COOKIEPATH ? COOKIEPATH : '/',
                'domain' => defined('COOKIE_DOMAIN') && COOKIE_DOMAIN ? COOKIE_DOMAIN : '',
                'secure' => $secure,
                'httponly' => true,
                'samesite' => 'Lax',
            )
        );
    }

    /**
     * Borra la cookie de sesion propia (usada en logout).
     *
     * @return void
     */
    public static function clear_session_cookie()
    {
        setcookie(
            self::COOKIE_NAME,
            '',
            array(
                'expires' => time() - YEAR_IN_SECONDS,
                'path' => defined('COOKIEPATH') && COOKIEPATH ? COOKIEPATH : '/',
                'domain' => defined('COOKIE_DOMAIN') && COOKIE_DOMAIN ? COOKIE_DOMAIN : '',
                'secure' => is_ssl(),
                'httponly' => true,
                'samesite' => 'Lax',
            )
        );
    }

    /**
     * Verifica la cookie de la request actual y devuelve su contenido si es valida.
     *
     * @return array|null Datos de la sesion (correo, exp, fp), o null si la cookie falta, no verifica o expiro.
     */
    private static function session_data()
    {
        if (empty($_COOKIE[self::COOKIE_NAME])) {
            return null;
        }

        $token = sanitize_text_field(wp_unslash($_COOKIE[self::COOKIE_NAME]));
        $parts = explode('.', $token);
        if (count($parts) !== 2) {
            return null;
        }

        list($payload, $signature) = $parts;

        if (!hash_equals(self::sign($payload), $signature)) {
            return null;
        }

        $data = json_decode(base64_decode($payload), true);
        if (!is_array($data) || empty($data['correo']) || empty($data['exp'])) {
            return null;
        }

        if (time() > (int) $data['exp']) {
            return null;
        }

        return $data;
    }

    /**
     * Usuario autenticado de la request actual (fila completa sin contrasena),
     * o null si no hay sesion valida. Se cachea por request.
     *
     * @return array|null Fila de pmi_usuario (correo, numero, rol, nombre, baneado, trabajo), o null si no hay sesion.
     */
    public static function current_user()
    {
        if (self::$current_user_loaded) {
            return self::$current_user;
        }
        self::$current_user_loaded = true;

        $session = self::session_data();
        if (!$session) {
            return self::$current_user = null;
        }

        global $wpdb;
        $row = $wpdb->get_row(
            $wpdb->prepare(
                'SELECT correo, numero, rol, nombre, baneado, trabajo, contrasena FROM ' . PMI_DB::usuario() . ' WHERE correo = %s',
                $session['correo']
            ),
            ARRAY_A
        );

        if (!$row) {
            return self::$current_user = null;
        }

        // Si la contrasena cambio despues de emitirse la cookie, la huella ya
        // no coincide y la sesion deja de valer. Las cookies emitidas antes de
        // que existiera la huella tampoco pasan: obligan a entrar de nuevo.
        $fingerprint = substr(hash_hmac('sha256', $row['contrasena'], self::secret()), 0, 16);
        if (empty($session['fp']) || !hash_equals($fingerprint, (string) $session['fp'])) {
            return self::$current_user = null;
        }

        // El hash no debe salir de aqui: varios endpoints devuelven al cliente
        // la fila del usuario autenticado.
        unset($row['contrasena']);

        return self::$current_user = $row;
    }

    /**
     * Correo del usuario autenticado, o null si no hay sesion.
     *
     * @return string|null
     */
    public static function correo()
    {
        $user = self::current_user();
        return $user ? $user['correo'] : null;
    }

    /**
     * Indica si el usuario autenticado esta baneado.
     *
     * @return bool
     */
    public static function is_banned()
    {
        $user = self::current_user();
        return $user && !empty($user['baneado']);
    }

    /**
     * Indica si el correo dado es el del usuario autenticado.
     *
     * @param string $correo Correo a comparar.
     * @return bool
     */
    public static function is_self($correo)
    {
        $actual = self::correo();
        return $actual !== null && strcasecmp((string) $correo, $actual) === 0;
    }

    /**
     * Indica si la request actual tiene una sesion valida.
     *
     * @return bool
     */
    public static function is_logged_in()
    {
        return self::current_user() !== null;
    }

    /**
     * Indica si el usuario autenticado de la request actual tiene rol Trabajador.
     *
     * @return bool
     */
    public static function is_worker()
    {
        $user = self::current_user();
        return $user && $user['rol'] === 'Trabajador';
    }

    /**
     * Proteccion CSRF para verbos de escritura: exige un nonce REST valido
     * ademas de la cookie de sesion propia.
     *
     * @param WP_REST_Request $request Request actual.
     * @return bool True si el header X-WP-Nonce trae un nonce REST valido.
     */
    public static function verify_nonce(WP_REST_Request $request)
    {
        $nonce = $request->get_header('X-WP-Nonce');
        return $nonce && wp_verify_nonce($nonce, 'wp_rest');
    }

    /**
     * permission_callback generico: requiere sesion valida y, si el verbo
     * es de escritura, tambien nonce valido.
     *
     * @param WP_REST_Request $request Request actual.
     * @return true|WP_Error True si la request esta autorizada, o WP_Error 401/403 en caso contrario.
     */
    public static function permission_logged_in(WP_REST_Request $request)
    {
        if (!self::is_logged_in()) {
            return new WP_Error('pmi_no_auth', 'No autenticado', array('status' => 401));
        }
        if (self::is_banned()) {
            return new WP_Error('pmi_banned', 'Tu cuenta esta suspendida. Comunicate con Medialab.', array('status' => 403));
        }
        if (in_array($request->get_method(), array('POST', 'PUT', 'DELETE'), true) && !self::verify_nonce($request)) {
            return new WP_Error('pmi_bad_nonce', 'Nonce invalido o ausente', array('status' => 403));
        }
        return true;
    }

    /**
     * permission_callback de GET /users/{correo}. Cada usuario puede leer su
     * propio registro y un Trabajador puede leer cualquiera; nadie mas.
     *
     * A diferencia del resto, un usuario baneado SI puede leer su propia fila:
     * es asi como la aplicacion se entera del baneo y muestra la pantalla de
     * cuenta suspendida en vez de una pantalla vacia.
     *
     * @param WP_REST_Request $request Request actual.
     * @return true|WP_Error
     */
    public static function permission_read_user(WP_REST_Request $request)
    {
        if (!self::is_logged_in()) {
            return new WP_Error('pmi_no_auth', 'No autenticado', array('status' => 401));
        }

        if (self::is_self(urldecode((string) $request->get_param('correo')))) {
            return true;
        }

        if (self::is_banned()) {
            return new WP_Error('pmi_banned', 'Tu cuenta esta suspendida. Comunicate con Medialab.', array('status' => 403));
        }

        if (!self::is_worker()) {
            return new WP_Error('pmi_forbidden', 'Solo puedes consultar tu propio usuario', array('status' => 403));
        }

        return true;
    }

    /**
     * permission_callback para operaciones administrativas (solo Trabajador).
     *
     * @param WP_REST_Request $request Request actual.
     * @return true|WP_Error True si esta autorizada, o WP_Error 401/403 en caso contrario.
     */
    public static function permission_worker(WP_REST_Request $request)
    {
        $base = self::permission_logged_in($request);
        if (is_wp_error($base)) {
            return $base;
        }
        if (!self::is_worker()) {
            return new WP_Error('pmi_forbidden', 'Requiere rol Trabajador', array('status' => 403));
        }
        return true;
    }

    /**
     * Endpoint publico (catalogo de solo lectura, login). Sin requisito de sesion.
     *
     * @return true Siempre autorizado.
     */
    public static function permission_public()
    {
        return true;
    }
}
