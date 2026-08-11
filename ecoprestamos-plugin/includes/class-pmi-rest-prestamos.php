<?php
if (!defined('ABSPATH')) {
    exit;
}

/**
 * Equivalente de Backend/routes/loans.routes.js + Controllers/loans.controllers.js.
 */
class PMI_Rest_Prestamos
{
    /**
     * Registra las rutas CRUD de prestamos bajo /wp-json/pmi/v1/.
     *
     * @return void
     */
    public static function register_routes()
    {
        register_rest_route('pmi/v1', '/loans', array(
            array(
                'methods' => 'GET',
                'callback' => array(__CLASS__, 'get_loans'),
                'permission_callback' => array('PMI_Auth', 'permission_logged_in'),
            ),
            array(
                'methods' => 'POST',
                'callback' => array(__CLASS__, 'create_loan'),
                'permission_callback' => array('PMI_Auth', 'permission_logged_in'),
            ),
        ));

        register_rest_route('pmi/v1', '/loans/(?P<id>\d+)', array(
            array(
                'methods' => 'GET',
                'callback' => array(__CLASS__, 'get_loan'),
                'permission_callback' => array('PMI_Auth', 'permission_logged_in'),
            ),
            array(
                'methods' => 'PUT',
                'callback' => array(__CLASS__, 'edit_loan'),
                'permission_callback' => array('PMI_Auth', 'permission_logged_in'),
            ),
            array(
                'methods' => 'DELETE',
                'callback' => array(__CLASS__, 'delete_loan'),
                'permission_callback' => array('PMI_Auth', 'permission_worker'),
            ),
        ));
    }

    /**
     * GET /loans: lista todos los prestamos. Requiere sesion iniciada.
     *
     * @return WP_REST_Response Lista de prestamos.
     */
    public static function get_loans()
    {
        global $wpdb;
        $rows = $wpdb->get_results('SELECT * FROM ' . PMI_DB::prestamo(), ARRAY_A);
        return rest_ensure_response(self::map_rows($rows));
    }

    /**
     * GET /loans/{id}: obtiene un prestamo por su id. Requiere sesion iniciada.
     *
     * @param WP_REST_Request $request Request con el parametro de ruta "id".
     * @return WP_REST_Response|WP_Error El prestamo, o 404 si no existe.
     */
    public static function get_loan(WP_REST_Request $request)
    {
        global $wpdb;
        $id = (int) $request->get_param('id');

        $row = $wpdb->get_row($wpdb->prepare('SELECT * FROM ' . PMI_DB::prestamo() . ' WHERE id_prestamo = %d', $id), ARRAY_A);
        if (!$row) {
            return new WP_Error('pmi_not_found', 'Prestamo no encontrado', array('status' => 404));
        }

        return rest_ensure_response(self::map_row($row));
    }

    /**
     * POST /loans: crea un prestamo nuevo. Requiere sesion iniciada.
     * usuario_solicitante y usuario_responsable son obligatorios y deben
     * existir en la tabla de usuarios.
     *
     * @param WP_REST_Request $request Request con un body JSON (usuario_solicitante, usuario_responsable, Notas, Fecha_prestamo, Hora_entrega, Entregado).
     * @return WP_REST_Response|WP_Error Confirmacion con el idPrestamo creado, o 400 si faltan datos o los usuarios no existen.
     */
    public static function create_loan(WP_REST_Request $request)
    {
        global $wpdb;
        $body = $request->get_json_params();

        $usuario_solicitante = sanitize_email($body['usuario_solicitante'] ?? '');
        $usuario_responsable = sanitize_email($body['usuario_responsable'] ?? '');

        if (!$usuario_solicitante || !$usuario_responsable) {
            return new WP_Error('pmi_bad_request', 'usuario_solicitante y usuario_responsable son obligatorios', array('status' => 400));
        }

        $existe_solicitante = $wpdb->get_var($wpdb->prepare('SELECT correo FROM ' . PMI_DB::usuario() . ' WHERE correo = %s', $usuario_solicitante));
        $existe_responsable = $wpdb->get_var($wpdb->prepare('SELECT correo FROM ' . PMI_DB::usuario() . ' WHERE correo = %s', $usuario_responsable));
        if (!$existe_solicitante || !$existe_responsable) {
            return new WP_Error('pmi_bad_request', 'El usuario solicitante o responsable no existe', array('status' => 400));
        }

        // $wpdb->insert() (a diferencia de $wpdb->prepare() con %s/%d crudo)
        // siempre ha insertado NULL real para valores PHP null, en cualquier
        // version de WordPress. No usar $wpdb->query($wpdb->prepare(...)) aqui:
        // con columnas nullable eso guarda '' o '0000-00-00' en vez de NULL.
        $wpdb->insert(
            PMI_DB::prestamo(),
            array(
                'notas' => $body['Notas'] ?? null,
                'fecha_prestamo' => PMI_Utils::to_mysql_datetime($body['Fecha_prestamo'] ?? null),
                'hora_entrega' => PMI_Utils::to_mysql_datetime($body['Hora_entrega'] ?? null),
                'entregado' => !empty($body['Entregado']) ? 1 : 0,
                'usuario_solicitante' => $usuario_solicitante,
                'usuario_responsable' => $usuario_responsable,
            ),
            array('%s', '%s', '%s', '%d', '%s', '%s')
        );

        return rest_ensure_response(array('message' => 'Prestamo solicitado', 'idPrestamo' => (int) $wpdb->insert_id));
    }

