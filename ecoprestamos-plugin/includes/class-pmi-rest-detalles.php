<?php
if (!defined('ABSPATH')) {
    exit;
}

/**
 * Equivalente de Backend/routes/details.routes.js + Controllers/details.controllers.js.
 *
 * Los recursos de un prestamo se reservan por unidad fisica: PMI_Inventario
 * elige que unidades concretas se entregan, las deja registradas en la
 * columna "unidades" del detalle y ajusta el estado del recurso. El trigger
 * before_detalle_insert queda como segunda linea de defensa a nivel de base
 * de datos (stock y activo fijo) para escrituras que no pasen por esta API.
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
     * existente. Requiere sesion iniciada.
     *
     * Por cada recurso se eligen unidades fisicas concretas, se registran en
     * el detalle (columna "unidades") y se marcan como prestadas. Todo ocurre
     * en una transaccion con la fila del recurso bloqueada, para que dos
     * solicitudes simultaneas no se asignen la misma unidad.
     *
     * @param WP_REST_Request $request Request con el parametro de ruta "id" y un body JSON con "recurso" (lista de {id, cantidad}).
     * @return WP_REST_Response|WP_Error Confirmacion con idPrestamo y recursos agregados, o error 404/400/500.
     */
    public static function add_detail(WP_REST_Request $request)
    {
        global $wpdb;
        $id_prestamo = (int) $request->get_param('id');
        $body = $request->get_json_params() ?: array();
        $recursos = $body['recurso'] ?? array();

        $prestamo = $wpdb->get_row($wpdb->prepare(
            'SELECT usuario_solicitante FROM ' . PMI_DB::prestamo() . ' WHERE id_prestamo = %d',
            $id_prestamo
        ), ARRAY_A);

        if (!$prestamo) {
            return new WP_Error('pmi_not_found', 'Prestamo no encontrado', array('status' => 404));
        }

        if (!PMI_Auth::is_worker() && !PMI_Auth::is_self($prestamo['usuario_solicitante'])) {
            return new WP_Error('pmi_forbidden', 'No puedes modificar una solicitud de otra persona', array('status' => 403));
        }

        $wpdb->query('START TRANSACTION');

        $resultado = self::reservar_recursos($id_prestamo, $recursos, $prestamo['usuario_solicitante']);
        if (is_wp_error($resultado)) {
            return self::rollback($resultado, $id_prestamo);
        }

        $wpdb->query('COMMIT');

        return rest_ensure_response(array('message' => 'Recursos agregados al prestamo', 'idPrestamo' => $id_prestamo, 'recurso' => $recursos));
    }

    /**
     * Reserva unidades fisicas para un prestamo: valida disponibilidad, elige
     * las unidades, inserta un detalle por recurso dejando registradas esas
     * unidades, y marca el recurso.
     *
     * Debe llamarse DENTRO de una transaccion ya abierta por quien llama (que
     * es tambien quien debe hacer el ROLLBACK, via rollback()). Se comparte
     * entre POST /loans (creacion atomica del prestamo con sus recursos) y
     * POST /loans/{id}/details.
     *
     * @param int    $id_prestamo        Id del prestamo al que se agregan los recursos.
     * @param mixed  $recursos           Lista de {id, cantidad, unidades?} recibida del cliente. "unidades" es opcional: ids de unidad elegidos a mano por quien pide el prestamo.
     * @param string $correo_solicitante Correo de quien pide el prestamo (define el estado destino de las unidades).
     * @return true|WP_Error True si quedo todo reservado.
     */
    public static function reservar_recursos($id_prestamo, $recursos, $correo_solicitante)
    {
        global $wpdb;

        if (empty($recursos) || !is_array($recursos)) {
            return new WP_Error('pmi_bad_request', 'Debes enviar al menos un recurso para el prestamo', array('status' => 400));
        }

        // Un prestamo de Docente inmoviliza la unidad (proyectos y semilleros
        // de larga duracion) en vez de dejarla como prestada del dia.
        $rol = $wpdb->get_var($wpdb->prepare('SELECT rol FROM ' . PMI_DB::usuario() . ' WHERE correo = %s', $correo_solicitante));
        $estado_destino = ($rol === 'Docente') ? 'No disponible' : 'Prestado';

        // Dos entradas del body pueden resolver al mismo recurso (dos unidades
        // del mismo grupo), asi que se suman las cantidades por recurso antes
        // de elegir unidades: si no, la segunda elegiria las mismas unidades.
        // Igual se acumulan las unidades especificas que haya pedido el
        // cliente para ese recurso (campo "unidades" del item, opcional).
        $pedidos = array();
        foreach ($recursos as $item) {
            $item_id = sanitize_text_field($item['id'] ?? '');
            if (!$item_id) {
                return new WP_Error('pmi_bad_request', 'ID de recurso invalido', array('status' => 400));
            }

            $row = PMI_Inventario::find_recurso($item_id, true);
            if (!$row) {
                return new WP_Error('pmi_bad_request', 'Uno o mas recursos solicitados no existen en el catalogo', array('status' => 400));
            }

            if (PMI_Inventario::es_activo_fijo($row)) {
                return new WP_Error('pmi_bad_request', 'Los recursos de tipo Activo fijo no pueden prestarse', array('status' => 400));
            }

            $clave = $row['id_recurso'];
            if (!isset($pedidos[$clave])) {
                $pedidos[$clave] = array('row' => $row, 'qty' => 0, 'unidades' => array());
            }
            $pedidos[$clave]['qty'] += max(1, (int) ($item['cantidad'] ?? 1));

            if (!empty($item['unidades']) && is_array($item['unidades'])) {
                foreach ($item['unidades'] as $uid) {
                    $uid = sanitize_text_field($uid);
                    if ($uid !== '') {
                        $pedidos[$clave]['unidades'][] = $uid;
                    }
                }
            }
        }

        foreach ($pedidos as $clave => $pedido) {
            if (!empty($pedido['unidades'])) {
                // El cliente elige unidades especificas (ej. por numero de
                // activo). Tienen que ser exactamente las pedidas y seguir
                // disponibles; si no, se aborta con un mensaje claro en vez
                // de asignarle otras distintas a las que pidio.
                if (count(array_unique($pedido['unidades'])) !== $pedido['qty']) {
                    return new WP_Error('pmi_bad_request', 'La cantidad de unidades elegidas no coincide con la cantidad solicitada', array('status' => 400));
                }
                $unidades = PMI_Inventario::elegir_unidades_especificas($pedido['row'], $pedido['unidades']);
                if (empty($unidades)) {
                    return new WP_Error('pmi_bad_request', 'Una o mas de las unidades elegidas ya no estan disponibles. Vuelve a intentarlo.', array('status' => 400));
                }
            } else {
                $unidades = PMI_Inventario::elegir_unidades($pedido['row'], $pedido['qty']);
                if (empty($unidades)) {
                    return new WP_Error('pmi_bad_request', 'No hay suficiente cantidad disponible para uno o mas recursos solicitados', array('status' => 400));
                }
            }

            $wpdb->hide_errors();
            $wpdb->query($wpdb->prepare(
                'INSERT INTO ' . PMI_DB::detalle_prestamo() . ' (prestamo_id, recurso_id, cantidad_prestada, unidades) VALUES (%d, %s, %d, %s)',
                $id_prestamo,
                $clave,
                count($unidades),
                implode(',', $unidades)
            ));
            $wpdb->show_errors();

            if ($wpdb->last_error) {
                $sql_error = $wpdb->last_error;

                // El trigger aborta con SIGNAL si la cantidad_disponible
                // guardada no alcanza, lo que solo pasa si ese contador quedo
                // desincronizado de los estados por unidad (ej. edicion
                // directa en la base de datos).
                if (stripos($sql_error, 'suficiente cantidad disponible') !== false) {
                    return new WP_Error('pmi_bad_request', 'No hay suficiente cantidad disponible para uno o mas recursos solicitados', array('status' => 400));
                }
                if (stripos($sql_error, 'Activo fijo') !== false) {
                    return new WP_Error('pmi_bad_request', 'Los recursos de tipo Activo fijo no pueden prestarse', array('status' => 400));
                }

                return new WP_Error(
                    'pmi_server_error',
                    'No se pudo agregar los recursos al prestamo por un problema tecnico. Ya avisamos al equipo de Medialab.',
                    array('status' => 500, 'sql_error' => $sql_error)
                );
            }

            PMI_Inventario::marcar($pedido['row'], $unidades, $estado_destino);
        }

        return true;
    }

    /**
     * Deshace la transaccion en curso y, si el error venia de un fallo de SQL,
     * lo registra para el panel de administracion.
     *
     * El ROLLBACK va antes del registro: PMI_Error_Log guarda el diagnostico
     * con update_option(), asi que dentro de la transaccion se descartaria
     * junto con el resto de la escritura.
     *
     * @param WP_Error $error       Error devuelto por reservar_recursos().
     * @param int      $id_prestamo Prestamo afectado, para el mensaje del log.
     * @return WP_Error El mismo error, ya listo para devolver al cliente.
     */
    public static function rollback(WP_Error $error, $id_prestamo)
    {
        global $wpdb;
        $wpdb->query('ROLLBACK');

        $sql_error = $error->get_error_data()['sql_error'] ?? null;
        if ($sql_error) {
            PMI_Error_Log::report(
                PMI_Rest_Usuarios::is_missing_table_error($sql_error) ? 'pmi_missing_table' : 'pmi_db_insert_error',
                'No se pudo agregar un detalle al prestamo ' . $id_prestamo . ': ' . $sql_error,
                array('endpoint' => 'POST /loans/' . $id_prestamo . '/details', 'sql_error' => $sql_error)
            );
        }

        return $error;
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
        $id = (int) $request->get_param('id');

        $solicitante = $wpdb->get_var($wpdb->prepare(
            'SELECT usuario_solicitante FROM ' . PMI_DB::prestamo() . ' WHERE id_prestamo = %d',
            $id
        ));

        if ($solicitante && !PMI_Auth::is_worker() && !PMI_Auth::is_self($solicitante)) {
            return new WP_Error('pmi_forbidden', 'No puedes consultar la solicitud de otra persona', array('status' => 403));
        }

        $rows = $wpdb->get_results(
            $wpdb->prepare(
                'SELECT dp.prestamo_id, dp.recurso_id, dp.cantidad_prestada, dp.unidades,
                        r.nombre, r.ubicacion, r.estado, r.tipo, r.activo
                 FROM ' . PMI_DB::detalle_prestamo() . ' dp
                 JOIN ' . PMI_DB::recurso() . ' r ON dp.recurso_id = r.id_recurso
                 WHERE dp.prestamo_id = %d',
                $id
            ),
            ARRAY_A
        );

        if (!$rows) {
            return new WP_Error('pmi_not_found', 'No hay recursos asociados a este prestamo', array('status' => 404));
        }

        return rest_ensure_response(self::map_rows($rows));
    }

    /**
     * GET /loans/alldetails: lista todos los detalles de todos los prestamos
     * en una sola consulta. Requiere sesion iniciada.
     *
     * @return WP_REST_Response Lista de todos los detalles con sus datos de recurso.
     */
    public static function get_all_details()
    {
        global $wpdb;

        $select = 'SELECT dp.prestamo_id, dp.recurso_id, dp.cantidad_prestada, dp.unidades,
                    r.nombre, r.ubicacion, r.estado, r.tipo, r.activo
             FROM ' . PMI_DB::detalle_prestamo() . ' dp
             JOIN ' . PMI_DB::recurso() . ' r ON dp.recurso_id = r.id_recurso';

        if (PMI_Auth::is_worker()) {
            $rows = $wpdb->get_results($select, ARRAY_A);
        } else {
            // Un solicitante solo ve el contenido de sus propios prestamos.
            $rows = $wpdb->get_results($wpdb->prepare(
                $select . ' JOIN ' . PMI_DB::prestamo() . ' p ON p.id_prestamo = dp.prestamo_id
                 WHERE p.usuario_solicitante = %s',
                PMI_Auth::correo()
            ), ARRAY_A);
        }

        return rest_ensure_response(self::map_rows($rows));
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

        $detalle = $wpdb->get_row($wpdb->prepare(
            'SELECT recurso_id, cantidad_prestada, unidades FROM ' . PMI_DB::detalle_prestamo() . ' WHERE prestamo_id = %d AND recurso_id = %s',
            $id_prestamo,
            $recurso_id
        ), ARRAY_A);

        if (!$detalle) {
            return new WP_Error('pmi_not_found', 'Recurso no encontrado en este prestamo', array('status' => 404));
        }

        $wpdb->delete(
            PMI_DB::detalle_prestamo(),
            array('prestamo_id' => $id_prestamo, 'recurso_id' => $recurso_id),
            array('%d', '%s')
        );

        PMI_Inventario::devolver_detalle($detalle);

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
                'unidades' => $row['unidades'] ?? '',
                'Nombre' => $row['nombre'],
                'Ubicacion' => $row['ubicacion'],
                'Estado' => $row['estado'],
                'Tipo' => $row['tipo'],
                'activo' => $row['activo'] ?? 'N/A',
            );
        }, $rows);
    }
}
