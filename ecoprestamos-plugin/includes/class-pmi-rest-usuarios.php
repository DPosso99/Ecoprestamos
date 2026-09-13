<?php
if (!defined('ABSPATH')) {
    exit;
}

/**
 * Equivalente de Backend/routes/user.routes.js + Controllers/User.controllers.js.
 */
class PMI_Rest_Usuarios
{
    /**
     * Contrasena con la que queda una cuenta creada por un Trabajador que no
     * indico una. Es de un solo uso: la persona debe cambiarla al entrar.
     */
    const DEFAULT_TEMP_PASSWORD = 'Medialab2026!';

    /** Roles validos. Cualquier otro valor dejaria al usuario sin permisos utiles. */
    const ROLES = array('Estudiante', 'Docente', 'Trabajador');

    /** Valores validos de "trabajo" (solo aplica a rol Trabajador). */
    const TRABAJOS = array('Trabajador', 'Practicante');

    /**
     * Normaliza un valor contra una lista blanca.
     *
     * @param mixed  $valor       Valor recibido del cliente.
     * @param array  $permitidos  Valores aceptados.
     * @param string $por_defecto Valor a usar si el recibido no esta en la lista.
     * @return string
     */
    private static function whitelist($valor, array $permitidos, $por_defecto)
    {
        $valor = sanitize_text_field((string) $valor);
        return in_array($valor, $permitidos, true) ? $valor : $por_defecto;
    }

    /**
     * Registra las rutas CRUD de usuarios y las rutas de login/logout bajo
     * /wp-json/pmi/v1/.
     *
     * @return void
     */
    public static function register_routes()
    {
        register_rest_route('pmi/v1', '/users', array(
            array(
                'methods' => 'GET',
                'callback' => array(__CLASS__, 'get_users'),
                'permission_callback' => array('PMI_Auth', 'permission_logged_in'),
            ),
            array(
                'methods' => 'POST',
                'callback' => array(__CLASS__, 'create_user'),
                'permission_callback' => array(__CLASS__, 'permission_create_user'),
            ),
        ));

        register_rest_route('pmi/v1', '/users/(?P<correo>[^/]+)', array(
            array(
                'methods' => 'GET',
                'callback' => array(__CLASS__, 'get_user'),
                'permission_callback' => array('PMI_Auth', 'permission_read_user'),
            ),
            array(
                'methods' => 'PUT',
                'callback' => array(__CLASS__, 'edit_user'),
                'permission_callback' => array(__CLASS__, 'permission_edit_user'),
            ),
            array(
                'methods' => 'DELETE',
                'callback' => array(__CLASS__, 'delete_user'),
                'permission_callback' => array('PMI_Auth', 'permission_worker'),
            ),
        ));

        register_rest_route('pmi/v1', '/login', array(
            'methods' => 'POST',
            'callback' => array(__CLASS__, 'login'),
            'permission_callback' => array('PMI_Auth', 'permission_public'),
        ));

        register_rest_route('pmi/v1', '/logout', array(
            'methods' => 'POST',
            'callback' => array(__CLASS__, 'logout'),
            'permission_callback' => array('PMI_Auth', 'permission_public'),
        ));
    }

    /**
     * El auto-registro de un Estudiante es publico; que un Trabajador cree
     * una cuenta para otra persona (adminCreated=true) exige sesion + nonce
     * + rol Trabajador.
     *
     * @param WP_REST_Request $request Request POST /users.
     * @return true|WP_Error True si esta autorizada, o WP_Error 401/403 en caso contrario.
     */
    public static function permission_create_user(WP_REST_Request $request)
    {
        $body = $request->get_json_params();
        if (!empty($body['adminCreated'])) {
            return PMI_Auth::permission_worker($request);
        }
        return true;
    }

    /**
     * Cualquier usuario logueado puede editar su propio perfil; cambiar el
     * perfil de otra persona exige rol Trabajador (se valida en el handler).
     *
     * @param WP_REST_Request $request Request PUT /users/{correo}.
     * @return true|WP_Error True si hay sesion valida, o WP_Error 401/403 en caso contrario.
     */
    public static function permission_edit_user(WP_REST_Request $request)
    {
        return PMI_Auth::permission_logged_in($request);
    }

