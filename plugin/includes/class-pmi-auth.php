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

    private static function secret()
    {
        $secret = get_option('pmi_auth_secret');
        if (!$secret) {
            // Fallback defensivo si el plugin nunca paso por la activacion.
            $secret = wp_salt('auth');
        }
        return $secret;
    }

    private static function sign($payload)
    {
        return hash_hmac('sha256', $payload, self::secret());
    }

    /**
     * Crea el valor de cookie de sesion para un usuario ya autenticado.
     */
    public static function issue_session_cookie($correo)
    {
        $payload = base64_encode(wp_json_encode(array(
            'correo' => $correo,
            'exp' => time() + self::SESSION_TTL,
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
     * Verifica la cookie de la request actual y devuelve el correo si es valida.
     */
    private static function correo_from_cookie()
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

        return $data['correo'];
    }

    /**
     * Usuario autenticado de la request actual (fila completa sin contrasena),
     * o null si no hay sesion valida. Se cachea por request.
     */
    public static function current_user()
    {
        if (self::$current_user_loaded) {
            return self::$current_user;
        }
        self::$current_user_loaded = true;

        $correo = self::correo_from_cookie();
        if (!$correo) {
            return self::$current_user = null;
        }

        global $wpdb;
        $row = $wpdb->get_row(
            $wpdb->prepare(
                'SELECT correo, numero, rol, nombre, baneado, trabajo FROM ' . PMI_DB::usuario() . ' WHERE correo = %s',
                $correo
            ),
            ARRAY_A
        );

        return self::$current_user = $row ?: null;
    }

    public static function is_logged_in()
    {
        return self::current_user() !== null;
    }

    public static function is_worker()
    {
        $user = self::current_user();
        return $user && $user['rol'] === 'Trabajador';
    }

    /**
     * Proteccion CSRF para verbos de escritura: exige un nonce REST valido
     * ademas de la cookie de sesion propia.
     */
    public static function verify_nonce(WP_REST_Request $request)
    {
        $nonce = $request->get_header('X-WP-Nonce');
        return $nonce && wp_verify_nonce($nonce, 'wp_rest');
    }

    /**
     * permission_callback generico: requiere sesion valida y, si el verbo
     * es de escritura, tambien nonce valido.
     */
    public static function permission_logged_in(WP_REST_Request $request)
    {
        if (!self::is_logged_in()) {
            return new WP_Error('pmi_no_auth', 'No autenticado', array('status' => 401));
        }
        if (in_array($request->get_method(), array('POST', 'PUT', 'DELETE'), true) && !self::verify_nonce($request)) {
            return new WP_Error('pmi_bad_nonce', 'Nonce invalido o ausente', array('status' => 403));
        }
        return true;
    }

    /**
     * permission_callback para operaciones administrativas (solo Trabajador).
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
     */
    public static function permission_public()
    {
        return true;
    }
}
