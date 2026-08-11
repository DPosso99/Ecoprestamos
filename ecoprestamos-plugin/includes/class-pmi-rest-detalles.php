<?php
if (!defined('ABSPATH')) {
    exit;
}

/**
 * Equivalente de Backend/routes/details.routes.js + Controllers/details.controllers.js.
 *
 * AddDetail dispara (via el trigger pmi_after_detalle_insert) la resta de
 * Cantidad_disponible del recurso; si no hay stock o el recurso es
 * 'Activo fijo', MySQL aborta el INSERT con un SIGNAL que se traduce aqui
 * a un 400 con mensaje legible, igual que en el backend Node original.
 */
class PMI_Rest_Detalles
{
    /**
     * Registra las rutas de detalle de prestamo (recursos asociados a cada
     * prestamo) bajo /wp-json/pmi/v1/.
     *
     * @return void
     */
    public static function register_routes()
    {
        register_rest_route('pmi/v1', '/loans/alldetails', array(
            'methods' => 'GET',
            'callback' => array(__CLASS__, 'get_all_details'),
            'permission_callback' => array('PMI_Auth', 'permission_logged_in'),
        ));

        register_rest_route('pmi/v1', '/loans/(?P<id>\d+)/details', array(
            array(
                'methods' => 'GET',
                'callback' => array(__CLASS__, 'get_details'),
                'permission_callback' => array('PMI_Auth', 'permission_logged_in'),
            ),
            array(
                'methods' => 'POST',
                'callback' => array(__CLASS__, 'add_detail'),
                'permission_callback' => array('PMI_Auth', 'permission_logged_in'),
            ),
        ));

        register_rest_route('pmi/v1', '/loans/(?P<id>\d+)/details/(?P<recurso_id>[^/]+)', array(
            'methods' => 'DELETE',
            'callback' => array(__CLASS__, 'delete_detail'),
            'permission_callback' => array('PMI_Auth', 'permission_worker'),
        ));
    }

    /**
     * POST /loans/{id}/details: agrega uno o mas recursos a un prestamo
     * existente. Requiere sesion iniciada. El INSERT dispara el trigger de
     * inventario que descuenta Cantidad_disponible; si MySQL lo aborta
     * (stock insuficiente, recurso "Activo fijo" o recurso inexistente) se
     * traduce a un 400 con mensaje legible.
     *
     * @param WP_REST_Request $request Request con el parametro de ruta "id" y un body JSON con "recurso" (lista de {id, cantidad}).
     * @return WP_REST_Response|WP_Error Confirmacion con idPrestamo y recursos agregados, o error 404/400/500.
     */
    public static function add_detail(WP_REST_Request $request)
    {
        global $wpdb;
        $id_prestamo = (int) $request->get_param('id');
        $body = $request->get_json_params();
        $recursos = $body['recurso'] ?? array();

        $prestamo = $wpdb->get_var($wpdb->prepare('SELECT id_prestamo FROM ' . PMI_DB::prestamo() . ' WHERE id_prestamo = %d', $id_prestamo));
        if (!$prestamo) {
            return new WP_Error('pmi_not_found', 'Prestamo no encontrado', array('status' => 404));
        }

        foreach ($recursos as $item) {
            $wpdb->hide_errors();
            $wpdb->query($wpdb->prepare(
                'INSERT INTO ' . PMI_DB::detalle_prestamo() . ' (prestamo_id, recurso_id, cantidad_prestada) VALUES (%d, %s, %d)',
                $id_prestamo,
                $item['id'],
                $item['cantidad'] ?? 1
            ));
            $wpdb->show_errors();

            if ($wpdb->last_error) {
                if (stripos($wpdb->last_error, 'suficiente cantidad disponible') !== false) {
                    return new WP_Error('pmi_bad_request', 'No hay suficiente cantidad disponible para uno o mas recursos solicitados', array('status' => 400));
                }
                if (stripos($wpdb->last_error, 'Activo fijo') !== false) {
                    return new WP_Error('pmi_bad_request', 'Los recursos de tipo Activo fijo no pueden prestarse', array('status' => 400));
                }
                if (stripos($wpdb->last_error, 'foreign key') !== false) {
                    return new WP_Error('pmi_bad_request', 'Uno o mas recursos no existen', array('status' => 400));
                }
                PMI_Error_Log::report(
                    PMI_Rest_Usuarios::is_missing_table_error($wpdb->last_error) ? 'pmi_missing_table' : 'pmi_db_insert_error',
                    'No se pudo agregar un detalle al prestamo ' . $id_prestamo . ': ' . $wpdb->last_error,
                    array('endpoint' => 'POST /prestamos/' . $id_prestamo . '/detalles', 'sql_error' => $wpdb->last_error)
                );
                return new WP_Error('pmi_server_error', 'No se pudo agregar los recursos al prestamo por un problema tecnico. Ya se avisamos al equipo de Medialab.', array('status' => 500));
            }
        }

        return rest_ensure_response(array('message' => 'Recursos agregados al prestamo', 'idPrestamo' => $id_prestamo, 'recurso' => $recursos));
    }