    /**
     * GET /users: directorio de usuarios (sin contrasena). Un Trabajador ve
     * todo el directorio; los demas roles solo ven a los trabajadores activos,
     * que es lo que necesitan para elegir el encargado de una solicitud, y sin
     * datos de contacto.
     *
     * @return WP_REST_Response Lista de usuarios.
     */
    public static function get_users()
    {
        global $wpdb;

        if (PMI_Auth::is_worker()) {
            $rows = $wpdb->get_results('SELECT correo, numero, rol, nombre, baneado, trabajo FROM ' . PMI_DB::usuario(), ARRAY_A);
            return rest_ensure_response($rows);
        }

        $rows = $wpdb->get_results($wpdb->prepare(
            'SELECT correo, rol, nombre, trabajo FROM ' . PMI_DB::usuario() . ' WHERE rol = %s AND baneado = 0',
            'Trabajador'
        ), ARRAY_A);

        return rest_ensure_response($rows);
    }

    /**
     * GET /users/{correo}: obtiene un usuario por su correo (sin
     * contrasena). Requiere sesion iniciada.
     *
     * @param WP_REST_Request $request Request con el parametro de ruta "correo".
     * @return WP_REST_Response|WP_Error El usuario, o 404 si no existe.
     */
    public static function get_user(WP_REST_Request $request)
    {
        global $wpdb;
        $correo = $request->get_param('correo');

        $row = $wpdb->get_row(
            $wpdb->prepare('SELECT correo, numero, rol, nombre, baneado, trabajo FROM ' . PMI_DB::usuario() . ' WHERE correo = %s', $correo),
            ARRAY_A
        );

        if (!$row) {
            return new WP_Error('pmi_not_found', 'Usuario no encontrado', array('status' => 404));
        }

        return rest_ensure_response($row);
    }

    /**
     * POST /users: crea un usuario nuevo. Publico para auto-registro de
     * Estudiante (exige correo @eafit.edu.co); con adminCreated=true crea la
     * cuenta con el Rol/Baneado/Trabajo indicados y exige rol Trabajador
     * (ver permission_create_user()). En el auto-registro publico se emite
     * ademas la cookie de sesion.
     *
     * @param WP_REST_Request $request Request con un body JSON (Correo, numero, Contraseña/Contrasena, Nombre, adminCreated, y si adminCreated: Rol, Baneado, Trabajo).
     * @return WP_REST_Response|WP_Error El usuario creado (sin contrasena), o 400/409/500 en caso de error.
     */
    public static function create_user(WP_REST_Request $request)
    {
        global $wpdb;
        $body = $request->get_json_params();

        $correo = sanitize_email($body['Correo'] ?? '');
        $numero = sanitize_text_field($body['numero'] ?? '');
        $contrasena = $body['Contraseña'] ?? $body['Contrasena'] ?? null;
        $nombre = sanitize_text_field($body['Nombre'] ?? '');
        $admin_created = !empty($body['adminCreated']);

        if (!$correo || !$nombre) {
            return new WP_Error('pmi_bad_request', 'Correo y Nombre son obligatorios', array('status' => 400));
        }

        // El auto-registro publico exige correo institucional @eafit.edu.co,
        // igual que ya validaba el frontend (login.js). Un Trabajador creando
        // una cuenta para otra persona (adminCreated=true) puede seguir
        // usando cualquier correo, igual que antes.
        if (!$admin_created && !preg_match('/^[^\s@]+@eafit\.edu\.co$/i', $correo)) {
            return new WP_Error('pmi_bad_request', 'Debe ser un correo institucional (@eafit.edu.co)', array('status' => 400));
        }

        // El auto-registro publico SIEMPRE crea un Estudiante sin banear,
        // sin importar lo que mande el body: Rol/Baneado/Trabajo solo se
        // confian del cliente cuando adminCreated=true, porque esa rama ya
        // esta protegida por permission_create_user() (exige rol Trabajador).
        // De lo contrario cualquier visitante anonimo podria auto-asignarse
        // Rol=Trabajador con un simple POST.
        if ($admin_created) {
            $rol = self::whitelist($body['Rol'] ?? 'Estudiante', self::ROLES, 'Estudiante');
            $baneado = !empty($body['Baneado']) ? 1 : 0;
            $trabajo = isset($body['Trabajo']) ? self::whitelist($body['Trabajo'], self::TRABAJOS, 'Practicante') : null;
        } else {
            $rol = 'Estudiante';
            $baneado = 0;
            $trabajo = null;
        }

        $hash = password_hash($contrasena ?: self::DEFAULT_TEMP_PASSWORD, PASSWORD_BCRYPT);

        $existing = $wpdb->get_var($wpdb->prepare('SELECT correo FROM ' . PMI_DB::usuario() . ' WHERE correo = %s', $correo));
        if ($existing) {
            return new WP_Error('pmi_conflict', 'El correo ya existe', array('status' => 409));
        }

        $inserted = $wpdb->insert(
            PMI_DB::usuario(),
            array(
                'correo' => $correo,
                'numero' => $numero,
                'contrasena' => $hash,
                'rol' => $rol,
                'nombre' => $nombre,
                'baneado' => $baneado,
                'trabajo' => $trabajo,
            ),
            array('%s', '%s', '%s', '%s', '%s', '%d', '%s')
        );

        if ($inserted === false) {
            PMI_Error_Log::report(
                self::is_missing_table_error($wpdb->last_error) ? 'pmi_missing_table' : 'pmi_db_insert_error',
                'No se pudo crear el usuario en ' . PMI_DB::usuario() . ': ' . $wpdb->last_error,
                array('endpoint' => 'POST /users', 'correo' => $correo, 'sql_error' => $wpdb->last_error)
            );
            return new WP_Error('pmi_server_error', 'No se pudo crear el usuario por un problema tecnico. Ya se avisamos al equipo de Medialab.', array('status' => 500));
        }

        if (!$admin_created) {
            PMI_Auth::issue_session_cookie($correo);
        }

        $row = $wpdb->get_row(
            $wpdb->prepare('SELECT correo, numero, rol, nombre, baneado, trabajo FROM ' . PMI_DB::usuario() . ' WHERE correo = %s', $correo),
            ARRAY_A
        );

        return rest_ensure_response($row);
    }