    /**
     * PUT /loans/{id}: actualiza un prestamo existente (actualizacion
     * parcial: solo se cambian los campos presentes en el body). Requiere
     * sesion iniciada. Si se marca Entregado sin enviar Hora_entrega, se usa
     * la hora actual del sitio.
     *
     * @param WP_REST_Request $request Request con el parametro de ruta "id" y un body JSON con los campos a actualizar.
     * @return WP_REST_Response|WP_Error Confirmacion, o 404 si el prestamo no existe.
     */
    public static function edit_loan(WP_REST_Request $request)
    {
        global $wpdb;
        $id = (int) $request->get_param('id');
        $body = $request->get_json_params();

        $current = $wpdb->get_row($wpdb->prepare('SELECT * FROM ' . PMI_DB::prestamo() . ' WHERE id_prestamo = %d', $id), ARRAY_A);
        if (!$current) {
            return new WP_Error('pmi_not_found', 'Prestamo no encontrado', array('status' => 404));
        }

        $entregado = array_key_exists('Entregado', $body) ? (int) (bool) $body['Entregado'] : (int) $current['entregado'];
        $hora_entrega_raw = array_key_exists('Hora_entrega', $body) ? $body['Hora_entrega'] : $current['hora_entrega'];

        // Si se marca como entregado y no se envio hora, se usa la hora actual del sitio.
        if ($entregado === 1 && (int) $current['entregado'] === 0 && empty($hora_entrega_raw)) {
            $hora_entrega = PMI_Utils::now_mysql_datetime();
        } else {
            $hora_entrega = PMI_Utils::to_mysql_datetime($hora_entrega_raw);
        }

        $wpdb->update(
            PMI_DB::prestamo(),
            array(
                'notas' => array_key_exists('Notas', $body) ? $body['Notas'] : $current['notas'],
                'fecha_prestamo' => array_key_exists('Fecha_prestamo', $body)
                    ? PMI_Utils::to_mysql_datetime($body['Fecha_prestamo'])
                    : $current['fecha_prestamo'],
                'hora_entrega' => $hora_entrega,
                'entregado' => $entregado,
                'usuario_solicitante' => array_key_exists('usuario_solicitante', $body) ? sanitize_email($body['usuario_solicitante']) : $current['usuario_solicitante'],
                'usuario_responsable' => array_key_exists('usuario_responsable', $body) ? sanitize_email($body['usuario_responsable']) : $current['usuario_responsable'],
            ),
            array('id_prestamo' => $id),
            array('%s', '%s', '%s', '%d', '%s', '%s'),
            array('%d')
        );

        return rest_ensure_response(array('message' => 'Prestamo actualizado'));
    }

    /**
     * DELETE /loans/{id}: elimina un prestamo y sus detalles asociados.
     * Requiere rol Trabajador.
     *
     * @param WP_REST_Request $request Request con el parametro de ruta "id".
     * @return WP_REST_Response|WP_Error Confirmacion, o 404/409 si no existe o no se puede eliminar.
     */
    public static function delete_loan(WP_REST_Request $request)
    {
        global $wpdb;
        $id = (int) $request->get_param('id');

        // Igual que el original: primero se borran los detalles asociados.
        $wpdb->delete(PMI_DB::detalle_prestamo(), array('prestamo_id' => $id), array('%d'));

        $wpdb->hide_errors();
        $deleted = $wpdb->delete(PMI_DB::prestamo(), array('id_prestamo' => $id), array('%d'));
        $wpdb->show_errors();

        if ($wpdb->last_error) {
            return new WP_Error('pmi_conflict', 'No se puede eliminar el prestamo porque tiene recursos asociados', array('status' => 409));
        }

        if (!$deleted) {
            return new WP_Error('pmi_not_found', 'Prestamo no encontrado', array('status' => 404));
        }

        return rest_ensure_response(array('message' => 'Prestamo eliminado'));
    }

    /**
     * Traduce nombres de columna snake_case de la BD a los nombres
     * PascalCase/tal-cual que espera el frontend original (ver src/types/index.ts).
     *
     * @param array $row Fila cruda de la tabla prestamo.
     * @return array Fila con las claves esperadas por el frontend.
     */
    private static function map_row($row)
    {
        return array(
            'idPrestamo' => (int) $row['id_prestamo'],
            'Notas' => $row['notas'],
            'Fecha_prestamo' => $row['fecha_prestamo'],
            'Hora_entrega' => $row['hora_entrega'],
            'Entregado' => (int) $row['entregado'],
            'usuario_solicitante' => $row['usuario_solicitante'],
            'usuario_responsable' => $row['usuario_responsable'],
        );
    }

    /**
     * Aplica map_row() a una lista de filas de prestamo.
     *
     * @param array $rows Filas crudas de la tabla prestamo.
     * @return array Filas con las claves esperadas por el frontend.
     */
    private static function map_rows($rows)
    {
        return array_map(array(__CLASS__, 'map_row'), $rows);
    }
}