    /**
     * GET /loans/{id}/details: lista los recursos asociados a un prestamo,
     * con sus datos de recurso (nombre, ubicacion, estado, tipo). Requiere sesion iniciada.
     *
     * @param WP_REST_Request $request Request con el parametro de ruta "id".
     * @return WP_REST_Response|WP_Error Lista de detalles, o 404 si el prestamo no tiene recursos.
     */
    public static function get_details(WP_REST_Request $request)
    {
        global $wpdb;
        $id_prestamo = (int) $request->get_param('id');

        $rows = $wpdb->get_results($wpdb->prepare(
            'SELECT dp.prestamo_id, dp.recurso_id, dp.cantidad_prestada, r.nombre, r.ubicacion, r.estado, r.tipo
             FROM ' . PMI_DB::detalle_prestamo() . ' dp
             JOIN ' . PMI_DB::recurso() . ' r ON dp.recurso_id = r.id_recurso
             WHERE dp.prestamo_id = %d',
            $id_prestamo
        ), ARRAY_A);

        if (empty($rows)) {
            return new WP_Error('pmi_not_found', 'No hay recursos en este prestamo', array('status' => 404));
        }

        return rest_ensure_response(self::map_rows($rows));
    }

    /**
     * GET /loans/alldetails: lista todos los detalles de prestamo del sistema
     * (todos los prestamos), con nombre y tipo del recurso. Requiere sesion iniciada.
     *
     * @return WP_REST_Response Lista completa de detalles de prestamo.
     */
    public static function get_all_details()
    {
        global $wpdb;
        $rows = $wpdb->get_results(
            'SELECT dp.prestamo_id, dp.recurso_id, dp.cantidad_prestada, r.nombre, r.tipo
             FROM ' . PMI_DB::detalle_prestamo() . ' dp
             JOIN ' . PMI_DB::recurso() . ' r ON dp.recurso_id = r.id_recurso',
            ARRAY_A
        );

        return rest_ensure_response(array_map(function ($row) {
            return array(
                'prestamo_id' => (int) $row['prestamo_id'],
                'recurso_id' => $row['recurso_id'],
                'cantidad_prestada' => (int) $row['cantidad_prestada'],
                'Nombre' => $row['nombre'],
                'Tipo' => $row['tipo'],
            );
        }, $rows));
    }

    /**
     * DELETE /loans/{id}/details/{recurso_id}: quita un recurso de un
     * prestamo. Requiere rol Trabajador.
     *
     * @param WP_REST_Request $request Request con los parametros de ruta "id" y "recurso_id".
     * @return WP_REST_Response|WP_Error Confirmacion, o 404 si el recurso no estaba en ese prestamo.
     */
    public static function delete_detail(WP_REST_Request $request)
    {
        global $wpdb;
        $id_prestamo = (int) $request->get_param('id');
        $recurso_id = $request->get_param('recurso_id');

        $deleted = $wpdb->delete(
            PMI_DB::detalle_prestamo(),
            array('prestamo_id' => $id_prestamo, 'recurso_id' => $recurso_id),
            array('%d', '%s')
        );

        if (!$deleted) {
            return new WP_Error('pmi_not_found', 'Recurso no encontrado en este prestamo', array('status' => 404));
        }

        return rest_ensure_response(array('message' => 'Recurso eliminado del prestamo'));
    }

    /**
     * Traduce filas de detalle_prestamo (join con recurso) a los nombres
     * PascalCase que espera el frontend original.
     *
     * @param array $rows Filas crudas de la consulta (columnas snake_case).
     * @return array Filas con las claves esperadas por el frontend.
     */
    private static function map_rows($rows)
    {
        return array_map(function ($row) {
            return array(
                'prestamo_id' => (int) $row['prestamo_id'],
                'recurso_id' => $row['recurso_id'],
                'cantidad_prestada' => (int) $row['cantidad_prestada'],
                'Nombre' => $row['nombre'],
                'Ubicacion' => $row['ubicacion'],
                'Estado' => $row['estado'],
                'Tipo' => $row['tipo'],
            );
        }, $rows);
    }
}