    /**
     * PUT /users/{correo}: actualiza un usuario existente (actualizacion
     * parcial). Requiere sesion iniciada; solo el propio usuario o un
     * Trabajador pueden editar, y solo un Trabajador puede cambiar
     * Rol/Baneado/Trabajo.
     *
     * @param WP_REST_Request $request Request con el parametro de ruta "correo" y un body JSON con los campos a actualizar.
     * @return WP_REST_Response|WP_Error El usuario actualizado (sin contrasena), o 403/404 en caso de error.
     */
    public static function edit_user(WP_REST_Request $request)
    {
        global $wpdb;
        $correo = $request->get_param('correo');
        $body = $request->get_json_params();

        $current = $wpdb->get_row($wpdb->prepare('SELECT * FROM ' . PMI_DB::usuario() . ' WHERE correo = %s', $correo), ARRAY_A);
        if (!$current) {
            return new WP_Error('pmi_not_found', 'Usuario no encontrado', array('status' => 404));
        }

        $is_self = PMI_Auth::is_self($correo);
        $is_worker = PMI_Auth::is_worker();

        if (!$is_self && !$is_worker) {
            return new WP_Error('pmi_forbidden', 'No autorizado para editar este usuario', array('status' => 403));
        }

        // Solo un Trabajador puede cambiar Rol/Baneado/Trabajo de un usuario.
        $rol = $current['rol'];
        $baneado = $current['baneado'];
        $trabajo = $current['trabajo'];
        if ($is_worker) {
            $rol = array_key_exists('Rol', $body) ? self::whitelist($body['Rol'], self::ROLES, $rol) : $rol;
            $baneado = array_key_exists('Baneado', $body) ? (int) (bool) $body['Baneado'] : $baneado;
            $trabajo = array_key_exists('Trabajo', $body) ? self::whitelist($body['Trabajo'], self::TRABAJOS, $trabajo) : $trabajo;
        }

        $numero = array_key_exists('numero', $body) ? sanitize_text_field($body['numero']) : $current['numero'];
        $nombre = array_key_exists('Nombre', $body) ? sanitize_text_field($body['Nombre']) : $current['nombre'];

        $contrasena_plain = $body['Contraseña'] ?? $body['Contrasena'] ?? null;
        $hash = $current['contrasena'];
        if ($contrasena_plain && !password_verify($contrasena_plain, $current['contrasena'])) {
            // Cambiar su propia contrasena exige conocer la actual: si no, una
            // sesion robada basta para quedarse con la cuenta. Un Trabajador
            // que le restablece la clave a otra persona no la necesita.
            if ($is_self) {
                $actual = $body['Contrasena_actual'] ?? $body['Contraseña_actual'] ?? '';
                if (!$actual || !password_verify($actual, $current['contrasena'])) {
                    return new WP_Error('pmi_forbidden', 'Debes confirmar tu contrasena actual para cambiarla', array('status' => 403));
                }
            }
            $hash = password_hash($contrasena_plain, PASSWORD_BCRYPT);
        }

        $wpdb->update(
            PMI_DB::usuario(),
            array(
                'numero' => $numero,
                'contrasena' => $hash,
                'rol' => $rol,
                'nombre' => $nombre,
                'baneado' => $baneado,
                'trabajo' => $trabajo,
            ),
            array('correo' => $correo),
            array('%s', '%s', '%s', '%s', '%d', '%s'),
            array('%s')
        );

        $row = $wpdb->get_row(
            $wpdb->prepare('SELECT correo, numero, rol, nombre, baneado, trabajo FROM ' . PMI_DB::usuario() . ' WHERE correo = %s', $correo),
            ARRAY_A
        );

        return rest_ensure_response($row);
    }

    /**
     * DELETE /users/{correo}: elimina un usuario. Requiere rol Trabajador.
     *
     * @param WP_REST_Request $request Request con el parametro de ruta "correo".
     * @return WP_REST_Response|WP_Error Confirmacion, o 404/409 si no existe o tiene prestamos asociados.
     */
    public static function delete_user(WP_REST_Request $request)
    {
        global $wpdb;
        $correo = $request->get_param('correo');

        $wpdb->hide_errors();
        $deleted = $wpdb->delete(PMI_DB::usuario(), array('correo' => $correo), array('%s'));
        $wpdb->show_errors();

        if ($wpdb->last_error) {
            return new WP_Error('pmi_conflict', 'No se puede eliminar el usuario porque tiene prestamos asociados', array('status' => 409));
        }

        if (!$deleted) {
            return new WP_Error('pmi_not_found', 'Usuario no encontrado', array('status' => 404));
        }

        return rest_ensure_response(array('message' => 'Usuario eliminado'));
    }

    /**
     * POST /login: verifica correo/contrasena y, si son validos, emite la
     * cookie de sesion propia. Ruta publica.
     *
     * @param WP_REST_Request $request Request con un body JSON (Correo, Contraseña/Contrasena).
     * @return WP_REST_Response|WP_Error Datos basicos del usuario autenticado, o 401 si las credenciales son invalidas.
     */
    public static function login(WP_REST_Request $request)
    {
        global $wpdb;
        $body = $request->get_json_params();
        $correo = sanitize_email($body['Correo'] ?? '');
        $contrasena = $body['Contraseña'] ?? $body['Contrasena'] ?? '';

        // El correo institucional se exige al registrarse (ver create_user),
        // no aqui: un Trabajador puede dar de alta cuentas con otro dominio
        // (proveedores, invitados) y esas tambien tienen que poder entrar.
        if (!$correo) {
            return new WP_Error('pmi_bad_credentials', 'Correo o contrasena incorrectos', array('status' => 401));
        }

        $user = $wpdb->get_row($wpdb->prepare('SELECT * FROM ' . PMI_DB::usuario() . ' WHERE correo = %s', $correo), ARRAY_A);

        if (!$user || !password_verify($contrasena, $user['contrasena'])) {
            return new WP_Error('pmi_bad_credentials', 'Correo o contrasena incorrectos', array('status' => 401));
        }

        PMI_Auth::issue_session_cookie($user['correo']);

        return rest_ensure_response(array(
            'Correo' => $user['correo'],
            'Nombre' => $user['nombre'],
            'Rol' => $user['rol'],
            'Baneado' => (int) $user['baneado'],
        ));
    }

    /**
     * POST /logout: borra la cookie de sesion propia. Ruta publica.
     *
     * @return WP_REST_Response Confirmacion de cierre de sesion.
     */
    public static function logout()
    {
        PMI_Auth::clear_session_cookie();
        return rest_ensure_response(array('message' => 'Sesion cerrada'));
    }

    /**
     * Detecta el caso especifico de "la tabla del plugin no existe" (subsitio
     * nuevo donde el plugin nunca corrio su activacion), para que el correo
     * de aviso apunte directo al panel de reparacion en vez de un SQL crudo.
     *
     * @param string $sql_error Mensaje de error de $wpdb->last_error.
     * @return bool True si el mensaje corresponde a una tabla inexistente.
     */
    public static function is_missing_table_error($sql_error)
    {
        return $sql_error && stripos($sql_error, "doesn't exist") !== false;
    }
}
